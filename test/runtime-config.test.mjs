import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultRuntimeConfig,
  getTrackedClickupSources,
  isWeekendInTimeZone,
  matchesScheduleTime,
  mergeRuntimeConfig,
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

test("mergeRuntimeConfig preserves selected ClickUp list metadata", () => {
  const runtimeConfig = mergeRuntimeConfig({
    clickup: {
      sources: [
        {
          id: "901613969789",
          sourceType: "list",
          name: "Dev",
          teamName: "Alpha",
          spaceName: "Engineering",
          folderName: "Sprint 17",
          url: "https://example.com/dev-board"
        },
        {
          id: "901612769947",
          sourceType: "list",
          name: "Bugs",
          teamName: "Alpha",
          spaceName: "Engineering",
          folderName: "Sprint 17",
          url: "https://example.com/bugs-board"
        }
      ]
    }
  });

  assert.deepEqual(
    runtimeConfig.clickup.sources.map((source) => source.id),
    ["901613969789", "901612769947"]
  );
  assert.equal(runtimeConfig.clickup.sourceId, "901613969789");
});

test("getTrackedClickupSources falls back to legacy single-list config", () => {
  assert.deepEqual(getTrackedClickupSources({ sourceType: "list", sourceId: "901613969789" }), [
    {
      id: "901613969789",
      sourceType: "list",
      name: "",
      teamId: "",
      teamName: "",
      spaceId: "",
      spaceName: "",
      folderId: "",
      folderName: "",
      url: ""
    }
  ]);
});
