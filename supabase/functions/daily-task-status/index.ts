import { createClient } from "npm:@supabase/supabase-js@2";

import { buildAdminSummaryMessage } from "../../../src/admin-summary.mjs";
import { fetchOpenTasks } from "../../../src/clickup.mjs";
import { buildReminderMessage } from "../../../src/message.mjs";
import { normalizeOwnerMap, findOwnerMapping, getOwnerLookupCandidate } from "../../../src/owner-map-core.mjs";
import { updateOverdueState } from "../../../src/overdue-log-core.mjs";
import { buildReminderBuckets } from "../../../src/reminder-items.mjs";
import { SlackClient } from "../../../src/slack.mjs";

type JsonRecord = Record<string, unknown>;

type RuntimeConfig = {
  clickup: {
    sourceType: "list" | "view";
    sourceId: string;
    sourceUrl?: string | null;
  };
  slack: {
    destinationType: "channel" | "dm";
    channelId?: string | null;
    dmUserId?: string | null;
    dmEmail?: string | null;
    dmName?: string | null;
  };
  adminSummary: {
    enabled: boolean;
    destinationType: "dm";
    dmUserId?: string | null;
    dmEmail?: string | null;
    dmName?: string | null;
  };
  schedule: {
    time: string;
    timezone: string;
  };
  includeUnassigned: boolean;
  messageStyle: "option_a" | "option_b";
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as JsonRecord;
  } catch {
    return {};
  }
}

function defaultRuntimeConfig(): RuntimeConfig {
  return {
    clickup: {
      sourceType: (Deno.env.get("CLICKUP_SOURCE_TYPE") || "list") as "list" | "view",
      sourceId: Deno.env.get("CLICKUP_SOURCE_ID") || "",
      sourceUrl: Deno.env.get("CLICKUP_SOURCE_URL")
    },
    slack: {
      destinationType: (Deno.env.get("SLACK_DESTINATION_TYPE") || "dm") as "channel" | "dm",
      channelId: Deno.env.get("SLACK_CHANNEL_ID"),
      dmUserId: Deno.env.get("SLACK_DM_USER_ID"),
      dmEmail: Deno.env.get("SLACK_DM_EMAIL"),
      dmName: Deno.env.get("SLACK_DM_NAME")
    },
    adminSummary: {
      enabled: ["1", "true", "yes", "on"].includes(
        String(Deno.env.get("ADMIN_DM_ENABLED") || "").toLowerCase()
      ),
      destinationType: "dm",
      dmUserId: Deno.env.get("ADMIN_DM_USER_ID"),
      dmEmail: Deno.env.get("ADMIN_DM_EMAIL"),
      dmName: Deno.env.get("ADMIN_DM_NAME")
    },
    schedule: {
      time: Deno.env.get("SCHEDULE_TIME") || "21:00",
      timezone: Deno.env.get("SCHEDULE_TIMEZONE") || "Asia/Kolkata"
    },
    includeUnassigned: ["1", "true", "yes", "on"].includes(
      String(Deno.env.get("INCLUDE_UNASSIGNED") || "").toLowerCase()
    ),
    messageStyle: (Deno.env.get("MESSAGE_STYLE") || "option_b") as "option_a" | "option_b"
  };
}

function mergeRuntimeConfig(value: JsonRecord | null | undefined): RuntimeConfig {
  const fallback = defaultRuntimeConfig();

  return {
    clickup: {
      sourceType: (value?.clickup as JsonRecord | undefined)?.sourceType === "view" ? "view" : fallback.clickup.sourceType,
      sourceId: String((value?.clickup as JsonRecord | undefined)?.sourceId || fallback.clickup.sourceId),
      sourceUrl: String((value?.clickup as JsonRecord | undefined)?.sourceUrl || fallback.clickup.sourceUrl || "")
    },
    slack: {
      destinationType:
        (value?.slack as JsonRecord | undefined)?.destinationType === "channel"
          ? "channel"
          : fallback.slack.destinationType,
      channelId: String((value?.slack as JsonRecord | undefined)?.channelId || fallback.slack.channelId || ""),
      dmUserId: String((value?.slack as JsonRecord | undefined)?.dmUserId || fallback.slack.dmUserId || ""),
      dmEmail: String((value?.slack as JsonRecord | undefined)?.dmEmail || fallback.slack.dmEmail || ""),
      dmName: String((value?.slack as JsonRecord | undefined)?.dmName || fallback.slack.dmName || "")
    },
    adminSummary: {
      enabled: Boolean((value?.adminSummary as JsonRecord | undefined)?.enabled ?? fallback.adminSummary.enabled),
      destinationType: "dm",
      dmUserId: String((value?.adminSummary as JsonRecord | undefined)?.dmUserId || fallback.adminSummary.dmUserId || ""),
      dmEmail: String((value?.adminSummary as JsonRecord | undefined)?.dmEmail || fallback.adminSummary.dmEmail || ""),
      dmName: String((value?.adminSummary as JsonRecord | undefined)?.dmName || fallback.adminSummary.dmName || "")
    },
    schedule: {
      time: String((value?.schedule as JsonRecord | undefined)?.time || fallback.schedule.time),
      timezone: String((value?.schedule as JsonRecord | undefined)?.timezone || fallback.schedule.timezone)
    },
    includeUnassigned: Boolean(value?.includeUnassigned ?? fallback.includeUnassigned),
    messageStyle: value?.messageStyle === "option_a" ? "option_a" : fallback.messageStyle
  };
}

