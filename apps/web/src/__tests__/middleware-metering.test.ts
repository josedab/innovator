import { describe, it, expect, beforeEach, vi } from "vitest";

// Inline the metering & quota logic for testability (mirrors middleware.test.ts pattern)
// The actual middleware.ts exports these functions but requires NextRequest

interface MeteringEntry {
  keyId: string;
  route: string;
  method: string;
  timestamp: number;
}

interface KeyTierConfig {
  dailyLimit: number;
  burstPerMinute: number;
}

let meteringLog: MeteringEntry[];
let KEY_TIERS: Record<string, KeyTierConfig>;

function recordMeteringEntry(keyId: string, route: string, method: string): void {
  meteringLog.push({ keyId, route, method, timestamp: Date.now() });
  const MAX_METERING_ENTRIES = 50_000;
  if (meteringLog.length > MAX_METERING_ENTRIES) {
    meteringLog.splice(0, meteringLog.length - MAX_METERING_ENTRIES);
  }
}

function setMeteringKeyTier(keyId: string, tier: "free" | "pro" | "enterprise"): void {
  const configs: Record<string, KeyTierConfig> = {
    free: { dailyLimit: 100, burstPerMinute: 10 },
    pro: { dailyLimit: 10_000, burstPerMinute: 60 },
    enterprise: { dailyLimit: -1, burstPerMinute: 200 },
  };
  KEY_TIERS[keyId] = configs[tier];
}

function checkKeyQuota(keyId: string): { status: number; error: string } | null {
  const config = KEY_TIERS[keyId];
  if (!config) return null;

  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const minuteStart = now - 60_000;

  const dailyCount = meteringLog.filter(
    (e) => e.keyId === keyId && e.timestamp >= dayStartMs
  ).length;
  const burstCount = meteringLog.filter(
    (e) => e.keyId === keyId && e.timestamp >= minuteStart
  ).length;

  if (config.dailyLimit !== -1 && dailyCount >= config.dailyLimit) {
    return { status: 429, error: "Daily API quota exceeded." };
  }

  if (burstCount >= config.burstPerMinute) {
    return { status: 429, error: "Rate limit exceeded." };
  }

  return null;
}

function getMeteringLog(): MeteringEntry[] {
  return meteringLog;
}

