function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEntry(entry) {
  return {
    clickup: {
      userId: entry?.clickup?.userId ? String(entry.clickup.userId) : null,
      email: entry?.clickup?.email || null,
      name: entry?.clickup?.name || null
    },
    slack: {
      userId: entry?.slack?.userId ? String(entry.slack.userId) : null,
      email: entry?.slack?.email || null,
      displayName: entry?.slack?.displayName || null,
      realName: entry?.slack?.realName || null
    }
  };
}

export function normalizeOwnerMap(payload) {
  const owners = Array.isArray(payload?.owners)
    ? payload.owners
    : Array.isArray(payload)
      ? payload
      : [];

  return owners.map(normalizeEntry);
}

export function findOwnerMapping(assignee, ownerMap) {
  const assigneeId = assignee?.id != null ? String(assignee.id) : null;
  const assigneeEmail = normalizeText(assignee?.email);
  const assigneeName = normalizeText(assignee?.username || assignee?.name);

  return (
    ownerMap.find((entry) => entry.clickup.userId && entry.clickup.userId === assigneeId) ||
    ownerMap.find(
      (entry) => entry.clickup.email && normalizeText(entry.clickup.email) === assigneeEmail
    ) ||
    ownerMap.find((entry) => entry.clickup.name && normalizeText(entry.clickup.name) === assigneeName) ||
    null
  );
}

export function getOwnerLookupCandidate(assignee, mapping) {
  return {
    clickupName: assignee?.username || assignee?.name || "Unknown owner",
    slackUserId: mapping?.slack?.userId || null,
    slackEmail: mapping?.slack?.email || assignee?.email || null,
    slackDisplayName: mapping?.slack?.displayName || null,
    slackRealName: mapping?.slack?.realName || null
  };
}
