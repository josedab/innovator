/**
 * @module saas/rate-limiter
 *
 * Per-tenant token-bucket rate limiting for hosted SaaS endpoints.
 */

import { z } from "zod";

import { getTenant } from "./saas.js";
import type { PlanId } from "./types.js";

/** Zod schema for rate-limit configuration. */
export const RateLimitConfigSchema = z.object({
  windowMs: z.number().int().positive(),
  maxRequests: z.number().int().min(-1),
});

/** Rate-limit configuration for a plan or endpoint. */
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/** Zod schema for rate-limit check results. */
export const RateLimitResultSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int(),
  resetAt: z.string(),
});

/** Outcome of a rate-limit check. */
export type RateLimitResult = z.infer<typeof RateLimitResultSchema>;

/** Zod schema for tenant-wide rate-limit status snapshots. */
export const RateLimitStatusSchema = z.object({
  tenantId: z.string(),
  endpoints: z.record(RateLimitResultSchema),
});

/** Snapshot of current rate-limit status for all tracked tenant endpoints. */
export type RateLimitStatus = z.infer<typeof RateLimitStatusSchema>;

interface TokenBucketState {
  tokens: number;
  lastRefillAt: number;
}

/** Default plan-based rate limits for API traffic. */
export const DEFAULT_RATE_LIMITS: Record<PlanId, RateLimitConfig> = {
  free: { windowMs: 60_000, maxRequests: 10 },
  pro: { windowMs: 60_000, maxRequests: 120 },
  team: { windowMs: 60_000, maxRequests: 600 },
  enterprise: { windowMs: 60_000, maxRequests: -1 },
};

const rateLimitBuckets = new Map<string, TokenBucketState>();

function bucketKey(tenantId: string, endpoint: string): string {
  return `${tenantId}::${endpoint}`;
}

function parseBucketKey(key: string): { tenantId: string; endpoint: string } {
  const separatorIndex = key.indexOf("::");
  if (separatorIndex === -1) {
    return { tenantId: key, endpoint: "" };
  }

  return {
    tenantId: key.slice(0, separatorIndex),
    endpoint: key.slice(separatorIndex + 2),
  };
}

function getTenantRateLimitConfig(tenantId: string): RateLimitConfig {
  const planId = getTenant(tenantId)?.planId ?? "free";
  return DEFAULT_RATE_LIMITS[planId];
}

function normalizeBucket(
  bucket: TokenBucketState | undefined,
  config: RateLimitConfig,
  now: number
): TokenBucketState {
  if (config.maxRequests === -1) {
    return { tokens: Number.POSITIVE_INFINITY, lastRefillAt: now };
  }

  if (!bucket) {
    return { tokens: config.maxRequests, lastRefillAt: now };
  }

  const refillRatePerMs = config.maxRequests / config.windowMs;
  const elapsedMs = Math.max(0, now - bucket.lastRefillAt);
  const tokens = Math.min(config.maxRequests, bucket.tokens + elapsedMs * refillRatePerMs);

  return {
    tokens,
    lastRefillAt: now,
  };
}

function getResetAt(tokens: number, config: RateLimitConfig, now: number): string {
  if (config.maxRequests === -1 || tokens >= 1) {
    return new Date(now).toISOString();
  }

  const refillRatePerMs = config.maxRequests / config.windowMs;
  const nextTokenAt = now + Math.ceil((1 - tokens) / refillRatePerMs);
  return new Date(nextTokenAt).toISOString();
}

/**
 * Check whether a tenant can access an endpoint under the current rate limit.
 * @param tenantId - The tenant being checked.
 * @param endpoint - The endpoint identifier or path.
 * @returns Whether the request is allowed, how many whole requests remain, and when the next token is available.
 */
export function checkRateLimit(tenantId: string, endpoint: string): RateLimitResult {
  const tenant = getTenant(tenantId);
  const now = Date.now();

  if (!tenant) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(now).toISOString(),
    };
  }

  const config = getTenantRateLimitConfig(tenantId);
  const key = bucketKey(tenantId, endpoint);

  if (config.maxRequests === -1) {
    rateLimitBuckets.set(key, { tokens: Number.POSITIVE_INFINITY, lastRefillAt: now });
    return {
      allowed: true,
      remaining: -1,
      resetAt: new Date(now).toISOString(),
    };
  }

  const bucket = normalizeBucket(rateLimitBuckets.get(key), config, now);
  const allowed = bucket.tokens >= 1;

  if (allowed) {
    bucket.tokens -= 1;
  }

  rateLimitBuckets.set(key, bucket);

  return {
    allowed,
    remaining: Math.max(0, Math.floor(bucket.tokens)),
    resetAt: getResetAt(bucket.tokens, config, now),
  };
}

/**
 * Get the current rate-limit status for every tracked endpoint for a tenant.
 * @param tenantId - The tenant whose buckets should be inspected.
 * @returns A snapshot keyed by endpoint of remaining requests and reset timing.
 */
export function getRateLimitStatus(tenantId: string): RateLimitStatus {
  const now = Date.now();
  const endpoints: Record<string, RateLimitResult> = {};

  for (const [key, state] of rateLimitBuckets.entries()) {
    const parsed = parseBucketKey(key);
    if (parsed.tenantId !== tenantId) continue;

    const config = getTenantRateLimitConfig(tenantId);
    const bucket = normalizeBucket(state, config, now);
    rateLimitBuckets.set(key, bucket);

    endpoints[parsed.endpoint] = {
      allowed: config.maxRequests === -1 ? true : bucket.tokens >= 1,
      remaining: config.maxRequests === -1 ? -1 : Math.max(0, Math.floor(bucket.tokens)),
      resetAt: getResetAt(bucket.tokens, config, now),
    };
  }

  return RateLimitStatusSchema.parse({ tenantId, endpoints });
}

/**
 * Clear all in-memory rate-limit buckets.
 * Intended for test teardown.
 */
export function clearRateLimits(): void {
  rateLimitBuckets.clear();
}
