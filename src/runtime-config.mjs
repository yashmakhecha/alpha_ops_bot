export const TASK_PROPERTY_OPTIONS = ["status", "priority", "due", "owner", "blocking"];
export const DEFAULT_TASK_PROPERTIES = [...TASK_PROPERTY_OPTIONS];
export const DEFAULT_SCHEDULE_TIMES = ["21:00"];

function readEnv(getEnvValue, key) {
  if (typeof getEnvValue === "function") {
    return getEnvValue(key);
  }

  if (getEnvValue && typeof getEnvValue === "object") {
    return getEnvValue[key];
  }

  return undefined;
}

function asString(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function asBoolean(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function isValidTime(value) {
  return /^(24:00|([01]\d|2[0-3]):([0-5]\d))$/.test(String(value || "").trim());
}

function getTimeSortValue(value) {
  if (value === "24:00") {
    return 24 * 60;
  }

  const [hours, minutes] = String(value || "00:00")
    .split(":")
    .map((item) => Number(item));

  return hours * 60 + minutes;
}

export function normalizeScheduleTimes(value, fallback = DEFAULT_SCHEDULE_TIMES) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

  const normalized = [...new Set(values.filter(isValidTime))].sort(
    (left, right) => getTimeSortValue(left) - getTimeSortValue(right)
  );

  return normalized.length > 0 ? normalized : [...fallback];
}

export function formatScheduleTimes(value, fallback = DEFAULT_SCHEDULE_TIMES) {
  return normalizeScheduleTimes(value, fallback).join(", ");
}

export function matchesScheduleTime(scheduleTime, currentTime) {
  if (scheduleTime === currentTime) {
    return true;
  }

  return scheduleTime === "24:00" && currentTime === "00:00";
}

export function isWeekendInTimeZone(date, timeZone) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(date);

  return weekday === "Sat" || weekday === "Sun";
}

export function normalizeTaskProperties(value, fallback = DEFAULT_TASK_PROPERTIES) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

  const normalized = TASK_PROPERTY_OPTIONS.filter((item) => values.includes(item));

  return normalized.length > 0 ? normalized : [...fallback];
}

function derivePublicReminderConfig(slackConfig, fallback) {
  const slack = slackConfig || {};
  const destinationType = slack.destinationType === "dm" ? "dm" : "channel";

  return {
    enabled:
      slack.enabled != null
        ? asBoolean(slack.enabled, fallback.enabled)
        : destinationType === "channel"
          ? true
          : fallback.enabled,
    weekendsEnabled: asBoolean(slack.weekendsEnabled, fallback.weekendsEnabled),
    destinationType,
    channelId: asString(slack.channelId, fallback.channelId),
    dmUserId: asString(slack.dmUserId, fallback.dmUserId),
    dmEmail: asString(slack.dmEmail, fallback.dmEmail),
    dmName: asString(slack.dmName, fallback.dmName)
  };
}

export function defaultRuntimeConfig({ getEnvValue } = {}) {
  const envScheduleTimes = normalizeScheduleTimes(
    readEnv(getEnvValue, "SCHEDULE_TIMES") || readEnv(getEnvValue, "SCHEDULE_TIME")
  );

  return {
    clickup: {
      sourceType: readEnv(getEnvValue, "CLICKUP_SOURCE_TYPE") === "view" ? "view" : "list",
      sourceId: asString(readEnv(getEnvValue, "CLICKUP_SOURCE_ID")),
      sourceUrl: asString(readEnv(getEnvValue, "CLICKUP_SOURCE_URL"))
    },
    slack: {
      enabled: asBoolean(readEnv(getEnvValue, "PUBLIC_REMINDER_ENABLED"), true),
      weekendsEnabled: asBoolean(readEnv(getEnvValue, "PUBLIC_REMINDER_WEEKENDS_ENABLED"), false),
      destinationType: readEnv(getEnvValue, "SLACK_DESTINATION_TYPE") === "dm" ? "dm" : "channel",
      channelId: asString(readEnv(getEnvValue, "SLACK_CHANNEL_ID"), "#all-alpha"),
      dmUserId: asString(readEnv(getEnvValue, "SLACK_DM_USER_ID")),
      dmEmail: asString(readEnv(getEnvValue, "SLACK_DM_EMAIL")),
      dmName: asString(readEnv(getEnvValue, "SLACK_DM_NAME"))
    },
    adminSummary: {
      enabled: asBoolean(readEnv(getEnvValue, "ADMIN_DM_ENABLED"), false),
      destinationType: "dm",
      dmUserId: asString(readEnv(getEnvValue, "ADMIN_DM_USER_ID")),
      dmEmail: asString(readEnv(getEnvValue, "ADMIN_DM_EMAIL")),
      dmName: asString(readEnv(getEnvValue, "ADMIN_DM_NAME"))
    },
    schedule: {
      time: envScheduleTimes[0],
      times: envScheduleTimes,
      timezone: asString(readEnv(getEnvValue, "SCHEDULE_TIMEZONE"), "Asia/Kolkata")
    },
    includeUnassigned: asBoolean(readEnv(getEnvValue, "INCLUDE_UNASSIGNED"), false),
    messageStyle: readEnv(getEnvValue, "MESSAGE_STYLE") === "option_a" ? "option_a" : "option_b",
    taskProperties: normalizeTaskProperties(readEnv(getEnvValue, "TASK_PROPERTIES"))
  };
}

export function mergeRuntimeConfig(value, { getEnvValue } = {}) {
  const fallback = defaultRuntimeConfig({ getEnvValue });
  const clickup = value?.clickup || {};
  const adminSummary = value?.adminSummary || {};
  const schedule = value?.schedule || {};
  const scheduleTimes = normalizeScheduleTimes(schedule.times || schedule.time, fallback.schedule.times);

  return {
    clickup: {
      sourceType: clickup.sourceType === "view" ? "view" : fallback.clickup.sourceType,
      sourceId: asString(clickup.sourceId, fallback.clickup.sourceId),
      sourceUrl: asString(clickup.sourceUrl, fallback.clickup.sourceUrl)
    },
    slack: derivePublicReminderConfig(value?.slack, fallback.slack),
    adminSummary: {
      enabled: asBoolean(adminSummary.enabled, fallback.adminSummary.enabled),
      destinationType: "dm",
      dmUserId: asString(adminSummary.dmUserId, fallback.adminSummary.dmUserId),
      dmEmail: asString(adminSummary.dmEmail, fallback.adminSummary.dmEmail),
      dmName: asString(adminSummary.dmName, fallback.adminSummary.dmName)
    },
    schedule: {
      time: scheduleTimes[0],
      times: scheduleTimes,
      timezone: asString(schedule.timezone, fallback.schedule.timezone)
    },
    includeUnassigned: asBoolean(value?.includeUnassigned, fallback.includeUnassigned),
    messageStyle: value?.messageStyle === "option_a" ? "option_a" : fallback.messageStyle,
    taskProperties: normalizeTaskProperties(value?.taskProperties, fallback.taskProperties)
  };
}
