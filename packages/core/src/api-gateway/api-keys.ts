import { getEndpointRateLimit, TIER_LIMITS } from "./config.js";
import { apiKeys, buckets, usageRecords } from "./state.js";
import type { ApiKey, BillingTier, UsageRecord, UsageSummary } from "./types.js";

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

/**
 * Get an API key by its unique identifier.
 *
 * @param id - The API key identifier.
 * @returns The API key, or `undefined` if not found.
 */
export function getApiKey(id: string): ApiKey | undefined {
  return apiKeys.get(id);
}

/**
 * Find an API key by its secret key value.
 *
 * @param keyValue - The full API key string (e.g., `inv_free_abc...`).
 * @returns The matching API key, or `undefined` if not found.
 */
export function findApiKeyByValue(keyValue: string): ApiKey | undefined {
  for (const apiKey of apiKeys.values()) {
    if (apiKey.key === keyValue) return apiKey;
  }
  return undefined;
}

/**
 * List all registered API keys.
 *
 * @returns Array of all API keys.
 */
export function listApiKeys(): ApiKey[] {
  return Array.from(apiKeys.values());
}

/**
 * Revoke an API key, disabling it from making further requests.
 *
 * @param id - The API key identifier to revoke.
 * @returns `true` if found and revoked, `false` if not found.
 */
export function revokeApiKey(id: string): boolean {
  const key = apiKeys.get(id);
  if (!key) return false;
  key.enabled = false;
  return true;
}

/**
 * Update an API key's billing tier and associated rate limits.
 *
 * @param id - The API key identifier.
 * @param tier - The new billing tier to assign.
 * @returns `true` if found and updated, `false` if not found.
 */
export function updateApiKeyTier(id: string, tier: BillingTier): boolean {
  const key = apiKeys.get(id);
  if (!key) return false;
  key.tier = tier;
  key.rateLimit = TIER_LIMITS[tier];
  return true;
}

/**
 * Permanently delete an API key.
 *
 * @param id - The API key identifier.
 * @returns `true` if found and deleted, `false` if not found.
 */
export function deleteApiKey(id: string): boolean {
  return apiKeys.delete(id);
}

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
