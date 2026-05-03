import { describe, it, expect, beforeEach } from "vitest";
import {
  createApiKey,
  getApiKey,
  findApiKeyByValue,
  listApiKeys,
  revokeApiKey,
  updateApiKeyTier,
  deleteApiKey,
  recordUsage,
  getUsageSummary,
  checkDailyLimit,
  checkTokenBucket,
  registerWebhook,
  getWebhooks,
  removeWebhook,
  getOpenApiSpec,
  clearApiGateway,
  TIER_LIMITS,
} from "../api-gateway/index.js";

describe("api-gateway", () => {
  beforeEach(() => {
    clearApiGateway();
  });

  // ---- API Key Management ----

  describe("createApiKey", () => {
    it("creates a key with default free tier", () => {
      const key = createApiKey("Test Key");
      expect(key.name).toBe("Test Key");
      expect(key.tier).toBe("free");
      expect(key.enabled).toBe(true);
      expect(key.id).toMatch(/^key_/);
      expect(key.key).toMatch(/^inv_free_/);
      expect(key.rateLimit).toEqual(TIER_LIMITS.free);
      expect(key.createdAt).toBeDefined();
    });

    it("creates a key with specified tier", () => {
      const key = createApiKey("Pro Key", "pro");
      expect(key.tier).toBe("pro");
      expect(key.key).toMatch(/^inv_pro_/);
      expect(key.rateLimit).toEqual(TIER_LIMITS.pro);
    });

    it("creates an enterprise key", () => {
      const key = createApiKey("Enterprise", "enterprise");
      expect(key.tier).toBe("enterprise");
      expect(key.rateLimit.dailyLimit).toBe(Infinity);
    });
  });

  describe("getApiKey", () => {
    it("returns the key by ID", () => {
      const created = createApiKey("Test");
      const found = getApiKey(created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Test");
    });

    it("returns undefined for unknown ID", () => {
      expect(getApiKey("nonexistent")).toBeUndefined();
    });
  });

  describe("findApiKeyByValue", () => {
    it("finds key by key value", () => {
      const created = createApiKey("Find Me");
      const found = findApiKeyByValue(created.key);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("returns undefined for unknown key value", () => {
      expect(findApiKeyByValue("inv_free_unknown")).toBeUndefined();
    });
  });

  describe("listApiKeys", () => {
    it("returns empty array when no keys", () => {
      expect(listApiKeys()).toEqual([]);
    });

    it("returns all created keys", () => {
      createApiKey("A");
      createApiKey("B");
      expect(listApiKeys()).toHaveLength(2);
    });
  });

  describe("revokeApiKey", () => {
    it("disables the key", () => {
      const key = createApiKey("Revoke Me");
      expect(revokeApiKey(key.id)).toBe(true);
      expect(getApiKey(key.id)!.enabled).toBe(false);
    });

    it("returns false for unknown key", () => {
      expect(revokeApiKey("nonexistent")).toBe(false);
    });
  });

  describe("updateApiKeyTier", () => {
    it("updates tier and rate limits", () => {
      const key = createApiKey("Upgrade Me", "free");
      expect(updateApiKeyTier(key.id, "pro")).toBe(true);
      const updated = getApiKey(key.id)!;
      expect(updated.tier).toBe("pro");
      expect(updated.rateLimit).toEqual(TIER_LIMITS.pro);
    });

    it("returns false for unknown key", () => {
      expect(updateApiKeyTier("nonexistent", "pro")).toBe(false);
    });
  });

  describe("deleteApiKey", () => {
    it("deletes the key", () => {
      const key = createApiKey("Delete Me");
      expect(deleteApiKey(key.id)).toBe(true);
      expect(getApiKey(key.id)).toBeUndefined();
    });

    it("returns false for unknown key", () => {
      expect(deleteApiKey("nonexistent")).toBe(false);
    });
  });

  // ---- Usage Tracking ----

  describe("recordUsage", () => {
    it("records usage and updates lastUsedAt", () => {
      const key = createApiKey("Usage Test");
      const ts = new Date().toISOString();
      recordUsage({
        keyId: key.id,
        endpoint: "/api/innovate",
        timestamp: ts,
        durationMs: 500,
        tokensUsed: 100,
        statusCode: 200,
      });
      const updated = getApiKey(key.id)!;
      expect(updated.lastUsedAt).toBe(ts);
    });
  });

  describe("getUsageSummary", () => {
    it("returns empty summary for no usage", () => {
      const key = createApiKey("Empty");
      const summary = getUsageSummary(key.id);
      expect(summary.totalCalls).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.averageLatencyMs).toBe(0);
      expect(summary.errorRate).toBe(0);
      expect(summary.dailyUsage).toEqual([]);
    });

    it("aggregates usage correctly", () => {
      const key = createApiKey("Aggregate");
      const today = new Date().toISOString();

      recordUsage({
        keyId: key.id,
        endpoint: "/api/innovate",
        timestamp: today,
        durationMs: 200,
        tokensUsed: 50,
        statusCode: 200,
      });
      recordUsage({
        keyId: key.id,
        endpoint: "/api/investigate",
        timestamp: today,
        durationMs: 300,
        tokensUsed: 100,
        statusCode: 200,
      });
      recordUsage({
        keyId: key.id,
        endpoint: "/api/innovate",
        timestamp: today,
        durationMs: 100,
        statusCode: 500,
        error: "fail",
      });

      const summary = getUsageSummary(key.id);
      expect(summary.totalCalls).toBe(3);
      expect(summary.totalTokens).toBe(150);
      expect(summary.averageLatencyMs).toBe(200);
      expect(summary.errorRate).toBeCloseTo(1 / 3);
      expect(summary.endpointBreakdown["/api/innovate"]).toBe(2);
      expect(summary.endpointBreakdown["/api/investigate"]).toBe(1);
    });

    it("includes daily breakdown sorted by date", () => {
      const key = createApiKey("Daily");
      const today = new Date();
      const yesterday = new Date(today.getTime() - 86_400_000);
      const todayStr = today.toISOString();
      const yesterdayStr = yesterday.toISOString();

      recordUsage({
        keyId: key.id,
        endpoint: "/api/test",
        timestamp: todayStr,
        durationMs: 100,
        statusCode: 200,
      });
      recordUsage({
        keyId: key.id,
        endpoint: "/api/test",
        timestamp: yesterdayStr,
        durationMs: 100,
        statusCode: 200,
      });

      const summary = getUsageSummary(key.id, 30);
      expect(summary.dailyUsage).toHaveLength(2);
      // Sorted by date ascending
      expect(summary.dailyUsage[0].date).toBe(yesterdayStr.slice(0, 10));
      expect(summary.dailyUsage[1].date).toBe(todayStr.slice(0, 10));
    });

    it("uses free tier for unknown key", () => {
      const summary = getUsageSummary("unknown-key");
      expect(summary.tier).toBe("free");
    });
  });

  describe("checkDailyLimit", () => {
    it("allows requests within daily limit", () => {
      const key = createApiKey("Daily Limit", "free");
      const result = checkDailyLimit(key.id);
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
      expect(result.limit).toBe(TIER_LIMITS.free.dailyLimit);
    });

    it("blocks after daily limit exceeded", () => {
      const key = createApiKey("Exceeded", "free");
      const today = new Date().toISOString();

      for (let i = 0; i < TIER_LIMITS.free.dailyLimit; i++) {
        recordUsage({
          keyId: key.id,
          endpoint: "/api/test",
          timestamp: today,
          durationMs: 50,
          statusCode: 200,
        });
      }

      const result = checkDailyLimit(key.id);
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(TIER_LIMITS.free.dailyLimit);
    });

    it("returns not allowed for revoked key", () => {
      const key = createApiKey("Revoked");
      revokeApiKey(key.id);
      const result = checkDailyLimit(key.id);
      expect(result.allowed).toBe(false);
    });

    it("returns not allowed for unknown key", () => {
      const result = checkDailyLimit("nonexistent");
      expect(result.allowed).toBe(false);
    });
  });

  // ---- Token Bucket Rate Limiter ----

  describe("checkTokenBucket", () => {
    it("allows first request with full bucket", () => {
      const result = checkTokenBucket("bucket-1", { limit: 10, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("blocks when bucket is empty", () => {
      const config = { limit: 2, windowMs: 60_000 };
      checkTokenBucket("bucket-2", config);
      checkTokenBucket("bucket-2", config);
      const result = checkTokenBucket("bucket-2", config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetMs).toBeGreaterThan(0);
    });

    it("isolates different keys", () => {
      const config = { limit: 1, windowMs: 60_000 };
      checkTokenBucket("bucket-a", config);
      const blocked = checkTokenBucket("bucket-a", config);
      const allowed = checkTokenBucket("bucket-b", config);

      expect(blocked.allowed).toBe(false);
      expect(allowed.allowed).toBe(true);
    });
  });

  // ---- Webhooks ----

  describe("webhooks", () => {
    it("registers and retrieves webhook URLs", () => {
      registerWebhook("wh-key", "https://example.com/hook");
      expect(getWebhooks("wh-key")).toEqual(["https://example.com/hook"]);
    });

    it("does not add duplicate URLs", () => {
      registerWebhook("wh-key2", "https://example.com/hook");
      registerWebhook("wh-key2", "https://example.com/hook");
      expect(getWebhooks("wh-key2")).toHaveLength(1);
    });

    it("returns empty array for unknown key", () => {
      expect(getWebhooks("unknown")).toEqual([]);
    });

    it("removes a webhook URL", () => {
      registerWebhook("wh-rm", "https://a.com");
      registerWebhook("wh-rm", "https://b.com");
      expect(removeWebhook("wh-rm", "https://a.com")).toBe(true);
      expect(getWebhooks("wh-rm")).toEqual(["https://b.com"]);
    });

    it("returns false when removing nonexistent URL", () => {
      expect(removeWebhook("wh-none", "https://a.com")).toBe(false);
    });

    it("returns false when removing URL not in list", () => {
      registerWebhook("wh-miss", "https://a.com");
      expect(removeWebhook("wh-miss", "https://b.com")).toBe(false);
    });
  });

  // ---- OpenAPI ----

  describe("getOpenApiSpec", () => {
    it("returns a valid OpenAPI 3.1 spec", () => {
      const spec = getOpenApiSpec();
      expect(spec.openapi).toBe("3.1.0");
      expect((spec.info as Record<string, unknown>).title).toBe("Innovator API");
      expect(spec.paths).toBeDefined();
    });
  });
});
