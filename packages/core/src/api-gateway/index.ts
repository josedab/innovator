/**
 * @module api-gateway
 *
 * API Gateway management: usage tracking, billing tiers, API key management,
 * rate limiting configuration, and webhook notifications.
 */

import { z } from "zod";

// ---- Schemas ----

export const BillingTierSchema = z.enum(["free", "pro", "enterprise"]);

export const ApiKeySchema = z.object({
  id: z.string().max(100),
  key: z.string().max(200),
  name: z.string().max(200),
  tier: BillingTierSchema,
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
  enabled: z.boolean(),
  rateLimit: z.object({
    dailyLimit: z.number(),
    minuteLimit: z.number(),
  }),
  metadata: z.record(z.string()).optional(),
});

export const UsageRecordSchema = z.object({
  keyId: z.string().max(100),
  endpoint: z.string().max(200),
  timestamp: z.string(),
  durationMs: z.number(),
  tokensUsed: z.number().optional(),
  statusCode: z.number(),
  error: z.string().optional(),
});

export const UsageSummarySchema = z.object({
  keyId: z.string().max(100),
  tier: BillingTierSchema,
  period: z.string(),
  totalCalls: z.number(),
  totalTokens: z.number(),
  averageLatencyMs: z.number(),
  errorRate: z.number().min(0).max(1),
  endpointBreakdown: z.record(z.number()),
  dailyUsage: z.array(
    z.object({
      date: z.string(),
      calls: z.number(),
    })
  ),
});

export const WebhookEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "pipeline.complete",
    "investigation.complete",
    "usage.limit.warning",
    "usage.limit.reached",
  ]),
  payload: z.record(z.unknown()),
  timestamp: z.string(),
  keyId: z.string(),
});

export type BillingTier = z.infer<typeof BillingTierSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ---- Tier Configuration ----

export const TIER_LIMITS: Record<BillingTier, { dailyLimit: number; minuteLimit: number }> = {
  free: { dailyLimit: 10, minuteLimit: 5 },
  pro: { dailyLimit: 1000, minuteLimit: 60 },
  enterprise: { dailyLimit: Infinity, minuteLimit: 300 },
};

// ---- In-Memory Stores ----

const apiKeys = new Map<string, ApiKey>();
const usageRecords: UsageRecord[] = [];
const webhookUrls = new Map<string, string[]>();

// ---- API Key Management ----

/**
 * Generate a new API key for a given tier.
 */
