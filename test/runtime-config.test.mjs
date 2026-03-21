import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultRuntimeConfig,
  isWeekendInTimeZone,
  matchesScheduleTime,
  normalizeScheduleTimes
} from "../src/runtime-config.mjs";

test("normalizeScheduleTimes keeps 24:00 and sorts it after other times", () => {
  assert.deepEqual(normalizeScheduleTimes("11:00, 18:00, 24:00"), ["11:00", "18:00", "24:00"]);
});

test("matchesScheduleTime treats 24:00 as the midnight slot", () => {
  assert.equal(matchesScheduleTime("24:00", "00:00"), true);
  assert.equal(matchesScheduleTime("24:00", "24:00"), true);
  assert.equal(matchesScheduleTime("24:00", "18:00"), false);
});

test("defaultRuntimeConfig disables weekend public reminders by default", () => {
  const runtimeConfig = defaultRuntimeConfig();

  assert.equal(runtimeConfig.slack.weekendsEnabled, false);
});

test("isWeekendInTimeZone recognizes Saturday and Sunday in the configured timezone", () => {
  assert.equal(isWeekendInTimeZone(new Date("2026-03-21T12:00:00.000Z"), "Asia/Kolkata"), true);
  assert.equal(isWeekendInTimeZone(new Date("2026-03-22T12:00:00.000Z"), "Asia/Kolkata"), true);
  assert.equal(isWeekendInTimeZone(new Date("2026-03-23T12:00:00.000Z"), "Asia/Kolkata"), false);
});
