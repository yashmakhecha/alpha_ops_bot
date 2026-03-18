import { normalizeTaskProperties } from "./runtime-config.mjs";

function escapeSlackText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeCodeText(value) {
  return String(value || "").replaceAll("`", "'");
}

function formatTaskLabel(task) {
  return task.customId ? `${task.customId}: ${task.name}` : task.name;
}

function formatParentTaskLabel(task) {
  return task.parentCustomId ? `${task.parentCustomId}: ${task.parentName}` : task.parentName;
}

function getTaskPathSegments(task) {
  if (Array.isArray(task.taskPath) && task.taskPath.length > 0) {
    return task.taskPath.map((segment, index, segments) => ({
      ...segment,
      blockingTasks:
        Array.isArray(segment.blockingTasks) && segment.blockingTasks.length > 0
          ? segment.blockingTasks
          : index === segments.length - 1 && Array.isArray(task.blockingTasks)
            ? task.blockingTasks
            : []
    }));
  }

  return [
    {
      id: task.id,
      name: task.name,
      customId: task.customId,
      label: formatTaskLabel(task),
      url: task.url,
      blockingTasks: Array.isArray(task.blockingTasks) ? task.blockingTasks : []
    }
  ];
}

function formatBlockingTasks(blockingTasks) {
  return blockingTasks
    .map(
      (blockedTask) =>
        `<${blockedTask.url}|${escapeSlackText(toSmartTitleCase(formatTaskLabel(blockedTask)))}>`
    )
    .join(", ");
}

function getAllBlockingTasks(task) {
  const taskPath = getTaskPathSegments(task);
  const unique = new Map();

  for (const segment of taskPath) {
    for (const blockedTask of segment.blockingTasks || []) {
      unique.set(blockedTask.id, blockedTask);
    }
  }

  return [...unique.values()];
}

function toSmartTitleCase(value) {
  return String(value || "")
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token) || token === "") {
        return token;
      }

      return token
        .split(/([/-])/)
        .map((part) => {
          if (part === "/" || part === "-") {
            return part;
          }

          if (!/[a-zA-Z]/.test(part)) {
            return part;
          }

          if (/[A-Z]/.test(part.slice(1)) || /\d/.test(part)) {
            return part;
          }

          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("");
    })
    .join("");
}

function formatParentCell(task) {
  const pathSegments = getTaskPathSegments(task).slice(0, -1);

  if (pathSegments.length === 0) {
    return "-";
  }

  return `\`${escapeCodeText(
    pathSegments.map((segment) => toSmartTitleCase(segment.label || formatTaskLabel(segment))).join(" > ")
  )}\``;
}

function formatTaskLine(task, kind, taskProperties) {
  const ownerMentions =
    task.ownerMentions && task.ownerMentions.length > 0
      ? task.ownerMentions.join(" ")
      : task.isUnassigned
        ? "_Unassigned_"
        : "_Owner not mapped_";
  const dueCell = kind === "dueToday" ? "Today" : escapeSlackText(task.dueLabel);
  const allBlockingTasks = getAllBlockingTasks(task);
  const blockingCell =
    allBlockingTasks.length > 0
      ? allBlockingTasks
          .map((blockedTask) => `<${blockedTask.url}|${escapeSlackText(toSmartTitleCase(formatTaskLabel(blockedTask)))}>` )
          .join(", ")
      : "-";
  const cells = [formatParentCell(task), `<${task.url}|${escapeSlackText(toSmartTitleCase(formatTaskLabel(task)))}>`];

  if (taskProperties.includes("status")) {
    cells.push(escapeSlackText(toSmartTitleCase(task.statusLabel)));
  }

  if (taskProperties.includes("priority")) {
    cells.push(task.priorityLabel ? escapeSlackText(toSmartTitleCase(task.priorityLabel)) : "-");
  }

  if (taskProperties.includes("due")) {
    cells.push(dueCell);
  }

  if (taskProperties.includes("owner")) {
    cells.push(ownerMentions);
  }

  if (taskProperties.includes("blocking")) {
    cells.push(blockingCell);
  }

  return `• ${cells.join(" | ")}`;
}

function formatTaskOwner(task) {
  if (task.ownerMentions && task.ownerMentions.length > 0) {
    return task.ownerMentions.join(" ");
  }

  if (task.isUnassigned) {
    return "_Unassigned_";
  }

  return "_Owner not mapped_";
}

