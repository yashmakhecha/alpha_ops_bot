import test from "node:test";
import assert from "node:assert/strict";

import { buildReminderMessage } from "../src/message.mjs";

test("buildReminderMessage renders option A as the compact table layout", () => {
  const message = buildReminderMessage({
    dueToday: [
      {
        id: "1",
        customId: "OPS-12",
        name: "Send proposal",
        statusLabel: "In Progress",
        priorityLabel: "High",
        priorityOrder: 1,
        url: "https://app.clickup.com/t/1",
        ownerMentions: ["<@U123>"],
        parentName: "Pipeline Work",
        parentCustomId: "OPS-1",
        parentUrl: "https://app.clickup.com/t/parent-1",
        taskPath: [
          {
            id: "parent-1",
            customId: "OPS-1",
            name: "Pipeline Work",
            label: "OPS-1: Pipeline Work",
            url: "https://app.clickup.com/t/parent-1"
          },
          {
            id: "1",
            customId: "OPS-12",
            name: "Send proposal",
            label: "OPS-12: Send proposal",
            url: "https://app.clickup.com/t/1"
          }
        ],
        dueLabel: "Mar 18",
        blockingTasks: [
          {
            id: "2",
            customId: "OPS-13",
            name: "Review proposal",
            url: "https://app.clickup.com/t/2"
          }
        ]
      }
    ],
    etaPending: [
      {
        id: "eta-1",
        customId: "OPS-20",
        name: "Add ETA",
        statusLabel: "Backlog",
        priorityLabel: null,
        priorityOrder: null,
        url: "https://app.clickup.com/t/eta-1",
        ownerMentions: ["<@U456>"],
        taskPath: [
          {
            id: "eta-1",
            customId: "OPS-20",
            name: "Add ETA",
            label: "OPS-20: Add ETA",
            url: "https://app.clickup.com/t/eta-1"
          }
        ],
        dueLabel: null,
        blockingTasks: []
      }
    ],
    overdue: [],
    runDate: new Date("2026-03-18T12:00:00.000Z"),
    timeZone: "UTC",
    sourceLabel: "Dev",
    sourceUrl: "https://app.clickup.com/90161148770/v/li/901613969789",
    messageStyle: "option_a"
  });

  assert.match(message.text, /\*Daily Task Status\*/);
  assert.match(message.text, /<https:\/\/app\.clickup\.com\/90161148770\/v\/li\/901613969789\|Dev>/);
  assert.match(message.text, /Due Today \(1\)/);
  assert.match(message.text, /ETA Pending \(1\)/);
  assert.match(message.text, /\*Parent\* \| \*Task\* \| \*Status\* \| \*Priority\* \| \*Due\* \| \*Owner\* \| \*Blocking\*/);
  assert.match(message.text, /<https:\/\/app.clickup.com\/t\/1\|OPS-12: Send Proposal>/);
  assert.match(message.text, /`OPS-1: Pipeline Work` \| <https:\/\/app.clickup.com\/t\/1\|OPS-12: Send Proposal> \| In Progress \| High \| Today \| <@U123> \| <https:\/\/app.clickup.com\/t\/2\|OPS-13: Review Proposal>/);
  assert.match(message.text, /- \| <https:\/\/app.clickup.com\/t\/eta-1\|OPS-20: Add ETA> \| Backlog \| - \| ETA Pending \| <@U456> \| -/);
  assert.equal(message.blocks[0].type, "header");
});