export function createApiKey(name: string, tier: BillingTier = "free"): ApiKey {
  const id = `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `inv_${tier}_${Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join("")}`;
  const limits = TIER_LIMITS[tier];

  const apiKey: ApiKey = {
    id,
    key,
    name,
    tier,
    createdAt: new Date().toISOString(),
    enabled: true,
    rateLimit: {
      dailyLimit: limits.dailyLimit,
      minuteLimit: limits.minuteLimit,
    },
  };

  apiKeys.set(id, apiKey);
  return apiKey;
}

/** Get an API key by ID. */
export function getApiKey(id: string): ApiKey | undefined {
  return apiKeys.get(id);
}

/** Find API key by key value. */
export function findApiKeyByValue(keyValue: string): ApiKey | undefined {
  for (const apiKey of apiKeys.values()) {
    if (apiKey.key === keyValue) return apiKey;
  }
  return undefined;
}

/** List all API keys. */
export function listApiKeys(): ApiKey[] {
  return Array.from(apiKeys.values());
}

/** Revoke an API key. */
export function revokeApiKey(id: string): boolean {
  const key = apiKeys.get(id);
  if (!key) return false;
  key.enabled = false;
  return true;
}

/** Update API key tier. */
export function updateApiKeyTier(id: string, tier: BillingTier): boolean {
  const key = apiKeys.get(id);
  if (!key) return false;
  key.tier = tier;
  key.rateLimit = TIER_LIMITS[tier];
  return true;
}

/** Delete an API key. */
export function deleteApiKey(id: string): boolean {
  return apiKeys.delete(id);
}

// ---- Usage Tracking ----

/**
 * Record an API usage event.
 */
export function recordUsage(record: UsageRecord): void {
  usageRecords.push(record);
  const key = apiKeys.get(record.keyId);
  if (key) {
    key.lastUsedAt = record.timestamp;
  }
}

/**
 * Get usage summary for an API key within a time period.
 */
export function getUsageSummary(keyId: string, periodDays: number = 30): UsageSummary {
  const key = apiKeys.get(keyId);
  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

  const records = usageRecords.filter((r) => r.keyId === keyId && r.timestamp >= cutoff);

  const totalCalls = records.length;
  const totalTokens = records.reduce((s, r) => s + (r.tokensUsed ?? 0), 0);
  const avgLatency =
    totalCalls > 0 ? records.reduce((s, r) => s + r.durationMs, 0) / totalCalls : 0;
  const errors = records.filter((r) => r.statusCode >= 400).length;

  const endpointBreakdown: Record<string, number> = {};
  for (const r of records) {
    endpointBreakdown[r.endpoint] = (endpointBreakdown[r.endpoint] ?? 0) + 1;
  }

  const dailyMap = new Map<string, number>();
  for (const r of records) {
    const date = r.timestamp.slice(0, 10);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
  }

  return {
    keyId,
    tier: key?.tier ?? "free",
    period: `${periodDays} days`,
    totalCalls,
    totalTokens,
    averageLatencyMs: Math.round(avgLatency),
    errorRate: totalCalls > 0 ? errors / totalCalls : 0,
    endpointBreakdown,
    dailyUsage: Array.from(dailyMap.entries())
      .map(([date, calls]) => ({ date, calls }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Check if an API key has exceeded its daily limit.
 */
export function checkDailyLimit(keyId: string): { allowed: boolean; used: number; limit: number } {
  const key = apiKeys.get(keyId);
  if (!key || !key.enabled) return { allowed: false, used: 0, limit: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const todayUsage = usageRecords.filter(
    (r) => r.keyId === keyId && r.timestamp.startsWith(today)
  ).length;

  return {
    allowed: todayUsage < key.rateLimit.dailyLimit,
    used: todayUsage,
    limit: key.rateLimit.dailyLimit,
  };
}

// ---- Token Bucket Rate Limiter ----

const buckets = new Map<string, { tokens: number; lastRefill: number }>();

/**
 * Token bucket rate limiter for per-minute rate limiting.
 */
export function checkTokenBucket(
  keyId: string,
  config: { limit: number; windowMs: number }
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let bucket = buckets.get(keyId);

  if (!bucket) {
    bucket = { tokens: config.limit, lastRefill: now };
    buckets.set(keyId, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refillRate = config.limit / config.windowMs;
  bucket.tokens = Math.min(config.limit, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), resetMs: 0 };
  }

  const waitMs = Math.ceil((1 - bucket.tokens) / refillRate);
  return { allowed: false, remaining: 0, resetMs: waitMs };
}

// ---- Webhooks ----

/** Register a webhook URL for an API key. */
export function registerWebhook(keyId: string, url: string): void {
  const urls = webhookUrls.get(keyId) ?? [];
  if (!urls.includes(url)) urls.push(url);
  webhookUrls.set(keyId, urls);
}

/** Get webhook URLs for an API key. */
export function getWebhooks(keyId: string): string[] {
  return webhookUrls.get(keyId) ?? [];
}

/** Remove a webhook URL. */
export function removeWebhook(keyId: string, url: string): boolean {
  const urls = webhookUrls.get(keyId);
  if (!urls) return false;
  const idx = urls.indexOf(url);
  if (idx === -1) return false;
  urls.splice(idx, 1);
  return true;
}

// ---- OpenAPI Spec ----

/** Get OpenAPI 3.1 spec for the Innovation API. */
export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Innovator API",
      version: "1.0.0",
      description: "AI-Powered Innovation Engine API",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
      },
      schemas: {
        Investigation: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief summary of the investigation" },
            currentState: { type: "string", description: "Current state of the subject area" },
            keyAspects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                },
                required: ["title", "description"],
              },
            },
            challenges: { type: "array", items: { type: "string" } },
            opportunities: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "currentState", "keyAspects", "challenges", "opportunities"],
        },
        AngleResult: {
          type: "object",
          properties: {
            angleId: { type: "string", description: "Angle identifier" },
            angleName: { type: "string", description: "Human-readable angle name" },
            reasoning: { type: "string", description: "How the angle was applied" },
            ideas: {
              type: "array",
              items: { $ref: "#/components/schemas/Idea" },
            },
          },
          required: ["angleId", "angleName", "reasoning", "ideas"],
        },
        Idea: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            potentialImpact: { type: "string" },
            implementationHint: { type: "string" },
          },
          required: ["title", "description", "potentialImpact", "implementationHint"],
        },
        Synthesis: {
          type: "object",
          properties: {
            topIdeas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  sourceAngle: { type: "string" },
                  potentialImpact: { type: "string" },
                  feasibility: { type: "string", enum: ["low", "medium", "high"] },
                },
                required: ["title", "description", "sourceAngle", "potentialImpact", "feasibility"],
              },
            },
            themes: { type: "array", items: { type: "string" } },
            recommendation: { type: "string" },
          },
          required: ["topIdeas", "themes", "recommendation"],
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error message" },
            code: { type: "string", description: "Error code" },
          },
          required: ["error"],
        },
      },
    },
    paths: {
      "/investigate": {
        post: {
          summary: "Investigate a subject",
          description:
            "Analyze a subject to identify key aspects, challenges, and opportunities for innovation.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: {
                      type: "string",
                      maxLength: 500,
                      description: "The subject to investigate",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Investigation result",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Investigation" },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/innovate": {
        post: {
          summary: "Generate innovation ideas",
          description: "Generate innovation ideas for a subject using specified creativity angles.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject", "investigation", "angles"],
                  properties: {
                    subject: { type: "string", description: "The subject to innovate on" },
                    investigation: { $ref: "#/components/schemas/Investigation" },
                    angles: {
                      type: "array",
                      items: { type: "string" },
                      description: "Array of angle IDs to use",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Innovation results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: { $ref: "#/components/schemas/AngleResult" },
                      },
                    },
                    required: ["results"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/auto": {
        post: {
          summary: "Run full innovation pipeline with streaming",
          description:
            "Run the complete pipeline (investigate → generate → synthesize) with SSE streaming progress updates.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: {
                      type: "string",
                      maxLength: 500,
                      description: "The subject for the full pipeline",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "SSE stream of pipeline progress events",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "object",
                    description:
                      "Server-Sent Events stream. Each event is a JSON object with stage, data, and progress fields.",
                    properties: {
                      stage: {
                        type: "string",
                        enum: ["investigating", "generating", "synthesizing", "complete", "error"],
                      },
                      investigation: { $ref: "#/components/schemas/Investigation" },
                      angleResults: {
                        type: "array",
                        items: { $ref: "#/components/schemas/AngleResult" },
                      },
                      synthesis: { $ref: "#/components/schemas/Synthesis" },
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
    },
  };
}

// ---- Webhook Subscriptions ----

export const WebhookSubscriptionSchema = z.object({
  id: z.string().max(100),
  keyId: z.string().max(100),
  url: z.string().url().max(2000),
  events: z.array(
    z.enum([
      "pipeline.complete",
      "investigation.complete",
      "usage.limit.warning",
      "usage.limit.reached",
      "idea.scored",
      "experiment.complete",
    ])
  ),
  secret: z.string().max(200),
  active: z.boolean(),
  createdAt: z.string(),
  lastDeliveredAt: z.string().optional(),
  failureCount: z.number().default(0),
});

export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

const webhookSubscriptions = new Map<string, WebhookSubscription>();

/** Create a webhook subscription for specific events. */
export function createWebhookSubscription(
  keyId: string,
  url: string,
  events: WebhookSubscription["events"]
): WebhookSubscription {
  const id = `whsub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const secret = `whsec_${Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join("")}`;

  const sub: WebhookSubscription = {
    id,
    keyId,
    url,
    events,
    secret,
    active: true,
    createdAt: new Date().toISOString(),
    failureCount: 0,
  };

  webhookSubscriptions.set(id, sub);
  return sub;
}

