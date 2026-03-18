import { jsonRequest } from "./http.mjs";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function escapeSlackText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export class SlackClient {
  constructor({ baseUrl, botToken, dryRun = false }) {
    this.baseUrl = baseUrl;
    this.botToken = botToken;
    this.dryRun = dryRun;
    this.userListPromise = null;
    this.conversationListPromise = null;
  }

  async get(method, query = {}) {
    const url = new URL(method, `${this.baseUrl}/`);

    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const payload = await jsonRequest(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.botToken}`
      }
    });

    if (payload?.ok === false) {
      const details = [
        payload.error || "unknown_error",
        payload.needed ? `needed=${payload.needed}` : null,
        payload.provided ? `provided=${payload.provided}` : null
      ]
        .filter(Boolean)
        .join(", ");
      const error = new Error(`Slack API ${method} failed: ${details}`);
      error.slackError = payload.error || "unknown_error";
      throw error;
    }

    return payload;
  }

  async api(method, body) {
    const url = new URL(method, `${this.baseUrl}/`);
    const payload = await jsonRequest(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(body || {})
    });

    if (payload?.ok === false) {
      const details = [
        payload.error || "unknown_error",
        payload.needed ? `needed=${payload.needed}` : null,
        payload.provided ? `provided=${payload.provided}` : null
      ]
        .filter(Boolean)
        .join(", ");
      const error = new Error(`Slack API ${method} failed: ${details}`);
      error.slackError = payload.error || "unknown_error";
      throw error;
    }

    return payload;
  }

  async lookupUserIdByEmail(email) {
    if (!email) {
      return null;
    }

    try {
      const payload = await this.get("users.lookupByEmail", { email });
      return payload?.user?.id || null;
    } catch (error) {
      if (error.slackError === "users_not_found") {
        return null;
      }

      throw error;
    }
  }

  async listUsers() {
    if (!this.userListPromise) {
      this.userListPromise = (async () => {
        const members = [];
        let cursor = null;

        do {
          const payload = await this.get("users.list", cursor ? { cursor, limit: 200 } : { limit: 200 });
          members.push(...(Array.isArray(payload?.members) ? payload.members : []));
          cursor = payload?.response_metadata?.next_cursor || null;
        } while (cursor);

        return members;
      })();
    }

    return this.userListPromise;
  }

  async listConversations() {
    if (!this.conversationListPromise) {
      this.conversationListPromise = (async () => {
        const channels = [];
        let cursor = null;

        do {
          const payload = await this.get(
            "conversations.list",
            cursor
              ? { cursor, limit: 200, types: "public_channel,private_channel", exclude_archived: true }
              : { limit: 200, types: "public_channel,private_channel", exclude_archived: true }
          );
          channels.push(...(Array.isArray(payload?.channels) ? payload.channels : []));
          cursor = payload?.response_metadata?.next_cursor || null;
        } while (cursor);

        return channels;
      })();
    }

    return this.conversationListPromise;
  }

  async lookupUserIdByName(name) {
    if (!name) {
      return null;
    }

    const wanted = normalizeText(name);
    const users = await this.listUsers();

    for (const user of users) {
      const candidates = [
        user?.name,
        user?.real_name,
        user?.profile?.display_name,
        user?.profile?.real_name,
        user?.profile?.display_name_normalized,
        user?.profile?.real_name_normalized
      ];

      if (candidates.some((candidate) => normalizeText(candidate) === wanted)) {
        return user.id || null;
      }
    }

    return null;
  }

  async lookupConversationIdByName(name) {
    if (!name) {
      return null;
    }

    const wanted = normalizeText(String(name).replace(/^#/, ""));
    const conversations = await this.listConversations();

    for (const conversation of conversations) {
      const candidates = [conversation?.name, conversation?.name_normalized];

      if (candidates.some((candidate) => normalizeText(candidate) === wanted)) {
        return conversation.id || null;
      }
    }

    return null;
  }

  async resolveOwner(candidate) {
    const userId =
      candidate.slackUserId ||
      (await this.lookupUserIdByEmail(candidate.slackEmail)) ||
      (await this.lookupUserIdByName(candidate.slackDisplayName)) ||
      (await this.lookupUserIdByName(candidate.slackRealName)) ||
      null;

    return {
      id: userId,
      label: candidate.clickupName,
      mention: userId ? `<@${userId}>` : escapeSlackText(candidate.clickupName)
    };
  }

  async resolveUserId({ userId, email, name }) {
    return userId || (await this.lookupUserIdByEmail(email)) || (await this.lookupUserIdByName(name)) || null;
  }

  async resolveChannelId(channel) {
    if (!channel) {
      return null;
    }

    if (/^[CDG][A-Z0-9]+$/.test(channel)) {
      return channel;
    }

    return (await this.lookupConversationIdByName(channel)) || channel;
  }

  async openDirectMessage({ userId, email, name }) {
    const resolvedUserId = await this.resolveUserId({ userId, email, name });

    if (!resolvedUserId) {
      throw new Error("Could not resolve the Slack user for the DM destination.");
    }

    const payload = await this.api("conversations.open", {
      users: resolvedUserId,
      return_im: true
    });

    return {
      userId: resolvedUserId,
      channelId: payload?.channel?.id || null
    };
  }

  async postMessage({ channel, text, blocks }) {
    if (this.dryRun) {
      return {
        ok: true,
        dryRun: true,
        channel,
        text,
        blocks
      };
    }

    const payload = {
      channel,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false
    };

    if (blocks) {
      payload.blocks = blocks;
    }

    return this.api("chat.postMessage", payload);
  }
}