test("buildReminderMessage renders option B as a per-task friendly card layout", () => {
  const message = buildReminderMessage({
    dueToday: [
      {
        id: "1",
        customId: "OPS-12",
        name: "Send proposal",
        statusLabel: "In Progress",
        priorityLabel: "High",
        priorityOrder: 1,
        url: "https://app.clickup.com/t/1",
        ownerMentions: ["<@U123>"],
        parentName: "Pipeline Work",
        parentCustomId: "OPS-1",
        parentUrl: "https://app.clickup.com/t/parent-1",
        taskPath: [
          {
            id: "top-1",
            customId: "OPS-1",
            name: "Pipeline Work",
            label: "OPS-1: Pipeline Work",
            url: "https://app.clickup.com/t/parent-1",
            blockingTasks: []
          },
          {
            id: "mid-1",
            customId: "OPS-10",
            name: "Proposal Stream",
            label: "OPS-10: Proposal Stream",
            url: "https://app.clickup.com/t/mid-1",
            blockingTasks: [
              {
                id: "3",
                customId: "OPS-99",
                name: "Prepare legal approval",
                url: "https://app.clickup.com/t/3"
              }
            ]
          },
          {
            id: "1",
            customId: "OPS-12",
            name: "Send proposal",
            label: "OPS-12: Send proposal",
            url: "https://app.clickup.com/t/1",
            blockingTasks: [
              {
                id: "2",
                customId: "OPS-13",
                name: "Review proposal",
                url: "https://app.clickup.com/t/2"
              }
            ]
          }
        ],
        dueLabel: "Mar 18",
        blockingTasks: []
      }
    ],
    etaPending: [
      {
        id: "eta-1",
        customId: "OPS-20",
        name: "Add ETA",
        statusLabel: "Backlog",
        priorityLabel: null,
        priorityOrder: null,
        url: "https://app.clickup.com/t/eta-1",
        ownerMentions: ["<@U456>"],
        taskPath: [
          {
            id: "eta-1",
            customId: "OPS-20",
            name: "Add ETA",
            label: "OPS-20: Add ETA",
            url: "https://app.clickup.com/t/eta-1",
            blockingTasks: []
          }
        ],
        dueLabel: null,
        blockingTasks: []
      }
    ],
    overdue: [],
    runDate: new Date("2026-03-18T12:00:00.000Z"),
    timeZone: "UTC",
    sourceLabel: "Dev",
    sourceUrl: "https://app.clickup.com/90161148770/v/li/901613969789",
    messageStyle: "option_b"
  });

  assert.match(message.text, /Due Today \(1\)/);
  assert.match(message.text, /ETA Pending \(1\)/);
  assert.match(message.text, /- :arrow_forward: Task: \*<https:\/\/app.clickup.com\/t\/parent-1\|OPS-1: Pipeline Work>\*/);
  assert.match(message.text, /  - Sub-task: <https:\/\/app.clickup.com\/t\/mid-1\|OPS-10: Proposal Stream>/);
  assert.match(message.text, /    - Sub-sub-task: <https:\/\/app.clickup.com\/t\/1\|OPS-12: Send Proposal>/);
  assert.match(message.text, /      - Status: In Progress/);
  assert.match(message.text, /      - Priority: P2 \(High\) :second_place_medal:/);
  assert.match(message.text, /      - Due: Today/);
  assert.match(message.text, /      - Owner: <@U123>/);
  assert.match(message.text, /    - Blocking: <https:\/\/app.clickup.com\/t\/3\|OPS-99: Prepare Legal Approval> :no_entry:/);
  assert.match(message.text, /      - Blocking: <https:\/\/app.clickup.com\/t\/2\|OPS-13: Review Proposal> :no_entry:/);
  assert.match(message.text, /- :card_index_dividers: Task: \*<https:\/\/app.clickup.com\/t\/eta-1\|OPS-20: Add ETA>\*/);
  assert.match(message.text, /  - Due: ETA Pending/);
});

test("buildReminderMessage respects the selected task properties", () => {
  const message = buildReminderMessage({
    dueToday: [
      {
        id: "1",
        customId: "OPS-12",
        name: "Send proposal",
        statusLabel: "In Progress",
        priorityLabel: "High",
        priorityOrder: 1,
        url: "https://app.clickup.com/t/1",
        ownerMentions: ["<@U123>"],
        taskPath: [
          {
            id: "1",
            customId: "OPS-12",
            name: "Send proposal",
            label: "OPS-12: Send proposal",
            url: "https://app.clickup.com/t/1",
            blockingTasks: [
              {
                id: "2",
                customId: "OPS-13",
                name: "Review proposal",
                url: "https://app.clickup.com/t/2"
              }
            ]
          }
        ],
        dueLabel: "Mar 18",
        blockingTasks: []
      }
    ],
    etaPending: [],
    overdue: [],
    runDate: new Date("2026-03-18T12:00:00.000Z"),
    timeZone: "UTC",
    sourceLabel: "Dev",
    sourceUrl: "https://app.clickup.com/90161148770/v/li/901613969789",
    messageStyle: "option_b",
    taskProperties: ["status", "owner"]
  });

  assert.match(message.text, /Status: In Progress/);
  assert.match(message.text, /Owner: <@U123>/);
  assert.doesNotMatch(message.text, /Priority:/);
  assert.doesNotMatch(message.text, /Due:/);
  assert.doesNotMatch(message.text, /Blocking:/);
});
