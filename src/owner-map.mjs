import fs from "node:fs";
import {
  findOwnerMapping,
  getOwnerLookupCandidate,
  normalizeOwnerMap
} from "./owner-map-core.mjs";

export function loadOwnerMap(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw);
  return normalizeOwnerMap(payload);
}

export { findOwnerMapping, getOwnerLookupCandidate, normalizeOwnerMap };
