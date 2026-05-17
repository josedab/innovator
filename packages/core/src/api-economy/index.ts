/**
 * @module api-economy
 *
 * Innovation API Economy — client registration, API key management,
 * usage metering, and pricing tiers for exposing Innovator's pipeline
 * as a metered public API.
 */

import { randomUUID, createHash, createHmac } from "node:crypto";
import type { ApiClient, ApiKey, UsageRecord, UsageSummary, PricingTier } from "./types.js";
import {
  ApiClientSchema,
  ApiKeySchema,
  UsageRecordSchema,
  UsageSummarySchema,
  PricingTierSchema,
} from "./types.js";
import { ValidationError } from "../errors.js";

export * from "./types.js";

// ---- Pricing Tiers ----

const PRICING_TIERS: PricingTier[] = [
  PricingTierSchema.parse({
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    includedRequests: 100,
    overagePrice: 0,
    rateLimit: 10,
    dailyQuota: 20,
    endpoints: ["/investigate", "/innovate", "/score"],
    features: ["Basic investigation", "3 angle types", "Idea scoring"],
  }),
  PricingTierSchema.parse({
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    includedRequests: 1000,
    overagePrice: 0.05,
    rateLimit: 30,
    dailyQuota: 100,
    endpoints: ["/investigate", "/innovate", "/score", "/gauntlet", "/evolve"],
    features: [
      "Full investigation",
      "All angle types",
      "Idea scoring",
      "Gauntlet stress-testing",
      "Idea evolution",
      "Email support",
    ],
  }),
  PricingTierSchema.parse({
    id: "pro",
    name: "Pro",
    monthlyPrice: 99,
    includedRequests: 5000,
    overagePrice: 0.03,
    rateLimit: 60,
    dailyQuota: 500,
    endpoints: [
      "/investigate",
      "/innovate",
      "/score",
      "/gauntlet",
      "/evolve",
      "/synthesize",
      "/export",
    ],
    features: [
      "Everything in Starter",
      "Synthesis",
      "Export (Markdown, JSON, PPTX)",
      "Priority support",
      "Custom angles",
      "Webhooks",
    ],
  }),
  PricingTierSchema.parse({
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 499,
    includedRequests: 50000,
    overagePrice: 0.01,
    rateLimit: 200,
    dailyQuota: 5000,
    endpoints: [
      "/investigate",
      "/innovate",
      "/score",
      "/gauntlet",
      "/evolve",
      "/synthesize",
      "/export",
      "/pipeline",
      "/collaborate",
      "/batch",
    ],
    features: [
      "Everything in Pro",
      "Batch processing",
      "Collaboration API",
      "Full pipeline endpoint",
      "SLA guarantee",
      "Dedicated support",
      "Custom model routing",
      "SSO integration",
    ],
  }),
];

/** Returns all pricing tiers. */
export function getApiPricing(): PricingTier[] {
  return PRICING_TIERS;
}

// ---- In-Memory State ----

const clients = new Map<string, ApiClient>();
const apiKeys = new Map<string, ApiKey>();
const usageRecords: UsageRecord[] = [];

// ---- Client Management ----

function getTierConfig(tier: ApiClient["tier"]): PricingTier {
  return PRICING_TIERS.find((t) => t.id === tier) ?? PRICING_TIERS[0];
}

/**
 * Register a new API client.
 */
export function createApiClient(
  name: string,
  email: string,
  options?: { organization?: string; tier?: ApiClient["tier"] }
): { client: ApiClient; rawKey: string } {
  const id = randomUUID();
  const tier = options?.tier ?? "free";

  const client: ApiClient = ApiClientSchema.parse({
    id,
    name,
    email,
    organization: options?.organization,
    tier,
    apiKeyIds: [],
    createdAt: new Date().toISOString(),
    status: "active",
  });

  clients.set(id, client);

  // Auto-generate first API key
  const { key, rawKey } = generateApiKey(id);
  client.apiKeyIds.push(key.id);

  return { client, rawKey };
}

/**
 * Generate a new API key for a client.
 */