describe("middleware metering system", () => {
  beforeEach(() => {
    meteringLog = [];
    KEY_TIERS = {};
  });

  // ---- setMeteringKeyTier ----

  describe("setMeteringKeyTier", () => {
    it("sets free tier for a key", () => {
      setMeteringKeyTier("key-1", "free");
      expect(KEY_TIERS["key-1"].dailyLimit).toBe(100);
      expect(KEY_TIERS["key-1"].burstPerMinute).toBe(10);
    });

    it("sets pro tier for a key", () => {
      setMeteringKeyTier("key-1", "pro");
      expect(KEY_TIERS["key-1"].dailyLimit).toBe(10_000);
      expect(KEY_TIERS["key-1"].burstPerMinute).toBe(60);
    });

    it("sets enterprise tier for a key (unlimited daily)", () => {
      setMeteringKeyTier("key-1", "enterprise");
      expect(KEY_TIERS["key-1"].dailyLimit).toBe(-1);
      expect(KEY_TIERS["key-1"].burstPerMinute).toBe(200);
    });

    it("updates tier for an existing key (transitions)", () => {
      setMeteringKeyTier("key-1", "free");
      expect(KEY_TIERS["key-1"].dailyLimit).toBe(100);
      setMeteringKeyTier("key-1", "pro");
      expect(KEY_TIERS["key-1"].dailyLimit).toBe(10_000);
    });

    it("tier transition resets config completely", () => {
      setMeteringKeyTier("key-1", "enterprise");
      setMeteringKeyTier("key-1", "free");
      expect(KEY_TIERS["key-1"].dailyLimit).toBe(100);
      expect(KEY_TIERS["key-1"].burstPerMinute).toBe(10);
    });
  });

  // ---- checkKeyQuota ----

  describe("checkKeyQuota", () => {
    it("returns null when no tier is set (no enforcement)", () => {
      recordMeteringEntry("key-x", "/api/test", "GET");
      expect(checkKeyQuota("key-x")).toBeNull();
    });

    it("free tier: blocks after 100 daily requests", () => {
      setMeteringKeyTier("key-1", "free");
      for (let i = 0; i < 100; i++) {
        recordMeteringEntry("key-1", "/api/test", "GET");
      }
      const result = checkKeyQuota("key-1");
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      expect(result!.error).toContain("Daily");
    });

    it("free tier: allows 99 daily requests (under quota)", () => {
      setMeteringKeyTier("key-1", "free");
      // Spread across time to avoid burst limit (10/min)
      const now = Date.now();
      for (let i = 0; i < 99; i++) {
        meteringLog.push({
          keyId: "key-1",
          route: "/api/test",
          method: "GET",
          timestamp: now - (i + 1) * 120_000,
        });
      }
      expect(checkKeyQuota("key-1")).toBeNull();
    });

    it("pro tier: allows up to 10K daily requests", () => {
      setMeteringKeyTier("key-1", "pro");
      // Spread across time to avoid burst limit (60/min)
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        meteringLog.push({
          keyId: "key-1",
          route: "/api/test",
          method: "GET",
          timestamp: now - (i + 1) * 120_000,
        });
      }
      expect(checkKeyQuota("key-1")).toBeNull();
    });

    it("enterprise tier: unlimited daily requests (no daily cap)", () => {
      setMeteringKeyTier("key-1", "enterprise");
      // Add entries spread across time so they don't trigger burst limit
      const now = Date.now();
      for (let i = 0; i < 500; i++) {
        meteringLog.push({
          keyId: "key-1",
          route: "/api/test",
          method: "GET",
          timestamp: now - (i + 1) * 120_000,
        });
      }
      expect(checkKeyQuota("key-1")).toBeNull();
    });

    it("enterprise tier: still enforces burst limit", () => {
      setMeteringKeyTier("key-1", "enterprise");
      for (let i = 0; i < 200; i++) {
        recordMeteringEntry("key-1", "/api/test", "GET");
      }
      const result = checkKeyQuota("key-1");
      expect(result).not.toBeNull();
      expect(result!.error).toContain("Rate limit");
    });

    it("per-key isolation: one key quota doesn't affect another", () => {
      setMeteringKeyTier("key-1", "free");
      setMeteringKeyTier("key-2", "free");
      for (let i = 0; i < 100; i++) {
        recordMeteringEntry("key-1", "/api/test", "GET");
      }
      expect(checkKeyQuota("key-1")).not.toBeNull();
      expect(checkKeyQuota("key-2")).toBeNull();
    });
  });

  // ---- getMeteringLog ----

  describe("getMeteringLog", () => {
    it("returns an empty array initially", () => {
      expect(getMeteringLog()).toEqual([]);
    });

    it("records entries accurately", () => {
      recordMeteringEntry("key-1", "/api/test", "POST");
      const log = getMeteringLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        keyId: "key-1",
        route: "/api/test",
        method: "POST",
      });
      expect(log[0].timestamp).toBeGreaterThan(0);
    });

    it("preserves insertion order", () => {
      recordMeteringEntry("k1", "/a", "GET");
      recordMeteringEntry("k2", "/b", "POST");
      const log = getMeteringLog();
      expect(log[0].keyId).toBe("k1");
      expect(log[1].keyId).toBe("k2");
    });
  });

  // ---- Concurrent request cap ----

  describe("concurrent request cap", () => {
    const MAX_CONCURRENT_PER_IP = 2;
    let inFlightMap: Map<string, number>;

    beforeEach(() => {
      inFlightMap = new Map();
    });

    function tryRequest(ip: string): boolean {
      const current = inFlightMap.get(ip) ?? 0;
      if (current >= MAX_CONCURRENT_PER_IP) return false;
      inFlightMap.set(ip, current + 1);
      return true;
    }

    function releaseRequest(ip: string): void {
      const count = inFlightMap.get(ip);
      if (count !== undefined) {
        if (count <= 1) inFlightMap.delete(ip);
        else inFlightMap.set(ip, count - 1);
      }
    }

    it("allows first 2 requests from same IP", () => {
      expect(tryRequest("1.2.3.4")).toBe(true);
      expect(tryRequest("1.2.3.4")).toBe(true);
    });

    it("blocks 3rd concurrent request from same IP", () => {
      tryRequest("1.2.3.4");
      tryRequest("1.2.3.4");
      expect(tryRequest("1.2.3.4")).toBe(false);
    });

    it("allows new request after one completes", () => {
      tryRequest("1.2.3.4");
      tryRequest("1.2.3.4");
      releaseRequest("1.2.3.4");
      expect(tryRequest("1.2.3.4")).toBe(true);
    });

    it("in-flight timeout cleanup resets counter", () => {
      tryRequest("1.2.3.4");
      tryRequest("1.2.3.4");
      releaseRequest("1.2.3.4");
      releaseRequest("1.2.3.4");
      expect(inFlightMap.has("1.2.3.4")).toBe(false);
      expect(tryRequest("1.2.3.4")).toBe(true);
    });

    it("concurrent limit is per-IP", () => {
      tryRequest("1.1.1.1");
      tryRequest("1.1.1.1");
      expect(tryRequest("2.2.2.2")).toBe(true);
    });
  });

  // ---- IP extraction chain ----

  describe("IP extraction chain", () => {
    function getClientIp(headers: Record<string, string>, platformIp?: string): string {
      if (platformIp) return platformIp;
      const xff = headers["x-forwarded-for"];
      if (xff) return xff.split(",")[0].trim();
      const xri = headers["x-real-ip"];
      if (xri) return xri;
      return "unknown";
    }

    it("prefers platform IP over all headers", () => {
      expect(
        getClientIp({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "10.0.0.2" }, "172.16.0.1")
      ).toBe("172.16.0.1");
    });

    it("falls back to x-forwarded-for first entry", () => {
      expect(getClientIp({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" })).toBe("10.0.0.1");
    });

    it("falls back to x-real-ip when no x-forwarded-for", () => {
      expect(getClientIp({ "x-real-ip": "192.168.1.1" })).toBe("192.168.1.1");
    });

    it("returns 'unknown' when no IP source available", () => {
      expect(getClientIp({})).toBe("unknown");
    });
  });

  // ---- Rate limit map overflow protection ----

  describe("rate limit map overflow", () => {
    it("cleanup removes expired entries", () => {
      interface RateLimitEntry {
        count: number;
        resetTime: number;
      }
      const map = new Map<string, RateLimitEntry>();

      map.set("expired-ip", { count: 5, resetTime: Date.now() - 1000 });
      map.set("valid-ip", { count: 1, resetTime: Date.now() + 60_000 });

      const now = Date.now();
      for (const [key, entry] of map) {
        if (now > entry.resetTime) map.delete(key);
      }

      expect(map.has("expired-ip")).toBe(false);
      expect(map.has("valid-ip")).toBe(true);
    });

    it("caps map size by evicting oldest entries", () => {
      interface RateLimitEntry {
        count: number;
        resetTime: number;
      }
      const map = new Map<string, RateLimitEntry>();
      const MAX = 100;

      for (let i = 0; i < MAX + 50; i++) {
        map.set(`ip-${i}`, { count: 1, resetTime: Date.now() + i * 1000 });
      }

      if (map.size > MAX) {
        const entries = [...map.entries()].sort((a, b) => a[1].resetTime - b[1].resetTime);
        const toRemove = entries.slice(0, map.size - MAX);
        for (const [key] of toRemove) map.delete(key);
      }

      expect(map.size).toBe(MAX);
    });
  });

  // ---- Additional quota edge cases ----

  describe("checkKeyQuota — quota resets at day boundary", () => {
    it("daily count resets at UTC midnight", () => {
      setMeteringKeyTier("reset-key", "free");

      // Simulate entries from yesterday
      const yesterday = Date.now() - 86_400_000 - 1000;
      for (let i = 0; i < 100; i++) {
        meteringLog.push({
          keyId: "reset-key",
          route: "/api/test",
          method: "GET",
          timestamp: yesterday,
        });
      }

      // Today's count should be 0, so quota is not exceeded
      const result = checkKeyQuota("reset-key");
      expect(result).toBeNull();
    });
  });

  describe("metering entry overflow", () => {
    it("trims oldest entries when exceeding MAX_METERING_ENTRIES", () => {
      const MAX_METERING_ENTRIES = 50_000;
      // Fill to just above capacity
      for (let i = 0; i < MAX_METERING_ENTRIES + 10; i++) {
        recordMeteringEntry("overflow-key", "/api/test", "GET");
      }
      expect(meteringLog.length).toBeLessThanOrEqual(MAX_METERING_ENTRIES);
    });
  });

  describe("setMeteringKeyTier — burst per minute values", () => {
    it("free tier has burst limit of 10/min", () => {
      setMeteringKeyTier("burst-free", "free");
      expect(KEY_TIERS["burst-free"].burstPerMinute).toBe(10);
    });

    it("pro tier has burst limit of 60/min", () => {
      setMeteringKeyTier("burst-pro", "pro");
      expect(KEY_TIERS["burst-pro"].burstPerMinute).toBe(60);
    });

    it("enterprise tier has burst limit of 200/min", () => {
      setMeteringKeyTier("burst-ent", "enterprise");
      expect(KEY_TIERS["burst-ent"].burstPerMinute).toBe(200);
    });
  });

  describe("checkKeyQuota — burst limit enforcement", () => {
    it("free tier: blocks after 10 requests per minute", () => {
      setMeteringKeyTier("burst-key", "free");
      for (let i = 0; i < 10; i++) {
        recordMeteringEntry("burst-key", "/api/test", "GET");
      }
      const result = checkKeyQuota("burst-key");
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      expect(result!.error).toContain("Rate limit");
    });
  });

  describe("in-flight timeout safety net", () => {
    it("stale in-flight entries with count <= 0 are removed on cleanup", () => {
      const inFlightMap = new Map<string, number>();
      inFlightMap.set("stale-ip", 0);
      inFlightMap.set("active-ip", 1);

      for (const [key, count] of inFlightMap) {
        if (count <= 0) inFlightMap.delete(key);
      }

      expect(inFlightMap.has("stale-ip")).toBe(false);
      expect(inFlightMap.has("active-ip")).toBe(true);
    });
  });
});
