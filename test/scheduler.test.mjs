import test from "node:test";
import assert from "node:assert/strict";

import { getNextRunDate } from "../src/scheduler.mjs";

test("getNextRunDate returns same-day run when the scheduled time is still ahead", () => {
  const nextRun = getNextRunDate({
    hours: 18,
    minutes: 0,
    timeZone: "UTC",
    now: new Date("2026-03-18T10:15:00.000Z")
  });

  assert.equal(nextRun.toISOString(), "2026-03-18T18:00:00.000Z");
});

test("getNextRunDate rolls to the next calendar day in the configured timezone", () => {
  const nextRun = getNextRunDate({
    hours: 18,
    minutes: 0,
    timeZone: "Asia/Kolkata",
    now: new Date("2026-03-18T13:30:00.000Z")
  });

  assert.equal(nextRun.toISOString(), "2026-03-19T12:30:00.000Z");
});
