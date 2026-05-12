import { describe, it, expect, beforeEach } from "vitest";
import {
  createTenant,
  getTenant,
  getTenantBySlug,
  updateTenantPlan,
  suspendTenant,
  getUsage,
  incrementUsage,
  checkLimit,
  createApiKey,
  validateApiKey,
  revokeApiKey,
  listTenantApiKeys,
  clearSaasData,
  getPlan,
  listPlans,
  PLANS,
} from "../index.js";

describe("saas", () => {
  beforeEach(() => {
    clearSaasData();
  });

  // ---- Tenant Management ----

  describe("createTenant", () => {
    it("creates a tenant with valid input", () => {
      const tenant = createTenant({
        name: "Acme Corp",
        slug: "acme-corp",
        ownerId: "user-1",
      });
      expect(tenant).toMatchObject({
        name: "Acme Corp",
        slug: "acme-corp",
        ownerId: "user-1",
        planId: "free",
        status: "active",
      });
      expect(tenant.id).toBeTruthy();
      expect(tenant.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(tenant.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("defaults planId to free when not specified", () => {
      const tenant = createTenant({
        name: "Test",
        slug: "test",
        ownerId: "user-1",
      });
      expect(tenant.planId).toBe("free");
    });

    it("rejects duplicate slug", () => {
      createTenant({ name: "A", slug: "dup-slug", ownerId: "u1" });
      expect(() => createTenant({ name: "B", slug: "dup-slug", ownerId: "u2" })).toThrow(
        'Tenant slug "dup-slug" already exists'
      );
    });

    it("sets trialEndsAt for pro plan", () => {
      const tenant = createTenant({
        name: "Pro Co",
        slug: "pro-co",
        ownerId: "u1",
        planId: "pro",
      });
      expect(tenant.trialEndsAt).toBeDefined();
      const trialEnd = new Date(tenant.trialEndsAt!);
      const now = new Date();
      // Trial should be roughly 14 days out
      const diffDays = (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(13);
      expect(diffDays).toBeLessThanOrEqual(14.1);
    });

    it("sets trialEndsAt for team plan", () => {
      const tenant = createTenant({
        name: "Team Co",
        slug: "team-co",
        ownerId: "u1",
        planId: "team",
      });
      expect(tenant.trialEndsAt).toBeDefined();
    });

    it("does not set trialEndsAt for free plan", () => {
      const tenant = createTenant({
        name: "Free Co",
        slug: "free-co",
        ownerId: "u1",
      });
      expect(tenant.trialEndsAt).toBeUndefined();
    });

    it("does not set trialEndsAt for enterprise plan", () => {
      const tenant = createTenant({
        name: "Ent Co",
        slug: "ent-co",
        ownerId: "u1",
        planId: "enterprise",
      });
      expect(tenant.trialEndsAt).toBeUndefined();
    });

    it("stores billingEmail when provided", () => {
      const tenant = createTenant({
        name: "Billed",
        slug: "billed",
        ownerId: "u1",
        billingEmail: "billing@test.com",
      });
      expect(tenant.billingEmail).toBe("billing@test.com");
    });

    it("can be retrieved by ID after creation", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      expect(getTenant(tenant.id)).toEqual(tenant);
    });

    it("can be retrieved by slug after creation", () => {
      const tenant = createTenant({ name: "A", slug: "slug-a", ownerId: "u1" });
      expect(getTenantBySlug("slug-a")).toEqual(tenant);
    });

    it("initializes usage on creation", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const usage = getUsage(tenant.id);
      expect(usage).toMatchObject({
        tenantId: tenant.id,
        sessionsUsed: 0,
        anglesGenerated: 0,
        apiRequests: 0,
        storageUsedBytes: 0,
        llmTokensUsed: 0,
      });
    });
  });

  describe("getTenant / getTenantBySlug", () => {
    it("returns undefined for non-existent ID", () => {
      expect(getTenant("nonexistent")).toBeUndefined();
    });

    it("returns undefined for non-existent slug", () => {
      expect(getTenantBySlug("nonexistent")).toBeUndefined();
    });
  });

  describe("updateTenantPlan", () => {
    it("updates plan for existing tenant", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const updated = updateTenantPlan(tenant.id, "pro");
      expect(updated?.planId).toBe("pro");
    });

    it("updates updatedAt timestamp", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const originalUpdatedAt = tenant.updatedAt;
      // Small delay to ensure different timestamp
      const updated = updateTenantPlan(tenant.id, "team");
      expect(updated?.updatedAt).toBeDefined();
    });

    it("returns undefined for non-existent tenant", () => {
      expect(updateTenantPlan("nonexistent", "pro")).toBeUndefined();
    });

    it("supports all plan transitions", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      expect(updateTenantPlan(tenant.id, "pro")?.planId).toBe("pro");
      expect(updateTenantPlan(tenant.id, "team")?.planId).toBe("team");
      expect(updateTenantPlan(tenant.id, "enterprise")?.planId).toBe("enterprise");
      expect(updateTenantPlan(tenant.id, "free")?.planId).toBe("free");
    });
  });

  describe("suspendTenant", () => {
    it("suspends an existing tenant", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      expect(suspendTenant(tenant.id)).toBe(true);
      expect(getTenant(tenant.id)?.status).toBe("suspended");
    });

    it("returns false for non-existent tenant", () => {
      expect(suspendTenant("nonexistent")).toBe(false);
    });

    it("updates updatedAt on suspension", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const before = tenant.updatedAt;
      suspendTenant(tenant.id);
      const after = getTenant(tenant.id)?.updatedAt;
      expect(after).toBeDefined();
    });
  });

  // ---- Usage Metering ----

  describe("incrementUsage", () => {
    it("increments sessionsUsed", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const result = incrementUsage(tenant.id, "sessionsUsed");
      expect(result.sessionsUsed).toBe(1);
    });

    it("increments anglesGenerated", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const result = incrementUsage(tenant.id, "anglesGenerated", 3);
      expect(result.anglesGenerated).toBe(3);
    });

    it("increments apiRequests", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      incrementUsage(tenant.id, "apiRequests", 5);
      const result = incrementUsage(tenant.id, "apiRequests", 3);
      expect(result.apiRequests).toBe(8);
    });

    it("increments llmTokensUsed", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const result = incrementUsage(tenant.id, "llmTokensUsed", 1000);
      expect(result.llmTokensUsed).toBe(1000);
    });

    it("accumulates across multiple increments", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      incrementUsage(tenant.id, "sessionsUsed");
      incrementUsage(tenant.id, "sessionsUsed");
      incrementUsage(tenant.id, "sessionsUsed");
      const usage = getUsage(tenant.id);
      expect(usage.sessionsUsed).toBe(3);
    });

    it("updates lastUpdated", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const result = incrementUsage(tenant.id, "sessionsUsed");
      expect(result.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ---- Limit Checking ----

  describe("checkLimit", () => {
    it("allows usage under limit for free plan", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(0);
      expect(result.limit).toBe(PLANS.free.limits.sessionsPerMonth);
    });

    it("disallows usage when limit reached", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      // Free plan has 5 sessions/month
      for (let i = 0; i < 5; i++) {
        incrementUsage(tenant.id, "sessionsUsed");
      }
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(5);
      expect(result.upgradeRequired).toBe("pro");
    });

    it("checks apiRequestsPerDay limit", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      // Free plan has 10 api requests/day
      for (let i = 0; i < 10; i++) {
        incrementUsage(tenant.id, "apiRequests");
      }
      const result = checkLimit(tenant.id, "apiRequestsPerDay");
      expect(result.allowed).toBe(false);
      expect(result.upgradeRequired).toBe("pro");
    });

    it("returns unlimited (-1) for enterprise plan", () => {
      const tenant = createTenant({
        name: "E",
        slug: "e",
        ownerId: "u1",
        planId: "enterprise",
      });
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });

    it("returns not allowed for non-existent tenant", () => {
      const result = checkLimit("nonexistent", "sessionsPerMonth");
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });

    it("suggests correct upgrade path: free→pro", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      for (let i = 0; i < 5; i++) incrementUsage(tenant.id, "sessionsUsed");
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.upgradeRequired).toBe("pro");
    });

    it("suggests correct upgrade path: pro→team", () => {
      const tenant = createTenant({
        name: "P",
        slug: "p",
        ownerId: "u1",
        planId: "pro",
      });
      for (let i = 0; i < 100; i++) incrementUsage(tenant.id, "sessionsUsed");
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.upgradeRequired).toBe("team");
    });

    it("suggests correct upgrade path: team→enterprise", () => {
      const tenant = createTenant({
        name: "T",
        slug: "t",
        ownerId: "u1",
        planId: "team",
      });
      for (let i = 0; i < 500; i++) incrementUsage(tenant.id, "sessionsUsed");
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.upgradeRequired).toBe("enterprise");
    });

    it("no upgrade suggestion for enterprise", () => {
      const tenant = createTenant({
        name: "E",
        slug: "e",
        ownerId: "u1",
        planId: "enterprise",
      });
      // Enterprise has unlimited, so will never hit the limit
      const result = checkLimit(tenant.id, "sessionsPerMonth");
      expect(result.upgradeRequired).toBeUndefined();
    });
  });

  // ---- API Key Management ----

  describe("createApiKey", () => {
    it("creates key with inv_ prefix", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey, rawKey } = createApiKey(tenant.id, "test-key");
      expect(rawKey).toMatch(/^inv_/);
      expect(apiKey.prefix).toBe(rawKey.slice(0, 8));
    });

    it("hashes the raw key", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey, rawKey } = createApiKey(tenant.id, "test-key");
      expect(apiKey.hashedKey).not.toBe(rawKey);
      expect(apiKey.hashedKey).toMatch(/^hash_/);
    });

    it("assigns default scopes", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey } = createApiKey(tenant.id, "test-key");
      expect(apiKey.scopes).toEqual(["read", "write"]);
    });

    it("assigns custom scopes", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey } = createApiKey(tenant.id, "test-key", ["read"]);
      expect(apiKey.scopes).toEqual(["read"]);
    });

    it("sets createdAt timestamp", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey } = createApiKey(tenant.id, "test-key");
      expect(apiKey.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("assigns unique IDs to each key", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey: k1 } = createApiKey(tenant.id, "key-1");
      const { apiKey: k2 } = createApiKey(tenant.id, "key-2");
      expect(k1.id).not.toBe(k2.id);
    });
  });

  describe("validateApiKey", () => {
    it("validates an active key", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { rawKey } = createApiKey(tenant.id, "test-key");
      const validated = validateApiKey(rawKey);
      expect(validated).toBeDefined();
      expect(validated?.tenantId).toBe(tenant.id);
    });

    it("returns undefined for invalid key", () => {
      expect(validateApiKey("inv_invalid_key_123")).toBeUndefined();
    });

    it("returns undefined for revoked key", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey, rawKey } = createApiKey(tenant.id, "test-key");
      revokeApiKey(apiKey.id);
      expect(validateApiKey(rawKey)).toBeUndefined();
    });
  });

  describe("revokeApiKey", () => {
    it("revokes an existing key", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey } = createApiKey(tenant.id, "test-key");
      expect(revokeApiKey(apiKey.id)).toBe(true);
    });

    it("returns false for non-existent key", () => {
      expect(revokeApiKey("nonexistent")).toBe(false);
    });
  });

  describe("listTenantApiKeys", () => {
    it("lists active keys for a tenant", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      createApiKey(tenant.id, "key-1");
      createApiKey(tenant.id, "key-2");
      const keys = listTenantApiKeys(tenant.id);
      expect(keys).toHaveLength(2);
    });

    it("excludes revoked keys", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const { apiKey: k1 } = createApiKey(tenant.id, "key-1");
      createApiKey(tenant.id, "key-2");
      revokeApiKey(k1.id);
      const keys = listTenantApiKeys(tenant.id);
      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe("key-2");
    });

    it("returns empty for tenant with no keys", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      expect(listTenantApiKeys(tenant.id)).toEqual([]);
    });

    it("does not return keys from other tenants", () => {
      const t1 = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      const t2 = createTenant({ name: "B", slug: "b", ownerId: "u2" });
      createApiKey(t1.id, "key-t1");
      createApiKey(t2.id, "key-t2");
      const keys = listTenantApiKeys(t1.id);
      expect(keys).toHaveLength(1);
      expect(keys[0].tenantId).toBe(t1.id);
    });
  });

  // ---- Cleanup ----

  describe("clearSaasData", () => {
    it("clears all tenants, usage, and api keys", () => {
      const tenant = createTenant({ name: "A", slug: "a", ownerId: "u1" });
      incrementUsage(tenant.id, "sessionsUsed");
      createApiKey(tenant.id, "key");
      clearSaasData();
      expect(getTenant(tenant.id)).toBeUndefined();
      expect(listTenantApiKeys(tenant.id)).toEqual([]);
    });
  });

  // ---- Plan Helpers ----

  describe("getPlan / listPlans", () => {
    it("returns plan definition by id", () => {
      const plan = getPlan("free");
      expect(plan.id).toBe("free");
      expect(plan.name).toBe("Free");
      expect(plan.priceMonthly).toBe(0);
    });

    it("lists all 4 plans", () => {
      const plans = listPlans();
      expect(plans).toHaveLength(4);
      const ids = plans.map((p) => p.id);
      expect(ids).toContain("free");
      expect(ids).toContain("pro");
      expect(ids).toContain("team");
      expect(ids).toContain("enterprise");
    });
  });

  // ---- Edge Cases ----

  describe("concurrent tenant creation", () => {
    it("allows multiple tenants with different slugs", () => {
      const tenants = Array.from({ length: 10 }, (_, i) =>
        createTenant({ name: `T${i}`, slug: `tenant-${i}`, ownerId: `u${i}` })
      );
      expect(tenants).toHaveLength(10);
      const slugs = new Set(tenants.map((t) => t.slug));
      expect(slugs.size).toBe(10);
    });
  });
});
