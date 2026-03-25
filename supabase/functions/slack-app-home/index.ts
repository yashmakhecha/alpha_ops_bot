import { createClient } from "npm:@supabase/supabase-js@2";

import { buildAdminSummaryMessage } from "../../../src/admin-summary.mjs";
import { APP_HOME_IDS, buildAppHomeView } from "../../../src/app-home.mjs";
import { fetchAccessibleLists } from "../../../src/clickup.mjs";
import { buildReminderMessage } from "../../../src/message.mjs";
import { normalizeOwnerMap } from "../../../src/owner-map-core.mjs";
import { resolveAdminUserId, resolveDestination } from "../../../src/reminder-delivery.mjs";
import { buildReminderSnapshot } from "../../../src/reminder-snapshot.mjs";
import {
  getTrackedClickupSources,
  mergeRuntimeConfig,
  normalizeScheduleTimes,
  normalizeTaskProperties
} from "../../../src/runtime-config.mjs";
import { parseSlackRequest, verifySlackSignature } from "../../../src/slack-signature.mjs";
import { SlackClient } from "../../../src/slack.mjs";

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function okResponse() {
  return new Response("", {
    status: 200
  });
}

async function loadState(supabase: ReturnType<typeof createClient>) {
  const { data: rows, error } = await supabase
    .from("app_state")
    .select("key, value")
    .in("key", ["runtime_config", "owner_map", "overdue_state", "delivery_state"]);

  if (error) {
    throw new Error(error.message);
  }

  const rowMap = new Map((rows || []).map((row) => [row.key, row.value as JsonRecord]));

  return {
    runtimeConfig: mergeRuntimeConfig(rowMap.get("runtime_config"), {
      getEnvValue: (key: string) => Deno.env.get(key)
    }),
    ownerMap: normalizeOwnerMap(rowMap.get("owner_map")),
    overdueState: rowMap.get("overdue_state") || undefined,
    deliveryState: rowMap.get("delivery_state") || undefined
  };
}

async function saveRuntimeConfig(supabase: ReturnType<typeof createClient>, runtimeConfig: unknown) {
  const { error } = await supabase
    .from("app_state")
    .upsert(
      [
        {
          key: "runtime_config",
          value: runtimeConfig
        }
      ],
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(error.message);
  }
}

function getStateEntry(viewState: Record<string, any>, blockId: string, actionId: string) {
  return viewState?.[blockId]?.[actionId];
}

function isChecked(viewState: Record<string, any>, blockId: string, actionId: string, value: string) {
  const selected = getStateEntry(viewState, blockId, actionId)?.selected_options || [];
  return selected.some((option: any) => option?.value === value);
}

function buildRuntimeConfigFromViewState(
  viewState: Record<string, any>,
  runtimeConfig: any,
  clickupLists: any[]
) {
  const selectedListOptions = getStateEntry(
    viewState,
    APP_HOME_IDS.trackedListsBlock,
    APP_HOME_IDS.trackedListsAction
  )?.selected_options;
  const selectedListIds = Array.isArray(selectedListOptions)
    ? selectedListOptions.map((option: any) => String(option.value))
    : getTrackedClickupSources(runtimeConfig.clickup).map((source) => source.id);
  const clickupListMap = new Map((clickupLists || []).map((list) => [list.id, list]));
  const selectedClickupSources = selectedListIds
    .map((listId) => clickupListMap.get(listId))
    .filter(Boolean);
  const selectedProperties =
    getStateEntry(viewState, APP_HOME_IDS.taskPropertiesBlock, APP_HOME_IDS.taskPropertiesAction)?.selected_options?.map(
      (option: any) => option.value
    ) || runtimeConfig.taskProperties;
  const selectedChannel =
    getStateEntry(viewState, APP_HOME_IDS.publicChannelBlock, APP_HOME_IDS.publicChannelAction)
      ?.selected_conversation || runtimeConfig.slack.channelId;
  const scheduleInput =
    getStateEntry(viewState, APP_HOME_IDS.scheduleTimesBlock, APP_HOME_IDS.scheduleTimesAction)?.value ||
    runtimeConfig.schedule.times;

  return mergeRuntimeConfig({
    ...runtimeConfig,
    clickup: {
      ...runtimeConfig.clickup,
      sourceType: "list",
      sourceId: selectedClickupSources[0]?.id || "",
      sourceUrl: selectedClickupSources[0]?.url || "",
      sources: selectedClickupSources
    },
    slack: {
      ...runtimeConfig.slack,
      enabled: isChecked(
        viewState,
        APP_HOME_IDS.publicEnabledBlock,
        APP_HOME_IDS.publicEnabledAction,
        "public_enabled"
      ),
      weekendsEnabled: isChecked(
        viewState,
        APP_HOME_IDS.publicWeekendsBlock,
        APP_HOME_IDS.publicWeekendsAction,
        "public_weekends_enabled"
      ),
      destinationType: "channel",
      channelId: selectedChannel || runtimeConfig.slack.channelId
    },
    adminSummary: {
      ...runtimeConfig.adminSummary,
      enabled: isChecked(
        viewState,
        APP_HOME_IDS.adminEnabledBlock,
        APP_HOME_IDS.adminEnabledAction,
        "admin_enabled"
      )
    },
    schedule: {
      ...runtimeConfig.schedule,
      times: normalizeScheduleTimes(scheduleInput, runtimeConfig.schedule.times),
      time: normalizeScheduleTimes(scheduleInput, runtimeConfig.schedule.times)[0]
    },
    taskProperties: normalizeTaskProperties(selectedProperties, runtimeConfig.taskProperties)
  });
}