function getStatusEmoji(task) {
  const status = String(task.statusLabel || "")
    .trim()
    .toLowerCase();
  const statusType = String(task.statusType || "")
    .trim()
    .toLowerCase();

  if (status.includes("backlog")) {
    return ":card_index_dividers:";
  }

  if (status.includes("scope") || status.includes("plan")) {
    return ":mag:";
  }

  if (status.includes("design")) {
    return ":art:";
  }

  if (status.includes("develop")) {
    return ":hammer_and_wrench:";
  }

  if (status.includes("review")) {
    return ":eyes:";
  }

  if (status.includes("test")) {
    return ":test_tube:";
  }

  if (status.includes("risk")) {
    return ":warning:";
  }

  if (status.includes("hold")) {
    return ":pause_button:";
  }

  if (status.includes("ship")) {
    return ":rocket:";
  }

  if (status.includes("cancel")) {
    return ":no_entry_sign:";
  }

  if (status.includes("done") || status.includes("complete")) {
    return ":white_check_mark:";
  }

  if (status.includes("progress")) {
    return ":arrow_forward:";
  }

  if (statusType === "open" || statusType === "unstarted") {
    return ":clipboard:";
  }

  if (statusType === "closed" || statusType === "done") {
    return ":white_check_mark:";
  }

  return ":bookmark_tabs:";
}

function getPriorityEmoji(task) {
  const label = String(task.priorityLabel || "")
    .trim()
    .toLowerCase();

  if (label === "urgent") {
    return ":first_place_medal:";
  }

  if (label === "high") {
    return ":second_place_medal:";
  }

  if (label === "normal" || label === "medium") {
    return ":third_place_medal:";
  }

  if (label === "low") {
    return "";
  }

  return "";
}

function getPriorityLabel(task) {
  const label = String(task.priorityLabel || "")
    .trim()
    .toLowerCase();

  if (!label) {
    return "";
  }

  if (label === "urgent") {
    return "P1 (Urgent)";
  }

  if (label === "high") {
    return "P2 (High)";
  }

  if (label === "normal" || label === "medium") {
    return "P3 (Normal)";
  }

  if (label === "low") {
    return "P4 (Low)";
  }

  return toSmartTitleCase(label);
}

function getHierarchyLabel(index) {
  if (index === 0) {
    return "Task";
  }

  if (index === 1) {
    return "Sub-task";
  }

  if (index === 2) {
    return "Sub-sub-task";
  }

  return `Level ${index + 1} Task`;
}

