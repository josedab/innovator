import { describe, it, expect, beforeEach } from "vitest";
import { ApiMeter, getApiMeter, resetApiMeter } from "../meter.js";
import {
  getTierForKey,
  setKeyTier,
  removeKeyTier,
  listKeyTiers,
  RATE_LIMIT_TIERS,
} from "../tiers.js";

describe("metering", () => {
  beforeEach(() => {
    resetApiMeter();
    removeKeyTier("test-key");
    removeKeyTier("pro-key");
  });

  describe("RATE_LIMIT_TIERS", () => {
    it("defines free, pro, and enterprise tiers", () => {
      expect(RATE_LIMIT_TIERS.free.dailyLimit).toBe(100);
      expect(RATE_LIMIT_TIERS.pro.dailyLimit).toBe(10_000);
      expect(RATE_LIMIT_TIERS.enterprise.dailyLimit).toBe(-1);
    });

    it("has burst limits for each tier", () => {
      expect(RATE_LIMIT_TIERS.free.burstLimit).toBe(10);
      expect(RATE_LIMIT_TIERS.pro.burstLimit).toBe(60);
      expect(RATE_LIMIT_TIERS.enterprise.burstLimit).toBe(200);
    });
  });

  describe("tier assignment", () => {
    it("defaults to free tier", () => {
      const tier = getTierForKey("unknown-key");
      expect(tier.tier).toBe("free");
      expect(tier.dailyLimit).toBe(100);
    });

    it("assigns and retrieves tier", () => {
      setKeyTier("pro-key", "pro");
      const tier = getTierForKey("pro-key");
      expect(tier.tier).toBe("pro");
      expect(tier.dailyLimit).toBe(10_000);
    });

    it("removes tier assignment", () => {
      setKeyTier("pro-key", "pro");
      removeKeyTier("pro-key");
      expect(getTierForKey("pro-key").tier).toBe("free");
    });

    it("lists key-tier assignments", () => {
      setKeyTier("key-a", "pro");
      setKeyTier("key-b", "enterprise");
      const list = listKeyTiers();
      expect(list).toHaveLength(2);
      expect(list.find((k) => k.keyId === "key-a")?.tier).toBe("pro");
    });
  });

  describe("ApiMeter", () => {
    it("records API calls", () => {
      const meter = getApiMeter();
      const record = meter.record({
        keyId: "test-key",
        route: "/api/investigate",
        method: "POST",
        statusCode: 200,
        durationMs: 150,
      });
      expect(record.id).toBeDefined();
      expect(record.keyId).toBe("test-key");
      expect(record.timestamp).toBeGreaterThan(0);
    });

    it("checks quota for free tier", () => {
      const meter = getApiMeter();
      const quota = meter.checkQuota("test-key");
      expect(quota.allowed).toBe(true);
      expect(quota.tier).toBe("free");
      expect(quota.dailyLimit).toBe(100);
      expect(quota.remainingToday).toBe(100);
    });

    it("decrements remaining quota after recording", () => {
      const meter = getApiMeter();
      meter.record({
        keyId: "test-key",
        route: "/api/test",
        method: "GET",
        statusCode: 200,
        durationMs: 10,
      });
      meter.record({
        keyId: "test-key",
        route: "/api/test",
        method: "GET",
        statusCode: 200,
        durationMs: 10,
      });
      const quota = meter.checkQuota("test-key");
      expect(quota.dailyUsed).toBe(2);
      expect(quota.remainingToday).toBe(98);
    });

    it("denies quota when daily limit exceeded", () => {
      const meter = getApiMeter();
      // Record 100 calls to exhaust free tier
      for (let i = 0; i < 100; i++) {
        meter.record({
          keyId: "test-key",
          route: "/api/test",
          method: "GET",
          statusCode: 200,
          durationMs: 1,
        });
      }
      const quota = meter.checkQuota("test-key");
      expect(quota.allowed).toBe(false);
      expect(quota.remainingToday).toBe(0);
    });

    it("allows unlimited for enterprise tier", () => {
      setKeyTier("ent-key", "enterprise");
      const meter = getApiMeter();
      // Record 150 calls (under enterprise burst limit of 200)
      for (let i = 0; i < 150; i++) {
        meter.record({
          keyId: "ent-key",
          route: "/api/test",
          method: "GET",
          statusCode: 200,
          durationMs: 1,
        });
      }
      const quota = meter.checkQuota("ent-key");
      expect(quota.allowed).toBe(true);
      expect(quota.remainingToday).toBe(-1);
    });

    it("enforces burst limit", () => {
      const meter = getApiMeter();
      // Free tier burst is 10/minute
      for (let i = 0; i < 10; i++) {
        meter.record({
          keyId: "test-key",
          route: "/api/test",
          method: "GET",
          statusCode: 200,
          durationMs: 1,
        });
      }
      const quota = meter.checkQuota("test-key");
      expect(quota.burstUsed).toBe(10);
      expect(quota.allowed).toBe(false);
    });

    it("returns usage summary", () => {
      const meter = getApiMeter();
      meter.record({
        keyId: "test-key",
        route: "/api/investigate",
        method: "POST",
        statusCode: 200,
        durationMs: 100,
      });
      meter.record({
        keyId: "test-key",
        route: "/api/innovate",
        method: "POST",
        statusCode: 200,
        durationMs: 200,
      });
      meter.record({
        keyId: "test-key",
        route: "/api/investigate",
        method: "POST",
        statusCode: 200,
        durationMs: 150,
      });

      const summary = meter.getUsageSummary("test-key");
      expect(summary.totalCalls).toBe(3);
      expect(summary.callsToday).toBe(3);
      expect(summary.usageByRoute["/api/investigate"]).toBe(2);
      expect(summary.usageByRoute["/api/innovate"]).toBe(1);
      expect(summary.usageByHour).toHaveLength(24);
      expect(summary.usageByDay).toHaveLength(30);
    });

    it("lists metered keys", () => {
      const meter = getApiMeter();
      meter.record({
        keyId: "key-a",
        route: "/api/test",
        method: "GET",
        statusCode: 200,
        durationMs: 1,
      });
      meter.record({
        keyId: "key-b",
        route: "/api/test",
        method: "GET",
        statusCode: 200,
        durationMs: 1,
      });
      expect(meter.listKeys()).toContain("key-a");
      expect(meter.listKeys()).toContain("key-b");
    });

    it("configures and checks alerts", () => {
      const meter = getApiMeter();
      meter.setAlert({ keyId: "test-key", thresholdPercent: 80, enabled: true });

      // Record 85 calls out of 100 (85%)
      for (let i = 0; i < 85; i++) {
        meter.record({
          keyId: "test-key",
          route: "/api/test",
          method: "GET",
          statusCode: 200,
          durationMs: 1,
        });
      }

      const alert = meter.checkAlerts("test-key");
      expect(alert).not.toBeNull();
      expect(alert!.usagePercent).toBeGreaterThanOrEqual(80);
      expect(alert!.message).toContain("test-key");
    });

    it("does not fire alert below threshold", () => {
      const meter = getApiMeter();
      meter.setAlert({ keyId: "test-key", thresholdPercent: 80, enabled: true });

      for (let i = 0; i < 10; i++) {
        meter.record({
          keyId: "test-key",
          route: "/api/test",
          method: "GET",
          statusCode: 200,
          durationMs: 1,
        });
      }

      const alert = meter.checkAlerts("test-key");
      expect(alert).toBeNull();
    });

    it("resets metering data", () => {
      const meter = getApiMeter();
      meter.record({
        keyId: "test-key",
        route: "/api/test",
        method: "GET",
        statusCode: 200,
        durationMs: 1,
      });
      meter.reset("test-key");
      expect(meter.getUsageSummary("test-key").totalCalls).toBe(0);
    });

    it("singleton via getApiMeter()", () => {
      const a = getApiMeter();
      const b = getApiMeter();
      expect(a).toBe(b);
    });
  });
});
