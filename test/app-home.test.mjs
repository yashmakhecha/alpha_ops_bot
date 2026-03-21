import test from "node:test";
import assert from "node:assert/strict";

import { APP_HOME_IDS, buildAppHomeView } from "../src/app-home.mjs";

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
    enabled: true,
    weekendsEnabled: false,
    destinationType: "channel",
    channelId: "C1234567890"
  },
  adminSummary: {
    enabled: true,
    destinationType: "dm",
    dmUserId: "UADMIN"
  },
  schedule: {
    time: "21:00",
    times: ["09:00", "21:00"],
    timezone: "Asia/Kolkata"
  },
  taskProperties: ["status", "priority", "owner"]
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
    lastLoggedRunOn: "2026-03-19",
    publicChannelId: "C1234567890"
  });

  assert.equal(view.type, "home");
  assert.equal(view.blocks[0].type, "header");
  assert.equal(view.blocks[0].text.text, "Alpha Ops Control Panel");
  assert.match(view.blocks[1].text.text, /Sent test DM\./);
  assert.match(JSON.stringify(view.blocks), /Save Settings/);
  assert.match(JSON.stringify(view.blocks), /Send Test DM Now/);
  assert.match(JSON.stringify(view.blocks), /Send Public Message Now/);
  assert.match(JSON.stringify(view.blocks), /Show Restricted Preview/);
  assert.match(JSON.stringify(view.blocks), /Public Announcement Settings/);
  assert.match(JSON.stringify(view.blocks), /Private Announcement Settings/);
  assert.match(JSON.stringify(view.blocks), /Weekends: \*Disabled\*/);
  assert.match(JSON.stringify(view.blocks), /Send public announcements on Saturdays and Sundays/);
  assert.match(JSON.stringify(view.blocks), /24:00 is allowed for midnight/);
  assert.match(JSON.stringify(view.blocks), new RegExp(APP_HOME_IDS.taskPropertiesAction));
  assert.match(JSON.stringify(view.blocks), /Parent Task \/ Subtask \/ <https:\/\/example.com\/tasks\/1\|Leaf Task>/);
});

test("buildAppHomeView can show the restricted view preview to the admin", () => {
  const view = buildAppHomeView({
    viewerUserId: "UADMIN",
    adminUserId: "UADMIN",
    runtimeConfig,
    snapshot: createSnapshot(),
    sourceLabel: "Dev",
    sourceUrl: "https://example.com/dev-board",
    showRestrictedPreview: true
  });

  assert.match(JSON.stringify(view.blocks), /Hide Restricted Preview/);
  assert.match(JSON.stringify(view.blocks), /Restricted View Preview/);
  assert.match(JSON.stringify(view.blocks), /reserved for <@UADMIN>/);
  assert.match(JSON.stringify(view.blocks), /server-side on every Home open and every button click/);
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
