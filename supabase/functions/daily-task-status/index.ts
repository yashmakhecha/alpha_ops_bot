import { createClient } from "npm:@supabase/supabase-js@2";

import { buildAdminSummaryMessage } from "../../../src/admin-summary.mjs";
import {
  getCurrentScheduleSlot,
  hasDeliveredForSlot,
  markDeliveredForSlot,
  normalizeDeliveryState
} from "../../../src/delivery-state.mjs";
import { buildReminderMessage } from "../../../src/message.mjs";
import { normalizeOwnerMap } from "../../../src/owner-map-core.mjs";
import { resolveDestination } from "../../../src/reminder-delivery.mjs";
import { buildReminderSnapshot } from "../../../src/reminder-snapshot.mjs";
import {
  isWeekendInTimeZone,
  matchesScheduleTime,
  mergeRuntimeConfig
} from "../../../src/runtime-config.mjs";
import { SlackClient } from "../../../src/slack.mjs";

type JsonRecord = Record<string, unknown>;

type RuntimeConfig = {
  clickup: {
    sourceType: "list" | "view";
    sourceId: string;
    sourceUrl?: string | null;
  };
  slack: {
    enabled: boolean;
    weekendsEnabled: boolean;
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
    times: string[];
    timezone: string;
  };
  includeUnassigned: boolean;
  messageStyle: "option_a" | "option_b";
  taskProperties: string[];
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

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedCronSecret = request.headers.get("x-cron-secret");

  if (cronSecret && providedCronSecret !== cronSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(request);
  const url = new URL(request.url);
  const dryRun = String(body?.dryRun || url.searchParams.get("dry_run") || "") === "true";
  const force = String(body?.force || url.searchParams.get("force") || "") === "true";
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
    .in("key", ["runtime_config", "owner_map", "overdue_state", "delivery_state"]);

  if (loadError) {
    return jsonResponse({ error: loadError.message }, 500);
  }

  const rowMap = new Map((rows || []).map((row) => [row.key, row.value as JsonRecord]));
  const runtimeConfig = mergeRuntimeConfig(rowMap.get("runtime_config"), {
    getEnvValue: (key) => Deno.env.get(key)
  }) as RuntimeConfig;
  const ownerMap = normalizeOwnerMap(rowMap.get("owner_map"));
  const overdueState = rowMap.get("overdue_state") || undefined;
  const deliveryState = normalizeDeliveryState(rowMap.get("delivery_state"));
  const scheduleSlot = getCurrentScheduleSlot({
    now: new Date(),
    timeZone: runtimeConfig.schedule.timezone,
    scheduleTimes: runtimeConfig.schedule.times
  });
  const isScheduledInvocation = Boolean(providedCronSecret);

  if (isScheduledInvocation && !dryRun && !force) {
    const matchesCurrentSchedule = runtimeConfig.schedule.times.some((scheduleTime) =>
      matchesScheduleTime(scheduleTime, scheduleSlot.timeKey)
    );

    if (!matchesCurrentSchedule) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "outside_scheduled_time_window",
        slot: scheduleSlot
      });
    }

    if (hasDeliveredForSlot(deliveryState, scheduleSlot)) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "already_sent_for_time_slot",
        slot: scheduleSlot
      });
    }
  }

  const slack = new SlackClient({
    baseUrl: Deno.env.get("SLACK_BASE_URL") || "https://slack.com/api",
    botToken: slackBotToken,
    dryRun
  });
  const snapshot = await buildReminderSnapshot({
    clickupBaseUrl: Deno.env.get("CLICKUP_BASE_URL") || "https://api.clickup.com/api/v2",
    clickupToken,
    runtimeConfig,
    ownerMap,
    overdueState,
    slack,
    now: new Date()
  });
  const { runDate, buckets, dueToday, overdue, overdueLog } = snapshot;

  const message = buildReminderMessage({
    dueToday,
    overdue,
    runDate,
    timeZone: runtimeConfig.schedule.timezone,
    sourceLabel: buckets.sourceLabel || runtimeConfig.clickup.sourceId,
    sourceUrl: runtimeConfig.clickup.sourceUrl || buckets.sourceUrl,
    messageStyle: runtimeConfig.messageStyle,
    taskProperties: runtimeConfig.taskProperties
  });

  let reminderResult: unknown = { ok: true, skipped: true };
  let reminderDestination: { channel: string; label: string } | null = null;
  let posted = false;
  const isWeekendRun = isWeekendInTimeZone(runDate, runtimeConfig.schedule.timezone);
  const publicReminderBlockedOnWeekend = isWeekendRun && !runtimeConfig.slack.weekendsEnabled;

  if (runtimeConfig.slack.enabled && (dueToday.length > 0 || overdue.length > 0)) {
    if (publicReminderBlockedOnWeekend) {
      reminderResult = {
        ok: true,
        skipped: true,
        reason: "weekends_disabled_for_public_reminders"
      };
    } else {
      reminderDestination = await resolveDestination(runtimeConfig.slack, slack);
      reminderResult = await slack.postMessage({
        channel: reminderDestination.channel,
        text: message.text,
        blocks: message.blocks
      });
      posted = true;
    }
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
    posted = true;

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        taskCount: dueToday.length + overdue.length,
        publicReminder: {
          destination: reminderDestination?.label || null,
          text: message.text,
          skippedReason: publicReminderBlockedOnWeekend
            ? "weekends_disabled_for_public_reminders"
            : null
        },
        adminSummary: {
          destination: adminDestination.label,
          text: adminMessage.text
        },
        totals: overdueLog.totals
      });
    }
  }

  if (!dryRun) {
    const nextState = isScheduledInvocation && !force
      ? markDeliveredForSlot(deliveryState, {
          dateKey: scheduleSlot.dateKey,
          timeKey: scheduleSlot.timeKey,
          sentAt: runDate.toISOString()
        })
      : deliveryState;
    const { error: saveError } = await supabase
      .from("app_state")
      .upsert(
        [
          {
            key: "overdue_state",
            value: overdueLog.state
          },
          {
            key: "delivery_state",
            value: nextState
          }
        ],
        { onConflict: "key" }
      );

    if (saveError) {
      return jsonResponse({ error: saveError.message }, 500);
    }
  }

  return jsonResponse({
    ok: true,
    posted,
    taskCount: dueToday.length + overdue.length,
    reminderDestination: reminderDestination?.label || null,
    adminDestination: adminDestination?.label || null,
    reminderResult,
    adminResult,
    totals: overdueLog.totals,
    slot: scheduleSlot
  });
});
