import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../emitter.js", () => {
  type EventHandler = (...args: unknown[]) => void;
  const listeners = new Map<string, EventHandler[]>();
  return {
    getEventBus: vi.fn(() => ({
      on: vi.fn((eventType: string, handler: EventHandler) => {
        const list = listeners.get(eventType) ?? [];
        list.push(handler);
        listeners.set(eventType, list);
        return () => {
          const l = listeners.get(eventType) ?? [];
          const idx = l.indexOf(handler);
          if (idx >= 0) l.splice(idx, 1);
        };
      }),
    })),
    resetEventBus: vi.fn(),
  };
});

import { WebhookManager } from "../webhooks.js";
import type { PipelineEvent } from "../types.js";

function makeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    id: "evt-1",
    type: "pipeline.started",
    timestamp: new Date().toISOString(),
    payload: { test: true },
    ...overrides,
  };
}

describe("WebhookManager", () => {
  let manager: WebhookManager;

  beforeEach(() => {
    manager = new WebhookManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe("registerWebhook", () => {
    it("assigns UUID and subscribes to events", () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
        active: true,
      });

      expect(webhook.id).toMatch(/^[0-9a-f]{8}-/);
      expect(webhook.url).toBe("https://example.com/hook");
      expect(webhook.createdAt).toBeDefined();
      expect(webhook.active).toBe(true);
    });

    it("defaults active to true", () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });
      expect(webhook.active).toBe(true);
    });
  });

  describe("unregisterWebhook", () => {
    it("removes webhook and returns true", () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });
      expect(manager.unregisterWebhook(webhook.id)).toBe(true);
      expect(manager.getWebhook(webhook.id)).toBeUndefined();
    });

    it("returns false for non-existent webhook", () => {
      expect(manager.unregisterWebhook("nonexistent")).toBe(false);
    });
  });

  describe("listWebhooks", () => {
    it("returns all registered webhooks", () => {
      manager.registerWebhook({
        url: "https://a.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });
      manager.registerWebhook({
        url: "https://b.com/hook",
        events: ["pipeline.completed"],
        secret: "secret1234567890cd",
      });

      expect(manager.listWebhooks()).toHaveLength(2);
    });
  });

  describe("signPayload", () => {
    it("produces valid HMAC-SHA256 hex signature", () => {
      const sig = manager.signPayload('{"test":true}', "my-secret");
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different signatures for different payloads", () => {
      const sig1 = manager.signPayload("payload1", "secret");
      const sig2 = manager.signPayload("payload2", "secret");
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different secrets", () => {
      const sig1 = manager.signPayload("payload", "secret1");
      const sig2 = manager.signPayload("payload", "secret2");
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("deliverEvent", () => {
    it("delivers successfully with mocked fetch", async () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });

      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const delivery = await manager.deliverEvent(webhook.id, makeEvent());

      expect(delivery.status).toBe("success");
      expect(delivery.attempt).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it("retries on failure with 3 attempts", async () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const delivery = await manager.deliverEvent(webhook.id, makeEvent());

      expect(delivery.status).toBe("failed");
      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.unstubAllGlobals();
    });

    it("populates dead letter queue after 3 failures", async () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      await manager.deliverEvent(webhook.id, makeEvent());

      const deadLetters = manager.getDeadLetters();
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0].webhookId).toBe(webhook.id);
      expect(deadLetters[0].attempts).toBe(3);

      vi.unstubAllGlobals();
    });

    it("returns early for inactive webhook", async () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
        active: false,
      });

      const delivery = await manager.deliverEvent(webhook.id, makeEvent());

      expect(delivery.status).toBe("failed");
      expect(delivery.error).toContain("inactive");
      expect(delivery.attempt).toBe(0);
    });

    it("returns early for non-existent webhook", async () => {
      const delivery = await manager.deliverEvent("nonexistent", makeEvent());
      expect(delivery.status).toBe("failed");
      expect(delivery.attempt).toBe(0);
    });
  });

  describe("getDeliveryLog", () => {
    it("filters by webhookId", async () => {
      const wh1 = manager.registerWebhook({
        url: "https://a.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });
      const wh2 = manager.registerWebhook({
        url: "https://b.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890cd",
      });

      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await manager.deliverEvent(wh1.id, makeEvent());
      await manager.deliverEvent(wh2.id, makeEvent({ id: "evt-2" }));

      const log1 = manager.getDeliveryLog(wh1.id);
      expect(log1).toHaveLength(1);
      expect(log1[0].webhookId).toBe(wh1.id);

      const allLogs = manager.getDeliveryLog();
      expect(allLogs).toHaveLength(2);

      vi.unstubAllGlobals();
    });
  });

  describe("destroy", () => {
    it("clears all webhooks and unsubscriptions", () => {
      manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.started"],
        secret: "secret1234567890ab",
      });

      manager.destroy();

      expect(manager.listWebhooks()).toHaveLength(0);
    });
  });
});
