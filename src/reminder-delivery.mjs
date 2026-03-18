import { findOwnerMapping, getOwnerLookupCandidate } from "./owner-map-core.mjs";

export async function resolveTaskOwners(task, ownerMap, slack) {
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

export async function resolveReminderItems(items, ownerMap, slack) {
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

export async function resolveDestination(config, slack) {
  if (config.destinationType === "channel") {
    const channel = await slack.resolveChannelId(config.channelId || "");

    return {
      channel,
      label: channel
    };
  }

  const dm = await slack.openDirectMessage({
    userId: config.dmUserId || undefined,
    email: config.dmEmail || undefined,
    name: config.dmName || undefined
  });

  return {
    channel: dm.channelId,
    label: `DM with ${dm.userId}`
  };
}

export async function resolveAdminUserId(runtimeConfig, slack, overrideUserId = "") {
  if (overrideUserId) {
    return overrideUserId;
  }

  const adminConfig = runtimeConfig?.adminSummary || {};

  if (adminConfig.dmUserId) {
    return adminConfig.dmUserId;
  }

  const resolvedAdminUserId = await slack.resolveUserId({
    userId: adminConfig.dmUserId,
    email: adminConfig.dmEmail,
    name: adminConfig.dmName
  });

  if (resolvedAdminUserId) {
    return resolvedAdminUserId;
  }

  const reminderConfig = runtimeConfig?.slack || {};

  if (reminderConfig.destinationType !== "dm") {
    return null;
  }

  return slack.resolveUserId({
    userId: reminderConfig.dmUserId,
    email: reminderConfig.dmEmail,
    name: reminderConfig.dmName
  });
}