/** List webhook subscriptions for a key. */
export function listWebhookSubscriptions(keyId: string): WebhookSubscription[] {
  return Array.from(webhookSubscriptions.values()).filter((s) => s.keyId === keyId);
}

/** Get a webhook subscription by ID. */
export function getWebhookSubscription(id: string): WebhookSubscription | undefined {
  return webhookSubscriptions.get(id);
}

/** Delete a webhook subscription. */
export function deleteWebhookSubscription(id: string): boolean {
  return webhookSubscriptions.delete(id);
}

/** Toggle a webhook subscription active/inactive. */
export function toggleWebhookSubscription(id: string): boolean {
  const sub = webhookSubscriptions.get(id);
  if (!sub) return false;
  sub.active = !sub.active;
  return true;
}

/** Dispatch a webhook event to matching subscriptions. */
export async function dispatchWebhookEvent(
  event: WebhookEvent
): Promise<{ delivered: number; failed: number }> {
  let delivered = 0;
  let failed = 0;

  for (const sub of webhookSubscriptions.values()) {
    if (!sub.active || sub.keyId !== event.keyId) continue;
    if (!sub.events.includes(event.type as WebhookSubscription["events"][number])) continue;

    try {
      const response = await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": sub.secret,
          "X-Webhook-Event": event.type,
          "X-Webhook-Id": event.id,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        sub.lastDeliveredAt = new Date().toISOString();
        sub.failureCount = 0;
        delivered++;
      } else {
        sub.failureCount++;
        failed++;
      }
    } catch {
      sub.failureCount++;
      failed++;
    }

    // Auto-disable after 10 consecutive failures
    if (sub.failureCount >= 10) {
      sub.active = false;
    }
  }

  return { delivered, failed };
}

