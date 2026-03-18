import { fetchOpenTasks } from "./clickup.mjs";
import { updateOverdueState } from "./overdue-log-core.mjs";
import { buildReminderBuckets } from "./reminder-items.mjs";
import { resolveReminderItems } from "./reminder-delivery.mjs";

export async function buildReminderSnapshot({
  clickupBaseUrl,
  clickupToken,
  runtimeConfig,
  ownerMap,
  overdueState,
  slack,
  now = new Date()
}) {
  const tasks = await fetchOpenTasks({
    baseUrl: clickupBaseUrl,
    token: clickupToken,
    sourceType: runtimeConfig.clickup.sourceType,
    sourceId: runtimeConfig.clickup.sourceId,
    sourceUrl: runtimeConfig.clickup.sourceUrl || undefined
  });

  const buckets = buildReminderBuckets(tasks, {
    now,
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
    now
  });

  return {
    runDate: now,
    buckets,
    dueToday,
    overdue,
    overdueLog
  };
}
