import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { updateOverdueLog } from "../src/overdue-log.mjs";

function owner(id, label) {
  return {
    id,
    label,
    mention: `<@${id}>`
  };
}

function task({ id, statusLabel = "In Progress", owners, dueLabel = "Mar 18", overdue = true }) {
  return {
    id,
    customId: `OPS-${id}`,
    name: `Task ${id}`,
    url: `https://app.clickup.com/t/${id}`,
    statusLabel,
    dueLabel,
    owners,
    isUnassigned: false,
    blockingTasks: [],
    dueTimestamp: overdue ? Date.parse("2026-03-15T10:00:00.000Z") : Date.parse("2026-03-16T10:00:00.000Z")
  };
}

test("updateOverdueLog increments missed deadlines once and overdue days once per run day", () => {
  const logFile = path.join(os.tmpdir(), `overdue-log-${Date.now()}.json`);
  const overdueTask = task({
    id: "1",
    owners: [owner("U1", "Alex")]
  });

  const first = updateOverdueLog({
    filePath: logFile,
    trackedItems: [overdueTask],
    overdueItems: [overdueTask],
    timeZone: "UTC",
    now: new Date("2026-03-16T12:00:00.000Z")
  });

  assert.equal(first.totals.missedDeadlines, 1);
  assert.equal(first.totals.overdueDays, 1);
  assert.equal(first.totals.unchangedStatusOverdueDays, 0);

  const secondSameDay = updateOverdueLog({
    filePath: logFile,
    trackedItems: [overdueTask],
    overdueItems: [overdueTask],
    timeZone: "UTC",
    now: new Date("2026-03-16T17:00:00.000Z")
  });

  assert.equal(secondSameDay.totals.missedDeadlines, 1);
  assert.equal(secondSameDay.totals.overdueDays, 1);
  assert.equal(secondSameDay.totals.unchangedStatusOverdueDays, 0);

  const thirdNextDay = updateOverdueLog({
    filePath: logFile,
    trackedItems: [overdueTask],
    overdueItems: [overdueTask],
    timeZone: "UTC",
    now: new Date("2026-03-17T12:00:00.000Z")
  });

  assert.equal(thirdNextDay.totals.missedDeadlines, 1);
  assert.equal(thirdNextDay.totals.overdueDays, 2);
  assert.equal(thirdNextDay.totals.unchangedStatusOverdueDays, 1);

  fs.rmSync(logFile, { force: true });
});

test("updateOverdueLog stops counting when the task is no longer overdue or no longer open", () => {
  const logFile = path.join(os.tmpdir(), `overdue-log-${Date.now()}-2.json`);
  const overdueTask = task({
    id: "2",
    owners: [owner("U2", "Taylor")]
  });
  const dueTodayTask = task({
    id: "2",
    owners: [owner("U2", "Taylor")],
    overdue: false
  });

  updateOverdueLog({
    filePath: logFile,
    trackedItems: [overdueTask],
    overdueItems: [overdueTask],
    timeZone: "UTC",
    now: new Date("2026-03-16T12:00:00.000Z")
  });

  const afterResolved = updateOverdueLog({
    filePath: logFile,
    trackedItems: [dueTodayTask],
    overdueItems: [],
    timeZone: "UTC",
    now: new Date("2026-03-17T12:00:00.000Z")
  });

  assert.equal(afterResolved.totals.missedDeadlines, 1);
  assert.equal(afterResolved.totals.overdueDays, 1);
  assert.equal(afterResolved.totals.unchangedStatusOverdueDays, 0);

  const nextOverdue = updateOverdueLog({
    filePath: logFile,
    trackedItems: [overdueTask],
    overdueItems: [overdueTask],
    timeZone: "UTC",
    now: new Date("2026-03-18T12:00:00.000Z")
  });

  assert.equal(nextOverdue.totals.missedDeadlines, 2);
  assert.equal(nextOverdue.totals.overdueDays, 2);
  assert.equal(nextOverdue.totals.unchangedStatusOverdueDays, 0);

  fs.rmSync(logFile, { force: true });
});

test("updateOverdueLog tracks unchanged-status overdue days separately from total overdue days", () => {
  const logFile = path.join(os.tmpdir(), `overdue-log-${Date.now()}-3.json`);
  const inProgressTask = task({
    id: "3",
    statusLabel: "In Progress",
    owners: [owner("U3", "Jordan")]
  });
  const inReviewTask = task({
    id: "3",
    statusLabel: "In Review",
    owners: [owner("U3", "Jordan")]
  });

  const dayOne = updateOverdueLog({
    filePath: logFile,
    trackedItems: [inProgressTask],
    overdueItems: [inProgressTask],
    timeZone: "UTC",
    now: new Date("2026-03-16T12:00:00.000Z")
  });

  assert.equal(dayOne.totals.overdueDays, 1);
  assert.equal(dayOne.totals.unchangedStatusOverdueDays, 0);

  const dayTwoSameStatus = updateOverdueLog({
    filePath: logFile,
    trackedItems: [inProgressTask],
    overdueItems: [inProgressTask],
    timeZone: "UTC",
    now: new Date("2026-03-17T12:00:00.000Z")
  });

  assert.equal(dayTwoSameStatus.totals.overdueDays, 2);
  assert.equal(dayTwoSameStatus.totals.unchangedStatusOverdueDays, 1);

  const dayThreeStatusChanged = updateOverdueLog({
    filePath: logFile,
    trackedItems: [inReviewTask],
    overdueItems: [inReviewTask],
    timeZone: "UTC",
    now: new Date("2026-03-18T12:00:00.000Z")
  });

  assert.equal(dayThreeStatusChanged.totals.overdueDays, 3);
  assert.equal(dayThreeStatusChanged.totals.unchangedStatusOverdueDays, 1);
  assert.equal(dayThreeStatusChanged.totals.missedDeadlines, 1);

  const dayFourSameNewStatus = updateOverdueLog({
    filePath: logFile,
    trackedItems: [inReviewTask],
    overdueItems: [inReviewTask],
    timeZone: "UTC",
    now: new Date("2026-03-19T12:00:00.000Z")
  });

  assert.equal(dayFourSameNewStatus.totals.overdueDays, 4);
  assert.equal(dayFourSameNewStatus.totals.unchangedStatusOverdueDays, 2);

  fs.rmSync(logFile, { force: true });
});
