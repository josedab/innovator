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
  createTenant,
  getTenant,
  findTenantBySlug,
  listTenants,
  updateTenantTier,
  suspendTenant,
  addTenantApiKey,
  getDeveloperPortalInfo,
  createDemoKey,
  createWebhookSubscription,
  listWebhookSubscriptions,
  getWebhookSubscription,
  deleteWebhookSubscription,
  toggleWebhookSubscription,
  dispatchWebhookEvent,
  getApiVersionInfo,
  listApiVersions,
  getEndpointRateLimit,
  checkUsageRateLimit,
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

  // ---- Multi-Tenant Management ----

  describe("createTenant", () => {
    it("creates a tenant with default free tier", () => {
      const tenant = createTenant("Acme Corp", "admin@acme.com");
      expect(tenant.name).toBe("Acme Corp");
      expect(tenant.ownerEmail).toBe("admin@acme.com");
      expect(tenant.tier).toBe("free");
      expect(tenant.status).toBe("active");
      expect(tenant.apiKeys).toHaveLength(1);
      expect(tenant.settings.maxKeys).toBe(2);
      expect(tenant.settings.webhooksEnabled).toBe(false);
    });

    it("creates a pro tenant with correct settings", () => {
      const tenant = createTenant("Pro Corp", "admin@pro.com", "pro");
      expect(tenant.tier).toBe("pro");
      expect(tenant.settings.maxKeys).toBe(10);
      expect(tenant.settings.webhooksEnabled).toBe(true);
    });

    it("creates an enterprise tenant with correct settings", () => {
      const tenant = createTenant("Big Corp", "admin@big.com", "enterprise");
      expect(tenant.tier).toBe("enterprise");
      expect(tenant.settings.maxKeys).toBe(50);
      expect(tenant.settings.webhooksEnabled).toBe(true);
    });

    it("generates a valid slug", () => {
      const tenant = createTenant("My Great Company!", "a@b.com");
      expect(tenant.slug).toMatch(/^[a-z0-9-]+$/);
    });

    it("creates an initial API key for the tenant", () => {
      const tenant = createTenant("Test", "t@t.com", "free");
      const key = getApiKey(tenant.apiKeys[0]);
      expect(key).toBeDefined();
      expect(key!.tier).toBe("free");
    });
  });

  describe("getTenant / findTenantBySlug", () => {
    it("retrieves tenant by ID", () => {
      const tenant = createTenant("Find Me", "f@m.com");
      expect(getTenant(tenant.id)).toBeDefined();
      expect(getTenant(tenant.id)!.name).toBe("Find Me");
    });

    it("returns undefined for unknown ID", () => {
      expect(getTenant("nonexistent")).toBeUndefined();
    });

    it("finds tenant by slug", () => {
      const tenant = createTenant("Slug Test", "s@t.com");
      const found = findTenantBySlug(tenant.slug);
      expect(found).toBeDefined();
      expect(found!.id).toBe(tenant.id);
    });

    it("returns undefined for unknown slug", () => {
      expect(findTenantBySlug("nonexistent")).toBeUndefined();
    });
  });

  describe("listTenants", () => {
    it("returns all tenants", () => {
      createTenant("A", "a@a.com");
      createTenant("B", "b@b.com");
      expect(listTenants()).toHaveLength(2);
    });
  });

  describe("updateTenantTier", () => {
    it("upgrades tenant tier and updates all keys", () => {
      const tenant = createTenant("Upgrade Me", "u@m.com", "free");
      expect(updateTenantTier(tenant.id, "pro")).toBe(true);
      const updated = getTenant(tenant.id)!;
      expect(updated.tier).toBe("pro");
      expect(updated.settings.maxKeys).toBe(10);
      expect(updated.settings.webhooksEnabled).toBe(true);
      const key = getApiKey(tenant.apiKeys[0])!;
      expect(key.tier).toBe("pro");
    });

    it("returns false for unknown tenant", () => {
      expect(updateTenantTier("nonexistent", "pro")).toBe(false);
    });
  });

  describe("suspendTenant", () => {
    it("suspends tenant and revokes all API keys", () => {
      const tenant = createTenant("Suspend Me", "s@m.com");
      expect(suspendTenant(tenant.id)).toBe(true);
      const suspended = getTenant(tenant.id)!;
      expect(suspended.status).toBe("suspended");
      const key = getApiKey(tenant.apiKeys[0])!;
      expect(key.enabled).toBe(false);
    });

    it("returns false for unknown tenant", () => {
      expect(suspendTenant("nonexistent")).toBe(false);
    });
  });

  describe("addTenantApiKey", () => {
    it("adds a new API key to an active tenant", () => {
      const tenant = createTenant("Key Test", "k@t.com", "pro");
      const newKey = addTenantApiKey(tenant.id, "Extra Key");
      expect(newKey).not.toBeNull();
      expect(newKey!.tier).toBe("pro");
      expect(getTenant(tenant.id)!.apiKeys).toHaveLength(2);
    });

    it("returns null when tenant at max keys", () => {
      const tenant = createTenant("Max Keys", "m@k.com", "free"); // maxKeys=2
      addTenantApiKey(tenant.id, "Key 2");
      const third = addTenantApiKey(tenant.id, "Key 3");
      expect(third).toBeNull();
    });

    it("returns null for suspended tenant", () => {
      const tenant = createTenant("Suspended", "s@s.com");
      suspendTenant(tenant.id);
      expect(addTenantApiKey(tenant.id, "New")).toBeNull();
    });

    it("returns null for unknown tenant", () => {
      expect(addTenantApiKey("nonexistent", "Key")).toBeNull();
    });
  });

  describe("getDeveloperPortalInfo", () => {
    it("returns portal info for a tenant", () => {
      const tenant = createTenant("Portal Test", "p@t.com", "pro");
      const info = getDeveloperPortalInfo(tenant.id);
      expect(info).not.toBeNull();
      expect(info!.tenantName).toBe("Portal Test");
      expect(info!.tier).toBe("pro");
      expect(info!.apiKeys).toHaveLength(1);
      expect(info!.endpoints.length).toBeGreaterThan(0);
      expect(info!.usage.dailyLimit).toBe(TIER_LIMITS.pro.dailyLimit);
    });

    it("returns null for unknown tenant", () => {
      expect(getDeveloperPortalInfo("nonexistent")).toBeNull();
    });
  });

  describe("createDemoKey", () => {
    it("creates a demo key with restricted limits", () => {
      const demo = createDemoKey();
      expect(demo.rateLimit.dailyLimit).toBe(5);
      expect(demo.rateLimit.minuteLimit).toBe(2);
      expect(demo.metadata).toBeDefined();
      expect(demo.metadata!.demo).toBe("true");
    });
  });

  // ---- Webhook Subscriptions ----

  describe("webhook subscriptions", () => {
    it("creates a subscription and retrieves it by ID", () => {
      const key = createApiKey("WH Sub Test");
      const sub = createWebhookSubscription(key.id, "https://example.com/hook", [
        "pipeline.complete",
      ]);
      expect(sub.id).toMatch(/^whsub_/);
      expect(sub.keyId).toBe(key.id);
      expect(sub.url).toBe("https://example.com/hook");
      expect(sub.events).toEqual(["pipeline.complete"]);
      expect(sub.active).toBe(true);
      expect(sub.failureCount).toBe(0);

      const retrieved = getWebhookSubscription(sub.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(sub.id);
    });

    it("lists subscriptions by key ID", () => {
      const key = createApiKey("List Subs");
      createWebhookSubscription(key.id, "https://a.com", ["pipeline.complete"]);
      createWebhookSubscription(key.id, "https://b.com", ["investigation.complete"]);
      const subs = listWebhookSubscriptions(key.id);
      expect(subs).toHaveLength(2);
    });

    it("does not list subscriptions for a different key", () => {
      const key1 = createApiKey("Key1");
      const key2 = createApiKey("Key2");
      createWebhookSubscription(key1.id, "https://a.com", ["pipeline.complete"]);
      expect(listWebhookSubscriptions(key2.id)).toHaveLength(0);
    });

    it("deletes a subscription", () => {
      const key = createApiKey("Delete Sub");
      const sub = createWebhookSubscription(key.id, "https://a.com", ["pipeline.complete"]);
      expect(deleteWebhookSubscription(sub.id)).toBe(true);
      expect(getWebhookSubscription(sub.id)).toBeUndefined();
    });

    it("returns false when deleting nonexistent subscription", () => {
      expect(deleteWebhookSubscription("nonexistent")).toBe(false);
    });

    it("toggles subscription active status", () => {
      const key = createApiKey("Toggle");
      const sub = createWebhookSubscription(key.id, "https://a.com", ["pipeline.complete"]);
      expect(sub.active).toBe(true);
      expect(toggleWebhookSubscription(sub.id)).toBe(true);
      expect(getWebhookSubscription(sub.id)!.active).toBe(false);
      expect(toggleWebhookSubscription(sub.id)).toBe(true);
      expect(getWebhookSubscription(sub.id)!.active).toBe(true);
    });

    it("returns false when toggling nonexistent subscription", () => {
      expect(toggleWebhookSubscription("nonexistent")).toBe(false);
    });
  });

  describe("dispatchWebhookEvent", () => {
    it("auto-disables subscription after 10 consecutive failures", async () => {
      const key = createApiKey("Auto Disable");
      const sub = createWebhookSubscription(key.id, "https://fail.invalid/hook", [
        "pipeline.complete",
      ]);

      // Mock fetch to always fail
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as typeof fetch;

      try {
        for (let i = 0; i < 10; i++) {
          await dispatchWebhookEvent({
            id: `evt-${i}`,
            type: "pipeline.complete",
            payload: {},
            timestamp: new Date().toISOString(),
            keyId: key.id,
          });
        }

        const updated = getWebhookSubscription(sub.id)!;
        expect(updated.active).toBe(false);
        expect(updated.failureCount).toBe(10);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("skips inactive subscriptions", async () => {
      const key = createApiKey("Inactive");
      const sub = createWebhookSubscription(key.id, "https://a.com/hook", ["pipeline.complete"]);
      toggleWebhookSubscription(sub.id); // deactivate

      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      try {
        const result = await dispatchWebhookEvent({
          id: "evt-1",
          type: "pipeline.complete",
          payload: {},
          timestamp: new Date().toISOString(),
          keyId: key.id,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.delivered).toBe(0);
        expect(result.failed).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("dispatches to matching subscriptions and counts results", async () => {
      const key = createApiKey("Dispatch");
      createWebhookSubscription(key.id, "https://a.com/hook", ["pipeline.complete"]);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

      try {
        const result = await dispatchWebhookEvent({
          id: "evt-1",
          type: "pipeline.complete",
          payload: { data: "test" },
          timestamp: new Date().toISOString(),
          keyId: key.id,
        });
        expect(result.delivered).toBe(1);
        expect(result.failed).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ---- API Versioning ----

  describe("API versioning", () => {
    it("returns v1 version info", () => {
      const info = getApiVersionInfo("v1");
      expect(info.version).toBe("1.0.0");
      expect(info.status).toBe("stable");
      expect(info.endpoints.length).toBeGreaterThan(0);
    });

    it("returns v2 version info", () => {
      const info = getApiVersionInfo("v2");
      expect(info.version).toBe("2.0.0");
      expect(info.status).toBe("beta");
    });

    it("lists all API versions", () => {
      const versions = listApiVersions();
      expect(versions.length).toBe(2);
      expect(versions.map((v) => v.apiVersion)).toContain("v1");
      expect(versions.map((v) => v.apiVersion)).toContain("v2");
    });
  });

  // ---- Endpoint Rate Limiting ----

  describe("endpoint rate limiting", () => {
    it("returns configured limits for known endpoints", () => {
      const freeInvestigate = getEndpointRateLimit("/investigate", "free");
      expect(freeInvestigate.limit).toBe(5);
      expect(freeInvestigate.windowMs).toBe(60_000);

      const proInvestigate = getEndpointRateLimit("/investigate", "pro");
      expect(proInvestigate.limit).toBe(30);
    });

    it("returns default limits for unknown endpoints", () => {
      const limits = getEndpointRateLimit("/unknown", "free");
      expect(limits.limit).toBeGreaterThan(0);
      expect(limits.windowMs).toBe(60_000);
    });

    it("checkUsageRateLimit combines key tier with endpoint config", () => {
      const key = createApiKey("Rate Test", "pro");
      const result = checkUsageRateLimit(key.id, "/investigate");
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe("pro");
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it("defaults to free tier for unknown key", () => {
      const result = checkUsageRateLimit("nonexistent", "/investigate");
      expect(result.tier).toBe("free");
    });
  });
});
