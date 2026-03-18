function toHex(bytes) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret, message) {
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

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return toHex(new Uint8Array(signature));
}

export async function verifySlackSignature({
  signingSecret,
  timestamp,
  signature,
  rawBody,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 60 * 5
}) {
  if (!signingSecret || !timestamp || !signature) {
    return false;
  }

  const numericTimestamp = Number(timestamp);

  if (!Number.isFinite(numericTimestamp)) {
    return false;
  }

  if (Math.abs(nowSeconds - numericTimestamp) > toleranceSeconds) {
    return false;
  }

  const baseString = `v0:${numericTimestamp}:${rawBody}`;
  const expected = `v0=${await hmacSha256Hex(signingSecret, baseString)}`;

  return expected === signature;
}

export function parseSlackRequest(rawBody, contentType = "application/json") {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(rawBody);
    const payload = form.get("payload");

    if (payload) {
      return JSON.parse(payload);
    }

    return Object.fromEntries(form.entries());
  }

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}
