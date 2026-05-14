import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock crypto.randomUUID
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

// Capture setTimeout calls and invoke them immediately so the inflight counter
// decrements synchronously. This prevents the concurrent-request cap from
// interfering with rate-limit accumulation tests.
const timeoutCallbacks: Array<() => void> = [];
vi.stubGlobal("setTimeout", (fn: () => void, _ms?: number) => {
  timeoutCallbacks.push(fn);
  return timeoutCallbacks.length;
});

function flushTimeouts() {
  while (timeoutCallbacks.length > 0) {
    timeoutCallbacks.shift()!();
  }
}

// Mock next/server
const mockNextResponseNext = vi.fn();
const mockNextResponseConstructor = vi.fn();

vi.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    headers: Map<string, string>;
    body: string;
    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      mockNextResponseConstructor(body, init);
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static next(opts?: unknown) {
      mockNextResponseNext(opts);
      const resp = new MockNextResponse("", { status: 200 });
      return resp;
    }
    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new MockNextResponse(JSON.stringify(data), init);
    }
  }
  return {
    NextResponse: MockNextResponse,
  };
});

import { middleware, setMeteringKeyTier } from "../middleware";

function makeRequest(
  path: string,
  opts?: { method?: string; ip?: string; headers?: Record<string, string> }
) {
  const headersMap = new Map(Object.entries(opts?.headers ?? {}));
  return {
    nextUrl: { pathname: path },
    method: opts?.method ?? "GET",
    headers: {
      get: (k: string) => headersMap.get(k) ?? null,
      // Support iteration for Object.fromEntries() in CSP path
      [Symbol.iterator]: () => headersMap.entries(),
    },
    ip: opts?.ip,
  };
}

