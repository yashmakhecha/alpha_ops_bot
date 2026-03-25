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

function buildCollectionUrl(baseUrl, pathSegments, searchParams = {}) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(pathSegments.join("/"), normalizedBaseUrl);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
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

function getCollectionItems(payload, key) {
  if (Array.isArray(payload?.[key])) {
    return payload[key];
  }

  if (Array.isArray(payload)) {
    return payload;
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

function buildListUrl(teamId, listId) {
  if (!teamId || !listId) {
    return "";
  }

  return `https://app.clickup.com/${teamId}/v/li/${listId}`;
}

function normalizeList({ team, space, folder = null, list }) {
  const teamId = team?.id ? String(team.id) : "";
  const teamName = team?.name || "";
  const spaceId = space?.id ? String(space.id) : "";
  const spaceName = space?.name || "";
  const folderId = folder?.id ? String(folder.id) : "";
  const folderName = folder?.name || "";
  const id = list?.id ? String(list.id) : "";

  if (!id) {
    return null;
  }

  return {
    id,
    sourceType: "list",
    name: list?.name || "Untitled list",
    teamId,
    teamName,
    spaceId,
    spaceName,
    folderId,
    folderName,
    url: buildListUrl(teamId, id)
  };
}

function sortAccessibleLists(left, right) {
  return [
    left.teamName.localeCompare(right.teamName),
    left.spaceName.localeCompare(right.spaceName),
    left.folderName.localeCompare(right.folderName),
    left.name.localeCompare(right.name)
  ].find((value) => value !== 0) || 0;
}

async function fetchJsonCollection(url, headers, key) {
  const payload = await jsonRequest(url, { headers });
  return getCollectionItems(payload, key);
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

export async function fetchOpenTasksForSources({ baseUrl, token, sources }) {
  const normalizedSources = Array.isArray(sources) ? sources.filter((source) => source?.id) : [];
  const allTasks = await Promise.all(
    normalizedSources.map((source) =>
      fetchOpenTasks({
        baseUrl,
        token,
        sourceType: source.sourceType === "view" ? "view" : "list",
        sourceId: source.id
      })
    )
  );
  const dedupedTasks = new Map();

  for (const task of allTasks.flat()) {
    dedupedTasks.set(task.id, task);
  }

  return [...dedupedTasks.values()];
}

export async function fetchAccessibleLists({ baseUrl, token }) {
  const headers = {
    Authorization: token,
    "Content-Type": "application/json"
  };
  const teams = await fetchJsonCollection(buildCollectionUrl(baseUrl, ["team"]), headers, "teams");
  const allLists = [];

  for (const team of teams) {
    const spaces = await fetchJsonCollection(
      buildCollectionUrl(baseUrl, ["team", String(team.id), "space"], { archived: "false" }),
      headers,
      "spaces"
    );

    for (const space of spaces) {
      const [folderlessLists, folders] = await Promise.all([
        fetchJsonCollection(
          buildCollectionUrl(baseUrl, ["space", String(space.id), "list"], { archived: "false" }),
          headers,
          "lists"
        ),
        fetchJsonCollection(
          buildCollectionUrl(baseUrl, ["space", String(space.id), "folder"], { archived: "false" }),
          headers,
          "folders"
        )
      ]);

      for (const list of folderlessLists) {
        const normalizedList = normalizeList({ team, space, list });

        if (normalizedList) {
          allLists.push(normalizedList);
        }
      }

      for (const folder of folders) {
        const folderLists = await fetchJsonCollection(
          buildCollectionUrl(baseUrl, ["folder", String(folder.id), "list"], { archived: "false" }),
          headers,
          "lists"
        );

        for (const list of folderLists) {
          const normalizedList = normalizeList({ team, space, folder, list });

          if (normalizedList) {
            allLists.push(normalizedList);
          }
        }
      }
    }
  }

  return [...new Map(allLists.map((list) => [list.id, list])).values()].sort(sortAccessibleLists);
}
