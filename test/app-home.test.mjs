import test from "node:test";
import assert from "node:assert/strict";

import { buildAppHomeView } from "../src/app-home.mjs";

function createSnapshot() {
  return {
    runDate: new Date("2026-03-19T15:30:00.000Z"),
    dueToday: [
      {
        name: "Leaf task",
        url: "https://example.com/tasks/1",
        taskPath: [
          {
            name: "Parent task",
            url: "https://example.com/tasks/p1"
          },
          {
            name: "Subtask",
            url: "https://example.com/tasks/s1"
          },
          {
            name: "Leaf task",
            url: "https://example.com/tasks/1"
          }
        ]
      }
    ],
    overdue: [],
    overdueLog: {
      ownerSummary: [
        {
          currentOverdueTasks: 1
        }
      ],
      totals: {
        missedDeadlines: 3,
        overdueDays: 9,
        currentOverdueTasks: 1
      }
    },
    buckets: {
      sourceLabel: "Dev",
      sourceUrl: "https://example.com/dev-board"
    }
  };
}

const runtimeConfig = {
  clickup: {
    sourceType: "list",
    sourceId: "901613969789",
    sourceUrl: "https://example.com/dev-board"
  },
  slack: {
    destinationType: "dm",
    dmUserId: "UADMIN"
  },
  adminSummary: {
    enabled: true,
    destinationType: "dm",
    dmUserId: "UADMIN"
  },
  schedule: {
    time: "21:00",
    timezone: "Asia/Kolkata"
  }
};

test("buildAppHomeView renders the admin control panel for the configured viewer", () => {
  const view = buildAppHomeView({
    viewerUserId: "UADMIN",
    adminUserId: "UADMIN",
    runtimeConfig,
    snapshot: createSnapshot(),
    sourceLabel: "Dev",
    sourceUrl: "https://example.com/dev-board",
    notice: "Sent test DM.",
    lastLoggedRunOn: "2026-03-19"
  });

  assert.equal(view.type, "home");
  assert.equal(view.blocks[0].type, "header");
  assert.equal(view.blocks[0].text.text, "Alpha Ops Control Panel");
  assert.match(view.blocks[1].text.text, /Sent test DM\./);
  assert.match(JSON.stringify(view.blocks), /Send Test DM Now/);
  assert.match(JSON.stringify(view.blocks), /Parent task \/ Subtask \/ <https:\/\/example.com\/tasks\/1\|Leaf task>/);
});

test("buildAppHomeView renders a restricted view for everyone else", () => {
  const view = buildAppHomeView({
    viewerUserId: "UOTHER",
    adminUserId: "UADMIN",
    runtimeConfig,
    snapshot: createSnapshot(),
    sourceLabel: "Dev",
    sourceUrl: "https://example.com/dev-board"
  });

  assert.equal(view.type, "home");
  assert.equal(view.blocks[0].text.text, "Alpha Ops App Home");
  assert.match(view.blocks[1].text.text, /reserved for <@UADMIN>/);
  assert.doesNotMatch(JSON.stringify(view.blocks), /Send Test DM Now/);
});
