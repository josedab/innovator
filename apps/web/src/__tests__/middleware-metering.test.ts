import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProxyModule = typeof import("../proxy");

function makeRequest(
  path = "/api/test",
  {
    method = "GET",
    headers = {},
    ip,
  }: {
    method?: string;
    headers?: Record<string, string>;
    ip?: string;
  } = {}
): NextRequest {
  const request = new NextRequest(`http://localhost${path}`, { method, headers });
  if (ip) {
    Object.defineProperty(request, "ip", { configurable: true, value: ip });
  }
  return request;
}

describe("middleware metering system", () => {
  let proxyModule: ProxyModule;
  let requestSequence: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T00:00:00.000Z"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("INNOVATOR_API_KEY", "");
    vi.stubEnv("INNOVATOR_API_KEYS", "");
    proxyModule = await import("../proxy");
    requestSequence = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function invoke(
    path = "/api/test",
    options: { method?: string; headers?: Record<string, string>; ip?: string } = {}
  ): Response {
    requestSequence++;
    return proxyModule.proxy(
      makeRequest(path, {
        ...options,
        ip: options.ip ?? `192.0.2.${requestSequence}`,
      })
    );
  }

  describe("setMeteringKeyTier", () => {
    it("sets the free tier burst limit to 10 requests per minute", () => {
      proxyModule.setMeteringKeyTier("anonymous", "free");
      for (let index = 0; index < 9; index++) {
        expect(invoke().status).toBe(200);
      }
      const response = invoke();
      expect(response.status).toBe(429);
      expect(response.headers.get("X-Quota-Exceeded")).toBe("burst");
    });

    it("sets the pro tier burst limit to 60 requests per minute", () => {
      proxyModule.setMeteringKeyTier("anonymous", "pro");
      for (let index = 0; index < 59; index++) {
        expect(invoke().status).toBe(200);
      }
      const response = invoke();
      expect(response.status).toBe(429);
      expect(response.headers.get("X-Quota-Exceeded")).toBe("burst");
    });

    it("sets the enterprise tier burst limit to 200 requests per minute", () => {
      proxyModule.setMeteringKeyTier("anonymous", "enterprise");
      for (let index = 0; index < 199; index++) {
        expect(invoke().status).toBe(200);
      }
      const response = invoke();
      expect(response.status).toBe(429);
      expect(response.headers.get("X-Quota-Exceeded")).toBe("burst");
    });

    it("updates an existing key from free to pro", () => {
      proxyModule.setMeteringKeyTier("anonymous", "free");
      for (let index = 0; index < 10; index++) invoke();
      expect(invoke().status).toBe(429);

      proxyModule.setMeteringKeyTier("anonymous", "pro");
      expect(invoke().status).toBe(200);
    });

    it("replaces enterprise limits when transitioning to free", () => {
      proxyModule.setMeteringKeyTier("anonymous", "enterprise");
      for (let index = 0; index < 9; index++) invoke();
      proxyModule.setMeteringKeyTier("anonymous", "free");
      const response = invoke();
      expect(response.status).toBe(429);
      expect(response.headers.get("X-Quota-Exceeded")).toBe("burst");
    });
  });

  describe("quota enforcement", () => {
    it("does not enforce a tier when none is set", () => {
      for (let index = 0; index < 200; index++) {
        expect(invoke().status).toBe(200);
      }
    });

    it("free tier blocks the 100th request in one UTC day", () => {
      proxyModule.setMeteringKeyTier("anonymous", "free");
      for (let index = 0; index < 99; index++) {
        vi.setSystemTime(new Date(Date.UTC(2025, 0, 15, 0, index * 2)));
        expect(invoke().status).toBe(200);
      }
      vi.setSystemTime(new Date("2025-01-15T03:20:00.000Z"));
      const response = invoke();
      expect(response.status).toBe(429);
      expect(response.headers.get("X-Quota-Exceeded")).toBe("daily");
    });

    it("free tier allows 99 requests in one UTC day", () => {
      proxyModule.setMeteringKeyTier("anonymous", "free");
      for (let index = 0; index < 99; index++) {
        vi.setSystemTime(new Date(Date.UTC(2025, 0, 15, 0, index * 2)));
        expect(invoke().status).toBe(200);
      }
    });

    it("pro tier allows 100 requests in one UTC day", () => {
      proxyModule.setMeteringKeyTier("anonymous", "pro");
      for (let index = 0; index < 100; index++) {
        vi.setSystemTime(new Date(Date.UTC(2025, 0, 15, 0, index * 2)));
        expect(invoke().status).toBe(200);
      }
    });

    it("enterprise tier has no daily cap", () => {
      proxyModule.setMeteringKeyTier("anonymous", "enterprise");
      for (let index = 0; index < 500; index++) {
        vi.setSystemTime(new Date(Date.UTC(2025, 0, 15, 0, index * 2)));
        expect(invoke().status).toBe(200);
      }
    });

    it("keeps quota counts isolated per API key", () => {
      vi.stubEnv("INNOVATOR_API_KEYS", "first-key,second-key");
      proxyModule.setMeteringKeyTier("key-0", "free");
      proxyModule.setMeteringKeyTier("key-1", "free");

      for (let index = 0; index < 10; index++) {
        invoke("/api/test", { headers: { "x-api-key": "first-key" } });
      }
      expect(invoke("/api/test", { headers: { "x-api-key": "first-key" } }).status).toBe(429);
      expect(invoke("/api/test", { headers: { "x-api-key": "second-key" } }).status).toBe(200);
    });

    it("resets daily quota at UTC midnight", () => {
      proxyModule.setMeteringKeyTier("anonymous", "free");
      for (let index = 0; index < 100; index++) {
        vi.setSystemTime(new Date(Date.UTC(2025, 0, 14, 0, index * 2)));
        invoke();
      }
      vi.setSystemTime(new Date("2025-01-15T00:00:00.000Z"));
      expect(invoke().status).toBe(200);
    });
  });

  describe("getMeteringLog", () => {
    it("returns an empty array initially", () => {
      expect(proxyModule.getMeteringLog()).toEqual([]);
    });

    it("records authenticated API requests accurately", () => {
      invoke("/api/test", { method: "POST" });
      expect(proxyModule.getMeteringLog()).toEqual([
        {
          keyId: "anonymous",
          route: "/api/test",
          method: "POST",
          timestamp: Date.parse("2025-01-15T00:00:00.000Z"),
        },
      ]);
    });

    it("preserves insertion order", () => {
      invoke("/api/a", { method: "GET" });
      invoke("/api/b", { method: "POST" });
      expect(proxyModule.getMeteringLog().map(({ route }) => route)).toEqual(["/api/a", "/api/b"]);
    });

    it("trims oldest entries when the log exceeds 50,000 entries", () => {
      const log = proxyModule.getMeteringLog();
      for (let index = 0; index < 50_000; index++) {
        log.push({
          keyId: "old-key",
          route: `/api/${index}`,
          method: "GET",
          timestamp: index,
        });
      }
      invoke("/api/new");
      expect(log).toHaveLength(50_000);
      expect(log[0].route).toBe("/api/1");
      expect(log.at(-1)?.route).toBe("/api/new");
    });
  });

  describe("request concurrency", () => {
    it("does not enforce the copied in-flight request cap", () => {
      const responses = Array.from({ length: 3 }, () =>
        invoke("/api/investigate", { ip: "198.51.100.1" })
      );
      expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
    });
  });

  describe("IP extraction chain", () => {
    it("prefers platform IP over forwarded headers", () => {
      for (let index = 0; index < 10; index++) {
        invoke("/api/investigate", {
          ip: "172.16.0.1",
          headers: { "x-forwarded-for": "10.0.0.1", "x-real-ip": "10.0.0.2" },
        });
      }
      expect(
        invoke("/api/investigate", {
          ip: "172.16.0.1",
          headers: { "x-forwarded-for": "10.0.0.99" },
        }).status
      ).toBe(429);
    });

    it("uses the first x-forwarded-for entry", () => {
      for (let index = 0; index < 10; index++) {
        invoke("/api/investigate", {
          ip: "",
          headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
        });
      }
      expect(
        invoke("/api/investigate", {
          ip: "",
          headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.99" },
        }).status
      ).toBe(429);
    });

    it("falls back to x-real-ip", () => {
      for (let index = 0; index < 10; index++) {
        invoke("/api/investigate", {
          ip: "",
          headers: { "x-real-ip": "192.168.1.1" },
        });
      }
      expect(
        invoke("/api/investigate", {
          ip: "",
          headers: { "x-real-ip": "192.168.1.1" },
        }).status
      ).toBe(429);
    });

    it("uses the unknown bucket when no IP source is available", () => {
      for (let index = 0; index < 10; index++) {
        proxyModule.proxy(makeRequest("/api/investigate"));
      }
      expect(proxyModule.proxy(makeRequest("/api/investigate")).status).toBe(429);
    });
  });

  describe("rate limit expiry", () => {
    it("allows an IP again after the one-minute window", () => {
      for (let index = 0; index < 10; index++) {
        invoke("/api/investigate", { ip: "203.0.113.1" });
      }
      expect(invoke("/api/investigate", { ip: "203.0.113.1" }).status).toBe(429);
      vi.advanceTimersByTime(60_001);
      expect(invoke("/api/investigate", { ip: "203.0.113.1" }).status).toBe(200);
    });
  });
});
