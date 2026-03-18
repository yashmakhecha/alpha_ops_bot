import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

import { parseSlackRequest, verifySlackSignature } from "../src/slack-signature.mjs";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

async function sign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));

  return `v0=${Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

test("verifySlackSignature accepts a valid signature", async () => {
  const signingSecret = "test-secret";
  const timestamp = "1700000000";
  const rawBody = JSON.stringify({
    type: "event_callback",
    event: {
      type: "app_home_opened"
    }
  });
  const signature = await sign(signingSecret, `v0:${timestamp}:${rawBody}`);

  const valid = await verifySlackSignature({
    signingSecret,
    timestamp,
    signature,
    rawBody,
    nowSeconds: 1700000001
  });

  assert.equal(valid, true);
});

test("parseSlackRequest parses interactive payload form bodies", () => {
  const parsed = parseSlackRequest(
    "payload=%7B%22type%22%3A%22block_actions%22%2C%22user%22%3A%7B%22id%22%3A%22U123%22%7D%7D",
    "application/x-www-form-urlencoded"
  );

  assert.equal(parsed.type, "block_actions");
  assert.equal(parsed.user.id, "U123");
});