async function resolveTaskOwners(task: any, ownerMap: any[], slack: SlackClient) {
  const owners = [];
  const seen = new Set();

  for (const assignee of task.assignees) {
    const mapping = findOwnerMapping(assignee, ownerMap);
    const candidate = getOwnerLookupCandidate(assignee, mapping);
    const owner = await slack.resolveOwner(candidate);
    const key = owner.id || owner.label.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    owners.push(owner);
  }

  return owners;
}

async function resolveReminderItems(items: any[], ownerMap: any[], slack: SlackClient) {
  const resolvedItems = [];

  for (const item of items) {
    const owners = await resolveTaskOwners(item, ownerMap, slack);

    resolvedItems.push({
      ...item,
      owners,
      ownerMentions: owners.map((owner) => owner.mention),
      isUnassigned: item.assignees.length === 0
    });
  }

  return resolvedItems;
}

async function resolveDestination(config: RuntimeConfig["slack"] | RuntimeConfig["adminSummary"], slack: SlackClient) {
  if (config.destinationType === "channel") {
    const channel = await slack.resolveChannelId(config.channelId || "");

    return {
      channel,
      label: channel
    };
  }

  const dm = await slack.openDirectMessage({
    userId: config.dmUserId || undefined,
    email: config.dmEmail || undefined,
    name: config.dmName || undefined
  });

  return {
    channel: dm.channelId,
    label: `DM with ${dm.userId}`
  };
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedCronSecret = request.headers.get("x-cron-secret");

  if (cronSecret && providedCronSecret !== cronSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(request);
  const dryRun = String(body?.dryRun || new URL(request.url).searchParams.get("dry_run") || "") === "true";
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
  const { data: rows, error: loadError } = await supabase
    .from("app_state")
    .select("key, value")
    .in("key", ["runtime_config", "owner_map", "overdue_state"]);

  if (loadError) {
    return jsonResponse({ error: loadError.message }, 500);
  }

  const rowMap = new Map((rows || []).map((row) => [row.key, row.value as JsonRecord]));
  const runtimeConfig = mergeRuntimeConfig(rowMap.get("runtime_config"));
  const ownerMap = normalizeOwnerMap(rowMap.get("owner_map"));
  const overdueState = rowMap.get("overdue_state") || undefined;
  const runDate = new Date();
  const slack = new SlackClient({
    baseUrl: Deno.env.get("SLACK_BASE_URL") || "https://slack.com/api",
    botToken: slackBotToken,
    dryRun
  });

  const tasks = await fetchOpenTasks({
    baseUrl: Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2",
    token: clickupToken,
    sourceType: runtimeConfig.clickup.sourceType,
    sourceId: runtimeConfig.clickup.sourceId,
    sourceUrl: runtimeConfig.clickup.sourceUrl || undefined
  });

  const buckets = buildReminderBuckets(tasks, {
    now: runDate,
    timeZone: runtimeConfig.schedule.timezone,
    includeUnassigned: runtimeConfig.includeUnassigned
  });
  const dueToday = await resolveReminderItems(buckets.dueToday, ownerMap, slack);
  const overdue = await resolveReminderItems(buckets.overdue, ownerMap, slack);
  const overdueLog = updateOverdueState({
    state: overdueState,
    trackedItems: [...dueToday, ...overdue],
    overdueItems: overdue,
    timeZone: runtimeConfig.schedule.timezone,
    now: runDate
  });

  const { error: saveError } = await supabase
    .from("app_state")
    .upsert(
      [
        {
          key: "overdue_state",
          value: overdueLog.state
        }
      ],
      { onConflict: "key" }
    );

  if (saveError) {
    return jsonResponse({ error: saveError.message }, 500);
  }

  const message = buildReminderMessage({
    dueToday,
    overdue,
    runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel: buckets.sourceLabel || runtimeConfig.clickup.sourceId,
    sourceUrl: runtimeConfig.clickup.sourceUrl || buckets.sourceUrl,
    messageStyle: runtimeConfig.messageStyle
  });

  let reminderResult: unknown = { ok: true, skipped: true };
  let reminderDestination: { channel: string; label: string } | null = null;

  if (dueToday.length > 0 || overdue.length > 0) {
    reminderDestination = await resolveDestination(runtimeConfig.slack, slack);
    reminderResult = await slack.postMessage({
      channel: reminderDestination.channel,
      text: message.text,
      blocks: message.blocks
    });
  }

  let adminResult: unknown = null;
  let adminDestination: { channel: string; label: string } | null = null;

  if (runtimeConfig.adminSummary.enabled) {
    const adminMessage = buildAdminSummaryMessage({
      ownerSummary: overdueLog.ownerSummary,
      totals: overdueLog.totals,
      runDate,
      timeZone: runtimeConfig.schedule.timezone,
      sourceLabel: buckets.sourceLabel || runtimeConfig.clickup.sourceId,
      sourceUrl: runtimeConfig.clickup.sourceUrl || buckets.sourceUrl
    });
    adminDestination = await resolveDestination(runtimeConfig.adminSummary, slack);
    adminResult = await slack.postMessage({
      channel: adminDestination.channel,
      text: adminMessage.text,
      blocks: adminMessage.blocks
    });

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        taskCount: dueToday.length + overdue.length,
        publicReminder: {
          destination: reminderDestination?.label || null,
          text: message.text
        },
        adminSummary: {
          destination: adminDestination.label,
          text: adminMessage.text
        },
        totals: overdueLog.totals
      });
    }
  }

  return jsonResponse({
    ok: true,
    posted: dueToday.length > 0 || overdue.length > 0,
    taskCount: dueToday.length + overdue.length,
    reminderDestination: reminderDestination?.label || null,
    adminDestination: adminDestination?.label || null,
    reminderResult,
    adminResult,
    totals: overdueLog.totals
  });
});
