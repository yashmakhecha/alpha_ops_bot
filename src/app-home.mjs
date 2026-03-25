import {
  formatScheduleTimes,
  getTrackedClickupSources,
  TASK_PROPERTY_OPTIONS
} from "./runtime-config.mjs";

export const APP_HOME_IDS = {
  trackedListsBlock: "tracked_lists_block",
  trackedListsAction: "tracked_lists_select",
  taskPropertiesBlock: "task_properties_block",
  taskPropertiesAction: "task_properties_select",
  publicEnabledBlock: "public_enabled_block",
  publicEnabledAction: "public_enabled_toggle",
  publicWeekendsBlock: "public_weekends_block",
  publicWeekendsAction: "public_weekends_toggle",
  publicChannelBlock: "public_channel_block",
  publicChannelAction: "public_channel_select",
  adminEnabledBlock: "admin_enabled_block",
  adminEnabledAction: "admin_enabled_toggle",
  scheduleTimesBlock: "schedule_times_block",
  scheduleTimesAction: "schedule_times_input",
  saveSettingsAction: "save_settings",
  refreshHomeAction: "refresh_home",
  sendTestDmAction: "send_test_dm_now",
  sendPublicNowAction: "send_public_now",
  showRestrictedPreviewAction: "show_restricted_preview",
  hideRestrictedPreviewAction: "hide_restricted_preview"
};

const PROPERTY_LABELS = {
  status: "Status",
  priority: "Priority",
  due: "Due",
  owner: "Owner",
  blocking: "Blocking"
};

function escapeSlackText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTaskLabel(task) {
  return task.customId ? `${task.customId}: ${task.name}` : task.name;
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

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatPublicDestinationLabel(runtimeConfig) {
  if (runtimeConfig.slack.destinationType === "dm") {
    if (runtimeConfig.slack.dmUserId) {
      return `DM with <@${runtimeConfig.slack.dmUserId}>`;
    }

    if (runtimeConfig.slack.dmEmail) {
      return `DM with ${escapeSlackText(runtimeConfig.slack.dmEmail)}`;
    }

    if (runtimeConfig.slack.dmName) {
      return `DM with ${escapeSlackText(runtimeConfig.slack.dmName)}`;
    }
  }

  return runtimeConfig.slack.channelId || "#all-alpha";
}

function formatAdminDestinationLabel(runtimeConfig, adminUserId) {
  if (runtimeConfig.adminSummary.dmUserId || adminUserId) {
    return `<@${runtimeConfig.adminSummary.dmUserId || adminUserId}>`;
  }

  if (runtimeConfig.adminSummary.dmEmail) {
    return escapeSlackText(runtimeConfig.adminSummary.dmEmail);
  }

  if (runtimeConfig.adminSummary.dmName) {
    return escapeSlackText(runtimeConfig.adminSummary.dmName);
  }

  return "Not configured";
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
      const label = escapeSlackText(toSmartTitleCase(formatTaskLabel(segment)));

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

function buildRestrictedPreviewBlocks(adminUserId) {
  const restrictedView = buildRestrictedView(adminUserId);

  return [
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "*Restricted View Preview*\n" +
          `This is what everyone except <@${adminUserId}> sees in Alpha Ops Home.\n` +
          "_Access is enforced server-side on every Home open and every button click by matching the Slack viewer user ID._"
      }
    },
    ...restrictedView.blocks
  ];
}

function buildTaskPropertyOptions(selectedProperties) {
  return TASK_PROPERTY_OPTIONS.map((value) => ({
    text: {
      type: "plain_text",
      text: PROPERTY_LABELS[value]
    },
    value
  }));
}

function buildTaskPropertyInitialOptions(selectedProperties) {
  return buildTaskPropertyOptions().filter((option) => selectedProperties.includes(option.value));
}

function buildToggleOption(label, value) {
  return {
    text: {
      type: "plain_text",
      text: label
    },
    value
  };
}