function formatFriendlyTaskBlock(task, kind, taskProperties) {
  const pathSegments = getTaskPathSegments(task);
  const statusEmoji = getStatusEmoji(task);
  const statusLabel = escapeSlackText(toSmartTitleCase(task.statusLabel));
  const dueLabel = kind === "dueToday" ? "Today" : escapeSlackText(toSmartTitleCase(task.dueLabel));
  const priorityLine = task.priorityLabel
    ? `${"  ".repeat(Math.max(pathSegments.length - 1, 0))}  - Priority: ${getPriorityLabel(task)}${getPriorityEmoji(task) ? ` ${getPriorityEmoji(task)}` : ""}`
    : null;
  const pathLines = pathSegments.map((segment, index) => {
    const indent = "  ".repeat(index);
    const hierarchyLabel = getHierarchyLabel(index);
    const title = escapeSlackText(toSmartTitleCase(segment.label || formatTaskLabel(segment)));

    if (index === 0) {
      return `${indent}- ${statusEmoji} ${hierarchyLabel}: *<${segment.url}|${title}>*`;
    }

    return `${indent}- ${hierarchyLabel}: <${segment.url}|${title}>`;
  });
  const pathBlockingLines = pathSegments.flatMap((segment, index) => {
    if (!Array.isArray(segment.blockingTasks) || segment.blockingTasks.length === 0) {
      return [];
    }

    const indent = `${"  ".repeat(index)}  `;
    return [`${indent}- Blocking: ${formatBlockingTasks(segment.blockingTasks)} :no_entry:`];
  });
  const metadataIndent = "  ".repeat(Math.max(pathSegments.length - 1, 0));
  const metadataLines = [];

  if (taskProperties.includes("status")) {
    metadataLines.push(`${metadataIndent}  - Status: ${statusLabel}`);
  }

  if (taskProperties.includes("priority") && priorityLine) {
    metadataLines.push(priorityLine);
  }

  if (taskProperties.includes("due")) {
    metadataLines.push(`${metadataIndent}  - Due: ${dueLabel}`);
  }

  if (taskProperties.includes("owner")) {
    metadataLines.push(`${metadataIndent}  - Owner: ${formatTaskOwner(task)}`);
  }

  if (taskProperties.includes("blocking")) {
    metadataLines.push(...pathBlockingLines);
  }

  return [
    ...pathLines,
    ...metadataLines
  ]
    .filter(Boolean)
    .join("\n");
}

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function chunkLines(lines, maxCharacters = 2800) {
  const chunks = [];
  let current = [];
  let size = 0;

  for (const line of lines) {
    const nextSize = size + line.length + 1;

    if (current.length > 0 && nextSize > maxCharacters) {
      chunks.push(current.join("\n"));
      current = [line];
      size = line.length;
      continue;
    }

    current.push(line);
    size = nextSize;
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

function buildOptionAHeader(taskProperties) {
  const columns = ["*Parent*", "*Task*"];

  if (taskProperties.includes("status")) {
    columns.push("*Status*");
  }

  if (taskProperties.includes("priority")) {
    columns.push("*Priority*");
  }

  if (taskProperties.includes("due")) {
    columns.push("*Due*");
  }

  if (taskProperties.includes("owner")) {
    columns.push("*Owner*");
  }

  if (taskProperties.includes("blocking")) {
    columns.push("*Blocking*");
  }

  return columns.join(" | ");
}

function pushCategory({ blocks, lines, title, items, kind, taskProperties }) {
  const headerLine = buildOptionAHeader(taskProperties);

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title} (${items.length})*`
    }
  });

  lines.push(`${title} (${items.length})`);

  if (items.length === 0) {
    const emptyText = kind === "dueToday" ? "_No open tasks due today._" : "_No open overdue tasks._";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: emptyText
      }
    });
    lines.push(kind === "dueToday" ? "- No open tasks due today." : "- No open overdue tasks.");
    lines.push("");
    return;
  }

  const taskLines = items.map((item) => formatTaskLine(item, kind, taskProperties));
  const blockLines = [headerLine, ...taskLines];

  for (const chunk of chunkLines(blockLines)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: chunk
      }
    });
  }

  lines.push(headerLine);
  lines.push(...taskLines);
  lines.push("");
}

function buildHeaderAndIntro({ runDate, timeZone, sourceLabel, sourceUrl }) {
  const title = "*Daily Task Status*";
  const boardLink = sourceUrl
    ? `<${sourceUrl}|${escapeSlackText(toSmartTitleCase(sourceLabel || "Dev Board"))}>`
    : `*${escapeSlackText(toSmartTitleCase(sourceLabel || "ClickUp"))}*`;
  const intro = `Synced from ${boardLink} at ${formatDate(
    runDate,
    timeZone
  )}. Reply here with blockers, progress, ETA, update the task status, and keep the board current.`;
  return {
    title,
    intro,
    lines: [title, intro, ""],
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Daily Task Status"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: intro
        }
      },
      {
        type: "divider"
      }
    ]
  };
}

function buildOptionAMessage({ dueToday, overdue, runDate, timeZone, sourceLabel, sourceUrl, taskProperties }) {
  const { lines, blocks } = buildHeaderAndIntro({ runDate, timeZone, sourceLabel, sourceUrl });

  pushCategory({
    blocks,
    lines,
    title: "Due Today",
    items: dueToday,
    kind: "dueToday",
    taskProperties
  });

  blocks.push({
    type: "divider"
  });
  lines.push("");

  pushCategory({
    blocks,
    lines,
    title: "Overdue",
    items: overdue,
    kind: "overdue",
    taskProperties
  });

  return {
    text: lines.join("\n").trim(),
    blocks
  };
}

function pushFriendlyCategory({ blocks, lines, title, items, kind, taskProperties }) {
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title} (${items.length})*`
    }
  });

  lines.push(`${title} (${items.length})`);

  if (items.length === 0) {
    const emptyText =
      kind === "dueToday" ? "No open tasks due today." : "No open overdue tasks.";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: emptyText
      }
    });
    lines.push(emptyText);
    lines.push("");
    return;
  }

  for (const item of items) {
    const blockText = formatFriendlyTaskBlock(item, kind, taskProperties);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: blockText
      }
    });
    lines.push(blockText);
    lines.push("");
  }
}

function buildOptionBMessage({ dueToday, overdue, runDate, timeZone, sourceLabel, sourceUrl, taskProperties }) {
  const { lines, blocks } = buildHeaderAndIntro({ runDate, timeZone, sourceLabel, sourceUrl });
  const totalTasks = dueToday.length + overdue.length;

  if (totalTasks > 40) {
    return buildOptionAMessage({ dueToday, overdue, runDate, timeZone, sourceLabel, sourceUrl, taskProperties });
  }

  pushFriendlyCategory({
    blocks,
    lines,
    title: "Due Today",
    items: dueToday,
    kind: "dueToday",
    taskProperties
  });

  blocks.push({
    type: "divider"
  });
  lines.push("");

  pushFriendlyCategory({
    blocks,
    lines,
    title: "Overdue",
    items: overdue,
    kind: "overdue",
    taskProperties
  });

  return {
    text: lines.join("\n").trim(),
    blocks
  };
}

export function buildReminderMessage({
  dueToday,
  overdue,
  runDate,
  timeZone,
  sourceLabel,
  sourceUrl,
  messageStyle = "option_b",
  taskProperties
}) {
  const visibleTaskProperties = normalizeTaskProperties(taskProperties);

  if (messageStyle === "option_a") {
    return buildOptionAMessage({
      dueToday,
      overdue,
      runDate,
      timeZone,
      sourceLabel,
      sourceUrl,
      taskProperties: visibleTaskProperties
    });
  }

  return buildOptionBMessage({
    dueToday,
    overdue,
    runDate,
    timeZone,
    sourceLabel,
    sourceUrl,
    taskProperties: visibleTaskProperties
  });
}
