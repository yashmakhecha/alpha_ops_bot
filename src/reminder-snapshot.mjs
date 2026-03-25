import { fetchOpenTasksForSources } from "./clickup.mjs";
import { updateOverdueState } from "./overdue-log-core.mjs";
import { buildReminderBuckets } from "./reminder-items.mjs";
import { resolveReminderItems } from "./reminder-delivery.mjs";
import { getTrackedClickupSources } from "./runtime-config.mjs";

function buildSourceSummaryLabel(sources, fallbackLabel) {
  if (sources.length === 0) {
    return fallbackLabel || null;
  }

  if (sources.length === 1) {
    return sources[0].name || fallbackLabel || sources[0].id;
  }

  const firstSourceLabel = sources[0].name || sources[0].id;
  return `${firstSourceLabel} + ${sources.length - 1} More Lists`;
}

export async function buildReminderSnapshot({
  clickupBaseUrl,
  clickupToken,
  runtimeConfig,
  ownerMap,
  overdueState,
  slack,
  now = new Date()
}) {
  const trackedSources = getTrackedClickupSources(runtimeConfig.clickup);
  const tasks = await fetchOpenTasksForSources({
    baseUrl: clickupBaseUrl,
    token: clickupToken,
    sources: trackedSources
  });

  const rawBuckets = buildReminderBuckets(tasks, {
    now,
    timeZone: runtimeConfig.schedule.timezone,
    includeUnassigned: runtimeConfig.includeUnassigned
  });
  const buckets = {
    ...rawBuckets,
    sourceLabel: buildSourceSummaryLabel(trackedSources, rawBuckets.sourceLabel || runtimeConfig.clickup.sourceId),
    sourceUrl: trackedSources.length === 1 ? trackedSources[0].url || rawBuckets.sourceUrl : null
  };
  const dueToday = await resolveReminderItems(buckets.dueToday, ownerMap, slack);
  const overdue = await resolveReminderItems(buckets.overdue, ownerMap, slack);
  const etaPending = await resolveReminderItems(buckets.etaPending, ownerMap, slack);
  const overdueLog = updateOverdueState({
    state: overdueState,
    trackedItems: [...dueToday, ...overdue, ...etaPending],
    overdueItems: overdue,
    timeZone: runtimeConfig.schedule.timezone,
    now
  });

  return {
    runDate: now,
    buckets,
    dueToday,
    overdue,
    etaPending,
    overdueLog
  };
}
