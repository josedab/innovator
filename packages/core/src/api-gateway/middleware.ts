/**
 * @module api-gateway/middleware
 *
 * Express/Fastify-compatible middleware for API authentication, rate limiting,
 * sliding window tracking, request validation, and CORS.
 * Framework-agnostic: returns handler descriptors that adapters can wire up.
 */

import { z } from "zod";
import {
  findApiKeyByValue,
  checkUsageRateLimit,
  checkDailyLimit,
  recordUsage,
  type ApiKey,
  type BillingTier,
} from "./index.js";

// ---- Schemas ----

/** Schema for the result returned by middleware functions (auth, rate limiting, validation). */
export const MiddlewareResultSchema = z.object({
  allowed: z.boolean().describe("Whether the request is allowed to proceed"),
  statusCode: z.number().describe("HTTP status code to return"),
  error: z.string().optional().describe("Error message if the request was rejected"),
  headers: z
    .record(z.string())
    .optional()
    .describe("Response headers to include (e.g. rate limit info)"),
  apiKey: z
    .object({
      id: z.string().describe("API key identifier"),
      tier: z.enum(["free", "pro", "enterprise"]).describe("Billing tier of the key"),
    })
    .optional()
    .describe("Authenticated API key context (present on successful auth)"),
});

export type MiddlewareResult = z.infer<typeof MiddlewareResultSchema>;

// ---- Sliding Window Rate Limiter ----

interface SlidingWindowEntry {
  timestamps: number[];
}

const slidingWindows = new Map<string, SlidingWindowEntry>();

/**
 * Sliding window rate limiter — more accurate than token bucket
 * for per-minute and per-hour limits.
 */
export function checkSlidingWindow(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetMs: number; retryAfterMs: number } {
  const now = Date.now();
  let entry = slidingWindows.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    slidingWindows.set(key, entry);
  }

  // Prune expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0] ?? now;
    const resetMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetMs,
      retryAfterMs: resetMs,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetMs: entry.timestamps.length > 0 ? (entry.timestamps[0] ?? now) + windowMs - now : windowMs,
    retryAfterMs: 0,
  };
}

/**
 * Clear all sliding window rate limiter state.
 * Primarily intended for test teardown.
 */
export function clearSlidingWindows(): void {
  slidingWindows.clear();
}

// ---- Authentication Middleware ----

/**
 * Authenticate a request by API key from header or query param.
 */
export function authenticateRequest(apiKeyHeader?: string, apiKeyQuery?: string): MiddlewareResult {
  const keyValue = apiKeyHeader ?? apiKeyQuery;

  if (!keyValue) {
    return {
      allowed: false,
      statusCode: 401,
      error: "Missing API key. Provide via X-API-Key header or ?api_key query parameter.",
      headers: { "WWW-Authenticate": 'ApiKey realm="Innovator API"' },
    };
  }

  const apiKey = findApiKeyByValue(keyValue);
  if (!apiKey) {
    return {
      allowed: false,
      statusCode: 401,
      error: "Invalid API key.",
    };
  }

  if (!apiKey.enabled) {
    return {
      allowed: false,
      statusCode: 403,
      error: "API key has been revoked.",
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    apiKey: { id: apiKey.id, tier: apiKey.tier },
  };
}

// ---- Rate Limit Middleware ----

/**
 * Check rate limits for an authenticated request.
 * Applies both sliding window per-minute and daily limits.
 */
export function checkRateLimits(
  keyId: string,
  endpoint: string,
  tier: BillingTier
): MiddlewareResult {
  // Per-minute sliding window
  const minuteKey = `${keyId}:${endpoint}:minute`;
  const minuteLimits: Record<BillingTier, number> = {
    free: 5,
    pro: 60,
    enterprise: 300,
  };
  const minuteResult = checkSlidingWindow(minuteKey, minuteLimits[tier], 60_000);

  if (!minuteResult.allowed) {
    return {
      allowed: false,
      statusCode: 429,
      error: `Rate limit exceeded. Retry after ${Math.ceil(minuteResult.retryAfterMs / 1000)}s.`,
      headers: {
        "X-RateLimit-Limit": String(minuteLimits[tier]),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + minuteResult.resetMs) / 1000)),
        "Retry-After": String(Math.ceil(minuteResult.retryAfterMs / 1000)),
      },
    };
  }

  // Daily limit
  const dailyCheck = checkDailyLimit(keyId);
  if (!dailyCheck.allowed) {
    return {
      allowed: false,
      statusCode: 429,
      error: "Daily API call limit exceeded. Upgrade your plan for higher limits.",
      headers: {
        "X-RateLimit-Daily-Limit": String(dailyCheck.limit),
        "X-RateLimit-Daily-Used": String(dailyCheck.used),
      },
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    headers: {
      "X-RateLimit-Limit": String(minuteLimits[tier]),
      "X-RateLimit-Remaining": String(minuteResult.remaining),
      "X-RateLimit-Reset": String(Math.ceil((Date.now() + minuteResult.resetMs) / 1000)),
    },
  };
}

