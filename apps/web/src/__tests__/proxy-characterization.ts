import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProxyHandler = (request: NextRequest) => Response;

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  ip?: string;
}

function makeRequest(path: string, options: RequestOptions = {}): NextRequest {
  const request = new NextRequest(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers: options.headers,
  });
  if (options.ip) {
    Object.defineProperty(request, "ip", { configurable: true, value: options.ip });
  }
  return request;
}

function expectPassThrough(response: Response): void {
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

export function defineProxyCharacterizationSuite(name: string): void {
  describe(name, () => {
    let proxy: ProxyHandler;

    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("NEXT_PHASE", "");
      vi.stubEnv("INNOVATOR_API_KEY", "");
      vi.stubEnv("INNOVATOR_API_KEYS", "");
      vi.stubEnv("INNOVATOR_DEPLOYMENT_PROFILE", "");
      vi.stubEnv("GH_TOKEN", "");
      ({ proxy } = await import("../proxy"));
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    describe("non-API routes", () => {
      it("passes through non-API requests with CSP headers", () => {
        const response = proxy(makeRequest("/"));
        expectPassThrough(response);
        expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
      });

      it("returns a pass-through response when directly invoked for a static asset", () => {
        const response = proxy(makeRequest("/favicon.ico"));
        expectPassThrough(response);
      });
    });

    describe("body size enforcement", () => {
      it("rejects oversized request bodies with 413", async () => {
        const response = proxy(
          makeRequest("/api/investigate", {
            method: "POST",
            headers: { "content-length": String(200 * 1024) },
          })
        );
        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toMatchObject({ error: "Request body too large." });
      });

      it("allows request bodies under the size limit", () => {
        expectPassThrough(
          proxy(
            makeRequest("/api/investigate", {
              method: "POST",
              headers: { "content-length": "500" },
            })
          )
        );
      });
    });

    describe("Content-Length handling", () => {
      it.each(["POST", "PUT", "PATCH"])("allows %s without Content-Length", (method) => {
        expectPassThrough(proxy(makeRequest("/api/investigate", { method })));
      });

      it("allows GET without Content-Length", () => {
        expectPassThrough(proxy(makeRequest("/api/investigate")));
      });
    });

    describe("global rate limiting", () => {
      it("allows requests through the tenth request", () => {
        for (let index = 0; index < 10; index++) {
          expectPassThrough(
            proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "1.2.3.4" } }))
          );
        }
      });

      it("rejects the eleventh request with 429 and Retry-After", async () => {
        for (let index = 0; index < 10; index++) {
          proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "1.2.3.4" } }));
        }
        const response = proxy(
          makeRequest("/api/investigate", { headers: { "x-real-ip": "1.2.3.4" } })
        );
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBeTruthy();
        await expect(response.json()).resolves.toMatchObject({
          error: "Too many requests. Please try again later.",
        });
      });

      it("keeps limits isolated per IP", () => {
        for (let index = 0; index < 10; index++) {
          proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "1.1.1.1" } }));
        }
        expectPassThrough(
          proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "2.2.2.2" } }))
        );
      });
    });

    describe("route-specific rate limiting", () => {
      it("rejects the fourth /api/auto request", async () => {
        for (let index = 0; index < 3; index++) {
          expectPassThrough(
            proxy(makeRequest("/api/auto", { headers: { "x-real-ip": "3.3.3.3" } }))
          );
        }
        const response = proxy(makeRequest("/api/auto", { headers: { "x-real-ip": "3.3.3.3" } }));
        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({
          error: "Too many auto requests. Please try again later.",
        });
      });

      it("rejects the sixth /api/innovate request", async () => {
        for (let index = 0; index < 5; index++) {
          expectPassThrough(
            proxy(makeRequest("/api/innovate", { headers: { "x-real-ip": "4.4.4.4" } }))
          );
        }
        const response = proxy(
          makeRequest("/api/innovate", { headers: { "x-real-ip": "4.4.4.4" } })
        );
        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({
          error: "Too many innovate requests. Please try again later.",
        });
      });
    });

    describe("request concurrency", () => {
      it("does not maintain an in-flight concurrency counter", () => {
        const responses = Array.from({ length: 3 }, () =>
          proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "5.5.5.5" } }))
        );
        responses.forEach(expectPassThrough);
      });
    });

    describe("security headers", () => {
      it("includes security headers on error responses", () => {
        const response = proxy(
          makeRequest("/api/investigate", {
            method: "POST",
            headers: { "content-length": String(200 * 1024) },
          })
        );
        expect(response.headers.get("Content-Type")).toBe("application/json");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      });
    });

    describe("API key validation", () => {
      it("allows requests when no API key is configured", () => {
        expectPassThrough(proxy(makeRequest("/api/investigate")));
      });

      it("allows a request with the configured API key", async () => {
        vi.stubEnv("INNOVATOR_API_KEY", "secret-key-123");
        vi.resetModules();
        ({ proxy } = await import("../proxy"));
        expectPassThrough(
          proxy(
            makeRequest("/api/investigate", {
              headers: { "x-api-key": "secret-key-123" },
            })
          )
        );
      });

      it("rejects a wrong API key", async () => {
        vi.stubEnv("INNOVATOR_API_KEY", "secret-key-123");
        vi.resetModules();
        ({ proxy } = await import("../proxy"));
        const response = proxy(
          makeRequest("/api/investigate", { headers: { "x-api-key": "wrong-key" } })
        );
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: "Invalid API key" });
      });

      it("rejects a missing API key", async () => {
        vi.stubEnv("INNOVATOR_API_KEY", "secret-key-123");
        vi.resetModules();
        ({ proxy } = await import("../proxy"));
        expect(proxy(makeRequest("/api/investigate")).status).toBe(401);
      });
    });

    describe("CSP headers", () => {
      it("generates a nonce-based CSP header for non-API routes", () => {
        const response = proxy(makeRequest("/"));
        const csp = response.headers.get("Content-Security-Policy");
        expect(csp).toContain("script-src 'self' 'nonce-");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
      });

      it("forwards the generated nonce on the request headers", () => {
        const response = proxy(makeRequest("/"));
        expect(response.headers.get("x-middleware-override-headers")).toContain("x-nonce");
      });
    });

    describe("IP extraction", () => {
      it("falls back to the shared unknown bucket", () => {
        for (let index = 0; index < 10; index++) {
          proxy(makeRequest("/api/investigate"));
        }
        expect(proxy(makeRequest("/api/investigate")).status).toBe(429);
      });

      it("uses the first x-forwarded-for value", () => {
        for (let index = 0; index < 10; index++) {
          proxy(
            makeRequest("/api/investigate", {
              headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
            })
          );
        }
        expect(
          proxy(
            makeRequest("/api/investigate", {
              headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.99" },
            })
          ).status
        ).toBe(429);
        expectPassThrough(
          proxy(
            makeRequest("/api/investigate", {
              headers: { "x-forwarded-for": "10.0.0.99" },
            })
          )
        );
      });

      it("uses x-real-ip when x-forwarded-for is absent", () => {
        for (let index = 0; index < 10; index++) {
          proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "192.168.1.1" } }));
        }
        expect(
          proxy(makeRequest("/api/investigate", { headers: { "x-real-ip": "192.168.1.1" } })).status
        ).toBe(429);
      });

      it("prefers the platform IP over forwarded headers", () => {
        for (let index = 0; index < 10; index++) {
          proxy(
            makeRequest("/api/investigate", {
              ip: "172.16.0.1",
              headers: { "x-forwarded-for": "10.0.0.1" },
            })
          );
        }
        expect(
          proxy(
            makeRequest("/api/investigate", {
              ip: "172.16.0.1",
              headers: { "x-forwarded-for": "10.0.0.2" },
            })
          ).status
        ).toBe(429);
        expectPassThrough(
          proxy(
            makeRequest("/api/investigate", {
              headers: { "x-forwarded-for": "10.0.0.1" },
            })
          )
        );
      });
    });
  });
}
