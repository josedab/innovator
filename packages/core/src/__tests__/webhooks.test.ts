import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { WebhookRegistry, getWebhookRegistry } from "../api-gateway/webhooks.js";

describe("webhooks", () => {
  let registry: WebhookRegistry;

  beforeEach(() => {
    registry = new WebhookRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("register", () => {
    it("registers a webhook and returns registration with id", () => {
      const reg = registry.register("https://example.com/hook", ["pipeline.complete"]);
      expect(reg.id).toMatch(/^wh_/);
      expect(reg.url).toBe("https://example.com/hook");
      expect(reg.events).toEqual(["pipeline.complete"]);
      expect(reg.active).toBe(true);
      expect(reg.secret).toBeTruthy();
    });

    it("uses provided secret when given", () => {
      const reg = registry.register("https://example.com/hook", ["*"], "my-secret");
      expect(reg.secret).toBe("my-secret");
    });

    it("generates a secret when not provided", () => {
      const reg = registry.register("https://example.com/hook", ["*"]);
      expect(reg.secret).toMatch(/^whsec_/);
    });

    it("throws for invalid URL", () => {
      expect(() => registry.register("not-a-url", ["*"])).toThrow("Invalid webhook URL");
    });
  });

  describe("unregister", () => {
    it("removes a registered webhook", () => {
      const reg = registry.register("https://example.com/hook", ["*"]);
      expect(registry.unregister(reg.id)).toBe(true);
      expect(registry.get(reg.id)).toBeUndefined();
    });

    it("returns false for non-existent webhook", () => {
      expect(registry.unregister("wh_nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns all registered webhooks", () => {
      registry.register("https://a.com/hook", ["*"]);
      registry.register("https://b.com/hook", ["*"]);
      expect(registry.list()).toHaveLength(2);
    });

    it("returns empty array when none registered", () => {
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("get", () => {
    it("returns registration by id", () => {
      const reg = registry.register("https://example.com/hook", ["event.a"]);
      expect(registry.get(reg.id)).toEqual(reg);
    });

    it("returns undefined for unknown id", () => {
      expect(registry.get("wh_unknown")).toBeUndefined();
    });
  });

  describe("deliver", () => {
    it("skips inactive webhooks", async () => {
      const reg = registry.register("https://example.com/hook", ["event.a"]);
      // Deactivate by accessing internal state through unregister+re-check
      registry.unregister(reg.id);
      const result = await registry.deliver("event.a", { data: "test" });
      expect(result.delivered).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("skips webhooks not subscribed to the event", async () => {
      registry.register("https://example.com/hook", ["other.event"]);
      const result = await registry.deliver("event.a", { data: "test" });
      expect(result.delivered).toBe(0);
    });
  });

  describe("getDeliveryHistory", () => {
    it("returns empty array for unknown webhook", () => {
      expect(registry.getDeliveryHistory("wh_unknown")).toEqual([]);
    });
  });

  describe("clear", () => {
    it("removes all registrations and history", () => {
      registry.register("https://a.com/hook", ["*"]);
      registry.register("https://b.com/hook", ["*"]);
      registry.clear();
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("getWebhookRegistry", () => {
    it("returns a singleton instance", () => {
      const a = getWebhookRegistry();
      const b = getWebhookRegistry();
      expect(a).toBe(b);
      expect(a).toBeInstanceOf(WebhookRegistry);
    });
  });

  // ---- Delivery with mocked fetch ----

  describe("delivery with fetch", () => {
    it("delivers payload with HMAC-SHA256 signature and correct headers", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["event.a"], "test-secret");
      await registry.deliver("event.a", { key: "value" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://example.com/hook");
      expect(opts.method).toBe("POST");

      const body = opts.body;
      const expectedSig = createHmac("sha256", "test-secret").update(body).digest("hex");
      expect(opts.headers["X-Webhook-Signature"]).toBe(`sha256=${expectedSig}`);
      expect(opts.headers["X-Webhook-Event"]).toBe("event.a");
      expect(opts.headers["X-Webhook-Id"]).toMatch(/^whd_/);
      expect(opts.headers["X-Webhook-Timestamp"]).toBeTruthy();
      expect(opts.headers["Content-Type"]).toBe("application/json");

      vi.unstubAllGlobals();
    });

    it("delivers to wildcard-subscribed webhooks", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      registry.register("https://example.com/hook", ["*"]);
      const result = await registry.deliver("any.event", { data: 1 });
      expect(result.delivered).toBe(1);
      expect(result.failed).toBe(0);

      vi.unstubAllGlobals();
    });

    it("delivers to multiple subscribers", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      registry.register("https://a.com/hook", ["event.x"]);
      registry.register("https://b.com/hook", ["event.x"]);
      registry.register("https://c.com/hook", ["other"]);

      const result = await registry.deliver("event.x", { data: 1 });
      expect(result.delivered).toBe(2);
      expect(result.failed).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it("records delivery history on success", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["ev"]);
      await registry.deliver("ev", { x: 1 });

      const history = registry.getDeliveryHistory(reg.id);
      expect(history).toHaveLength(1);
      expect(history[0].webhookId).toBe(reg.id);
      expect(history[0].event).toBe("ev");
      expect(history[0].statusCode).toBe(200);
      expect(history[0].retries).toBe(0);

      vi.unstubAllGlobals();
    });
  });

  // ---- Retry behavior ----

  describe("retry on failure", () => {
    it("retries on fetch error and records multiple deliveries", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["ev"]);
      const result = await registry.deliver("ev", { x: 1 });
      expect(result.delivered).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const history = registry.getDeliveryHistory(reg.id);
      expect(history).toHaveLength(3);
      expect(history[0].statusCode).toBe(0);
      expect(history[1].statusCode).toBe(0);
      expect(history[2].statusCode).toBe(200);

      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("retries on 500 status and eventually fails after max retries", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["ev"]);
      const result = await registry.deliver("ev", { x: 1 });
      expect(result.delivered).toBe(0);
      expect(result.failed).toBe(1);
      // 1 initial + 3 retries = 4
      expect(fetchMock).toHaveBeenCalledTimes(4);

      const history = registry.getDeliveryHistory(reg.id);
      expect(history).toHaveLength(4);
      expect(history.every((d) => d.statusCode === 500)).toBe(true);

      vi.unstubAllGlobals();
      vi.useRealTimers();
    }, 15_000);

    it("exhausts retries on persistent fetch errors", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["ev"]);
      const result = await registry.deliver("ev", { x: 1 });
      expect(result.failed).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      const history = registry.getDeliveryHistory(reg.id);
      expect(history).toHaveLength(4);
      expect(history.every((d) => d.statusCode === 0)).toBe(true);
      expect(history[0].retries).toBe(0);
      expect(history[1].retries).toBe(1);
      expect(history[2].retries).toBe(2);
      expect(history[3].retries).toBe(3);

      vi.unstubAllGlobals();
      vi.useRealTimers();
    }, 15_000);
  });

  // ---- testWebhook ----

  describe("testWebhook", () => {
    it("returns null for non-existent webhook", async () => {
      const result = await registry.testWebhook("wh_nonexistent");
      expect(result).toBeNull();
    });

    it("sends test payload and returns delivery record", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["*"]);
      const delivery = await registry.testWebhook(reg.id);

      expect(delivery).not.toBeNull();
      expect(delivery!.webhookId).toBe(reg.id);
      expect(delivery!.event).toBe("webhook.test");
      expect(delivery!.statusCode).toBe(200);

      // Verify test payload format
      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.type).toBe("webhook.test");
      expect(sentBody.message).toContain("test event");
      expect(sentBody.timestamp).toBeTruthy();

      vi.unstubAllGlobals();
    });
  });

  // ---- getDeliveryHistory limit ----

  describe("getDeliveryHistory with limit", () => {
    it("respects the limit parameter", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      const reg = registry.register("https://example.com/hook", ["ev"]);
      // Deliver 3 events
      await registry.deliver("ev", { a: 1 });
      await registry.deliver("ev", { a: 2 });
      await registry.deliver("ev", { a: 3 });

      const limited = registry.getDeliveryHistory(reg.id, 2);
      expect(limited).toHaveLength(2);

      vi.unstubAllGlobals();
    });
  });
});