async function publishHome({
  slack,
  viewerUserId,
  adminUserId,
  runtimeConfig,
  ownerMap,
  overdueState,
  clickupLists,
  snapshot,
  viewHash,
  notice,
  showRestrictedPreview = false
}: {
  slack: SlackClient;
  viewerUserId: string;
  adminUserId: string | null;
  runtimeConfig: any;
  ownerMap: any[];
  overdueState: JsonRecord | undefined;
  clickupLists?: any[];
  snapshot?: Awaited<ReturnType<typeof buildReminderSnapshot>>;
  viewHash?: string;
  notice?: string;
  showRestrictedPreview?: boolean;
}) {
  const nextSnapshot =
    snapshot ||
    (await buildReminderSnapshot({
      clickupBaseUrl: Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2",
      clickupToken: Deno.env.get("CLICKUP_TOKEN") || "",
      runtimeConfig,
      ownerMap,
      overdueState,
      slack,
      now: new Date()
    }));
  const nextClickupLists =
    clickupLists ||
    (await fetchAccessibleLists({
      baseUrl: Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2",
      token: Deno.env.get("CLICKUP_TOKEN") || ""
    }));
  const publicChannelId =
    runtimeConfig.slack.destinationType === "channel" && runtimeConfig.slack.channelId
      ? await slack.resolveChannelId(runtimeConfig.slack.channelId)
      : "";
  const view = buildAppHomeView({
    viewerUserId,
    adminUserId,
    runtimeConfig,
    snapshot: nextSnapshot,
    clickupLists: nextClickupLists,
    sourceLabel: nextSnapshot.buckets.sourceLabel || runtimeConfig.clickup.sourceId,
    sourceUrl:
      nextSnapshot.buckets.sourceUrl ||
      (getTrackedClickupSources(runtimeConfig.clickup).length === 1
        ? runtimeConfig.clickup.sourceUrl
        : null),
    notice,
    lastLoggedRunOn: overdueState?.lastRunOn ? String(overdueState.lastRunOn) : null,
    publicChannelId: /^[CGD][A-Z0-9]+$/.test(publicChannelId || "") ? publicChannelId : "",
    showRestrictedPreview
  });

  await slack.publishView({
    userId: viewerUserId,
    view,
    hash: viewHash
  });

  return nextSnapshot;
}

