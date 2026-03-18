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

export function defaultRuntimeConfig({ getEnvValue } = {}) {
  return {
    clickup: {
      sourceType: readEnv(getEnvValue, "CLICKUP_SOURCE_TYPE") === "view" ? "view" : "list",
      sourceId: asString(readEnv(getEnvValue, "CLICKUP_SOURCE_ID")),
      sourceUrl: asString(readEnv(getEnvValue, "CLICKUP_SOURCE_URL"))
    },
    slack: {
      destinationType: readEnv(getEnvValue, "SLACK_DESTINATION_TYPE") === "channel" ? "channel" : "dm",
      channelId: asString(readEnv(getEnvValue, "SLACK_CHANNEL_ID")),
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
      time: asString(readEnv(getEnvValue, "SCHEDULE_TIME"), "21:00"),
      timezone: asString(readEnv(getEnvValue, "SCHEDULE_TIMEZONE"), "Asia/Kolkata")
    },
    includeUnassigned: asBoolean(readEnv(getEnvValue, "INCLUDE_UNASSIGNED"), false),
    messageStyle: readEnv(getEnvValue, "MESSAGE_STYLE") === "option_a" ? "option_a" : "option_b"
  };
}

export function mergeRuntimeConfig(value, { getEnvValue } = {}) {
  const fallback = defaultRuntimeConfig({ getEnvValue });
  const clickup = value?.clickup || {};
  const slack = value?.slack || {};
  const adminSummary = value?.adminSummary || {};
  const schedule = value?.schedule || {};

  return {
    clickup: {
      sourceType: clickup.sourceType === "view" ? "view" : fallback.clickup.sourceType,
      sourceId: asString(clickup.sourceId, fallback.clickup.sourceId),
      sourceUrl: asString(clickup.sourceUrl, fallback.clickup.sourceUrl)
    },
    slack: {
      destinationType: slack.destinationType === "channel" ? "channel" : fallback.slack.destinationType,
      channelId: asString(slack.channelId, fallback.slack.channelId),
      dmUserId: asString(slack.dmUserId, fallback.slack.dmUserId),
      dmEmail: asString(slack.dmEmail, fallback.slack.dmEmail),
      dmName: asString(slack.dmName, fallback.slack.dmName)
    },
    adminSummary: {
      enabled: asBoolean(adminSummary.enabled, fallback.adminSummary.enabled),
      destinationType: "dm",
      dmUserId: asString(adminSummary.dmUserId, fallback.adminSummary.dmUserId),
      dmEmail: asString(adminSummary.dmEmail, fallback.adminSummary.dmEmail),
      dmName: asString(adminSummary.dmName, fallback.adminSummary.dmName)
    },
    schedule: {
      time: asString(schedule.time, fallback.schedule.time),
      timezone: asString(schedule.timezone, fallback.schedule.timezone)
    },
    includeUnassigned: asBoolean(value?.includeUnassigned, fallback.includeUnassigned),
    messageStyle: value?.messageStyle === "option_a" ? "option_a" : fallback.messageStyle
  };
}
