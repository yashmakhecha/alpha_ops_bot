import { createClient } from "npm:@supabase/supabase-js@2";

import { buildAdminSummaryMessage } from "../../../src/admin-summary.mjs";
import { buildAppHomeView } from "../../../src/app-home.mjs";
import { buildReminderMessage } from "../../../src/message.mjs";
import { normalizeOwnerMap } from "../../../src/owner-map-core.mjs";
import { resolveAdminUserId, resolveDestination } from "../../../src/reminder-delivery.mjs";
import { buildReminderSnapshot } from "../../../src/reminder-snapshot.mjs";
import { mergeRuntimeConfig } from "../../../src/runtime-config.mjs";
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
    .in("key", ["runtime_config", "owner_map", "overdue_state"]);

  if (error) {
    throw new Error(error.message);
  }

  const rowMap = new Map((rows || []).map((row) => [row.key, row.value as JsonRecord]));

  return {
    runtimeConfig: mergeRuntimeConfig(rowMap.get("runtime_config"), {
      getEnvValue: (key: string) => Deno.env.get(key)
    }),
    ownerMap: normalizeOwnerMap(rowMap.get("owner_map")),
    overdueState: rowMap.get("overdue_state") || undefined
  };
}

async function publishHome({
  slack,
  viewerUserId,
  adminUserId,
  runtimeConfig,
  ownerMap,
  overdueState,
  snapshot,
  viewHash,
  notice
}: {
  slack: SlackClient;
  viewerUserId: string;
  adminUserId: string | null;
  runtimeConfig: any;
  ownerMap: any[];
  overdueState: JsonRecord | undefined;
  snapshot?: Awaited<ReturnType<typeof buildReminderSnapshot>>;
  viewHash?: string;
  notice?: string;
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
  const view = buildAppHomeView({
    viewerUserId,
    adminUserId,
    runtimeConfig,
    snapshot: nextSnapshot,
    sourceLabel: nextSnapshot.buckets.sourceLabel || runtimeConfig.clickup.sourceId,
    sourceUrl: runtimeConfig.clickup.sourceUrl || nextSnapshot.buckets.sourceUrl,
    notice,
    lastLoggedRunOn: overdueState?.lastRunOn ? String(overdueState.lastRunOn) : null
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
  const sourceUrl = runtimeConfig.clickup.sourceUrl || snapshot.buckets.sourceUrl;
  const reminderMessage = buildReminderMessage({
    dueToday: snapshot.dueToday,
    overdue: snapshot.overdue,
    runDate: snapshot.runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel,
    sourceUrl,
    messageStyle: runtimeConfig.messageStyle
  });
  const adminMessage = buildAdminSummaryMessage({
    ownerSummary: snapshot.overdueLog.ownerSummary,
    totals: snapshot.overdueLog.totals,
    runDate: snapshot.runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel,
    sourceUrl
  });

  let reminderNotice = "No due-today or overdue reminder to send.";

  if (snapshot.dueToday.length > 0 || snapshot.overdue.length > 0) {
    const reminderDestination = await resolveDestination(dmConfig, slack);
    await slack.postMessage({
      channel: reminderDestination.channel,
      text: reminderMessage.text,
      blocks: reminderMessage.blocks
    });
    reminderNotice = "Reminder DM sent to you.";
  }

  const adminDestination = await resolveDestination(dmConfig, slack);
  await slack.postMessage({
    channel: adminDestination.channel,
    text: adminMessage.text,
    blocks: adminMessage.blocks
  });

  return `${reminderNotice} Team Progress Update sent to you.`;
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
      overdueState
    });

    return okResponse();
  }

  if (payload.type === "block_actions") {
    const viewerUserId = String(payload.user?.id || "");
    const viewHash = String(payload.view?.hash || "");
    let notice = "Home refreshed.";

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
    const snapshot = await buildReminderSnapshot({
      clickupBaseUrl: Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2",
      clickupToken,
      runtimeConfig,
      ownerMap,
      overdueState,
      slack,
      now: new Date()
    });

    if (actionId === "send_test_dm_now") {
      notice = await sendTestDmNow({
        slack,
        runtimeConfig,
        snapshot,
        viewerUserId
      });
    }

    await publishHome({
      slack,
      viewerUserId,
      adminUserId,
      runtimeConfig,
      ownerMap,
      overdueState,
      viewHash,
      notice,
      snapshot
    });

    return okResponse();
  }

  return okResponse();
});
