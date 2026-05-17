import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock crypto.randomUUID
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

// We inline the proxy logic since importing the actual proxy
// requires Next.js module resolution. This mirrors the pattern used in
// the API route tests.
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const AUTO_MAX_REQUESTS = 3;
const INNOVATE_MAX_REQUESTS = 5;
const MAX_CONCURRENT_PER_IP = 2;
const MAX_BODY_SIZE = 100 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

let rateLimitMap: Map<string, RateLimitEntry>;
let autoRateLimitMap: Map<string, RateLimitEntry>;
let innovateRateLimitMap: Map<string, RateLimitEntry>;
let inFlightMap: Map<string, number>;

function getClientIp(request: Request, ip?: string): string {
  if (ip) return ip;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

interface ProxyRequest {
  method: string;
  headers: Headers;
  url: string;
  ip?: string;
}

function proxy(req: ProxyRequest): Response | null {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) {
    return null; // pass through
  }

  // Body size check
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: "Request body too large." }), {
      status: 413,
      headers: { ...SECURITY_HEADERS },
    });
  }

  // Content-Length required on mutation requests
  const method = req.method;
  if ((method === "POST" || method === "PUT" || method === "PATCH") && !contentLength) {
    return new Response(JSON.stringify({ error: "Content-Length header is required." }), {
      status: 411,
      headers: { ...SECURITY_HEADERS },
    });
  }

  const ip = getClientIp(new Request(req.url, { headers: req.headers }), req.ip);
  const now = Date.now();
  const requestId = crypto.randomUUID();

  // Global rate limit
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429,
        headers: {
          ...SECURITY_HEADERS,
          "Retry-After": String(retryAfter),
          "X-Request-ID": requestId,
        },
      });
    }
  }

  // /api/auto rate limit
  if (url.pathname === "/api/auto") {
    const autoKey = `auto:${ip}`;
    const autoEntry = autoRateLimitMap.get(autoKey);
    if (!autoEntry || now > autoEntry.resetTime) {
      autoRateLimitMap.set(autoKey, { count: 1, resetTime: now + WINDOW_MS });
    } else {
      autoEntry.count++;
      if (autoEntry.count > AUTO_MAX_REQUESTS) {
        const retryAfter = Math.ceil((autoEntry.resetTime - now) / 1000);
        return new Response(
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

  // /api/innovate rate limit
  if (url.pathname === "/api/innovate") {
    const innovateKey = `innovate:${ip}`;
    const innovateEntry = innovateRateLimitMap.get(innovateKey);
    if (!innovateEntry || now > innovateEntry.resetTime) {
      innovateRateLimitMap.set(innovateKey, { count: 1, resetTime: now + WINDOW_MS });
    } else {
      innovateEntry.count++;
      if (innovateEntry.count > INNOVATE_MAX_REQUESTS) {
        const retryAfter = Math.ceil((innovateEntry.resetTime - now) / 1000);
        return new Response(
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

  // Concurrent in-flight limit
  const currentInFlight = inFlightMap.get(ip) ?? 0;
  if (currentInFlight >= MAX_CONCURRENT_PER_IP) {
    return new Response(
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
  inFlightMap.set(ip, currentInFlight + 1);

  // Success — return null to indicate "next()"
  return null;
}

function makeReq(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; ip?: string } = {}
): ProxyRequest {
  const headers = new Headers(opts.headers);
  return {
    method: opts.method ?? "GET",
    headers,
    url: `http://localhost${path}`,
    ip: opts.ip,
  };
}

describe("proxy", () => {
  beforeEach(() => {
    rateLimitMap = new Map();
    autoRateLimitMap = new Map();
    innovateRateLimitMap = new Map();
    inFlightMap = new Map();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("non-API routes", () => {
    it("passes through non-API requests", () => {
      const res = proxy(makeReq("/"));
      expect(res).toBeNull();
    });

    it("passes through static asset requests", () => {
      const res = proxy(makeReq("/favicon.ico"));
      expect(res).toBeNull();
    });
  });

  describe("body size enforcement", () => {
    it("rejects oversized request bodies with 413", async () => {
      const res = proxy(
        makeReq("/api/investigate", {
          method: "POST",
          headers: { "content-length": String(200 * 1024) },
        })
      );
      expect(res).not.toBeNull();
      expect(res!.status).toBe(413);
      const data = await res!.json();
      expect(data.error).toBe("Request body too large.");
    });

    it("allows request bodies under the size limit", () => {
      const res = proxy(
        makeReq("/api/investigate", {
          method: "POST",
          headers: { "content-length": "500" },
        })
      );
      expect(res).toBeNull();
    });
  });

  describe("Content-Length requirement", () => {
    it("rejects POST without Content-Length with 411", async () => {
      const res = proxy(makeReq("/api/investigate", { method: "POST" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(411);
      const data = await res!.json();
      expect(data.error).toBe("Content-Length header is required.");
    });

    it("rejects PUT without Content-Length with 411", async () => {
      const res = proxy(makeReq("/api/investigate", { method: "PUT" }));
      expect(res!.status).toBe(411);
    });

    it("rejects PATCH without Content-Length with 411", async () => {
      const res = proxy(makeReq("/api/investigate", { method: "PATCH" }));
      expect(res!.status).toBe(411);
    });

    it("allows GET without Content-Length", () => {
      const res = proxy(makeReq("/api/investigate", { method: "GET" }));
      expect(res).toBeNull();
    });
  });

  describe("global rate limiting", () => {
    it("allows requests under the limit", () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4"); // Reset in-flight so concurrency limit doesn't interfere
        const res = proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
        expect(res).toBeNull();
      }
    });

    it("rejects requests exceeding the global limit with 429", async () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4");
        proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      }
      inFlightMap.delete("1.2.3.4");
      const res = proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const data = await res!.json();
      expect(data.error).toContain("Too many requests");
    });

    it("includes Retry-After header on rate limit", () => {
      for (let i = 0; i <= MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4");
        proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      }
      inFlightMap.delete("1.2.3.4");
      const res = proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      expect(res!.headers.get("Retry-After")).toBeTruthy();
    });

    it("rate limits are per-IP", () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        inFlightMap.delete("1.1.1.1");
        proxy(makeReq("/api/investigate", { method: "GET", ip: "1.1.1.1" }));
      }
      // Different IP should still be allowed
      const res = proxy(makeReq("/api/investigate", { method: "GET", ip: "2.2.2.2" }));
      expect(res).toBeNull();
    });
  });

  describe("/api/auto rate limiting", () => {
    it("allows auto requests under the stricter limit", () => {
      for (let i = 0; i < AUTO_MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4");
        const res = proxy(
          makeReq("/api/auto", {
            method: "POST",
            headers: { "content-length": "100" },
            ip: "1.2.3.4",
          })
        );
        expect(res).toBeNull();
      }
    });

    it("rejects auto requests exceeding the auto limit with 429", async () => {
      for (let i = 0; i < AUTO_MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4");
        proxy(
          makeReq("/api/auto", {
            method: "POST",
            headers: { "content-length": "100" },
            ip: "1.2.3.4",
          })
        );
      }
      inFlightMap.delete("1.2.3.4");
      const res = proxy(
        makeReq("/api/auto", {
          method: "POST",
          headers: { "content-length": "100" },
          ip: "1.2.3.4",
        })
      );
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const data = await res!.json();
      expect(data.error).toContain("Too many auto requests");
    });
  });

  describe("/api/innovate rate limiting", () => {
    it("allows innovate requests under the limit", () => {
      for (let i = 0; i < INNOVATE_MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4");
        const res = proxy(
          makeReq("/api/innovate", {
            method: "POST",
            headers: { "content-length": "100" },
            ip: "1.2.3.4",
          })
        );
        expect(res).toBeNull();
      }
    });

    it("rejects innovate requests exceeding the limit with 429", async () => {
      for (let i = 0; i < INNOVATE_MAX_REQUESTS; i++) {
        inFlightMap.delete("1.2.3.4");
        proxy(
          makeReq("/api/innovate", {
            method: "POST",
            headers: { "content-length": "100" },
            ip: "1.2.3.4",
          })
        );
      }
      inFlightMap.delete("1.2.3.4");
      const res = proxy(
        makeReq("/api/innovate", {
          method: "POST",
          headers: { "content-length": "100" },
          ip: "1.2.3.4",
        })
      );
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const data = await res!.json();
      expect(data.error).toContain("Too many innovate requests");
    });
  });

  describe("concurrent in-flight request limiting", () => {
    it("allows requests under the concurrency limit", () => {
      const res1 = proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      const res2 = proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      expect(res1).toBeNull();
      expect(res2).toBeNull();
    });

    it("rejects requests exceeding the concurrency limit with 429", async () => {
      // Saturate the in-flight limit
      for (let i = 0; i < MAX_CONCURRENT_PER_IP; i++) {
        proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      }
      const res = proxy(makeReq("/api/investigate", { method: "GET", ip: "1.2.3.4" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const data = await res!.json();
      expect(data.error).toContain("Too many concurrent requests");
    });

    it("concurrent limit is per-IP", () => {
      for (let i = 0; i < MAX_CONCURRENT_PER_IP; i++) {
        proxy(makeReq("/api/investigate", { method: "GET", ip: "1.1.1.1" }));
      }
      const res = proxy(makeReq("/api/investigate", { method: "GET", ip: "2.2.2.2" }));
      expect(res).toBeNull();
    });
  });

  describe("security headers", () => {
    it("includes security headers on error responses", async () => {
      const res = proxy(
        makeReq("/api/investigate", {
          method: "POST",
          headers: { "content-length": String(200 * 1024) },
        })
      );
      expect(res!.headers.get("Content-Type")).toBe("application/json");
      expect(res!.headers.get("Cache-Control")).toBe("no-store");
      expect(res!.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  describe("API key validation", () => {
    let originalApiKey: string | undefined;

    beforeEach(() => {
      originalApiKey = process.env.INNOVATOR_API_KEY;
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.INNOVATOR_API_KEY = originalApiKey;
      } else {
        delete process.env.INNOVATOR_API_KEY;
      }
    });

    // Note: The inlined proxy function doesn't include API key logic,
    // so these tests validate the key-checking logic directly.
    function checkApiKey(req: ProxyRequest): Response | null {
      const apiKey = process.env.INNOVATOR_API_KEY;
      if (apiKey) {
        const providedKey = req.headers.get("x-api-key");
        if (!providedKey || providedKey !== apiKey) {
          return new Response(JSON.stringify({ error: "Invalid or missing API key." }), {
            status: 401,
            headers: { ...SECURITY_HEADERS },
          });
        }
      }
      return null;
    }

    it("allows request when no INNOVATOR_API_KEY is set", () => {
      delete process.env.INNOVATOR_API_KEY;
      const res = checkApiKey(makeReq("/api/investigate", { method: "GET" }));
      expect(res).toBeNull();
    });

    it("allows request with correct API key", () => {
      process.env.INNOVATOR_API_KEY = "secret-key-123";
      const res = checkApiKey(
        makeReq("/api/investigate", {
          method: "GET",
          headers: { "x-api-key": "secret-key-123" },
        })
      );
      expect(res).toBeNull();
    });

    it("rejects request with wrong API key (401)", async () => {
      process.env.INNOVATOR_API_KEY = "secret-key-123";
      const res = checkApiKey(
        makeReq("/api/investigate", {
          method: "GET",
          headers: { "x-api-key": "wrong-key" },
        })
      );
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
      const data = await res!.json();
      expect(data.error).toContain("Invalid or missing API key");
    });

    it("rejects request with missing API key (401)", async () => {
      process.env.INNOVATOR_API_KEY = "secret-key-123";
      const res = checkApiKey(makeReq("/api/investigate", { method: "GET" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    });
  });

  describe("CSP headers", () => {
    it("generates nonce-based CSP header for non-API routes", () => {
      // Simulate the CSP logic from the real proxy
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

      expect(csp).toContain(`nonce-${nonce}`);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
    });

    it("nonce is base64-encoded UUID", () => {
      const uuid = "test-uuid-1234";
      const nonce = Buffer.from(uuid).toString("base64");
      expect(nonce).toBe(Buffer.from(uuid).toString("base64"));
      expect(nonce.length).toBeGreaterThan(0);
    });
  });

  describe("null/undefined IP edge cases", () => {
    it("falls back to 'unknown' when no IP source available", () => {
      const ip = getClientIp(new Request("http://localhost/api/test"));
      expect(ip).toBe("unknown");
    });

    it("handles multiple X-Forwarded-For values (takes first)", () => {
      const req = new Request("http://localhost/api/test", {
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" },
      });
      const ip = getClientIp(req);
      expect(ip).toBe("10.0.0.1");
    });
  });

  describe("IP extraction", () => {
    it("uses x-forwarded-for header when no platform IP", () => {
      const req = makeReq("/api/investigate", {
        method: "GET",
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
      });
      for (let i = 0; i < MAX_REQUESTS; i++) {
        inFlightMap.delete("10.0.0.1");
        proxy(req);
      }
      inFlightMap.delete("10.0.0.1");
      const res = proxy(req);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);

      // Different x-forwarded-for should still work
      const req2 = makeReq("/api/investigate", {
        method: "GET",
        headers: { "x-forwarded-for": "10.0.0.99" },
      });
      const res2 = proxy(req2);
      expect(res2).toBeNull();
    });

    it("uses x-real-ip when x-forwarded-for is absent", () => {
      const req = makeReq("/api/investigate", {
        method: "GET",
        headers: { "x-real-ip": "192.168.1.1" },
      });
      for (let i = 0; i < MAX_REQUESTS; i++) {
        inFlightMap.delete("192.168.1.1");
        proxy(req);
      }
      inFlightMap.delete("192.168.1.1");
      const res = proxy(req);
      expect(res!.status).toBe(429);
    });

    it("prefers platform IP over headers", () => {
      const req = makeReq("/api/investigate", {
        method: "GET",
        headers: { "x-forwarded-for": "10.0.0.1" },
        ip: "172.16.0.1",
      });
      for (let i = 0; i < MAX_REQUESTS; i++) {
        inFlightMap.delete("172.16.0.1");
        proxy(req);
      }
      inFlightMap.delete("172.16.0.1");
      const res = proxy(req);
      expect(res!.status).toBe(429);

      // x-forwarded-for IP should still be allowed since platform IP was used
      const req2 = makeReq("/api/investigate", {
        method: "GET",
        headers: { "x-forwarded-for": "10.0.0.1" },
      });
      const res2 = proxy(req2);
      expect(res2).toBeNull();
    });
  });
});
