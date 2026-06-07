import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateApiKey } from "./lib/api-auth";
import { getProductionRouteDecision, isProductionRuntime } from "./lib/runtime-policy";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;
const AUTO_MAX_REQUESTS = 3; // Stricter limit for /api/auto (triggers 10+ LLM calls per request)
const INNOVATE_MAX_REQUESTS = 5; // Stricter limit for /api/innovate (triggers up to 9 LLM calls per request)
const MAX_BODY_SIZE = 100 * 1024; // 100KB max request body size
const MAX_RATE_LIMIT_ENTRIES = 10_000;

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

// NOTE: This in-memory Map-based rate limiting only works for single-instance
// deployments. In multi-instance environments (Vercel, K8s), each instance
// maintains its own map, making the rate limit trivially bypassable.
// For production, use Redis/Upstash or Vercel's built-in rate limiting.
const rateLimitMap = new Map<string, RateLimitEntry>();
const autoRateLimitMap = new Map<string, RateLimitEntry>();
const innovateRateLimitMap = new Map<string, RateLimitEntry>();

// ---- Per-key API metering ----
// Lightweight in-memory metering that runs in edge middleware.
// Records API calls per key for the usage dashboard at /dashboard/usage.

interface MeteringEntry {
  keyId: string;
  route: string;
  method: string;
  timestamp: number;
}

const meteringLog: MeteringEntry[] = [];
const MAX_METERING_ENTRIES = 50_000;
const METERING_RETENTION_MS = 30 * 86_400_000; // 30 days

/** Record an API call for metering. Called after auth succeeds. */
function recordMeteringEntry(keyId: string, route: string, method: string): void {
  meteringLog.push({ keyId, route, method, timestamp: Date.now() });
  if (meteringLog.length > MAX_METERING_ENTRIES) {
    meteringLog.splice(0, meteringLog.length - MAX_METERING_ENTRIES);
  }
}

/** Exported for the /api/metering route to read. */
export function getMeteringLog(): MeteringEntry[] {
  return meteringLog;
}

// Per-key tier-based rate limiting (free: 100/day, pro: 10K/day, enterprise: unlimited)
interface KeyTierConfig {
  dailyLimit: number; // -1 = unlimited
  burstPerMinute: number;
}

const KEY_TIERS: Record<string, KeyTierConfig> = {};

/** Set tier limits for a key. Called from /api/metering set-tier action. */
export function setMeteringKeyTier(keyId: string, tier: "free" | "pro" | "enterprise"): void {
  const configs: Record<string, KeyTierConfig> = {
    free: { dailyLimit: 100, burstPerMinute: 10 },
    pro: { dailyLimit: 10_000, burstPerMinute: 60 },
    enterprise: { dailyLimit: -1, burstPerMinute: 200 },
  };
  KEY_TIERS[keyId] = configs[tier];
}

/** Check if a key has exceeded its tier quota. Returns error response or null. */
function checkKeyQuota(keyId: string, requestId: string): NextResponse | null {
  const config = KEY_TIERS[keyId];
  if (!config) return null; // No tier set = no metering enforcement

  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const minuteStart = now - 60_000;

  const dailyCount = meteringLog.filter(
    (e) => e.keyId === keyId && e.timestamp >= dayStartMs
  ).length;
  const burstCount = meteringLog.filter(
    (e) => e.keyId === keyId && e.timestamp >= minuteStart
  ).length;

  if (config.dailyLimit !== -1 && dailyCount >= config.dailyLimit) {
    return new NextResponse(
      JSON.stringify({ error: "Daily API quota exceeded. Upgrade your plan for higher limits." }),
      {
        status: 429,
        headers: { ...SECURITY_HEADERS, "X-Request-ID": requestId, "X-Quota-Exceeded": "daily" },
      }
    );
  }

  if (burstCount >= config.burstPerMinute) {
    return new NextResponse(
      JSON.stringify({ error: "Rate limit exceeded. Please slow down requests." }),
      {
        status: 429,
        headers: { ...SECURITY_HEADERS, "X-Request-ID": requestId, "X-Quota-Exceeded": "burst" },
      }
    );
  }

  return null;
}

// Periodically clean up expired entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

/** Remove expired entries and cap map sizes to prevent memory leaks. */
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const map of [rateLimitMap, autoRateLimitMap, innovateRateLimitMap]) {
    for (const [key, entry] of map) {
      if (now > entry.resetTime) {
        map.delete(key);
      }
    }
    if (map.size > MAX_RATE_LIMIT_ENTRIES) {
      const entries = [...map.entries()].sort((a, b) => a[1].resetTime - b[1].resetTime);
      const toRemove = entries.slice(0, map.size - MAX_RATE_LIMIT_ENTRIES);
      for (const [key] of toRemove) {
        map.delete(key);
      }
    }
  }

  // Clean up old metering entries
  const meteringCutoff = now - METERING_RETENTION_MS;
  const firstValid = meteringLog.findIndex((e) => e.timestamp >= meteringCutoff);
  if (firstValid > 0) {
    meteringLog.splice(0, firstValid);
  }
}