// ---- Request Validation ----

const RequestBodySchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  model: z.string().max(100).optional(),
  investigation: z.record(z.unknown()).optional(),
  angles: z.array(z.string().max(100)).max(20).optional(),
});

/**
 * Validate request body against expected schema for an endpoint.
 */
export function validateRequestBody(
  endpoint: string,
  body: unknown
): { valid: boolean; error?: string } {
  if (body === null || body === undefined) {
    return { valid: false, error: "Request body is required." };
  }

  if (typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object." };
  }

  const requiresSubject = ["/investigate", "/innovate", "/auto", "/pipeline"].some((p) =>
    endpoint.includes(p)
  );

  if (requiresSubject) {
    const parsed = RequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return {
        valid: false,
        error: `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      };
    }

    if (!parsed.data.subject) {
      return { valid: false, error: 'Missing required field: "subject".' };
    }
  }

  return { valid: true };
}

// ---- CORS Configuration ----

/** CORS configuration for allowed origins, methods, headers, and preflight cache duration. */
export interface CorsConfig {
  /** Origins allowed to make cross-origin requests (use `["*"]` for any). */
  allowedOrigins: string[];
  /** HTTP methods allowed in cross-origin requests. */
  allowedMethods: string[];
  /** Request headers allowed in cross-origin requests. */
  allowedHeaders: string[];
  /** Maximum duration (in seconds) browsers should cache preflight results. */
  maxAge: number;
}

const DEFAULT_CORS: CorsConfig = {
  allowedOrigins: ["*"],
  allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
  maxAge: 86400,
};

/**
 * Generate CORS headers for a request origin.
 */
export function getCorsHeaders(
  origin?: string,
  config: CorsConfig = DEFAULT_CORS
): Record<string, string> {
  const allowOrigin =
    config.allowedOrigins.includes("*") || !origin
      ? "*"
      : config.allowedOrigins.includes(origin)
        ? origin
        : "";

  if (!allowOrigin) return {};

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": config.allowedMethods.join(", "),
    "Access-Control-Allow-Headers": config.allowedHeaders.join(", "),
    "Access-Control-Max-Age": String(config.maxAge),
  };
}

// ---- Full Request Pipeline ----

export interface GatewayRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: unknown;
  startTime?: number;
}

export interface GatewayResponse {
  allowed: boolean;
  statusCode: number;
  error?: string;
  headers: Record<string, string>;
  apiKey?: { id: string; tier: BillingTier };
}

/**
 * Process a full gateway request through auth, rate limiting, validation, and CORS.
 * Returns a GatewayResponse indicating whether the request should proceed.
 */
export function processGatewayRequest(req: GatewayRequest): GatewayResponse {
  const headers: Record<string, string> = {};

  // CORS
  const corsHeaders = getCorsHeaders(req.headers["origin"]);
  Object.assign(headers, corsHeaders);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return { allowed: true, statusCode: 204, headers };
  }

  // Authentication
  const authResult = authenticateRequest(req.headers["x-api-key"], req.query?.["api_key"]);

  if (!authResult.allowed) {
    return {
      allowed: false,
      statusCode: authResult.statusCode,
      error: authResult.error,
      headers: { ...headers, ...(authResult.headers ?? {}) },
    };
  }

  // Rate limiting — apiKey guaranteed non-null after successful auth
  const apiKey = authResult.apiKey;
  if (!apiKey) {
    return {
      allowed: false,
      statusCode: 500,
      error: "Internal error: missing API key context.",
      headers,
    };
  }
  const rateLimitResult = checkRateLimits(apiKey.id, req.path, apiKey.tier);

  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      statusCode: rateLimitResult.statusCode,
      error: rateLimitResult.error,
      headers: { ...headers, ...(rateLimitResult.headers ?? {}) },
    };
  }

  Object.assign(headers, rateLimitResult.headers ?? {});

  // Request validation for POST/PUT/PATCH
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const validation = validateRequestBody(req.path, req.body);
    if (!validation.valid) {
      return {
        allowed: false,
        statusCode: 400,
        error: validation.error,
        headers,
      };
    }
  }

  return {
    allowed: true,
    statusCode: 200,
    headers,
    apiKey,
  };
}

/**
 * Record the completion of a gateway request for usage tracking.
 */
export function recordGatewayCompletion(
  keyId: string,
  endpoint: string,
  startTime: number,
  statusCode: number,
  tokensUsed?: number
): void {
  recordUsage({
    keyId,
    endpoint,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    tokensUsed,
    statusCode,
  });
}
