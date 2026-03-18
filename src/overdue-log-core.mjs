function getDateKeyFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function createEmptyOverdueState() {
  return {
    version: 2,
    lastRunOn: null,
    tasks: {},
    owners: {}
  };
}

export function normalizeOverdueState(parsed) {
  return {
    version: parsed?.version || 2,
    lastRunOn: parsed?.lastRunOn || null,
    tasks: parsed?.tasks || {},
    owners: parsed?.owners || {}
  };
}

function getOwnerRefs(task) {
  if (Array.isArray(task.owners) && task.owners.length > 0) {
    return task.owners.map((owner) => ({
      key: owner.id ? `slack:${owner.id}` : `label:${owner.label.toLowerCase()}`,
      label: owner.label,
      mention: owner.mention
    }));
  }

  if (task.isUnassigned) {
    return [
      {
        key: "unassigned",
        label: "Unassigned",
        mention: "_Unassigned_"
      }
    ];
  }

  return [
    {
      key: "unmapped",
      label: "Owner not mapped",
      mention: "_Owner not mapped_"
    }
  ];
}

function getTaskLabel(task) {
  return task.customId ? `${task.customId}: ${task.name}` : task.name;
}

function ensureOwnerState(state, ownerRef) {
  if (!state.owners[ownerRef.key]) {
    state.owners[ownerRef.key] = {
      key: ownerRef.key,
      label: ownerRef.label,
      mention: ownerRef.mention,
      overdueDays: 0,
      unchangedStatusOverdueDays: 0,
      missedDeadlines: 0
    };
  }

  state.owners[ownerRef.key].label = ownerRef.label;
  state.owners[ownerRef.key].mention = ownerRef.mention;
  state.owners[ownerRef.key].unchangedStatusOverdueDays ||= 0;

  return state.owners[ownerRef.key];
}

function getStatusKey(task) {
  return `${String(task.statusType || "").trim().toLowerCase()}::${String(task.statusLabel || "")
    .trim()
    .toLowerCase()}`;
}

function ensureTaskState(state, task, ownerRefs) {
  if (!state.tasks[task.id]) {
    state.tasks[task.id] = {
      id: task.id,
      label: getTaskLabel(task),
      url: task.url,
      overdueDays: 0,
      unchangedStatusOverdueDays: 0,
      missedDeadlines: 0,
      currentlyOverdue: false,
      lastOverdueCountedOn: null,
      activeStatusKey: null,
      lastStatusLabel: task.statusLabel,
      lastStatusType: task.statusType,
      lastDueLabel: task.dueLabel,
      owners: ownerRefs
    };
  }

  const taskState = state.tasks[task.id];
  taskState.label = getTaskLabel(task);
  taskState.url = task.url;
  taskState.lastStatusLabel = task.statusLabel;
  taskState.lastStatusType = task.statusType;
  taskState.lastDueLabel = task.dueLabel;
  taskState.owners = ownerRefs;
  taskState.unchangedStatusOverdueDays ||= 0;
  return taskState;
}

function sortOwnerSummary(left, right) {
  if (right.currentOverdueTasks !== left.currentOverdueTasks) {
    return right.currentOverdueTasks - left.currentOverdueTasks;
  }

  if (right.unchangedStatusOverdueDays !== left.unchangedStatusOverdueDays) {
    return right.unchangedStatusOverdueDays - left.unchangedStatusOverdueDays;
  }

  if (right.overdueDays !== left.overdueDays) {
    return right.overdueDays - left.overdueDays;
  }

  return left.label.localeCompare(right.label);
}

export function updateOverdueState({
  state,
  trackedItems,
  overdueItems,
  timeZone,
  now = new Date()
}) {
  const nextState = normalizeOverdueState(state);
  const dateKeyFormatter = getDateKeyFormatter(timeZone);
  const todayKey = dateKeyFormatter.format(now);
  const overdueIds = new Set(overdueItems.map((item) => item.id));
  const currentOverdueByOwner = new Map();

  for (const task of trackedItems) {
    const ownerRefs = getOwnerRefs(task);
    const taskState = ensureTaskState(nextState, task, ownerRefs);
    const statusKey = getStatusKey(task);
    const hadSameStatusWhileOverdue =
      taskState.currentlyOverdue &&
      taskState.activeStatusKey != null &&
      taskState.activeStatusKey === statusKey;

    if (!overdueIds.has(task.id)) {
      taskState.currentlyOverdue = false;
      taskState.activeStatusKey = null;
      continue;
    }

    for (const ownerRef of ownerRefs) {
      ensureOwnerState(nextState, ownerRef);

      if (!currentOverdueByOwner.has(ownerRef.key)) {
        currentOverdueByOwner.set(ownerRef.key, {
          count: 0,
          tasks: [],
          owner: ownerRef
        });
      }

      currentOverdueByOwner.get(ownerRef.key).count += 1;
      currentOverdueByOwner.get(ownerRef.key).tasks.push({
        id: task.id,
        label: getTaskLabel(task),
        url: task.url
      });
    }

    if (!taskState.currentlyOverdue) {
      taskState.missedDeadlines += 1;

      for (const ownerRef of ownerRefs) {
        ensureOwnerState(nextState, ownerRef).missedDeadlines += 1;
      }
    }

    if (taskState.lastOverdueCountedOn !== todayKey) {
      taskState.overdueDays += 1;
      taskState.lastOverdueCountedOn = todayKey;

      for (const ownerRef of ownerRefs) {
        ensureOwnerState(nextState, ownerRef).overdueDays += 1;
      }

      if (hadSameStatusWhileOverdue) {
        taskState.unchangedStatusOverdueDays += 1;

        for (const ownerRef of ownerRefs) {
          ensureOwnerState(nextState, ownerRef).unchangedStatusOverdueDays += 1;
        }
      }
    }

    taskState.currentlyOverdue = true;
    taskState.activeStatusKey = statusKey;
  }

  for (const taskState of Object.values(nextState.tasks)) {
    if (!overdueIds.has(taskState.id)) {
      taskState.currentlyOverdue = false;
      taskState.activeStatusKey = null;
    }
  }

  nextState.lastRunOn = todayKey;

  const ownerSummary = Object.values(nextState.owners)
    .map((ownerState) => {
      const current = currentOverdueByOwner.get(ownerState.key);

      return {
        ...ownerState,
        currentOverdueTasks: current?.count || 0,
        currentTasks: current?.tasks || []
      };
    })
    .sort(sortOwnerSummary);

  return {
    todayKey,
    state: nextState,
    ownerSummary,
    totals: {
      overdueDays: ownerSummary.reduce((sum, owner) => sum + owner.overdueDays, 0),
      unchangedStatusOverdueDays: ownerSummary.reduce(
        (sum, owner) => sum + owner.unchangedStatusOverdueDays,
        0
      ),
      missedDeadlines: ownerSummary.reduce((sum, owner) => sum + owner.missedDeadlines, 0),
      currentOverdueTasks: overdueItems.length
    }
  };
}
