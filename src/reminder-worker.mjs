import { fetchOpenTasks } from "./clickup.mjs";
import { buildAdminSummaryMessage } from "./admin-summary.mjs";
import { buildReminderBuckets } from "./reminder-items.mjs";
import { buildReminderMessage } from "./message.mjs";
import { updateOverdueLog } from "./overdue-log.mjs";
import { findOwnerMapping, getOwnerLookupCandidate, loadOwnerMap } from "./owner-map.mjs";
import { SlackClient } from "./slack.mjs";

async function resolveTaskOwners(task, ownerMap, slack) {
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

async function resolveReminderItems(items, ownerMap, slack) {
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

async function resolveDestination(config, slack) {
  if (config.destinationType === "channel") {
    const channel = await slack.resolveChannelId(config.channelId);

    return {
      channel,
      label: channel
    };
  }

  if (slack.dryRun) {
    const userId = await slack.resolveUserId({
      userId: config.dmUserId,
      email: config.dmEmail,
      name: config.dmName
    });

    return {
      channel: userId || config.dmEmail || config.dmName || "dm-preview",
      label: userId ? `DM with ${userId}` : `DM with ${config.dmEmail || config.dmName}`
    };
  }

  const dm = await slack.openDirectMessage({
    userId: config.dmUserId,
    email: config.dmEmail,
    name: config.dmName
  });

  return {
    channel: dm.channelId,
    label: `DM with ${dm.userId}`
  };
}

export async function runReminder(config) {
  const ownerMap = loadOwnerMap(config.ownerMapPath);
  const tasks = await fetchOpenTasks(config.clickup);
  const runDate = new Date();
  const slack = new SlackClient({
    ...config.slack,
    dryRun: config.dryRun
  });
  const buckets = buildReminderBuckets(tasks, {
    now: runDate,
    timeZone: config.schedule.timezone,
    includeUnassigned: config.includeUnassigned
  });
  const dueToday = await resolveReminderItems(buckets.dueToday, ownerMap, slack);
  const overdue = await resolveReminderItems(buckets.overdue, ownerMap, slack);
  const etaPending = await resolveReminderItems(buckets.etaPending, ownerMap, slack);
  const overdueLog = updateOverdueLog({
    filePath: config.overdueLogPath,
    trackedItems: [...dueToday, ...overdue, ...etaPending],
    overdueItems: overdue,
    timeZone: config.schedule.timezone,
    now: runDate
  });

  if (dueToday.length === 0 && overdue.length === 0 && etaPending.length === 0) {
    console.log("No open ClickUp tasks matched the reminder criteria.");
  }

  const message = buildReminderMessage({
    dueToday,
    overdue,
    etaPending,
    runDate,
    timeZone: config.schedule.timezone,
    sourceLabel: buckets.sourceLabel || config.clickup.sourceId,
    sourceUrl: config.clickup.sourceUrl || buckets.sourceUrl,
    messageStyle: config.messageStyle
  });
  const destination = await resolveDestination(config.slack, slack);
  let result = {
    ok: true,
    skipped: true
  };

  if (dueToday.length > 0 || overdue.length > 0 || etaPending.length > 0) {
    result = await slack.postMessage({
      channel: destination.channel,
      text: message.text,
      blocks: message.blocks
    });
  }

  let adminResult = null;

  if (config.adminSummary.enabled) {
    const adminMessage = buildAdminSummaryMessage({
      ownerSummary: overdueLog.ownerSummary,
      totals: overdueLog.totals,
      runDate,
      timeZone: config.schedule.timezone,
      sourceLabel: buckets.sourceLabel || config.clickup.sourceId,
      sourceUrl: config.clickup.sourceUrl || buckets.sourceUrl
    });
    const adminDestination = await resolveDestination(config.adminSummary, slack);

    adminResult = await slack.postMessage({
      channel: adminDestination.channel,
      text: adminMessage.text,
      blocks: adminMessage.blocks
    });

    if (config.dryRun) {
      console.log("\nDry run only. Private admin summary preview:\n");
      console.log(adminMessage.text);
    } else {
      console.log(`Private admin summary posted to ${adminDestination.label}.`);
    }
  }

  if (config.dryRun) {
    console.log("Dry run only. Slack message preview:\n");
    console.log(message.text);
  } else if (dueToday.length > 0 || overdue.length > 0 || etaPending.length > 0) {
    console.log(`Slack reminder posted to ${destination.label}.`);
  } else {
    console.log("No public reminder sent because there are no due-today, overdue, or ETA-pending tasks.");
  }

  return {
    posted: dueToday.length > 0 || overdue.length > 0 || etaPending.length > 0,
    taskCount: dueToday.length + overdue.length + etaPending.length,
    result,
    adminResult,
    overdueLog
  };
}