// ---- API Versioning ----

export const ApiVersionSchema = z.enum(["v1", "v2"]);
export type ApiVersion = z.infer<typeof ApiVersionSchema>;

export const API_VERSIONS: Record<
  ApiVersion,
  {
    version: string;
    status: "stable" | "beta" | "deprecated";
    deprecationDate?: string;
    endpoints: string[];
  }
> = {
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
};

/** Get version info for an API version. */
export function getApiVersionInfo(version: ApiVersion) {
  return API_VERSIONS[version];
}

/** List all API versions. */
export function listApiVersions() {
  return Object.entries(API_VERSIONS).map(([key, val]) => ({
    apiVersion: key,
    ...val,
  }));
}

// ---- Usage-Based Rate Limiting ----

export const RateLimitConfigSchema = z.object({
  tier: BillingTierSchema,
  endpoint: z.string().max(200),
  limit: z.number().min(1),
  windowMs: z.number().min(1000),
  burstLimit: z.number().optional(),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

const ENDPOINT_RATE_LIMITS: Record<
  string,
  Record<BillingTier, { limit: number; windowMs: number }>
> = {
  "/investigate": {
    free: { limit: 5, windowMs: 60_000 },
    pro: { limit: 30, windowMs: 60_000 },
    enterprise: { limit: 120, windowMs: 60_000 },
  },
  "/innovate": {
    free: { limit: 5, windowMs: 60_000 },
    pro: { limit: 30, windowMs: 60_000 },
    enterprise: { limit: 120, windowMs: 60_000 },
  },
  "/auto": {
    free: { limit: 2, windowMs: 60_000 },
    pro: { limit: 10, windowMs: 60_000 },
    enterprise: { limit: 60, windowMs: 60_000 },
  },
};

/** Get rate limit config for an endpoint and tier. */
export function getEndpointRateLimit(
  endpoint: string,
  tier: BillingTier
): { limit: number; windowMs: number } {
  const endpointConfig = ENDPOINT_RATE_LIMITS[endpoint];
  if (endpointConfig) return endpointConfig[tier];
  return TIER_LIMITS[tier].minuteLimit
    ? { limit: TIER_LIMITS[tier].minuteLimit, windowMs: 60_000 }
    : { limit: 10, windowMs: 60_000 };
}

/** Check usage-based rate limit for a key against an endpoint. */
export function checkUsageRateLimit(
  keyId: string,
  endpoint: string
): { allowed: boolean; remaining: number; resetMs: number; tier: BillingTier } {
  const key = apiKeys.get(keyId);
  const tier = key?.tier ?? "free";
  const config = getEndpointRateLimit(endpoint, tier);
  const bucketKey = `${keyId}:${endpoint}`;
  const result = checkTokenBucket(bucketKey, config);
  return { ...result, tier };
}

/** Clear all API gateway state (for testing). */
export function clearApiGateway(): void {
  apiKeys.clear();
  usageRecords.length = 0;
  webhookUrls.clear();
  buckets.clear();
  tenants.clear();
  webhookSubscriptions.clear();
}

// ---- Multi-Tenant Management ----

export const TenantSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  tier: BillingTierSchema,
  ownerId: z.string().max(200),
  ownerEmail: z.string().max(300),
  apiKeys: z.array(z.string().max(100)),
  createdAt: z.string(),
  status: z.enum(["active", "suspended", "cancelled"]),
  settings: z.object({
    maxKeys: z.number().min(1).max(100),
    webhooksEnabled: z.boolean(),
    customModels: z.array(z.string().max(100)).max(20).optional(),
  }),
  usage: z.object({
    currentPeriodCalls: z.number().min(0),
    currentPeriodTokens: z.number().min(0),
    periodStart: z.string(),
  }),
});