describe("middleware rate-limit edge cases", () => {
  beforeEach(() => {
    timeoutCallbacks.length = 0;
    mockNextResponseNext.mockClear();
    mockNextResponseConstructor.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("checkRouteRateLimit behavior", () => {
    it("allows first 10 requests then returns 429 on the 11th", () => {
      const ip = "10.0.1.1";
      for (let i = 0; i < 10; i++) {
        const res = middleware(makeRequest("/api/test", { ip }) as never);
        expect(res.status).toBe(200);
        flushTimeouts(); // clear inflight counter
      }
      const res = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res.status).toBe(429);
      expect(res.body).toContain("Too many requests");
    });
  });

  describe("per-route rate limits", () => {
    it("/api/auto returns 429 after 3 requests", () => {
      const ip = "10.0.2.1";
      for (let i = 0; i < 3; i++) {
        const res = middleware(
          makeRequest("/api/auto", {
            ip,
            method: "POST",
            headers: { "content-length": "50" },
          }) as never
        );
        expect(res.status).toBe(200);
        flushTimeouts();
      }
      const res = middleware(
        makeRequest("/api/auto", {
          ip,
          method: "POST",
          headers: { "content-length": "50" },
        }) as never
      );
      expect(res.status).toBe(429);
      expect(res.body).toContain("Too many auto requests");
    });

    it("/api/innovate returns 429 after 5 requests", () => {
      const ip = "10.0.2.2";
      for (let i = 0; i < 5; i++) {
        const res = middleware(
          makeRequest("/api/innovate", {
            ip,
            method: "POST",
            headers: { "content-length": "50" },
          }) as never
        );
        expect(res.status).toBe(200);
        flushTimeouts();
      }
      const res = middleware(
        makeRequest("/api/innovate", {
          ip,
          method: "POST",
          headers: { "content-length": "50" },
        }) as never
      );
      expect(res.status).toBe(429);
      expect(res.body).toContain("Too many innovate requests");
    });
  });

  describe("daily quota per tier", () => {
    it("returns 429 with 'Daily API quota exceeded' after free tier daily limit", () => {
      vi.stubEnv("INNOVATOR_API_KEY", "test-key");
      setMeteringKeyTier("key-0", "free");

      // Free tier daily limit is 100; send 101 requests
      // Use unique IPs per request to avoid global rate limit
      for (let i = 0; i < 101; i++) {
        const batchIp = `10.3.${Math.floor(i / 250)}.${i % 250}`;
        const res = middleware(
          makeRequest("/api/test", {
            ip: batchIp,
            headers: { "x-api-key": "test-key" },
          }) as never
        );
        flushTimeouts();
        if (i === 100) {
          expect(res.status).toBe(429);
          expect(res.body).toContain("Daily API quota exceeded");
        }
      }
    });
  });

  describe("concurrent request cap", () => {
    it("returns 429 on 3rd concurrent request from same IP", () => {
      const ip = "10.0.4.1";
      // Don't flush timeouts - keep inflight counters active
      const res1 = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res1.status).toBe(200);
      const res2 = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res2.status).toBe(200);
      const res3 = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res3.status).toBe(429);
      expect(res3.body).toContain("Too many concurrent requests");
    });

    it("releases in-flight slots after timeout callback fires", () => {
      const ip = "10.0.4.2";
      middleware(makeRequest("/api/test", { ip }) as never);
      middleware(makeRequest("/api/test", { ip }) as never);

      // Flush timeouts to simulate inflight timeout callback
      flushTimeouts();

      const res = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res.status).toBe(200);
    });
  });

  describe("body size limit", () => {
    it("returns 413 when content-length exceeds 100KB", () => {
      const ip = "10.0.5.1";
      const res = middleware(
        makeRequest("/api/test", {
          ip,
          method: "POST",
          headers: { "content-length": String(100 * 1024 + 1) },
        }) as never
      );
      expect(res.status).toBe(413);
      expect(res.body).toContain("Request body too large");
    });

    it("allows content-length exactly at 100KB", () => {
      const ip = "10.0.5.2";
      const res = middleware(
        makeRequest("/api/test", {
          ip,
          method: "POST",
          headers: { "content-length": String(100 * 1024) },
        }) as never
      );
      expect(res.status).toBe(200);
    });
  });

  describe("Content-Length required", () => {
    it("returns 411 for POST without content-length", () => {
      const ip = "10.0.6.1";
      const res = middleware(makeRequest("/api/test", { ip, method: "POST" }) as never);
      expect(res.status).toBe(411);
      expect(res.body).toContain("Content-Length header is required");
    });

    it("returns 411 for PUT without content-length", () => {
      const ip = "10.0.6.2";
      const res = middleware(makeRequest("/api/test", { ip, method: "PUT" }) as never);
      expect(res.status).toBe(411);
    });

    it("returns 411 for PATCH without content-length", () => {
      const ip = "10.0.6.3";
      const res = middleware(makeRequest("/api/test", { ip, method: "PATCH" }) as never);
      expect(res.status).toBe(411);
    });

    it("allows GET without content-length", () => {
      const ip = "10.0.6.4";
      const res = middleware(makeRequest("/api/test", { ip, method: "GET" }) as never);
      expect(res.status).toBe(200);
    });
  });

  describe("CSP headers for non-API routes", () => {
    it("sets Content-Security-Policy on non-API routes", () => {
      const res = middleware(makeRequest("/", {}) as never);
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      const csp = res.headers.get("Content-Security-Policy")!;
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("nonce-");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it("does not set CSP on API routes", () => {
      const ip = "10.0.7.1";
      const res = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res.headers.has("Content-Security-Policy")).toBe(false);
    });
  });

  describe("IP extraction fallback", () => {
    it("uses platform ip when available", () => {
      const ip = "10.0.8.1";
      for (let i = 0; i < 11; i++) {
        middleware(makeRequest("/api/test", { ip }) as never);
        flushTimeouts();
      }
      const res = middleware(makeRequest("/api/test", { ip: "10.0.8.2" }) as never);
      expect(res.status).toBe(200);
    });

    it("falls back to x-forwarded-for when no platform ip", () => {
      const fwdIp = "10.0.8.3";
      for (let i = 0; i < 11; i++) {
        middleware(
          makeRequest("/api/test", {
            headers: { "x-forwarded-for": `${fwdIp}, 10.0.0.2` },
          }) as never
        );
        flushTimeouts();
      }
      const res = middleware(
        makeRequest("/api/test", {
          headers: { "x-forwarded-for": `${fwdIp}` },
        }) as never
      );
      expect(res.status).toBe(429);
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", () => {
      const realIp = "10.0.8.4";
      for (let i = 0; i < 11; i++) {
        middleware(
          makeRequest("/api/test", {
            headers: { "x-real-ip": realIp },
          }) as never
        );
        flushTimeouts();
      }
      const res = middleware(
        makeRequest("/api/test", {
          headers: { "x-real-ip": realIp },
        }) as never
      );
      expect(res.status).toBe(429);
    });

    it("falls back to 'unknown' when no IP source is available", () => {
      // First request with no IP info should succeed
      const res = middleware(makeRequest("/api/test") as never);
      expect(res.status).toBe(200);
    });
  });

  describe("API key authentication", () => {
    it("returns 401 when INNOVATOR_API_KEY is set but no x-api-key header provided", () => {
      vi.stubEnv("INNOVATOR_API_KEY", "secret-key");
      const ip = "10.0.9.1";
      const res = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res.status).toBe(401);
      expect(res.body).toContain("Invalid or missing API key");
    });

    it("returns 401 when x-api-key does not match", () => {
      vi.stubEnv("INNOVATOR_API_KEY", "secret-key");
      const ip = "10.0.9.2";
      const res = middleware(
        makeRequest("/api/test", {
          ip,
          headers: { "x-api-key": "wrong-key" },
        }) as never
      );
      expect(res.status).toBe(401);
    });

    it("does not return 401 with correct x-api-key", () => {
      vi.stubEnv("INNOVATOR_API_KEY", "auth-only-key");
      const ip = "192.168.99.1";
      const res = middleware(
        makeRequest("/api/test", {
          ip,
          headers: { "x-api-key": "auth-only-key" },
        }) as never
      );
      // Auth succeeds (no 401); may hit rate limit from metering state
      expect(res.status).not.toBe(401);
    });

    it("allows request when INNOVATOR_API_KEY is not set", () => {
      vi.stubEnv("INNOVATOR_API_KEY", "");
      const ip = "10.0.9.4";
      const res = middleware(makeRequest("/api/test", { ip }) as never);
      expect(res.status).toBe(200);
    });
  });
});