function formatClickupListGroupLabel(list) {
  const parts = [];

  if (list.teamName) {
    parts.push(list.teamName);
  }

  if (list.spaceName) {
    parts.push(list.spaceName);
  }

  if (list.folderName) {
    parts.push(list.folderName);
  }

  return parts.join(" / ") || "Other Lists";
}

function buildClickupListOption(source) {
  return {
    text: {
      type: "plain_text",
      text: source.name || source.id
    },
    value: source.id
  };
}

function buildClickupListOptionGroups(clickupLists) {
  const groups = new Map();

  for (const list of clickupLists) {
    const groupLabel = formatClickupListGroupLabel(list);

    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, []);
    }

    groups.get(groupLabel).push(buildClickupListOption(list));
  }

  return [...groups.entries()]
    .sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
    .map(([label, options]) => ({
      label: {
        type: "plain_text",
        text: label
      },
      options: options.sort((left, right) => left.text.text.localeCompare(right.text.text))
    }));
}

function buildClickupListInitialOptions(selectedSources, clickupLists) {
  const clickupListMap = new Map((clickupLists || []).map((list) => [list.id, list]));

  return selectedSources.map((source) => buildClickupListOption(clickupListMap.get(source.id) || source));
}

function formatTrackedClickupLists(selectedSources) {
  if (selectedSources.length === 0) {
    return "None Selected";
  }

  const preview = selectedSources.slice(0, 3).map((source) => source.name || source.id);

  if (selectedSources.length > preview.length) {
    preview.push(`+${selectedSources.length - preview.length} More`);
  }

  return preview.join(", ");
}

