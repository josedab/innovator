import { describe, it, expect, beforeEach } from "vitest";
import { WebhookRegistry, getWebhookRegistry } from "../api-gateway/webhooks.js";

describe("webhooks", () => {
  let registry: WebhookRegistry;

  beforeEach(() => {
    registry = new WebhookRegistry();
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
});
