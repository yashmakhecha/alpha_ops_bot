function escapeSlackText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTaskLabel(task) {
  return task.customId ? `${task.customId}: ${task.name}` : task.name;
}

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDestinationLabel(config) {
  if (config.destinationType === "channel") {
    return config.channelId || "Unknown channel";
  }

  if (config.dmUserId) {
    return `DM with <@${config.dmUserId}>`;
  }

  if (config.dmEmail) {
    return `DM with ${escapeSlackText(config.dmEmail)}`;
  }

  if (config.dmName) {
    return `DM with ${escapeSlackText(config.dmName)}`;
  }

  return "Direct message";
}

function formatTaskPath(task) {
  const segments =
    Array.isArray(task.taskPath) && task.taskPath.length > 0
      ? task.taskPath
      : [
          {
            name: task.name,
            customId: task.customId,
            url: task.url
          }
        ];

  return segments
    .map((segment, index) => {
      const label = escapeSlackText(formatTaskLabel(segment));

      if (index === segments.length - 1 && segment.url) {
        return `<${segment.url}|${label}>`;
      }

      return label;
    })
    .join(" / ");
}

function buildPreviewBlock(title, items, emptyText) {
  const previewItems = items.slice(0, 5);

  if (previewItems.length === 0) {
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n${emptyText}`
      }
    };
  }

  const lines = previewItems.map((item) => `- ${formatTaskPath(item)}`);

  if (items.length > previewItems.length) {
    lines.push(`- +${items.length - previewItems.length} more`);
  }

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title}*\n${lines.join("\n")}`
    }
  };
}

function buildRestrictedView(adminUserId) {
  const text = adminUserId
    ? `This App Home is reserved for <@${adminUserId}>.`
    : "This App Home is reserved for the Alpha Ops admin.";

  return {
    type: "home",
    callback_id: "alpha_ops_home",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Alpha Ops App Home"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text
        }
      }
    ]
  };
}

export function buildAppHomeView({
  viewerUserId,
  adminUserId,
  runtimeConfig,
  snapshot,
  sourceLabel,
  sourceUrl,
  notice = "",
  lastLoggedRunOn = null
}) {
  if (!adminUserId || viewerUserId !== adminUserId) {
    return buildRestrictedView(adminUserId);
  }

  const scheduleLabel = `${runtimeConfig.schedule.time} ${runtimeConfig.schedule.timezone}`;
  const reminderDestination = formatDestinationLabel(runtimeConfig.slack);
  const adminDestination = runtimeConfig.adminSummary.enabled
    ? formatDestinationLabel({
        destinationType: "dm",
        dmUserId: runtimeConfig.adminSummary.dmUserId || adminUserId,
        dmEmail: runtimeConfig.adminSummary.dmEmail,
        dmName: runtimeConfig.adminSummary.dmName
      })
    : "Disabled";
  const totals = snapshot.overdueLog.totals;
  const ownersWithOverdue = snapshot.overdueLog.ownerSummary.filter(
    (owner) => owner.currentOverdueTasks > 0
  ).length;
  const boardLink = sourceUrl
    ? `<${sourceUrl}|${escapeSlackText(sourceLabel || "ClickUp board")}>`
    : `*${escapeSlackText(sourceLabel || "ClickUp board")}*`;
  const headerText = notice
    ? `*Private control panel for <@${viewerUserId}>.* ${escapeSlackText(notice)}`
    : `*Private control panel for <@${viewerUserId}>.* Everyone else sees a locked view.`;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Alpha Ops Control Panel"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${headerText}\nLive snapshot from ${boardLink} at ${formatDate(
          snapshot.runDate,
          runtimeConfig.schedule.timezone
        )}.`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Schedule: *${escapeSlackText(scheduleLabel)}*`
        },
        {
          type: "mrkdwn",
          text: `Reminder: *${reminderDestination}*`
        },
        {
          type: "mrkdwn",
          text: `Private Summary: *${adminDestination}*`
        },
        {
          type: "mrkdwn",
          text: `Last Logged Run: *${escapeSlackText(lastLoggedRunOn || "Not yet recorded")}*`
        }
      ]
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Due Today*\n${snapshot.dueToday.length}`
        },
        {
          type: "mrkdwn",
          text: `*Overdue*\n${snapshot.overdue.length}`
        },
        {
          type: "mrkdwn",
          text: `*Owners With Overdue*\n${ownersWithOverdue}`
        },
        {
          type: "mrkdwn",
          text: `*Missed Deadlines*\n${totals.missedDeadlines}`
        },
        {
          type: "mrkdwn",
          text: `*Overdue Days Logged*\n${totals.overdueDays}`
        },
        {
          type: "mrkdwn",
          text: `*Current Overdue Tasks*\n${totals.currentOverdueTasks}`
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Refresh Home"
          },
          action_id: "refresh_home"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Send Test DM Now"
          },
          style: "primary",
          action_id: "send_test_dm_now"
        },
        ...(sourceUrl
          ? [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open Dev Board"
                },
                url: sourceUrl,
                action_id: "open_dev_board"
              }
            ]
          : [])
      ]
    },
    {
      type: "divider"
    },
    buildPreviewBlock("Due Today Preview", snapshot.dueToday, "No tasks due today."),
    buildPreviewBlock("Overdue Preview", snapshot.overdue, "No overdue tasks."),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Controls*\n- `Refresh Home` pulls a fresh ClickUp snapshot.\n- `Send Test DM Now` sends the reminder and Team Progress Update only to you."
      }
    }
  ];

  return {
    type: "home",
    callback_id: "alpha_ops_home",
    blocks
  };
}
