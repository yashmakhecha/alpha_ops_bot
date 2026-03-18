import fs from "node:fs";
import path from "node:path";
import {
  createEmptyOverdueState,
  normalizeOverdueState,
  updateOverdueState
} from "./overdue-log-core.mjs";

function loadState(filePath) {
  if (!fs.existsSync(filePath)) {
    return createEmptyOverdueState();
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return normalizeOverdueState(parsed);
}

function saveState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function updateOverdueLog({
  filePath,
  trackedItems,
  overdueItems,
  timeZone,
  now = new Date()
}) {
  const state = loadState(filePath);
  const result = updateOverdueState({
    state,
    trackedItems,
    overdueItems,
    timeZone,
    now
  });
  saveState(filePath, result.state);
  return result;
}
