import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import * as gateway from "../api-gateway/index.js";
import type {
  ApiKey,
  ApiVersion,
  BillingTier,
  DeveloperPortalInfo,
  RateLimitConfig,
  Tenant,
  UsageRecord,
  UsageSummary,
  WebhookEvent,
  WebhookSubscription,
} from "../api-gateway/index.js";

const FIXED_NOW = "2024-01-02T03:04:05.678Z";
const FIXED_ID_TIME = "lqvrmo8e";
const FIXED_RANDOM_CHARACTER = "i";

describe("api-gateway compatibility characterization", () => {
  beforeEach(() => {
    gateway.clearApiGateway();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    gateway.clearApiGateway();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("preserves the complete runtime and type export surface", () => {
    expect(Object.keys(gateway).sort()).toEqual([
      "API_VERSIONS",
      "ApiKeySchema",
      "ApiVersionSchema",
      "BillingTierSchema",
      "DeveloperPortalInfoSchema",
      "RateLimitConfigSchema",
      "TIER_LIMITS",
      "TenantSchema",
      "UsageRecordSchema",
      "UsageSummarySchema",
      "WebhookEventSchema",
      "WebhookSubscriptionSchema",
      "addTenantApiKey",
      "checkDailyLimit",
      "checkTokenBucket",
      "checkUsageRateLimit",
      "clearApiGateway",
      "createApiKey",
      "createDemoKey",
      "createTenant",
      "createWebhookSubscription",
      "deleteApiKey",
      "deleteWebhookSubscription",
      "dispatchWebhookEvent",
      "findApiKeyByValue",
      "findTenantBySlug",
      "getApiKey",
      "getApiVersionInfo",
      "getDeveloperPortalInfo",
      "getEndpointRateLimit",
      "getOpenApiSpec",
      "getTenant",
      "getUsageSummary",
      "getWebhookSubscription",
      "getWebhooks",
      "listApiKeys",
      "listApiVersions",
      "listTenants",
      "listWebhookSubscriptions",
      "recordUsage",
      "registerWebhook",
      "removeWebhook",
      "revokeApiKey",
      "suspendTenant",
      "toggleWebhookSubscription",
      "updateApiKeyTier",
      "updateTenantTier",
    ]);

    expectTypeOf<BillingTier>().toEqualTypeOf<"free" | "pro" | "enterprise">();
    expectTypeOf<ReturnType<typeof gateway.createApiKey>>().toEqualTypeOf<ApiKey>();
    expectTypeOf<Parameters<typeof gateway.recordUsage>[0]>().toEqualTypeOf<UsageRecord>();
    expectTypeOf<ReturnType<typeof gateway.getUsageSummary>>().toEqualTypeOf<UsageSummary>();
    expectTypeOf<
      Parameters<typeof gateway.dispatchWebhookEvent>[0]
    >().toEqualTypeOf<WebhookEvent>();
    expectTypeOf<
      ReturnType<typeof gateway.createWebhookSubscription>
    >().toEqualTypeOf<WebhookSubscription>();
    expectTypeOf<Parameters<typeof gateway.getApiVersionInfo>[0]>().toEqualTypeOf<ApiVersion>();
    expectTypeOf<Parameters<typeof gateway.getEndpointRateLimit>[1]>().toEqualTypeOf<BillingTier>();
    expectTypeOf<ReturnType<typeof gateway.createTenant>>().toEqualTypeOf<Tenant>();
    expectTypeOf<
      NonNullable<ReturnType<typeof gateway.getDeveloperPortalInfo>>
    >().toEqualTypeOf<DeveloperPortalInfo>();
    expectTypeOf<RateLimitConfig["tier"]>().toEqualTypeOf<BillingTier>();
  });

  it("keeps every schema and static configuration export unchanged", () => {
    const key = gateway.createApiKey("Schema Key", "pro");
    const tenant = gateway.createTenant("Schema Tenant", "owner@example.com", "pro");
    const portal = gateway.getDeveloperPortalInfo(tenant.id);
    const subscription = gateway.createWebhookSubscription(key.id, "https://example.com/hook", [
      "pipeline.complete",
    ]);
    const usageRecord = {
      keyId: key.id,
      endpoint: "/api/v1/investigate",
      timestamp: FIXED_NOW,
      durationMs: 42,
      tokensUsed: 10,
      statusCode: 200,
    };
    const event = {
      id: "evt-1",
      type: "pipeline.complete" as const,
      payload: { ok: true },
      timestamp: FIXED_NOW,
      keyId: key.id,
    };

    expect(gateway.BillingTierSchema.parse("enterprise")).toBe("enterprise");
    expect(gateway.ApiKeySchema.parse(key)).toEqual(key);
    expect(gateway.UsageRecordSchema.parse(usageRecord)).toEqual(usageRecord);
    expect(gateway.UsageSummarySchema.parse(gateway.getUsageSummary(key.id))).toEqual(
      gateway.getUsageSummary(key.id)
    );
    expect(gateway.WebhookEventSchema.parse(event)).toEqual(event);
    expect(gateway.WebhookSubscriptionSchema.parse(subscription)).toEqual(subscription);
    expect(gateway.ApiVersionSchema.parse("v2")).toBe("v2");
    expect(
      gateway.RateLimitConfigSchema.parse({
        tier: "pro",
        endpoint: "/investigate",
        limit: 30,
        windowMs: 60_000,
      })
    ).toEqual({
      tier: "pro",
      endpoint: "/investigate",
      limit: 30,
      windowMs: 60_000,
    });
    expect(gateway.TenantSchema.parse(tenant)).toEqual(tenant);
    expect(gateway.DeveloperPortalInfoSchema.parse(portal)).toEqual(portal);

    expect(gateway.TIER_LIMITS).toEqual({
      free: { dailyLimit: 10, minuteLimit: 5 },
      pro: { dailyLimit: 1000, minuteLimit: 60 },
      enterprise: { dailyLimit: Infinity, minuteLimit: 300 },
    });
    expect(gateway.API_VERSIONS).toEqual({
      v1: {
        version: "1.0.0",
        status: "stable",
        endpoints: [
          "/api/v1/investigate",
          "/api/v1/innovate",
          "/api/v1/auto",
          "/api/v1/keys",
          "/api/v1/openapi",
          "/api/v1/plugins",
        ],
      },
      v2: {
        version: "2.0.0",
        status: "beta",
        endpoints: [
          "/api/v2/investigate",
          "/api/v2/innovate",
          "/api/v2/auto",
          "/api/v2/experiments",
          "/api/v2/scoring",
          "/api/v2/webhooks",
          "/api/v2/replay",
        ],
      },
    });
  });

  it("pins API key IDs, values, timestamps, store identity, and lifecycle mutation", () => {
    const key = gateway.createApiKey("Pinned Key", "pro");

    expect(key).toEqual({
      id: `key_${FIXED_ID_TIME}_${FIXED_RANDOM_CHARACTER}`,
      key: `inv_pro_${FIXED_RANDOM_CHARACTER.repeat(32)}`,
      name: "Pinned Key",
      tier: "pro",
      createdAt: FIXED_NOW,
      enabled: true,
      rateLimit: { dailyLimit: 1000, minuteLimit: 60 },
    });
    expect(key.rateLimit).not.toBe(gateway.TIER_LIMITS.pro);
    expect(gateway.getApiKey(key.id)).toBe(key);
    expect(gateway.findApiKeyByValue(key.key)).toBe(key);
    expect(gateway.listApiKeys()).toEqual([key]);
    expect(gateway.listApiKeys()).not.toBe(gateway.listApiKeys());
    expect(gateway.listApiKeys()[0]).toBe(key);

    expect(gateway.revokeApiKey(key.id)).toBe(true);
    expect(key.enabled).toBe(false);
    expect(gateway.updateApiKeyTier(key.id, "enterprise")).toBe(true);
    expect(key.tier).toBe("enterprise");
    expect(key.rateLimit).toBe(gateway.TIER_LIMITS.enterprise);
    expect(gateway.revokeApiKey("missing")).toBe(false);
    expect(gateway.updateApiKeyTier("missing", "pro")).toBe(false);

    expect(gateway.deleteApiKey(key.id)).toBe(true);
    expect(gateway.deleteApiKey(key.id)).toBe(false);
    expect(gateway.getApiKey(key.id)).toBeUndefined();
    expect(gateway.findApiKeyByValue(key.key)).toBeUndefined();
  });

  it("keeps timestamp/random collisions as last-write-wins in the singleton key store", () => {
    const first = gateway.createApiKey("First");
    const second = gateway.createApiKey("Second");

    expect(first.id).toBe(second.id);
    expect(first.key).toBe(second.key);
    expect(first).not.toBe(second);
    expect(gateway.getApiKey(first.id)).toBe(second);
    expect(gateway.listApiKeys()).toEqual([second]);
  });

  it("preserves usage filtering, aggregation, rounding, and last-used mutation", () => {
    const key = gateway.createApiKey("Usage", "pro");
    const records: UsageRecord[] = [
      {
        keyId: key.id,
        endpoint: "/outside",
        timestamp: "2023-12-31T03:04:05.677Z",
        durationMs: 999,
        tokensUsed: 999,
        statusCode: 500,
      },
      {
        keyId: key.id,
        endpoint: "/a",
        timestamp: "2023-12-31T03:04:05.678Z",
        durationMs: 100,
        tokensUsed: 10,
        statusCode: 200,
      },
      {
        keyId: key.id,
        endpoint: "/b",
        timestamp: "2024-01-01T12:00:00.000Z",
        durationMs: 201,
        statusCode: 500,
      },
      {
        keyId: key.id,
        endpoint: "/a",
        timestamp: "2024-01-02T02:00:00.000Z",
        durationMs: 151,
        tokensUsed: 20,
        statusCode: 399,
      },
    ];

    records.forEach(gateway.recordUsage);

    expect(key.lastUsedAt).toBe("2024-01-02T02:00:00.000Z");
    expect(gateway.getUsageSummary(key.id, 2)).toEqual({
      keyId: key.id,
      tier: "pro",
      period: "2 days",
      totalCalls: 3,
      totalTokens: 30,
      averageLatencyMs: 151,
      errorRate: 1 / 3,
      endpointBreakdown: { "/a": 2, "/b": 1 },
      dailyUsage: [
        { date: "2023-12-31", calls: 1 },
        { date: "2024-01-01", calls: 1 },
        { date: "2024-01-02", calls: 1 },
      ],
    });
    expect(gateway.getUsageSummary("missing")).toEqual({
      keyId: "missing",
      tier: "free",
      period: "30 days",
      totalCalls: 0,
      totalTokens: 0,
      averageLatencyMs: 0,
      errorRate: 0,
      endpointBreakdown: {},
      dailyUsage: [],
    });
  });

  it("preserves daily-limit and token-bucket boundary state", () => {
    const key = gateway.createApiKey("Daily", "free");
    for (let index = 0; index < 10; index++) {
      gateway.recordUsage({
        keyId: key.id,
        endpoint: "/test",
        timestamp: FIXED_NOW,
        durationMs: 1,
        statusCode: 200,
      });
    }

    expect(gateway.checkDailyLimit(key.id)).toEqual({ allowed: false, used: 10, limit: 10 });
    gateway.revokeApiKey(key.id);
    expect(gateway.checkDailyLimit(key.id)).toEqual({ allowed: false, used: 0, limit: 0 });
    expect(gateway.checkDailyLimit("missing")).toEqual({ allowed: false, used: 0, limit: 0 });

    const config = { limit: 2, windowMs: 1000 };
    expect(gateway.checkTokenBucket("bucket", config)).toEqual({
      allowed: true,
      remaining: 1,
      resetMs: 0,
    });
    expect(gateway.checkTokenBucket("bucket", config)).toEqual({
      allowed: true,
      remaining: 0,
      resetMs: 0,
    });
    expect(gateway.checkTokenBucket("bucket", config)).toEqual({
      allowed: false,
      remaining: 0,
      resetMs: 500,
    });
    vi.advanceTimersByTime(250);
    expect(gateway.checkTokenBucket("bucket", config)).toEqual({
      allowed: false,
      remaining: 0,
      resetMs: 250,
    });
    vi.advanceTimersByTime(250);
    expect(gateway.checkTokenBucket("bucket", config)).toEqual({
      allowed: true,
      remaining: 0,
      resetMs: 0,
    });
  });

  it("preserves endpoint and usage rate-limit configuration and bucket keys", () => {
    const key = gateway.createApiKey("Rate", "pro");

    expect(gateway.getEndpointRateLimit("/investigate", "free")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(gateway.getEndpointRateLimit("/auto", "enterprise")).toEqual({
      limit: 60,
      windowMs: 60_000,
    });
    expect(gateway.getEndpointRateLimit("/unknown", "enterprise")).toEqual({
      limit: 300,
      windowMs: 60_000,
    });
    expect(gateway.checkUsageRateLimit(key.id, "/investigate")).toEqual({
      allowed: true,
      remaining: 29,
      resetMs: 0,
      tier: "pro",
    });
    expect(gateway.checkUsageRateLimit(key.id, "/auto")).toEqual({
      allowed: true,
      remaining: 9,
      resetMs: 0,
      tier: "pro",
    });
    expect(gateway.checkUsageRateLimit("missing", "/investigate")).toEqual({
      allowed: true,
      remaining: 4,
      resetMs: 0,
      tier: "free",
    });
  });

  it("preserves webhook URL registry reference and removal behavior", () => {
    gateway.registerWebhook("key-1", "https://example.com/a");
    gateway.registerWebhook("key-1", "https://example.com/a");
    gateway.registerWebhook("key-1", "https://example.com/b");

    const urls = gateway.getWebhooks("key-1");
    expect(urls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(gateway.getWebhooks("key-1")).toBe(urls);
    urls.push("https://example.com/c");
    expect(gateway.getWebhooks("key-1")).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);

    const missing = gateway.getWebhooks("missing");
    missing.push("local-only");
    expect(gateway.getWebhooks("missing")).toEqual([]);
    expect(gateway.removeWebhook("key-1", "https://example.com/b")).toBe(true);
    expect(gateway.removeWebhook("key-1", "https://example.com/b")).toBe(false);
    expect(gateway.removeWebhook("missing", "https://example.com/a")).toBe(false);
    expect(urls).toEqual(["https://example.com/a", "https://example.com/c"]);
  });

  it("pins webhook subscription IDs, secrets, object identity, and delivery state", async () => {
    const events: WebhookSubscription["events"] = ["pipeline.complete"];
    const subscription = gateway.createWebhookSubscription(
      "key-1",
      "https://example.com/hook",
      events
    );

    expect(subscription).toEqual({
      id: `whsub_${FIXED_ID_TIME}_${FIXED_RANDOM_CHARACTER}`,
      keyId: "key-1",
      url: "https://example.com/hook",
      events,
      secret: `whsec_${FIXED_RANDOM_CHARACTER.repeat(32)}`,
      active: true,
      createdAt: FIXED_NOW,
      failureCount: 0,
    });
    expect(subscription.events).toBe(events);
    expect(gateway.getWebhookSubscription(subscription.id)).toBe(subscription);
    expect(gateway.listWebhookSubscriptions("key-1")).toEqual([subscription]);
    expect(gateway.listWebhookSubscriptions("key-1")[0]).toBe(subscription);
    expect(gateway.listWebhookSubscriptions("key-1")).not.toBe(
      gateway.listWebhookSubscriptions("key-1")
    );

    const event: WebhookEvent = {
      id: "evt-1",
      type: "pipeline.complete",
      payload: { result: "ok" },
      timestamp: FIXED_NOW,
      keyId: "key-1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(gateway.dispatchWebhookEvent(event)).resolves.toEqual({
      delivered: 0,
      failed: 1,
    });
    expect(subscription.failureCount).toBe(1);
    expect(subscription.lastDeliveredAt).toBeUndefined();

    vi.advanceTimersByTime(1000);
    await expect(gateway.dispatchWebhookEvent(event)).resolves.toEqual({
      delivered: 1,
      failed: 0,
    });
    expect(subscription.failureCount).toBe(0);
    expect(subscription.lastDeliveredAt).toBe("2024-01-02T03:04:06.678Z");
    expect(fetchMock).toHaveBeenLastCalledWith("https://example.com/hook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": subscription.secret,
        "X-Webhook-Event": "pipeline.complete",
        "X-Webhook-Id": "evt-1",
      },
      body: JSON.stringify(event),
      signal: expect.any(AbortSignal),
    });

    expect(gateway.toggleWebhookSubscription(subscription.id)).toBe(true);
    expect(subscription.active).toBe(false);
    expect(gateway.toggleWebhookSubscription("missing")).toBe(false);
    expect(gateway.deleteWebhookSubscription(subscription.id)).toBe(true);
    expect(gateway.deleteWebhookSubscription(subscription.id)).toBe(false);
    expect(gateway.getWebhookSubscription(subscription.id)).toBeUndefined();
  });

  it("pins the complete OpenAPI object while retaining fresh-object semantics", () => {
    const first = gateway.getOpenApiSpec();
    const second = gateway.getOpenApiSpec();
    const digest = createHash("sha256").update(JSON.stringify(first)).digest("hex");

    expect(digest).toBe("78c05ad1798c192709ee76926ae31ccc1a4b3af7390b0eacf6d5b5a94b515652");
    expect(first).toEqual(second);
    expect(first).not.toBe(second);

    (first.info as Record<string, unknown>).title = "mutated locally";
    expect((gateway.getOpenApiSpec().info as Record<string, unknown>).title).toBe("Innovator API");
  });

  it("preserves API version object identity and shallow list projection", () => {
    expect(gateway.getApiVersionInfo("v1")).toBe(gateway.API_VERSIONS.v1);
    expect(gateway.getApiVersionInfo("v2")).toBe(gateway.API_VERSIONS.v2);

    const versions = gateway.listApiVersions();
    expect(versions).toEqual([
      { apiVersion: "v1", ...gateway.API_VERSIONS.v1 },
      { apiVersion: "v2", ...gateway.API_VERSIONS.v2 },
    ]);
    expect(versions[0]).not.toBe(gateway.API_VERSIONS.v1);
    expect(versions[0].endpoints).toBe(gateway.API_VERSIONS.v1.endpoints);
  });

  it("pins tenant creation, lifecycle mutation, and singleton identity", () => {
    const tenant = gateway.createTenant(" Acme & Sons! ", "owner@example.com", "pro");
    const initialKey = gateway.getApiKey(tenant.apiKeys[0]);

    expect(tenant).toEqual({
      id: `tenant_${FIXED_ID_TIME}_${FIXED_RANDOM_CHARACTER}`,
      name: " Acme & Sons! ",
      slug: "-acme-sons-",
      tier: "pro",
      ownerId: "owner@example.com",
      ownerEmail: "owner@example.com",
      apiKeys: [`key_${FIXED_ID_TIME}_${FIXED_RANDOM_CHARACTER}`],
      createdAt: FIXED_NOW,
      status: "active",
      settings: {
        maxKeys: 10,
        webhooksEnabled: true,
      },
      usage: {
        currentPeriodCalls: 0,
        currentPeriodTokens: 0,
        periodStart: FIXED_NOW,
      },
    });
    expect(initialKey?.name).toBe(" Acme & Sons!  Default Key");
    expect(gateway.getTenant(tenant.id)).toBe(tenant);
    expect(gateway.findTenantBySlug(tenant.slug)).toBe(tenant);
    expect(gateway.listTenants()).toEqual([tenant]);
    expect(gateway.listTenants()[0]).toBe(tenant);
    expect(gateway.listTenants()).not.toBe(gateway.listTenants());

    vi.advanceTimersByTime(1);
    const extraKey = gateway.addTenantApiKey(tenant.id, "Extra");
    expect(extraKey?.id).toBe("key_lqvrmo8f_i");
    expect(extraKey?.tier).toBe("pro");
    expect(tenant.apiKeys).toEqual([initialKey?.id, extraKey?.id]);

    expect(gateway.updateTenantTier(tenant.id, "enterprise")).toBe(true);
    expect(tenant.tier).toBe("enterprise");
    expect(tenant.settings).toEqual({ maxKeys: 50, webhooksEnabled: true });
    expect(initialKey?.tier).toBe("enterprise");
    expect(extraKey?.tier).toBe("enterprise");
    expect(initialKey?.rateLimit).toBe(gateway.TIER_LIMITS.enterprise);

    expect(gateway.suspendTenant(tenant.id)).toBe(true);
    expect(tenant.status).toBe("suspended");
    expect(initialKey?.enabled).toBe(false);
    expect(extraKey?.enabled).toBe(false);
    expect(gateway.addTenantApiKey(tenant.id, "Rejected")).toBeNull();
    expect(gateway.updateTenantTier("missing", "pro")).toBe(false);
    expect(gateway.suspendTenant("missing")).toBe(false);
    expect(gateway.addTenantApiKey("missing", "Rejected")).toBeNull();
    expect(gateway.getTenant("missing")).toBeUndefined();
    expect(gateway.findTenantBySlug("missing")).toBeUndefined();
  });

  it("preserves the developer portal projection and its shared nested references", () => {
    const tenant = gateway.createTenant("Portal", "portal@example.com", "pro");
    const key = gateway.getApiKey(tenant.apiKeys[0])!;
    gateway.registerWebhook(key.id, "https://example.com/portal");

    const portal = gateway.getDeveloperPortalInfo(tenant.id);
    expect(portal).toEqual({
      tenantId: tenant.id,
      tenantName: "Portal",
      tier: "pro",
      apiKeys: [key],
      usage: {
        currentPeriodCalls: 0,
        currentPeriodTokens: 0,
        dailyLimit: 1000,
        minuteLimit: 60,
      },
      endpoints: [
        {
          method: "POST",
          path: "/api/v1/investigate",
          description: "Investigate a subject for innovation opportunities",
        },
        {
          method: "POST",
          path: "/api/v1/innovate",
          description: "Generate innovation ideas using creativity angles",
        },
        {
          method: "POST",
          path: "/api/v1/auto",
          description: "Run the full innovation pipeline (SSE streaming)",
        },
        {
          method: "POST",
          path: "/api/v1/validate",
          description: "Validate ideas against market and feasibility data",
        },
        {
          method: "POST",
          path: "/api/v1/artifacts",
          description: "Generate structured artifacts (PRD, tech spec, etc.)",
        },
        {
          method: "POST",
          path: "/api/v1/pipeline",
          description: "Run a natural language pipeline (SSE streaming)",
        },
        {
          method: "GET",
          path: "/api/v1/health",
          description: "Check API health and status",
        },
      ],
      webhooks: ["https://example.com/portal"],
    });
    expect(portal?.apiKeys[0]).toBe(key);
    expect(portal?.webhooks).toBe(gateway.getWebhooks(key.id));
    expect(gateway.getDeveloperPortalInfo("missing")).toBeNull();

    const freeTenant = gateway.createTenant("Free Portal", "free@example.com");
    gateway.registerWebhook(freeTenant.apiKeys[0], "https://example.com/hidden");
    expect(gateway.getDeveloperPortalInfo(freeTenant.id)?.webhooks).toEqual([]);
  });

  it("pins demo-key formatting, expiry, limits, metadata, and store identity", () => {
    const demo = gateway.createDemoKey();

    expect(demo).toEqual({
      id: `key_${FIXED_ID_TIME}_${FIXED_RANDOM_CHARACTER}`,
      key: `inv_free_${FIXED_RANDOM_CHARACTER.repeat(32)}`,
      name: "Live Demo",
      tier: "free",
      createdAt: FIXED_NOW,
      enabled: true,
      rateLimit: { dailyLimit: 5, minuteLimit: 2 },
      metadata: {
        demo: "true",
        expiresAt: "2024-01-02T04:04:05.678Z",
      },
    });
    expect(gateway.getApiKey(demo.id)).toBe(demo);
  });

  it("clears every shared gateway store while leaving detached returned objects intact", () => {
    const key = gateway.createApiKey("Clear");
    gateway.recordUsage({
      keyId: key.id,
      endpoint: "/test",
      timestamp: FIXED_NOW,
      durationMs: 1,
      statusCode: 200,
    });
    gateway.registerWebhook(key.id, "https://example.com/hook");
    const urls = gateway.getWebhooks(key.id);
    const subscription = gateway.createWebhookSubscription(
      key.id,
      "https://example.com/subscription",
      ["pipeline.complete"]
    );
    const tenant = gateway.createTenant("Clear Tenant", "clear@example.com");
    const config = { limit: 1, windowMs: 60_000 };
    gateway.checkTokenBucket("clear-bucket", config);
    expect(gateway.checkTokenBucket("clear-bucket", config).allowed).toBe(false);

    gateway.clearApiGateway();

    expect(gateway.listApiKeys()).toEqual([]);
    expect(gateway.getUsageSummary(key.id).totalCalls).toBe(0);
    expect(gateway.getWebhooks(key.id)).toEqual([]);
    expect(gateway.getWebhookSubscription(subscription.id)).toBeUndefined();
    expect(gateway.listWebhookSubscriptions(key.id)).toEqual([]);
    expect(gateway.listTenants()).toEqual([]);
    expect(gateway.getTenant(tenant.id)).toBeUndefined();
    expect(gateway.checkTokenBucket("clear-bucket", config)).toEqual({
      allowed: true,
      remaining: 0,
      resetMs: 0,
    });

    expect(key.enabled).toBe(true);
    expect(urls).toEqual(["https://example.com/hook"]);
    expect(subscription.active).toBe(true);
    expect(tenant.status).toBe("active");
  });
});