async function sendTestDmNow({
  slack,
  runtimeConfig,
  snapshot,
  viewerUserId
}: {
  slack: SlackClient;
  runtimeConfig: any;
  snapshot: Awaited<ReturnType<typeof buildReminderSnapshot>>;
  viewerUserId: string;
}) {
  const dmConfig = {
    destinationType: "dm",
    dmUserId: viewerUserId,
    dmEmail: "",
    dmName: ""
  };
  const sourceLabel = snapshot.buckets.sourceLabel || runtimeConfig.clickup.sourceId;
  const sourceUrl =
    snapshot.buckets.sourceUrl ||
    (getTrackedClickupSources(runtimeConfig.clickup).length === 1
      ? runtimeConfig.clickup.sourceUrl
      : null);
  const reminderMessage = buildReminderMessage({
    dueToday: snapshot.dueToday,
    overdue: snapshot.overdue,
    etaPending: snapshot.etaPending,
    runDate: snapshot.runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel,
    sourceUrl,
    messageStyle: runtimeConfig.messageStyle,
    taskProperties: runtimeConfig.taskProperties
  });
  const adminMessage = buildAdminSummaryMessage({
    ownerSummary: snapshot.overdueLog.ownerSummary,
    totals: snapshot.overdueLog.totals,
    runDate: snapshot.runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel,
    sourceUrl
  });

  let reminderNotice = "No due-today, overdue, or ETA-pending reminder to send.";

  if (snapshot.dueToday.length > 0 || snapshot.overdue.length > 0 || snapshot.etaPending.length > 0) {
    const reminderDestination = await resolveDestination(dmConfig, slack);
    await slack.postMessage({
      channel: reminderDestination.channel,
      text: reminderMessage.text,
      blocks: reminderMessage.blocks
    });
    reminderNotice = "Reminder DM sent to you.";
  }

  if (runtimeConfig.adminSummary.enabled) {
    const adminDestination = await resolveDestination(dmConfig, slack);
    await slack.postMessage({
      channel: adminDestination.channel,
      text: adminMessage.text,
      blocks: adminMessage.blocks
    });
    return `${reminderNotice} Team Progress Update sent to you.`;
  }

  return `${reminderNotice} Team Progress Update DM is currently disabled.`;
}

async function sendPublicNow({
  slack,
  runtimeConfig,
  snapshot
}: {
  slack: SlackClient;
  runtimeConfig: any;
  snapshot: Awaited<ReturnType<typeof buildReminderSnapshot>>;
}) {
  if (!runtimeConfig.slack.channelId) {
    return "Choose a public channel before sending.";
  }

  if (snapshot.dueToday.length === 0 && snapshot.overdue.length === 0 && snapshot.etaPending.length === 0) {
    return "No due-today, overdue, or ETA-pending tasks to post publicly.";
  }

  const sourceLabel = snapshot.buckets.sourceLabel || runtimeConfig.clickup.sourceId;
  const sourceUrl =
    snapshot.buckets.sourceUrl ||
    (getTrackedClickupSources(runtimeConfig.clickup).length === 1
      ? runtimeConfig.clickup.sourceUrl
      : null);
  const message = buildReminderMessage({
    dueToday: snapshot.dueToday,
    overdue: snapshot.overdue,
    etaPending: snapshot.etaPending,
    runDate: snapshot.runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel,
    sourceUrl,
    messageStyle: runtimeConfig.messageStyle,
    taskProperties: runtimeConfig.taskProperties
  });
  const destination = await resolveDestination(
    {
      ...runtimeConfig.slack,
      destinationType: "channel"
    },
    slack
  );

  await slack.postMessage({
    channel: destination.channel,
    text: message.text,
    blocks: message.blocks
  });

  return `Public message sent to ${destination.label}.`;
}

