import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

// NOTE: This in-memory Map-based rate limiting only works for single-instance
// deployments. In multi-instance environments (Vercel, K8s), each instance
// maintains its own map, making the rate limit trivially bypassable.
// For production, use Redis/Upstash or Vercel's built-in rate limiting.
const rateLimitMap = new Map<string, RateLimitEntry>();

// Periodically clean up expired entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
  // Evict oldest entries if map exceeds size cap
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const entries = [...rateLimitMap.entries()].sort(
      (a, b) => a[1].resetTime - b[1].resetTime
    );
    const toRemove = entries.slice(0, rateLimitMap.size - MAX_RATE_LIMIT_ENTRIES);
    for (const [key] of toRemove) {
      rateLimitMap.delete(key);
    }
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  cleanup();

  const requestId = crypto.randomUUID();
  const ip = getClientIp(request);
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    const response = NextResponse.next();
    response.headers.set("X-Request-ID", requestId);
    return response;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return new NextResponse(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-Request-ID": requestId,
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
