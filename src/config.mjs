import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  return {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run")
  };
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(cwd, fileName = ".env") {
  const envPath = path.resolve(cwd, fileName);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");

    if (delimiterIndex === -1) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    const value = stripQuotes(line.slice(delimiterIndex + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optional(name, fallback = null) {
  return process.env[name] || fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function validateScheduleTime(time) {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`SCHEDULE_TIME must be HH:MM, received "${time}"`);
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (hours > 23 || minutes > 59) {
    throw new Error(`SCHEDULE_TIME must be a valid 24-hour time, received "${time}"`);
  }

  return { hours, minutes };
}

export function loadConfig({ cwd = process.cwd(), argv = process.argv.slice(2) } = {}) {
  loadEnvFile(cwd);

  const args = parseArgs(argv);
  const sourceType = (process.env.CLICKUP_SOURCE_TYPE || "list").toLowerCase();

  if (!["list", "view"].includes(sourceType)) {
    throw new Error(`CLICKUP_SOURCE_TYPE must be "list" or "view", received "${sourceType}"`);
  }

  const scheduleTime = process.env.SCHEDULE_TIME || "18:00";
  const { hours, minutes } = validateScheduleTime(scheduleTime);
  const destinationType = (process.env.SLACK_DESTINATION_TYPE || "channel").toLowerCase();
  const messageStyle = (process.env.MESSAGE_STYLE || "option_b").toLowerCase();

  if (!["channel", "dm"].includes(destinationType)) {
    throw new Error(
      `SLACK_DESTINATION_TYPE must be "channel" or "dm", received "${destinationType}"`
    );
  }

  if (!["option_a", "option_b"].includes(messageStyle)) {
    throw new Error(
      `MESSAGE_STYLE must be "option_a" or "option_b", received "${messageStyle}"`
    );
  }

  const slack = {
    baseUrl: process.env.SLACK_BASE_URL || "https://slack.com/api",
    botToken: required("SLACK_BOT_TOKEN"),
    destinationType,
    channelId: optional("SLACK_CHANNEL_ID"),
    dmUserId: optional("SLACK_DM_USER_ID"),
    dmEmail: optional("SLACK_DM_EMAIL"),
    dmName: optional("SLACK_DM_NAME")
  };
  const adminSummaryEnabled = parseBoolean(process.env.ADMIN_DM_ENABLED, false);
  const adminSummary = {
    enabled: adminSummaryEnabled,
    destinationType: "dm",
    dmUserId: optional("ADMIN_DM_USER_ID"),
    dmEmail: optional("ADMIN_DM_EMAIL"),
    dmName: optional("ADMIN_DM_NAME")
  };

  if (destinationType === "channel" && !slack.channelId) {
    throw new Error("Missing required environment variable: SLACK_CHANNEL_ID");
  }

  if (destinationType === "dm" && !slack.dmUserId && !slack.dmEmail && !slack.dmName) {
    throw new Error(
      "For SLACK_DESTINATION_TYPE=dm, provide one of SLACK_DM_USER_ID, SLACK_DM_EMAIL, or SLACK_DM_NAME"
    );
  }

  if (
    adminSummary.enabled &&
    !adminSummary.dmUserId &&
    !adminSummary.dmEmail &&
    !adminSummary.dmName
  ) {
    throw new Error(
      "For ADMIN_DM_ENABLED=true, provide one of ADMIN_DM_USER_ID, ADMIN_DM_EMAIL, or ADMIN_DM_NAME"
    );
  }

  return {
    dryRun: args.dryRun || parseBoolean(process.env.DRY_RUN, false),
    once: args.once,
    includeUnassigned: parseBoolean(process.env.INCLUDE_UNASSIGNED, false),
    messageStyle,
    overdueLogPath: path.resolve(cwd, process.env.OVERDUE_LOG_FILE || "./data/overdue-state.json"),
    ownerMapPath: path.resolve(cwd, process.env.OWNER_MAP_FILE || "./config/owner-map.json"),
    clickup: {
      baseUrl: process.env.CLICKUP_BASE_URL || "https://api.clickup.com/api/v2",
      token: required("CLICKUP_TOKEN"),
      sourceType,
      sourceId: required("CLICKUP_SOURCE_ID"),
      sourceUrl: optional("CLICKUP_SOURCE_URL")
    },
    slack,
    adminSummary,
    schedule: {
      time: scheduleTime,
      hours,
      minutes,
      timezone: process.env.SCHEDULE_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  };
}