export function buildAppHomeView({
  viewerUserId,
  adminUserId,
  runtimeConfig,
  snapshot,
  clickupLists = [],
  sourceLabel,
  sourceUrl,
  notice = "",
  lastLoggedRunOn = null,
  publicChannelId = "",
  showRestrictedPreview = false
}) {
  if (!adminUserId || viewerUserId !== adminUserId) {
    return buildRestrictedView(adminUserId);
  }

  const scheduleLabel = `${formatScheduleTimes(runtimeConfig.schedule.times)} ${runtimeConfig.schedule.timezone}`;
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
  const taskPropertySummary = runtimeConfig.taskProperties
    .map((property) => PROPERTY_LABELS[property])
    .join(", ");
  const trackedClickupSources = getTrackedClickupSources(runtimeConfig.clickup);
  const publicSummaryLines = [
    `*Public Announcement Settings*`,
    `Status: *${runtimeConfig.slack.enabled ? "Enabled" : "Disabled"}*`,
    `Weekends: *${runtimeConfig.slack.weekendsEnabled ? "Enabled" : "Disabled"}*`,
    `Tracked Lists: *${escapeSlackText(formatTrackedClickupLists(trackedClickupSources))}*`,
    `Channel: *${formatPublicDestinationLabel(runtimeConfig)}*`,
    `Send times: *${escapeSlackText(scheduleLabel)}*`,
    `Visible task properties: *${escapeSlackText(taskPropertySummary || "None")}*`
  ];
  const privateSummaryLines = [
    `*Private Announcement Settings*`,
    `Team Progress Update DM: *${runtimeConfig.adminSummary.enabled ? "Enabled" : "Disabled"}*`,
    `Recipient: *${formatAdminDestinationLabel(runtimeConfig, adminUserId)}*`
  ];

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
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: publicSummaryLines.join("\n")
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.trackedListsBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "ClickUp lists to include in daily updates"
      },
      element: {
        type: "multi_static_select",
        action_id: APP_HOME_IDS.trackedListsAction,
        placeholder: {
          type: "plain_text",
          text: "Choose tracked lists"
        },
        option_groups: buildClickupListOptionGroups(clickupLists),
        initial_options: buildClickupListInitialOptions(trackedClickupSources, clickupLists)
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.taskPropertiesBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "Task properties to include in public reminders"
      },
      element: {
        type: "multi_static_select",
        action_id: APP_HOME_IDS.taskPropertiesAction,
        placeholder: {
          type: "plain_text",
          text: "Choose visible properties"
        },
        options: buildTaskPropertyOptions(runtimeConfig.taskProperties),
        initial_options: buildTaskPropertyInitialOptions(runtimeConfig.taskProperties)
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.publicEnabledBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "Public reminder delivery"
      },
      element: {
        type: "checkboxes",
        action_id: APP_HOME_IDS.publicEnabledAction,
        options: [buildToggleOption("Enable public announcement", "public_enabled")],
        initial_options: runtimeConfig.slack.enabled
          ? [buildToggleOption("Enable public announcement", "public_enabled")]
          : []
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.publicWeekendsBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "Weekend public announcements"
      },
      element: {
        type: "checkboxes",
        action_id: APP_HOME_IDS.publicWeekendsAction,
        options: [buildToggleOption("Send public announcements on Saturdays and Sundays", "public_weekends_enabled")],
        initial_options: runtimeConfig.slack.weekendsEnabled
          ? [buildToggleOption("Send public announcements on Saturdays and Sundays", "public_weekends_enabled")]
          : []
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.publicChannelBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "Public reminder channel"
      },
      element: {
        type: "conversations_select",
        action_id: APP_HOME_IDS.publicChannelAction,
        filter: {
          include: ["public"]
        },
        ...(publicChannelId ? { initial_conversation: publicChannelId } : {})
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.scheduleTimesBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "Public send times"
      },
      hint: {
        type: "plain_text",
        text: `Use HH:MM in ${runtimeConfig.schedule.timezone}, comma-separated for multiple sends. 24:00 is allowed for midnight.`
      },
      element: {
        type: "plain_text_input",
        action_id: APP_HOME_IDS.scheduleTimesAction,
        initial_value: formatScheduleTimes(runtimeConfig.schedule.times)
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: privateSummaryLines.join("\n")
      }
    },
    {
      type: "input",
      block_id: APP_HOME_IDS.adminEnabledBlock,
      optional: true,
      label: {
        type: "plain_text",
        text: "Private Team Progress Update DM"
      },
      element: {
        type: "checkboxes",
        action_id: APP_HOME_IDS.adminEnabledAction,
        options: [buildToggleOption("Enable private Team Progress Update DM", "admin_enabled")],
        initial_options: runtimeConfig.adminSummary.enabled
          ? [buildToggleOption("Enable private Team Progress Update DM", "admin_enabled")]
          : []
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Save Settings"
          },
          action_id: APP_HOME_IDS.saveSettingsAction
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Refresh Home"
          },
          action_id: APP_HOME_IDS.refreshHomeAction
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Send Test DM Now"
          },
          style: "primary",
          action_id: APP_HOME_IDS.sendTestDmAction
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Send Public Message Now"
          },
          action_id: APP_HOME_IDS.sendPublicNowAction
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: showRestrictedPreview ? "Hide Restricted Preview" : "Show Restricted Preview"
          },
          action_id: showRestrictedPreview
            ? APP_HOME_IDS.hideRestrictedPreviewAction
            : APP_HOME_IDS.showRestrictedPreviewAction
        }
      ]
    },
    ...(sourceUrl
      ? [
          {
            type: "actions",
            elements: [
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
          }
        ]
      : []),
    {
      type: "divider"
    },
    buildPreviewBlock("Due Today Preview", snapshot.dueToday, "No tasks due today."),
    buildPreviewBlock("Overdue Preview", snapshot.overdue, "No overdue tasks."),
    ...(showRestrictedPreview ? buildRestrictedPreviewBlocks(adminUserId) : [])
  ];

  return {
    type: "home",
    callback_id: "alpha_ops_home",
    blocks
  };
}
