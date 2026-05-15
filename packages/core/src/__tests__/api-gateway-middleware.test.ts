import { describe, it, expect, beforeEach } from "vitest";

import {
  checkSlidingWindow,
  clearSlidingWindows,
  authenticateRequest,
  checkRateLimits,
  validateRequestBody,
  getCorsHeaders,
  processGatewayRequest,
  recordGatewayCompletion,
} from "../api-gateway/middleware.js";
import { createApiKey, clearApiGateway } from "../api-gateway/index.js";

describe("api-gateway/middleware", () => {
  beforeEach(() => {
    clearApiGateway();
    clearSlidingWindows();
  });

  describe("checkSlidingWindow", () => {
    it("allows requests within the limit", () => {
      const result = checkSlidingWindow("test-key", 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("blocks requests exceeding the limit", () => {
      for (let i = 0; i < 5; i++) {
        checkSlidingWindow("test-key-2", 5, 60_000);
      }
      const result = checkSlidingWindow("test-key-2", 5, 60_000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("tracks separate keys independently", () => {
      for (let i = 0; i < 5; i++) {
        checkSlidingWindow("key-a", 5, 60_000);
      }
      const resultA = checkSlidingWindow("key-a", 5, 60_000);
      const resultB = checkSlidingWindow("key-b", 5, 60_000);
      expect(resultA.allowed).toBe(false);
      expect(resultB.allowed).toBe(true);
    });
  });

  describe("authenticateRequest", () => {
    it("rejects missing API key", () => {
      const result = authenticateRequest();
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain("Missing API key");
    });

    it("rejects invalid API key", () => {
      const result = authenticateRequest("invalid-key");
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain("Invalid");
    });

    it("rejects revoked API key", () => {
      const key = createApiKey("test", "free");
      key.enabled = false;
      const result = authenticateRequest(key.key);
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    it("accepts valid enabled API key", () => {
      const key = createApiKey("test", "pro");
      const result = authenticateRequest(key.key);
      expect(result.allowed).toBe(true);
      expect(result.apiKey?.id).toBe(key.id);
      expect(result.apiKey?.tier).toBe("pro");
    });

    it("accepts API key via query param", () => {
      const key = createApiKey("test", "free");
      const result = authenticateRequest(undefined, key.key);
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkRateLimits", () => {
    it("allows requests within tier limits", () => {
      const key = createApiKey("test", "pro");
      const result = checkRateLimits(key.id, "/investigate", "pro");
      expect(result.allowed).toBe(true);
      expect(result.headers?.["X-RateLimit-Limit"]).toBe("60");
    });

    it("applies correct limits per tier", () => {
      const freeKey = createApiKey("free-test", "free");
      const result = checkRateLimits(freeKey.id, "/investigate", "free");
      expect(result.headers?.["X-RateLimit-Limit"]).toBe("5");
    });
  });

  describe("validateRequestBody", () => {
    it("rejects null body", () => {
      const result = validateRequestBody("/investigate", null);
      expect(result.valid).toBe(false);
    });

    it("rejects non-object body", () => {
      const result = validateRequestBody("/investigate", "string");
      expect(result.valid).toBe(false);
    });

    it("rejects missing subject for investigation endpoints", () => {
      const result = validateRequestBody("/api/v1/investigate", { model: "gpt-4" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("subject");
    });

    it("accepts valid body with subject", () => {
      const result = validateRequestBody("/api/v1/investigate", { subject: "test" });
      expect(result.valid).toBe(true);
    });

    it("allows any body for non-subject endpoints", () => {
      const result = validateRequestBody("/api/v1/health", { anything: true });
      expect(result.valid).toBe(true);
    });
  });

  describe("getCorsHeaders", () => {
    it("returns wildcard origin by default", () => {
      const headers = getCorsHeaders("https://example.com");
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("returns empty for non-matching origin", () => {
      const headers = getCorsHeaders("https://evil.com", {
        allowedOrigins: ["https://good.com"],
        allowedMethods: ["GET"],
        allowedHeaders: ["Content-Type"],
        maxAge: 3600,
      });
      expect(headers).toEqual({});
    });

    it("returns matching origin when specified", () => {
      const headers = getCorsHeaders("https://good.com", {
        allowedOrigins: ["https://good.com"],
        allowedMethods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        maxAge: 3600,
      });
      expect(headers["Access-Control-Allow-Origin"]).toBe("https://good.com");
    });
  });

  describe("processGatewayRequest", () => {
    it("handles OPTIONS preflight", () => {
      const result = processGatewayRequest({
        method: "OPTIONS",
        path: "/api/v1/investigate",
        headers: { origin: "https://example.com" },
      });
      expect(result.allowed).toBe(true);
      expect(result.statusCode).toBe(204);
    });

    it("rejects unauthenticated requests", () => {
      const result = processGatewayRequest({
        method: "POST",
        path: "/api/v1/investigate",
        headers: {},
      });
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it("processes valid authenticated request", () => {
      const key = createApiKey("test", "pro");
      const result = processGatewayRequest({
        method: "POST",
        path: "/api/v1/investigate",
        headers: { "x-api-key": key.key },
        body: { subject: "test innovation" },
      });
      expect(result.allowed).toBe(true);
      expect(result.apiKey?.tier).toBe("pro");
    });

    it("rejects invalid body on POST", () => {
      const key = createApiKey("test", "pro");
      const result = processGatewayRequest({
        method: "POST",
        path: "/api/v1/investigate",
        headers: { "x-api-key": key.key },
        body: { noSubject: true },
      });
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(400);
    });
  });

  describe("recordGatewayCompletion", () => {
    it("records usage without throwing", () => {
      const key = createApiKey("test", "free");
      expect(() =>
        recordGatewayCompletion(key.id, "/investigate", Date.now() - 100, 200, 500)
      ).not.toThrow();
    });
  });
});
