export async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJsonParse(text) : {};

  if (!response.ok) {
    throw new Error(
      `Request failed with ${response.status} ${response.statusText}: ${text || "<empty body>"}`
    );
  }

  return body;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Expected JSON response but received: ${value}`);
  }
}