export const DeveloperPortalInfoSchema = z.object({
  tenantId: z.string().max(100),
  tenantName: z.string().max(200),
  tier: BillingTierSchema,
  apiKeys: z.array(ApiKeySchema),
  usage: z.object({
    currentPeriodCalls: z.number(),
    currentPeriodTokens: z.number(),
    dailyLimit: z.number(),
    minuteLimit: z.number(),
  }),
  endpoints: z.array(
    z.object({
      method: z.string(),
      path: z.string(),
      description: z.string(),
    })
  ),
  webhooks: z.array(z.string()),
});

export type Tenant = z.infer<typeof TenantSchema>;
export type DeveloperPortalInfo = z.infer<typeof DeveloperPortalInfoSchema>;

const tenants = new Map<string, Tenant>();

/**
 * Create a new tenant for multi-tenant SaaS.
 */
export function createTenant(name: string, ownerEmail: string, tier: BillingTier = "free"): Tenant {
  const id = `tenant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 100);

  const initialKey = createApiKey(`${name} Default Key`, tier);

  const tenant: Tenant = {
    id,
    name,
    slug,
    tier,
    ownerId: ownerEmail,
    ownerEmail,
    apiKeys: [initialKey.id],
    createdAt: new Date().toISOString(),
    status: "active",
    settings: {
      maxKeys: tier === "enterprise" ? 50 : tier === "pro" ? 10 : 2,
      webhooksEnabled: tier !== "free",
    },
    usage: {
      currentPeriodCalls: 0,
      currentPeriodTokens: 0,
      periodStart: new Date().toISOString(),
    },
  };

  tenants.set(id, tenant);
  return tenant;
}

/** Get a tenant by ID. */
export function getTenant(id: string): Tenant | undefined {
  return tenants.get(id);
}

/** Find a tenant by slug. */
export function findTenantBySlug(slug: string): Tenant | undefined {
  for (const tenant of tenants.values()) {
    if (tenant.slug === slug) return tenant;
  }
  return undefined;
}

/** List all tenants. */
export function listTenants(): Tenant[] {
  return Array.from(tenants.values());
}

/** Update tenant tier (upgrade/downgrade). */
export function updateTenantTier(tenantId: string, tier: BillingTier): boolean {
  const tenant = tenants.get(tenantId);
  if (!tenant) return false;
  tenant.tier = tier;
  tenant.settings.maxKeys = tier === "enterprise" ? 50 : tier === "pro" ? 10 : 2;
  tenant.settings.webhooksEnabled = tier !== "free";
  for (const keyId of tenant.apiKeys) {
    updateApiKeyTier(keyId, tier);
  }
  return true;
}

/** Suspend a tenant. */
export function suspendTenant(tenantId: string): boolean {
  const tenant = tenants.get(tenantId);
  if (!tenant) return false;
  tenant.status = "suspended";
  for (const keyId of tenant.apiKeys) {
    revokeApiKey(keyId);
  }
  return true;
}

/** Add a new API key to a tenant. */
export function addTenantApiKey(tenantId: string, name: string): ApiKey | null {
  const tenant = tenants.get(tenantId);
  if (!tenant || tenant.status !== "active") return null;
  if (tenant.apiKeys.length >= tenant.settings.maxKeys) return null;
  const key = createApiKey(name, tenant.tier);
  tenant.apiKeys.push(key.id);
  return key;
}

/**
 * Get developer portal information for a tenant.
 */
export function getDeveloperPortalInfo(tenantId: string): DeveloperPortalInfo | null {
  const tenant = tenants.get(tenantId);
  if (!tenant) return null;

  const keys = tenant.apiKeys
    .map((id) => getApiKey(id))
    .filter((k): k is ApiKey => k !== undefined);

  const limits = TIER_LIMITS[tenant.tier];

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tier: tenant.tier,
    apiKeys: keys,
    usage: {
      currentPeriodCalls: tenant.usage.currentPeriodCalls,
      currentPeriodTokens: tenant.usage.currentPeriodTokens,
      dailyLimit: limits.dailyLimit,
      minuteLimit: limits.minuteLimit,
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
      { method: "GET", path: "/api/v1/health", description: "Check API health and status" },
    ],
    webhooks: tenant.settings.webhooksEnabled ? getWebhooks(tenant.apiKeys[0] ?? "") : [],
  };
}

/**
 * Get a live demo configuration with a temporary API key (read-only, limited calls).
 */
export function createDemoKey(): ApiKey {
  const demoKey = createApiKey("Live Demo", "free");
  const key = getApiKey(demoKey.id)!;
  key.rateLimit = { dailyLimit: 5, minuteLimit: 2 };
  key.metadata = { demo: "true", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  return key;
}
