import { describe, it, expect, beforeEach } from "vitest";
import {
  registerChannel,
  removeChannel,
  getChannels,
  formatForSlack,
  formatForTeams,
  formatForEmail,
  clearNotifications,
  NotificationChannelSchema,
  NotificationPayloadSchema,
} from "../notifications/index.js";

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
});
