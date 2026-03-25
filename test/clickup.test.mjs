import test from "node:test";
import assert from "node:assert/strict";

import { fetchAccessibleLists, fetchOpenTasksForSources } from "../src/clickup.mjs";

function createJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async text() {
      return JSON.stringify(body);
    }
  };
}

test("fetchAccessibleLists returns folderless and folder-based lists across spaces", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const href = String(url);

    if (href.endsWith("/team")) {
      return createJsonResponse({
        teams: [{ id: "team-1", name: "Alpha" }]
      });
    }

    if (href.includes("/team/team-1/space")) {
      return createJsonResponse({
        spaces: [
          { id: "space-1", name: "Engineering" },
          { id: "space-2", name: "Marketing" }
        ]
      });
    }

    if (href.includes("/space/space-1/list")) {
      return createJsonResponse({
        lists: [{ id: "list-1", name: "Backlog" }]
      });
    }

    if (href.includes("/space/space-2/list")) {
      return createJsonResponse({
        lists: [{ id: "list-3", name: "Campaigns" }]
      });
    }

    if (href.includes("/space/space-1/folder")) {
      return createJsonResponse({
        folders: [{ id: "folder-1", name: "Sprint 17" }]
      });
    }

    if (href.includes("/space/space-2/folder")) {
      return createJsonResponse({
        folders: []
      });
    }

    if (href.includes("/folder/folder-1/list")) {
      return createJsonResponse({
        lists: [{ id: "list-2", name: "Sprint Board" }]
      });
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const lists = await fetchAccessibleLists({
      baseUrl: "https://api.clickup.com/api/v2",
      token: "test-token"
    });

    assert.deepEqual(
      lists.map((list) => ({
        id: list.id,
        name: list.name,
        spaceName: list.spaceName,
        folderName: list.folderName
      })),
      [
        {
          id: "list-1",
          name: "Backlog",
          spaceName: "Engineering",
          folderName: ""
        },
        {
          id: "list-2",
          name: "Sprint Board",
          spaceName: "Engineering",
          folderName: "Sprint 17"
        },
        {
          id: "list-3",
          name: "Campaigns",
          spaceName: "Marketing",
          folderName: ""
        }
      ]
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchOpenTasksForSources merges open tasks from multiple selected lists", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const href = String(url);

    if (href.includes("/list/list-1/task")) {
      return createJsonResponse({
        tasks: [
          {
            id: "task-1",
            name: "Task One",
            url: "https://app.clickup.com/t/task-1",
            list: { id: "list-1", name: "Backlog" },
            team_id: "team-1",
            status: { status: "in progress", type: "custom" },
            assignees: [],
            dependencies: [],
            priority: null,
            parent: null,
            archived: false,
            due_date: String(Date.now())
          }
        ],
        last_page: true
      });
    }

    if (href.includes("/list/list-2/task")) {
      return createJsonResponse({
        tasks: [
          {
            id: "task-2",
            name: "Task Two",
            url: "https://app.clickup.com/t/task-2",
            list: { id: "list-2", name: "Sprint Board" },
            team_id: "team-1",
            status: { status: "backlog", type: "open" },
            assignees: [],
            dependencies: [],
            priority: null,
            parent: null,
            archived: false,
            due_date: String(Date.now())
          }
        ],
        last_page: true
      });
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const tasks = await fetchOpenTasksForSources({
      baseUrl: "https://api.clickup.com/api/v2",
      token: "test-token",
      sources: [
        { id: "list-1", sourceType: "list" },
        { id: "list-2", sourceType: "list" }
      ]
    });

    assert.deepEqual(
      tasks.map((task) => task.id),
      ["task-1", "task-2"]
    );
  } finally {
    global.fetch = originalFetch;
  }
});
