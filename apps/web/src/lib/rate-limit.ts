/**
 * @module rate-limit
 *
 * Simple in-memory rate limiter using a sliding window.
 * In production, this would use Redis or similar.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

/** Configuration for the sliding-window rate limiter. */
export interface RateLimitConfig {
  limit?: number;
  windowMs?: number;
}

/** Result of a rate limit check including remaining quota and reset time. */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/** Build an isolated bucket key for a route and caller identity. */
export function scopedRateLimitKey(scope: string, key: string): string {
  return `${scope}:${key}`;
}

/**
 * Check and consume a rate limit token for the given key.
 * Resets the counter when the current window expires.
 * @param key - Unique identifier for the rate limit bucket (e.g., IP address or API key).
 * @param config - Optional configuration overriding the default limit and window size.
 * @returns A {@link RateLimitResult} indicating whether the request is allowed and remaining quota.
 */
export function checkRateLimit(key: string, config?: RateLimitConfig): RateLimitResult {
  const limit = config?.limit ?? DEFAULT_LIMIT;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);

  return {
    allowed,
    limit,
    remaining,
    resetAt: new Date(entry.resetAt),
  };
}

/**
 * Add standard rate limit headers to a response header map.
 * @param headers - The existing headers object to augment.
 * @param result - The rate limit check result containing limit, remaining, and reset time.
 * @returns A new headers object with `X-RateLimit-*` headers added.
 */
export function addRateLimitHeaders(
  headers: Record<string, string>,
  result: RateLimitResult
): Record<string, string> {
  return {
    ...headers,
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}
