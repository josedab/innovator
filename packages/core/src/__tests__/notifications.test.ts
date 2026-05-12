import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerChannel,
  removeChannel,
  getChannels,
  formatForSlack,
  formatForTeams,
  formatForEmail,
  sendNotification,
  sendDigest,
  updatePreferences,
  getPreferences,
  getDeliveryHistory,
  testChannel,
  clearNotifications,
  NotificationChannelSchema,
  NotificationPayloadSchema,
} from "../notifications/index.js";
import type { NotificationChannel, NotificationPayload } from "../notifications/index.js";

beforeEach(() => {
  clearNotifications();
});

describe("NotificationChannelSchema", () => {
  it("validates a valid Slack channel", () => {
    const channel = {
      id: "ch-1",
      type: "slack",
      config: { webhookUrl: "https://hooks.slack.com/services/XXX" },
      enabled: true,
    };
    const result = NotificationChannelSchema.safeParse(channel);
    expect(result.success).toBe(true);
  });

  it("validates a valid email channel", () => {
    const channel = {
      id: "ch-2",
      type: "email",
      config: { to: "test@example.com" },
      enabled: true,
    };
    const result = NotificationChannelSchema.safeParse(channel);
    expect(result.success).toBe(true);
  });
});

describe("NotificationPayloadSchema", () => {
  it("validates a valid payload", () => {
    const payload = {
      title: "New High-Score Idea",
      body: "Your idea scored 9.5/10",
      priority: "high",
      category: "high_score_idea",
      timestamp: new Date().toISOString(),
    };
    const result = NotificationPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload without title", () => {
    const payload = {
      body: "Missing title",
      priority: "low",
      category: "session_complete",
    };
    const result = NotificationPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("registerChannel", () => {
  it("registers a channel and retrieves it", () => {
    const channel = {
      id: "ch-slack",
      type: "slack" as const,
      config: { webhookUrl: "https://hooks.slack.com/services/XXX" },
      enabled: true,
    };
    const registered = registerChannel(channel);
    expect(registered.id).toBe("ch-slack");
    const channels = getChannels();
    expect(channels.some((c) => c.id === "ch-slack")).toBe(true);
  });
});

describe("removeChannel", () => {
  it("removes a registered channel", () => {
    registerChannel({
      id: "ch-remove",
      type: "slack" as const,
      config: { webhookUrl: "https://hooks.slack.com/services/XXX" },
      enabled: true,
    });
    const removed = removeChannel("ch-remove");
    expect(removed).toBe(true);
    const channels = getChannels();
    expect(channels.some((c) => c.id === "ch-remove")).toBe(false);
  });

  it("returns false for non-existent channel", () => {
    const removed = removeChannel("nonexistent");
    expect(removed).toBe(false);
  });
});

describe("getChannels", () => {
  it("returns empty array when no channels registered", () => {
    const channels = getChannels();
    expect(channels).toEqual([]);
  });

  it("returns all registered channels", () => {
    registerChannel({
      id: "ch-1",
      type: "slack" as const,
      config: { webhookUrl: "https://hooks.slack.com/1" },
      enabled: true,
    });
    registerChannel({
      id: "ch-2",
      type: "email" as const,
      config: { to: "a@b.com" },
      enabled: true,
    });
    const channels = getChannels();
    expect(channels).toHaveLength(2);
  });
});

describe("formatForSlack", () => {
  it("returns a Slack-formatted message object", () => {
    const payload = {
      title: "Test Notification",
      body: "This is a test",
      priority: "medium" as const,
      category: "session_complete" as const,
      timestamp: new Date().toISOString(),
    };
    const formatted = formatForSlack(payload);
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe("object");
  });
});

describe("formatForTeams", () => {
  it("returns a Teams-formatted message object", () => {
    const payload = {
      title: "Teams Notification",
      body: "This is for Teams",
      priority: "high" as const,
      category: "high_score_idea" as const,
      timestamp: new Date().toISOString(),
    };
    const formatted = formatForTeams(payload);
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe("object");
  });
});

describe("formatForEmail", () => {
  it("returns an email-formatted string", () => {
    const payload = {
      title: "Email Notification",
      body: "This is for email",
      priority: "low" as const,
      category: "collaboration" as const,
      timestamp: new Date().toISOString(),
    };
    const formatted = formatForEmail(payload);
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("Email Notification");
  });

  it("escapes HTML in title and body (XSS prevention)", () => {
    const payload: NotificationPayload = {
      title: '<script>alert("xss")</script>',
      body: '<img onerror="alert(1)" src="x">',
      priority: "high",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    const html = formatForEmail(payload);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("includes priority color styling", () => {
    const payload: NotificationPayload = {
      title: "Urgent Alert",
      body: "Critical issue",
      priority: "urgent",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    const html = formatForEmail(payload);
    expect(html).toContain("#dc2626"); // urgent color
  });
});

describe("formatForSlack (detailed)", () => {
  it("returns Slack block kit structure", () => {
    const payload: NotificationPayload = {
      title: "Test",
      body: "Body text",
      priority: "high",
      category: "high_score_idea",
      timestamp: "2024-01-01T00:00:00Z",
    };
    const formatted = formatForSlack(payload) as Record<string, unknown>;
    expect(formatted.text).toBe("Test");
    expect(formatted.blocks).toBeDefined();
    const blocks = formatted.blocks as Array<Record<string, unknown>>;
    expect(blocks[0].type).toBe("header");
    expect(blocks[1].type).toBe("section");
    expect(blocks[2].type).toBe("context");
  });

  it("uses correct emoji for each priority", () => {
    for (const [priority, emoji] of [
      ["low", "ℹ️"],
      ["medium", "📋"],
      ["high", "⚠️"],
      ["urgent", "🚨"],
    ] as const) {
      const payload: NotificationPayload = {
        title: "Test",
        body: "Body",
        priority,
        category: "system",
        timestamp: new Date().toISOString(),
      };
      const formatted = formatForSlack(payload) as Record<string, unknown>;
      const blocks = formatted.blocks as Array<Record<string, unknown>>;
      const header = blocks[0] as { text: { text: string } };
      expect(header.text.text).toContain(emoji);
    }
  });
});

describe("formatForTeams (detailed)", () => {
  it("returns adaptive card format", () => {
    const payload: NotificationPayload = {
      title: "Teams Alert",
      body: "Alert body",
      priority: "medium",
      category: "session_complete",
      timestamp: "2024-01-01T00:00:00Z",
    };
    const card = formatForTeams(payload) as Record<string, unknown>;
    expect(card.type).toBe("message");
    expect(card.attachments).toBeDefined();
    const attachments = card.attachments as Array<Record<string, unknown>>;
    expect(attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    const content = attachments[0].content as Record<string, unknown>;
    expect(content.type).toBe("AdaptiveCard");
  });
});

describe("updatePreferences / getPreferences", () => {
  it("creates preferences for new user", () => {
    const prefs = updatePreferences("user-1", {
      channels: ["ch-1"],
      digestFrequency: "weekly",
    });
    expect(prefs.userId).toBe("user-1");
    expect(prefs.channels).toEqual(["ch-1"]);
    expect(prefs.digestFrequency).toBe("weekly");
  });

  it("returns undefined for non-existent user", () => {
    expect(getPreferences("nonexistent")).toBeUndefined();
  });

  it("merges with existing preferences", () => {
    updatePreferences("user-1", { channels: ["ch-1"], digestFrequency: "daily" });
    updatePreferences("user-1", { digestFrequency: "hourly" });

    const prefs = getPreferences("user-1")!;
    expect(prefs.channels).toEqual(["ch-1"]);
    expect(prefs.digestFrequency).toBe("hourly");
  });

  it("defaults to daily digest frequency", () => {
    const prefs = updatePreferences("user-1", { channels: [] });
    expect(prefs.digestFrequency).toBe("daily");
  });
});

describe("sendNotification", () => {
  it("skips disabled channels", async () => {
    const channel: NotificationChannel = {
      id: "disabled",
      type: "webhook",
      config: { url: "http://example.com" },
      enabled: false,
    };
    const payload: NotificationPayload = {
      title: "Test",
      body: "Body",
      priority: "low",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    const deliveries = await sendNotification(payload, [channel]);
    expect(deliveries).toHaveLength(0);
  });

  it("records delivery in history on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const channel: NotificationChannel = {
      id: "test-ch",
      type: "webhook",
      config: { url: "http://example.com/webhook" },
      enabled: true,
    };
    const payload: NotificationPayload = {
      title: "Test",
      body: "Body",
      priority: "low",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    const deliveries = await sendNotification(payload, [channel]);
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].channelId).toBe("test-ch");
    expect(deliveries[0].status).toBe("sent");
    expect(deliveries[0].attempts).toBe(1);

    const history = getDeliveryHistory("test-ch");
    expect(history.length).toBe(1);

    vi.unstubAllGlobals();
  });

  it("retries on failure and marks failed after max attempts", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    const channel: NotificationChannel = {
      id: "fail-ch",
      type: "webhook",
      config: { url: "http://example.com/fail" },
      enabled: true,
    };
    const payload: NotificationPayload = {
      title: "Test",
      body: "Body",
      priority: "low",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    const deliveries = await sendNotification(payload, [channel]);
    expect(deliveries[0].status).toBe("failed");
    expect(deliveries[0].attempts).toBe(3); // MAX_RETRY_ATTEMPTS

    vi.unstubAllGlobals();
  }, 30000);
});

describe("getDeliveryHistory", () => {
  it("returns empty for no deliveries", () => {
    expect(getDeliveryHistory()).toHaveLength(0);
  });

  it("filters by channelId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const ch1: NotificationChannel = {
      id: "ch-1",
      type: "webhook",
      config: { url: "http://example.com/a" },
      enabled: true,
    };
    const ch2: NotificationChannel = {
      id: "ch-2",
      type: "webhook",
      config: { url: "http://example.com/b" },
      enabled: true,
    };
    const payload: NotificationPayload = {
      title: "Test",
      body: "Body",
      priority: "low",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    await sendNotification(payload, [ch1, ch2]);

    const ch1History = getDeliveryHistory("ch-1");
    expect(ch1History.every((d) => d.channelId === "ch-1")).toBe(true);

    vi.unstubAllGlobals();
  });

  it("respects limit parameter", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const channel: NotificationChannel = {
      id: "ch-limit",
      type: "webhook",
      config: { url: "http://example.com/x" },
      enabled: true,
    };
    const payload: NotificationPayload = {
      title: "Test",
      body: "Body",
      priority: "low",
      category: "system",
      timestamp: new Date().toISOString(),
    };
    await sendNotification(payload, [channel]);
    await sendNotification(payload, [channel]);

    const limited = getDeliveryHistory("ch-limit", 1);
    expect(limited).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});

describe("sendDigest", () => {
  it("returns empty deliveries when user has no channels", async () => {
    const deliveries = await sendDigest("unknown-user");
    expect(deliveries).toHaveLength(0);
  });

  it("sends digest to user channels", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    registerChannel({
      id: "digest-ch",
      type: "webhook",
      config: { url: "http://example.com/digest" },
      enabled: true,
    });
    updatePreferences("user-1", { channels: ["digest-ch"], digestFrequency: "daily" });

    const deliveries = await sendDigest("user-1");
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0].payload.category).toBe("digest");
    expect(deliveries[0].payload.title).toContain("Digest");

    vi.unstubAllGlobals();
  });
});

describe("duplicate channels", () => {
  it("overwrites channel with same id", () => {
    registerChannel({
      id: "dup",
      type: "slack",
      config: { webhookUrl: "https://hooks.slack.com/1" },
      enabled: true,
    });
    registerChannel({
      id: "dup",
      type: "email",
      config: { to: "a@b.com" },
      enabled: false,
    });
    const channels = getChannels();
    const dup = channels.find((c) => c.id === "dup");
    expect(dup?.type).toBe("email");
    expect(dup?.enabled).toBe(false);
  });
});

describe("getChannels with userId", () => {
  it("returns user-specific channels based on preferences", () => {
    registerChannel({
      id: "ch-a",
      type: "slack",
      config: { webhookUrl: "https://hooks.slack.com/1" },
      enabled: true,
    });
    registerChannel({
      id: "ch-b",
      type: "email",
      config: { to: "a@b.com" },
      enabled: true,
    });
    updatePreferences("user-1", { channels: ["ch-a"] });

    const userChannels = getChannels("user-1");
    expect(userChannels).toHaveLength(1);
    expect(userChannels[0].id).toBe("ch-a");
  });

  it("returns empty for user with no preferences", () => {
    expect(getChannels("unknown")).toHaveLength(0);
  });
});
