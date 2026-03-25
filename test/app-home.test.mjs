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
    etaPending: [
      {
        name: "Await ETA",
        url: "https://example.com/tasks/eta-1",
        taskPath: [
          {
            name: "Await ETA",
            url: "https://example.com/tasks/eta-1"
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
    sourceUrl: "https://example.com/dev-board",
    sources: [
      {
        id: "901613969789",
        sourceType: "list",
        name: "Dev",
        teamId: "90161148770",
        teamName: "Alpha",
        spaceId: "90165943772",
        spaceName: "Engineering",
        folderId: "f123",
        folderName: "Sprint 17",
        url: "https://example.com/dev-board"
      },
      {
        id: "901612769947",
        sourceType: "list",
        name: "Bugs",
        teamId: "90161148770",
        teamName: "Alpha",
        spaceId: "90165943772",
        spaceName: "Engineering",
        folderId: "f123",
        folderName: "Sprint 17",
        url: "https://example.com/bugs-board"
      }
    ]
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

const clickupLists = [
  ...runtimeConfig.clickup.sources,
  {
    id: "901609797796",
    sourceType: "list",
    name: "Marketing",
    teamId: "90161148770",
    teamName: "Alpha",
    spaceId: "90164587447",
    spaceName: "Marketing",
    folderId: "",
    folderName: "",
    url: "https://example.com/marketing-board"
  }
];

test("buildAppHomeView renders the admin control panel for the configured viewer", () => {
  const view = buildAppHomeView({
    viewerUserId: "UADMIN",
    adminUserId: "UADMIN",
    runtimeConfig,
    snapshot: createSnapshot(),
    clickupLists,
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
  assert.match(JSON.stringify(view.blocks), /\*ETA Pending\*\\n1/);
  assert.match(JSON.stringify(view.blocks), /ETA Pending Preview/);
  assert.match(JSON.stringify(view.blocks), /Tracked Lists: \*Dev, Bugs\*/);
  assert.match(JSON.stringify(view.blocks), /ClickUp lists to include in daily updates/);
  assert.match(JSON.stringify(view.blocks), /Alpha \/ Engineering \/ Sprint 17/);
  assert.match(JSON.stringify(view.blocks), /Marketing/);
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
    clickupLists,
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
    clickupLists,
    sourceLabel: "Dev",
    sourceUrl: "https://example.com/dev-board"
  });

  assert.equal(view.type, "home");
  assert.equal(view.blocks[0].text.text, "Alpha Ops App Home");
  assert.match(view.blocks[1].text.text, /reserved for <@UADMIN>/);
  assert.doesNotMatch(JSON.stringify(view.blocks), /Send Test DM Now/);
});
