import { jsonRequest } from "./http.mjs";

const CLOSED_STATUS_TYPES = new Set(["closed", "complete", "completed", "done"]);
const CLOSED_STATUS_LABELS = new Set(["closed", "complete", "completed", "done"]);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildTasksUrl({ baseUrl, sourceType, sourceId, page }) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    sourceType === "view" ? `view/${sourceId}/task` : `list/${sourceId}/task`,
    normalizedBaseUrl
  );

  url.searchParams.set("page", String(page));
  url.searchParams.set("include_closed", "true");

  if (sourceType === "list") {
    url.searchParams.set("subtasks", "true");
  }

  return url;
}

function getTasksFromResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.tasks)) {
    return payload.tasks;
  }

  return [];
}

function isTaskOpen(task) {
  if (task.archived || task.date_closed) {
    return false;
  }

  const statusType = normalizeText(task.status?.type);
  const statusName = normalizeText(task.status?.status || task.status?.name);

  if (CLOSED_STATUS_TYPES.has(statusType) || CLOSED_STATUS_LABELS.has(statusName)) {
    return false;
  }

  return true;
}

function normalizeTask(task) {
  const priorityOrderIndex =
    task.priority?.orderindex != null && task.priority.orderindex !== ""
      ? Number(task.priority.orderindex)
      : null;

  return {
    id: String(task.id),
    customId: task.custom_id || null,
    name: task.name || "Untitled task",
    url: task.url || `https://app.clickup.com/t/${task.id}`,
    teamId: task.team_id ? String(task.team_id) : null,
    listId: task.list?.id ? String(task.list.id) : null,
    listName: task.list?.name || null,
    statusLabel: task.status?.status || task.status?.name || "Unknown",
    statusType: task.status?.type || "",
    priorityLabel: task.priority?.priority || null,
    priorityOrder:
      priorityOrderIndex != null && Number.isFinite(priorityOrderIndex) ? priorityOrderIndex : null,
    dependencies: Array.isArray(task.dependencies)
      ? task.dependencies.map((dependency) => ({
          taskId: dependency?.task_id ? String(dependency.task_id) : null,
          dependsOn: dependency?.depends_on ? String(dependency.depends_on) : null,
          type: dependency?.type ?? null
        }))
      : [],
    assignees: Array.isArray(task.assignees) ? task.assignees : [],
    archived: Boolean(task.archived),
    dueDate: task.due_date || null,
    isSubtask: Boolean(task.parent),
    parentId: task.parent ? String(task.parent) : null
  };
}

export async function fetchOpenTasks(config) {
  const headers = {
    Authorization: config.token,
    "Content-Type": "application/json"
  };

  const tasks = [];
  let page = 0;

  while (true) {
    const url = buildTasksUrl({ ...config, page });
    const payload = await jsonRequest(url, { headers });
    const pageTasks = getTasksFromResponse(payload);

    if (pageTasks.length === 0) {
      break;
    }

    tasks.push(...pageTasks);

    if (payload?.last_page === true || pageTasks.length < 100) {
      break;
    }

    page += 1;
  }

  return tasks.filter(isTaskOpen).map(normalizeTask);
}
