import test from "node:test";
import assert from "node:assert/strict";

import { SlackClient } from "../src/slack.mjs";

class FakeSlackClient extends SlackClient {
  constructor() {
    super({
      baseUrl: "https://slack.test/api",
      botToken: "xoxb-test",
      dryRun: true
    });
  }

  async get(method) {
    if (method === "conversations.list") {
      return {
        ok: true,
        channels: [
          {
            id: "C1234567890",
            name: "all-alpha",
            name_normalized: "all-alpha"
          }
        ]
      };
    }

    throw new Error(`Unexpected method: ${method}`);
  }
}

test("resolveChannelId returns the channel ID unchanged when it is already an ID", async () => {
  const slack = new FakeSlackClient();
  const channelId = await slack.resolveChannelId("C9999999999");

  assert.equal(channelId, "C9999999999");
});

test("resolveChannelId looks up a public channel by name", async () => {
  const slack = new FakeSlackClient();
  const channelId = await slack.resolveChannelId("#all-alpha");

  assert.equal(channelId, "C1234567890");
});
