function getDateKeyFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function getDueDateFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric"
  });
}

function parseDueTimestamp(value) {
  if (value == null || value === "") {
    return null;
  }

  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortReminderItems(left, right) {
  const leftHasPriority = left.prioritySortRank != null;
  const rightHasPriority = right.prioritySortRank != null;
  const leftHasBlocking = Boolean(left.hasBlockingInPath);
  const rightHasBlocking = Boolean(right.hasBlockingInPath);

  if (leftHasPriority !== rightHasPriority) {
    return leftHasPriority ? -1 : 1;
  }

  if (left.prioritySortRank != null && right.prioritySortRank != null) {
    if (left.prioritySortRank !== right.prioritySortRank) {
      return left.prioritySortRank - right.prioritySortRank;
    }
  }

  if (leftHasBlocking !== rightHasBlocking) {
    return leftHasBlocking ? -1 : 1;
  }

  if (left.dueTimestamp !== right.dueTimestamp) {
    return left.dueTimestamp - right.dueTimestamp;
  }

  return left.name.localeCompare(right.name);
}

function getPrioritySortRank(task) {
  if (task.priorityOrder != null) {
    return task.priorityOrder;
  }

  const label = String(task.priorityLabel || "")
    .trim()
    .toLowerCase();

  if (!label) {
    return null;
  }

  const knownRanks = {
    urgent: 0,
    high: 1,
    normal: 2,
    medium: 2,
    low: 3
  };

  return knownRanks[label] ?? 4;
}

function buildListUrl(teamId, listId) {
  if (!teamId || !listId) {
    return null;
  }

  return `https://app.clickup.com/${teamId}/v/li/${listId}`;
}

function formatTaskLabel(task) {
  return task.customId ? `${task.customId}: ${task.name}` : task.name;
}

function getBlockingTasksForId(blockingMap, taskId) {
  return [...new Map((blockingMap.get(taskId) || []).map((blockedTask) => [blockedTask.id, blockedTask])).values()].map(
    (blockedTask) => ({
      id: blockedTask.id,
      name: blockedTask.name,
      customId: blockedTask.customId,
      url: blockedTask.url
    })
  );
}

function buildTaskPath(task, tasksById, blockingMap) {
  const segments = [];
  const seen = new Set();
  let current = task;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    segments.unshift({
      id: current.id,
      name: current.name,
      customId: current.customId,
      label: formatTaskLabel(current),
      url: current.url,
      blockingTasks: getBlockingTasksForId(blockingMap, current.id)
    });

    if (!current.parentId) {
      break;
    }

    current = tasksById.get(current.parentId) || null;
  }

  return segments;
}

export function buildReminderBuckets(
  tasks,
  { now = new Date(), timeZone, includeUnassigned = false } = {}
) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const parentIdsWithSubtasks = new Set(tasks.filter((task) => task.parentId).map((task) => task.parentId));
  const blockingMap = new Map();
  const dateKeyFormatter = getDateKeyFormatter(timeZone);
  const dueDateFormatter = getDueDateFormatter(timeZone);
  const todayKey = dateKeyFormatter.format(now);
  const dueToday = [];
  const overdue = [];

  for (const task of tasks) {
    for (const dependency of task.dependencies || []) {
      if (!dependency.dependsOn || !dependency.taskId) {
        continue;
      }

      const blockedTask = tasksById.get(dependency.taskId);

      if (!blockedTask) {
        continue;
      }

      if (!blockingMap.has(dependency.dependsOn)) {
        blockingMap.set(dependency.dependsOn, []);
      }

      blockingMap.get(dependency.dependsOn).push(blockedTask);
    }
  }

  for (const task of tasks) {
    const dueTimestamp = parseDueTimestamp(task.dueDate);

    if (!dueTimestamp) {
      continue;
    }

    if (parentIdsWithSubtasks.has(task.id)) {
      continue;
    }

    if (task.assignees.length === 0 && !includeUnassigned) {
      continue;
    }

    const dueDate = new Date(dueTimestamp);
    const dueKey = dateKeyFormatter.format(dueDate);
    const taskPath = buildTaskPath(task, tasksById, blockingMap);
    const parentTask = taskPath.length > 1
      ? {
          name: taskPath[taskPath.length - 2]?.name || null,
          customId: taskPath[taskPath.length - 2]?.customId || null,
          url: taskPath[taskPath.length - 2]?.url || null
        }
      : null;
    const blockingTasks = getBlockingTasksForId(blockingMap, task.id);
    const item = {
      ...task,
      dueTimestamp,
      dueLabel: dueDateFormatter.format(dueDate),
      taskPath,
      parentName: parentTask?.name || null,
      parentCustomId: parentTask?.customId || null,
      parentUrl: parentTask?.url || null,
      prioritySortRank: getPrioritySortRank(task),
      hasBlockingInPath: taskPath.some((segment) => Array.isArray(segment.blockingTasks) && segment.blockingTasks.length > 0),
      blockingTasks
    };

    if (dueKey === todayKey) {
      dueToday.push(item);
      continue;
    }

    if (dueKey < todayKey) {
      overdue.push(item);
    }
  }

  dueToday.sort(sortReminderItems);
  overdue.sort(sortReminderItems);

  return {
    sourceLabel: tasks.find((task) => task.listName)?.listName || null,
    sourceUrl: buildListUrl(tasks[0]?.teamId, tasks[0]?.listId),
    dueToday,
    overdue
  };
}
