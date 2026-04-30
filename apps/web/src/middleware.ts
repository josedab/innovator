import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;
const AUTO_MAX_REQUESTS = 3; // Stricter limit for /api/auto (triggers 10+ LLM calls per request)
const INNOVATE_MAX_REQUESTS = 5; // Stricter limit for /api/innovate (triggers up to 9 LLM calls per request)
const MAX_CONCURRENT_PER_IP = 2; // Max simultaneous in-flight requests per IP
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
const inFlightMap = new Map<string, number>();

// Periodically clean up expired entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

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

  // Clean up stale inFlightMap entries and enforce size cap
  for (const [key, count] of inFlightMap) {
    if (count <= 0) {
      inFlightMap.delete(key);
    }
  }
  if (inFlightMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const excess = inFlightMap.size - MAX_RATE_LIMIT_ENTRIES;
    const keys = [...inFlightMap.keys()];
    for (let i = 0; i < excess; i++) {
      inFlightMap.delete(keys[i]);
    }
  }
}

// Use request.ip as the primary source (set by the platform, e.g. Vercel,
// and not spoofable by clients). Fall back to headers only when the platform
// does not provide it.
function getClientIp(request: NextRequest): string {
  const platformIp = (request as NextRequest & { ip?: string }).ip;
  if (platformIp) return platformIp;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// CORS Policy: This middleware intentionally does not set any CORS headers,
// enforcing same-origin access only. Do not add Access-Control-Allow-Origin
// or other CORS headers without a security review.
//
// AUTHENTICATION: These API endpoints have no authentication mechanism by design.
// The app relies on the server operator's GitHub Copilot subscription (via `gh auth`).
// For public-facing deployments, add an API key check, OAuth, or session-based auth
// to prevent unauthorized consumption of the Copilot subscription quota.
export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  cleanup();

  // Reject oversized request bodies before they consume parsing resources
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new NextResponse(JSON.stringify({ error: "Request body too large." }), {
      status: 413,
      headers: { ...SECURITY_HEADERS },
    });
  }

  // Require Content-Length on mutation requests to prevent unbounded body parsing
  const method = request.method;
  if ((method === "POST" || method === "PUT" || method === "PATCH") && !contentLength) {
    return new NextResponse(JSON.stringify({ error: "Content-Length header is required." }), {
      status: 411,
      headers: { ...SECURITY_HEADERS },
    });
  }

  const requestId = crypto.randomUUID();
  const ip = getClientIp(request);
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
  } else {
    entry.count++;

    if (entry.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            "Retry-After": String(retryAfter),
            "X-Request-ID": requestId,
          },
        }
      );
    }
  }

  // Stricter per-route rate limit for /api/auto
  if (request.nextUrl.pathname === "/api/auto") {
    const autoKey = `auto:${ip}`;
    const autoEntry = autoRateLimitMap.get(autoKey);

    if (!autoEntry || now > autoEntry.resetTime) {
      autoRateLimitMap.set(autoKey, { count: 1, resetTime: now + WINDOW_MS });
    } else {
      autoEntry.count++;
      if (autoEntry.count > AUTO_MAX_REQUESTS) {
        const retryAfter = Math.ceil((autoEntry.resetTime - now) / 1000);
        return new NextResponse(
          JSON.stringify({ error: "Too many auto requests. Please try again later." }),
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              "Retry-After": String(retryAfter),
              "X-Request-ID": requestId,
            },
          }
        );
      }
    }
  }

  // Stricter per-route rate limit for /api/innovate (triggers up to 9 LLM calls per request)
  if (request.nextUrl.pathname === "/api/innovate") {
    const innovateKey = `innovate:${ip}`;
    const innovateEntry = innovateRateLimitMap.get(innovateKey);

    if (!innovateEntry || now > innovateEntry.resetTime) {
      innovateRateLimitMap.set(innovateKey, { count: 1, resetTime: now + WINDOW_MS });
    } else {
      innovateEntry.count++;
      if (innovateEntry.count > INNOVATE_MAX_REQUESTS) {
        const retryAfter = Math.ceil((innovateEntry.resetTime - now) / 1000);
        return new NextResponse(
          JSON.stringify({ error: "Too many innovate requests. Please try again later." }),
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              "Retry-After": String(retryAfter),
              "X-Request-ID": requestId,
            },
          }
        );
      }
    }
  }

  // Concurrent in-flight request limit per IP
  const currentInFlight = inFlightMap.get(ip) ?? 0;
  if (currentInFlight >= MAX_CONCURRENT_PER_IP) {
    return new NextResponse(
      JSON.stringify({
        error: "Too many concurrent requests. Please wait for existing requests to complete.",
      }),
      {
        status: 429,
        headers: {
          ...SECURITY_HEADERS,
          "X-Request-ID": requestId,
        },
      }
    );
  }
  if (inFlightMap.size < MAX_RATE_LIMIT_ENTRIES || inFlightMap.has(ip)) {
    inFlightMap.set(ip, currentInFlight + 1);
  }

  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);

  // Decrement in-flight count after response completes.
  // Note: Next.js middleware cannot hook into response completion, so we
  // decrement after a generous timeout to prevent permanent counter leaks.
  const decrementInFlight = () => {
    const count = inFlightMap.get(ip);
    if (count !== undefined) {
      if (count <= 1) {
        inFlightMap.delete(ip);
      } else {
        inFlightMap.set(ip, count - 1);
      }
    }
  };
  setTimeout(decrementInFlight, 3 * 60_000);

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
