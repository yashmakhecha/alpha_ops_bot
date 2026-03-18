import test from "node:test";
import assert from "node:assert/strict";

import { findOwnerMapping, getOwnerLookupCandidate } from "../src/owner-map.mjs";

test("findOwnerMapping matches ClickUp assignee by id before email or name", () => {
  const ownerMap = [
    {
      clickup: {
        userId: "42",
        email: "alex@company.com",
        name: "Alex Smith"
      },
      slack: {
        userId: "U123"
      }
    }
  ];

  const assignee = {
    id: 42,
    email: "someone-else@company.com",
    username: "Different Name"
  };

  assert.equal(findOwnerMapping(assignee, ownerMap)?.slack?.userId, "U123");
});

test("getOwnerLookupCandidate falls back to ClickUp email when Slack email is not mapped", () => {
  const candidate = getOwnerLookupCandidate(
    {
      id: 42,
      email: "alex@company.com",
      username: "Alex Smith"
    },
    null
  );

  assert.deepEqual(candidate, {
    clickupName: "Alex Smith",
    slackUserId: null,
    slackEmail: "alex@company.com",
    slackDisplayName: null,
    slackRealName: null
  });
});