Deno.serve(async (request) => {
  const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");
  const rawBody = await request.text();

  if (!signingSecret) {
    return jsonResponse({ error: "Missing SLACK_SIGNING_SECRET" }, 500);
  }

  const signatureOk = await verifySlackSignature({
    signingSecret,
    timestamp: request.headers.get("x-slack-request-timestamp") || "",
    signature: request.headers.get("x-slack-signature") || "",
    rawBody
  });

  if (!signatureOk) {
    return jsonResponse({ error: "Invalid Slack signature" }, 401);
  }

  const payload = parseSlackRequest(rawBody, request.headers.get("content-type") || "application/json");

  if (payload.type === "url_verification") {
    return jsonResponse({ challenge: payload.challenge });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clickupToken = Deno.env.get("CLICKUP_TOKEN");
  const slackBotToken = Deno.env.get("SLACK_BOT_TOKEN");

  if (!supabaseUrl || !serviceRoleKey || !clickupToken || !slackBotToken) {
    return jsonResponse(
      {
        error: "Missing required environment for Supabase, ClickUp, or Slack"
      },
      500
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { runtimeConfig, ownerMap, overdueState } = await loadState(supabase);
  const clickupBaseUrl = Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2";
  const clickupLists = await fetchAccessibleLists({
    baseUrl: clickupBaseUrl,
    token: clickupToken
  });
  const slack = new SlackClient({
    baseUrl: Deno.env.get("SLACK_BASE_URL") || "https://slack.com/api",
    botToken: slackBotToken
  });
  const adminUserId = await resolveAdminUserId(
    runtimeConfig,
    slack,
    Deno.env.get("SLACK_APP_HOME_ADMIN_USER_ID") || ""
  );

  if (!adminUserId) {
    return jsonResponse({ error: "Could not resolve the Slack App Home admin user." }, 500);
  }

  if (payload.type === "event_callback") {
    if (payload.event?.type !== "app_home_opened" || payload.event?.tab !== "home") {
      return okResponse();
    }

    await publishHome({
      slack,
      viewerUserId: String(payload.event.user),
      adminUserId,
      runtimeConfig,
      ownerMap,
      overdueState,
      clickupLists
    });

    return okResponse();
  }

  if (payload.type === "block_actions") {
    const viewerUserId = String(payload.user?.id || "");
    const viewHash = String(payload.view?.hash || "");

    if (viewerUserId !== adminUserId) {
      await publishHome({
        slack,
        viewerUserId,
        adminUserId,
        runtimeConfig,
        ownerMap,
        overdueState,
        viewHash,
        notice: "You do not have access to the control panel."
      });

      return okResponse();
    }

    const actionId = String(payload.actions?.[0]?.action_id || "");

    if (
      ![
        APP_HOME_IDS.saveSettingsAction,
        APP_HOME_IDS.refreshHomeAction,
        APP_HOME_IDS.sendTestDmAction,
        APP_HOME_IDS.sendPublicNowAction,
        APP_HOME_IDS.showRestrictedPreviewAction,
        APP_HOME_IDS.hideRestrictedPreviewAction
      ].includes(actionId)
    ) {
      return okResponse();
    }

    let nextRuntimeConfig = runtimeConfig;
    let notice = "Home refreshed.";
    let showRestrictedPreview = actionId === APP_HOME_IDS.showRestrictedPreviewAction;

    if (
      ![
        APP_HOME_IDS.refreshHomeAction,
        APP_HOME_IDS.showRestrictedPreviewAction,
        APP_HOME_IDS.hideRestrictedPreviewAction
      ].includes(actionId)
    ) {
      nextRuntimeConfig = buildRuntimeConfigFromViewState(
        payload.view?.state?.values || {},
        runtimeConfig,
        clickupLists
      );
      await saveRuntimeConfig(supabase, nextRuntimeConfig);
      notice = "Settings saved.";
    }

    const snapshot = await buildReminderSnapshot({
      clickupBaseUrl: Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2",
      clickupToken,
      runtimeConfig: nextRuntimeConfig,
      ownerMap,
      overdueState,
      slack,
      now: new Date()
    });

    if (actionId === APP_HOME_IDS.sendTestDmAction) {
      notice = await sendTestDmNow({
        slack,
        runtimeConfig: nextRuntimeConfig,
        snapshot,
        viewerUserId
      });
    }

    if (actionId === APP_HOME_IDS.sendPublicNowAction) {
      notice = await sendPublicNow({
        slack,
        runtimeConfig: nextRuntimeConfig,
        snapshot
      });
    }

    if (actionId === APP_HOME_IDS.showRestrictedPreviewAction) {
      notice = "Restricted preview shown below. Only your Slack user ID can see the admin controls.";
    }

    if (actionId === APP_HOME_IDS.hideRestrictedPreviewAction) {
      notice = "Restricted preview hidden.";
      showRestrictedPreview = false;
    }

    await publishHome({
      slack,
      viewerUserId,
      adminUserId,
      runtimeConfig: nextRuntimeConfig,
      ownerMap,
      overdueState,
      clickupLists,
      viewHash,
      notice,
      snapshot,
      showRestrictedPreview
    });

    return okResponse();
  }

  return okResponse();
});
