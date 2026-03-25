import test from "node:test";
import assert from "node:assert/strict";

import { buildReminderBuckets } from "../src/reminder-items.mjs";

test("buildReminderBuckets prefers subtasks over parent tasks and groups by due date", () => {
  const dueTodayTimestamp = String(Date.parse("2026-03-16T10:00:00.000Z"));
  const overdueTimestamp = String(Date.parse("2026-03-15T10:00:00.000Z"));
  const tasks = [
    {
      id: "parent-1",
      name: "Parent Task",
      customId: null,
      url: "https://app.clickup.com/t/parent-1",
      statusLabel: "In Progress",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "subtask-1",
      name: "Child Task",
      customId: null,
      url: "https://app.clickup.com/t/subtask-1",
      statusLabel: "Backlog",
      assignees: [{ id: "2" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: "High",
      priorityOrder: 1,
      dependencies: [],
      isSubtask: true,
      parentId: "parent-1",
      listName: "Dev"
    },
    {
      id: "subsubtask-1",
      name: "Grandchild Task",
      customId: null,
      url: "https://app.clickup.com/t/subsubtask-1",
      statusLabel: "In Progress",
      assignees: [{ id: "4" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: "High",
      priorityOrder: 1,
      dependencies: [],
      isSubtask: true,
      parentId: "subtask-1",
      listName: "Dev"
    },
    {
      id: "solo-1",
      name: "Solo Task",
      customId: null,
      url: "https://app.clickup.com/t/solo-1",
      statusLabel: "Backlog",
      assignees: [{ id: "3" }],
      dueDate: overdueTimestamp,
      priorityLabel: "Low",
      priorityOrder: 4,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "eta-task",
      name: "Need ETA",
      customId: null,
      url: "https://app.clickup.com/t/eta-task",
      statusLabel: "Backlog",
      assignees: [{ id: "5" }],
      dueDate: null,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "eta-unassigned",
      name: "Unassigned No ETA",
      customId: null,
      url: "https://app.clickup.com/t/eta-unassigned",
      statusLabel: "Backlog",
      assignees: [],
      dueDate: null,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    }
  ];

  const buckets = buildReminderBuckets(tasks, {
    now: new Date("2026-03-16T12:00:00.000Z"),
    timeZone: "UTC"
  });

  assert.equal(buckets.sourceLabel, "Dev");
  assert.deepEqual(
    buckets.dueToday.map((item) => item.id),
    ["subsubtask-1"]
  );
  assert.deepEqual(
    buckets.dueToday[0].taskPath.map((segment) => segment.name),
    ["Parent Task", "Child Task", "Grandchild Task"]
  );
  assert.deepEqual(
    buckets.overdue.map((item) => item.id),
    ["solo-1"]
  );
  assert.deepEqual(
    buckets.etaPending.map((item) => item.id),
    ["eta-task"]
  );
});

test("buildReminderBuckets sorts defined priorities ahead of unprioritized work", () => {
  const dueTodayTimestamp = String(Date.parse("2026-03-16T10:00:00.000Z"));
  const tasks = [
    {
      id: "task-1",
      name: "Unprioritized Task",
      customId: null,
      url: "https://app.clickup.com/t/task-1",
      statusLabel: "Backlog",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "task-2",
      name: "Urgent Task",
      customId: null,
      url: "https://app.clickup.com/t/task-2",
      statusLabel: "Backlog",
      assignees: [{ id: "2" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: "Urgent",
      priorityOrder: 0,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "task-3",
      name: "High Task",
      customId: null,
      url: "https://app.clickup.com/t/task-3",
      statusLabel: "Backlog",
      assignees: [{ id: "3" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: "High",
      priorityOrder: 1,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    }
  ];

  const buckets = buildReminderBuckets(tasks, {
    now: new Date("2026-03-16T12:00:00.000Z"),
    timeZone: "UTC"
  });

  assert.deepEqual(
    buckets.dueToday.map((item) => item.id),
    ["task-2", "task-3", "task-1"]
  );
});

test("buildReminderBuckets sorts blocking tasks ahead of plain unprioritized work", () => {
  const dueTodayTimestamp = String(Date.parse("2026-03-16T10:00:00.000Z"));
  const tasks = [
    {
      id: "plain-task",
      name: "Plain Task",
      customId: null,
      url: "https://app.clickup.com/t/plain-task",
      statusLabel: "Backlog",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "blocking-task",
      name: "Blocking Task",
      customId: null,
      url: "https://app.clickup.com/t/blocking-task",
      statusLabel: "In Progress",
      assignees: [{ id: "2" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "blocked-task",
      name: "Blocked Task",
      customId: null,
      url: "https://app.clickup.com/t/blocked-task",
      statusLabel: "Backlog",
      assignees: [{ id: "3" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [
        {
          taskId: "blocked-task",
          dependsOn: "blocking-task",
          type: 1
        }
      ],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    }
  ];

  const buckets = buildReminderBuckets(tasks, {
    now: new Date("2026-03-16T12:00:00.000Z"),
    timeZone: "UTC"
  });

  assert.deepEqual(
    buckets.dueToday.map((item) => item.id),
    ["blocking-task", "blocked-task", "plain-task"]
  );
});

test("buildReminderBuckets annotates tasks that are blocking other tasks", () => {
  const dueTodayTimestamp = String(Date.parse("2026-03-16T10:00:00.000Z"));
  const tasks = [
    {
      id: "blocker",
      name: "Blocker Task",
      customId: "OPS-10",
      url: "https://app.clickup.com/t/blocker",
      statusLabel: "In Progress",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "blocked",
      name: "Blocked Task",
      customId: "OPS-11",
      url: "https://app.clickup.com/t/blocked",
      statusLabel: "Backlog",
      assignees: [{ id: "2" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [
        {
          taskId: "blocked",
          dependsOn: "blocker",
          type: 1
        }
      ],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    }
  ];

  const buckets = buildReminderBuckets(tasks, {
    now: new Date("2026-03-16T12:00:00.000Z"),
    timeZone: "UTC"
  });

  const blockerItem = buckets.dueToday.find((item) => item.id === "blocker");

  assert.deepEqual(blockerItem?.blockingTasks, [
    {
      id: "blocked",
      name: "Blocked Task",
      customId: "OPS-11",
      url: "https://app.clickup.com/t/blocked"
    }
  ]);
});

test("buildReminderBuckets carries blocking state across the visible task path", () => {
  const dueTodayTimestamp = String(Date.parse("2026-03-16T10:00:00.000Z"));
  const tasks = [
    {
      id: "top",
      name: "Top Task",
      customId: "OPS-1",
      url: "https://app.clickup.com/t/top",
      statusLabel: "Planning",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    },
    {
      id: "mid",
      name: "Mid Task",
      customId: "OPS-2",
      url: "https://app.clickup.com/t/mid",
      statusLabel: "Planning",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: true,
      parentId: "top",
      listName: "Dev"
    },
    {
      id: "leaf",
      name: "Leaf Task",
      customId: "OPS-3",
      url: "https://app.clickup.com/t/leaf",
      statusLabel: "In Progress",
      assignees: [{ id: "1" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [],
      isSubtask: true,
      parentId: "mid",
      listName: "Dev"
    },
    {
      id: "blocked-by-mid",
      name: "Blocked By Mid",
      customId: "OPS-4",
      url: "https://app.clickup.com/t/blocked-by-mid",
      statusLabel: "Backlog",
      assignees: [{ id: "2" }],
      dueDate: dueTodayTimestamp,
      priorityLabel: null,
      priorityOrder: null,
      dependencies: [
        {
          taskId: "blocked-by-mid",
          dependsOn: "mid",
          type: 1
        }
      ],
      isSubtask: false,
      parentId: null,
      listName: "Dev"
    }
  ];

  const buckets = buildReminderBuckets(tasks, {
    now: new Date("2026-03-16T12:00:00.000Z"),
    timeZone: "UTC"
  });

  assert.deepEqual(
    buckets.dueToday[0].taskPath.map((segment) => ({
      id: segment.id,
      blockingTasks: segment.blockingTasks
    })),
    [
      {
        id: "top",
        blockingTasks: []
      },
      {
        id: "mid",
        blockingTasks: [
          {
            id: "blocked-by-mid",
            name: "Blocked By Mid",
            customId: "OPS-4",
            url: "https://app.clickup.com/t/blocked-by-mid"
          }
        ]
      },
      {
        id: "leaf",
        blockingTasks: []
      }
    ]
  );
  assert.equal(buckets.dueToday[0].hasBlockingInPath, true);
});
