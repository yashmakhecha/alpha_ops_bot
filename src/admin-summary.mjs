function escapeSlackText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function buildAdminSummaryMessage({ ownerSummary, totals, runDate, timeZone, sourceLabel, sourceUrl }) {
  const boardLink = sourceUrl
    ? `<${sourceUrl}|${escapeSlackText(sourceLabel || "ClickUp source")}>`
    : `*${escapeSlackText(sourceLabel || "ClickUp")}*`;
  const lines = [
    "*Private Deadline Log*",
    `Only visible to you. Snapshot from ${boardLink} at ${formatDate(
      runDate,
      timeZone
    )}. Total overdue days keep tracking lateness. Unchanged-status overdue days only grow when a task stays overdue without a status change.`,
    "",
    `*Totals*`,
    `- Missed Deadlines: ${totals.missedDeadlines}`,
    `- Overdue Days Logged: ${totals.overdueDays}`,
    `- Unchanged-Status Overdue Days: ${totals.unchangedStatusOverdueDays}`,
    `- Current Overdue Tasks: ${totals.currentOverdueTasks}`,
    ""
  ];
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Private Deadline Log"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Only visible to you. Snapshot from ${boardLink} at ${formatDate(
          runDate,
          timeZone
        )}. Total overdue days keep tracking lateness. Unchanged-status overdue days only grow when a task stays overdue without a status change.`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Totals*\n- Missed Deadlines: ${totals.missedDeadlines}\n- Overdue Days Logged: ${totals.overdueDays}\n- Unchanged-Status Overdue Days: ${totals.unchangedStatusOverdueDays}\n- Current Overdue Tasks: ${totals.currentOverdueTasks}`
      }
    },
    {
      type: "divider"
    }
  ];

  if (ownerSummary.length === 0) {
    lines.push("No owner history recorded yet.");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No owner history recorded yet."
      }
    });

    return {
      text: lines.join("\n").trim(),
      blocks
    };
  }

  lines.push("*By Owner*");

  const ownerLines = [];

  for (const owner of ownerSummary) {
    ownerLines.push(`- ${owner.mention}`);
    ownerLines.push(`  - Missed Deadlines: ${owner.missedDeadlines}`);
    ownerLines.push(`  - Overdue Days Logged: ${owner.overdueDays}`);
    ownerLines.push(
      `  - Unchanged-Status Overdue Days: ${owner.unchangedStatusOverdueDays}`
    );
    ownerLines.push(`  - Current Overdue Tasks: ${owner.currentOverdueTasks}`);

    if (owner.currentTasks.length > 0) {
      ownerLines.push(
        `  - Currently Overdue: ${owner.currentTasks
          .map((task) => `<${task.url}|${escapeSlackText(task.label)}>` )
          .join(", ")}`
      );
    }

    ownerLines.push("");
  }

  for (const chunk of chunkLines(ownerLines.filter(Boolean))) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: chunk
      }
    });
  }

  lines.push(...ownerLines);

  return {
    text: lines.join("\n").trim(),
    blocks
  };
}