export function generateApiKey(clientId: string): { key: ApiKey; rawKey: string } {
  const client = clients.get(clientId);
  if (!client) throw new ValidationError(`Client ${clientId} not found`);

  const tierConfig = getTierConfig(client.tier);
  const rawKey = `inno_${randomUUID().replace(/-/g, "")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const key: ApiKey = ApiKeySchema.parse({
    id: randomUUID(),
    clientId,
    keyPrefix: rawKey.slice(0, 12),
    keyHash,
    rateLimit: tierConfig.rateLimit,
    dailyQuota: tierConfig.dailyQuota,
    allowedEndpoints: tierConfig.endpoints,
    status: "active",
    createdAt: new Date().toISOString(),
  });

  apiKeys.set(key.id, key);
  return { key, rawKey };
}

// ---- API Key Validation & Rate Limiting ----

/**
 * Validate an API key and check rate limits.
 * Returns the associated client if valid, or throws with the reason.
 */
export function validateApiKey(
  rawKey: string,
  endpoint: string
): {
  client: ApiClient;
  key: ApiKey;
  remaining: { minute: number; daily: number };
} {
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  // Find matching key
  let matchedKey: ApiKey | undefined;
  for (const key of apiKeys.values()) {
    if (key.keyHash === keyHash) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) throw new ValidationError("Invalid API key");
  if (matchedKey.status !== "active") throw new ValidationError("API key is revoked");

  // Check endpoint access
  if (!matchedKey.allowedEndpoints.includes(endpoint)) {
    throw new ValidationError(`Endpoint ${endpoint} not allowed on this tier`);
  }

  // Check client status
  const client = clients.get(matchedKey.clientId);
  if (!client) throw new ValidationError("Client not found");
  if (client.status !== "active") throw new ValidationError(`Client account is ${client.status}`);

  // Check rate limits
  const now = Date.now();
  const oneMinuteAgo = new Date(now - 60_000).toISOString();
  const startOfDay = new Date(now - (now % 86_400_000)).toISOString();

  const recentMinute = usageRecords.filter(
    (r) => r.apiKeyId === matchedKey!.id && r.timestamp >= oneMinuteAgo
  ).length;

  const todayTotal = usageRecords.filter(
    (r) => r.apiKeyId === matchedKey!.id && r.timestamp >= startOfDay
  ).length;

  if (recentMinute >= matchedKey.rateLimit) {
    throw new ValidationError(`Rate limit exceeded: ${matchedKey.rateLimit} requests/minute`);
  }

  if (todayTotal >= matchedKey.dailyQuota) {
    throw new ValidationError(`Daily quota exceeded: ${matchedKey.dailyQuota} requests/day`);
  }

  return {
    client,
    key: matchedKey,
    remaining: {
      minute: matchedKey.rateLimit - recentMinute,
      daily: matchedKey.dailyQuota - todayTotal,
    },
  };
}

/**
 * Generate a simple JWT-like token for session authentication.
 * Uses HMAC-SHA256 for signing. In production, use a proper JWT library.
 */
export function generateSessionToken(
  clientId: string,
  secret: string,
  expiresInSeconds: number = 3600
): string {
  const client = clients.get(clientId);
  if (!client) throw new ValidationError(`Client ${clientId} not found`);

  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: clientId,
      tier: client.tier,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })
  ).toString("base64url");

  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * Validate a JWT-like session token.
 */
export function validateSessionToken(
  token: string,
  secret: string
): { clientId: string; tier: string; expired: boolean } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ValidationError("Invalid token format");

  const [header, payload, signature] = parts;

  const expectedSig = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  if (signature !== expectedSig) throw new ValidationError("Invalid token signature");

  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  const expired = data.exp < Math.floor(Date.now() / 1000);

  return { clientId: data.sub, tier: data.tier, expired };
}

// ---- Usage Metering ----

/**
 * Record a single API usage event.
 */
export function recordUsage(params: {
  clientId: string;
  apiKeyId: string;
  endpoint: string;
  method: UsageRecord["method"];
  statusCode: number;
  latencyMs: number;
  tokensConsumed?: number;
}): UsageRecord {
  const record: UsageRecord = UsageRecordSchema.parse({
    id: randomUUID(),
    ...params,
    timestamp: new Date().toISOString(),
  });

  usageRecords.push(record);

  // Update key last used
  const key = apiKeys.get(params.apiKeyId);
  if (key) {
    key.lastUsedAt = record.timestamp;
    apiKeys.set(key.id, key);
  }

  return record;
}

/**
 * Get usage summary for a client over a period.
 */
export function getUsageSummary(clientId: string, period?: string): UsageSummary {
  const client = clients.get(clientId);
  if (!client) throw new ValidationError(`Client ${clientId} not found`);

  const currentPeriod = period ?? new Date().toISOString().slice(0, 7);
  const records = usageRecords.filter(
    (r) => r.clientId === clientId && r.timestamp.startsWith(currentPeriod)
  );

  const successful = records.filter((r) => r.statusCode >= 200 && r.statusCode < 300);
  const failed = records.filter((r) => r.statusCode >= 400);
  const totalTokens = records.reduce((sum, r) => sum + (r.tokensConsumed ?? 0), 0);
  const avgLatency =
    records.length > 0 ? records.reduce((sum, r) => sum + r.latencyMs, 0) / records.length : 0;

  // By endpoint
  const byEndpoint: UsageSummary["byEndpoint"] = {};
  for (const record of records) {
    if (!byEndpoint[record.endpoint]) {
      byEndpoint[record.endpoint] = { requests: 0, avgLatencyMs: 0, errorRate: 0 };
    }
    const ep = byEndpoint[record.endpoint];
    ep.requests++;
  }
  for (const [endpoint, data] of Object.entries(byEndpoint)) {
    const epRecords = records.filter((r) => r.endpoint === endpoint);
    data.avgLatencyMs = epRecords.reduce((s, r) => s + r.latencyMs, 0) / epRecords.length;
    data.errorRate = epRecords.filter((r) => r.statusCode >= 400).length / epRecords.length;
  }

  // Estimated cost
  const tierConfig = getTierConfig(client.tier);
  const overageRequests = Math.max(0, records.length - tierConfig.includedRequests);
  const estimatedCost = tierConfig.monthlyPrice + overageRequests * tierConfig.overagePrice;

  const quotaUtilization =
    tierConfig.includedRequests > 0 ? Math.min(1, records.length / tierConfig.includedRequests) : 0;

  return UsageSummarySchema.parse({
    clientId,
    period: currentPeriod,
    totalRequests: records.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    totalTokens,
    averageLatencyMs: Math.round(avgLatency),
    byEndpoint,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    quotaUtilization: Math.round(quotaUtilization * 1000) / 1000,
  });
}