// Use request.ip as the primary source (set by the platform, e.g. Vercel,
// and not spoofable by clients). Fall back to headers only when the platform
// does not provide it.
/** Extract the client IP from the request, preferring platform-provided values. */
function getClientIp(request: NextRequest): string {
  const platformIp = (request as NextRequest & { ip?: string }).ip;
  if (platformIp) return platformIp;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Check and enforce a per-route rate limit, returning a 429 response if exceeded. */
function checkRouteRateLimit(
  map: Map<string, RateLimitEntry>,
  key: string,
  maxRequests: number,
  now: number,
  requestId: string,
  errorMessage: string
): NextResponse | null {
  const entry = map.get(key);

  if (!entry || now > entry.resetTime) {
    map.set(key, { count: 1, resetTime: now + WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return new NextResponse(JSON.stringify({ error: errorMessage }), {
        status: 429,
        headers: {
          ...SECURITY_HEADERS,
          "Retry-After": String(retryAfter),
          "X-Request-ID": requestId,
        },
      });
    }
  }

  return null;
}

// CORS Policy: This middleware intentionally does not set any CORS headers,
// enforcing same-origin access only. Do not add Access-Control-Allow-Origin
// or other CORS headers without a security review.
//
// AUTHENTICATION: When INNOVATOR_API_KEY is set, all /api/* requests must
// include a matching X-API-Key header. For public-facing deployments without
// the env var, consider adding OAuth or session-based auth to prevent
// unauthorized consumption of the Copilot subscription quota.
/**
 * Next.js middleware for API security and rate limiting.
 *
 * For non-API routes: applies nonce-based Content-Security-Policy headers.
 * For API routes: enforces rate limiting (global + per-route), API key
 * authentication (when `INNOVATOR_API_KEY` is set), body size limits,
 * concurrent request caps, and request ID tracking.
 *
 * @param request - The incoming Next.js request
 * @returns A NextResponse with security headers, or a 4xx/5xx error response
 */
export function proxy(request: NextRequest) {
  const routeDecision = getProductionRouteDecision(request.nextUrl.pathname, request.method);
  if (routeDecision.action === "misconfigured") {
    return new NextResponse(JSON.stringify({ error: "Production runtime is misconfigured." }), {
      status: 503,
      headers: SECURITY_HEADERS,
    });
  }
  if (routeDecision.action === "not-found") {
    return new NextResponse(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: SECURITY_HEADERS,
    });
  }
  if (routeDecision.action === "method-not-allowed") {
    return new NextResponse(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        Allow: routeDecision.allowedMethods.join(", "),
      },
    });
  }

  // For non-API routes, apply nonce-based CSP
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      `img-src 'self' data:`,
      `font-src 'self'`,
      `connect-src 'self'`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `object-src 'none'`,
      `upgrade-insecure-requests`,
    ].join("; ");

    const response = NextResponse.next({
      request: {
        headers: new Headers({ ...Object.fromEntries(request.headers), "x-nonce": nonce }),
      },
    });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  cleanup();

  const auth = validateApiKey(request);
  if (!auth.valid) {
    const status = auth.error?.includes("Server API authentication") ? 503 : 401;
    return new NextResponse(JSON.stringify({ error: auth.error }), {
      status,
      headers: { ...SECURITY_HEADERS },
    });
  }
  const meteringKeyId = auth.keyId ?? "anonymous";

  const route = request.nextUrl.pathname;
  if (!isProductionRuntime()) {
    recordMeteringEntry(meteringKeyId, route, request.method);
  }

  // Reject oversized request bodies before they consume parsing resources
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new NextResponse(JSON.stringify({ error: "Request body too large." }), {
      status: 413,
      headers: { ...SECURITY_HEADERS },
    });
  }

  const requestId = crypto.randomUUID();
  const ip = getClientIp(request);
  const now = Date.now();

  if (!isProductionRuntime()) {
    const quotaResponse = checkKeyQuota(meteringKeyId, requestId);
    if (quotaResponse) return quotaResponse;
  }

  const globalRateLimitResponse = checkRouteRateLimit(
    rateLimitMap,
    ip,
    MAX_REQUESTS,
    now,
    requestId,
    "Too many requests. Please try again later."
  );
  if (globalRateLimitResponse) return globalRateLimitResponse;

  // Stricter per-route rate limit for /api/auto
  if (request.nextUrl.pathname === "/api/auto") {
    const rateLimitResponse = checkRouteRateLimit(
      autoRateLimitMap,
      `auto:${ip}`,
      AUTO_MAX_REQUESTS,
      now,
      requestId,
      "Too many auto requests. Please try again later."
    );
    if (rateLimitResponse) return rateLimitResponse;
  }

  // Stricter per-route rate limit for /api/innovate (triggers up to 9 LLM calls per request)
  if (request.nextUrl.pathname === "/api/innovate") {
    const rateLimitResponse = checkRouteRateLimit(
      innovateRateLimitMap,
      `innovate:${ip}`,
      INNOVATE_MAX_REQUESTS,
      now,
      requestId,
      "Too many innovate requests. Please try again later."
    );
    if (rateLimitResponse) return rateLimitResponse;
  }

  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);

  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
