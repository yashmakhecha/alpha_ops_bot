import test from "node:test";
import assert from "node:assert/strict";

import { matchesScheduleTime, normalizeScheduleTimes } from "../src/runtime-config.mjs";

test("normalizeScheduleTimes keeps 24:00 and sorts it after other times", () => {
  assert.deepEqual(normalizeScheduleTimes("11:00, 18:00, 24:00"), ["11:00", "18:00", "24:00"]);
});

test("matchesScheduleTime treats 24:00 as the midnight slot", () => {
  assert.equal(matchesScheduleTime("24:00", "00:00"), true);
  assert.equal(matchesScheduleTime("24:00", "24:00"), true);
  assert.equal(matchesScheduleTime("24:00", "18:00"), false);
});
