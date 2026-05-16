import { describe, it, expect } from "vitest";

import {
  createApiClient,
  generateApiKey,
  validateApiKey,
  generateSessionToken,
  validateSessionToken,
  recordUsage,
  getUsageSummary,
  getApiPricing,
  PricingTierSchema,
} from "../index.js";

describe("api-economy", () => {
  describe("getApiPricing", () => {
    it("returns 4 pricing tiers", () => {
      const tiers = getApiPricing();
      expect(tiers).toHaveLength(4);
    });

    it("all tiers have valid schemas", () => {
      const tiers = getApiPricing();
      for (const t of tiers) {
        expect(() => PricingTierSchema.parse(t)).not.toThrow();
      }
    });

    it("tiers are ordered by price", () => {
      const tiers = getApiPricing();
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].monthlyPrice).toBeGreaterThanOrEqual(tiers[i - 1].monthlyPrice);
      }
    });

    it("higher tiers include more endpoints", () => {
      const tiers = getApiPricing();
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].endpoints.length).toBeGreaterThanOrEqual(tiers[i - 1].endpoints.length);
      }
    });
  });

  describe("createApiClient", () => {
    it("creates a client with a free tier and API key", () => {
      const { client, rawKey } = createApiClient("Test App", "test@example.com");
      expect(client.name).toBe("Test App");
      expect(client.tier).toBe("free");
      expect(client.status).toBe("active");
      expect(rawKey).toMatch(/^inno_/);
      expect(client.apiKeyIds).toHaveLength(1);
    });

    it("creates a client with specified tier", () => {
      const { client } = createApiClient("Pro App", "pro@example.com", { tier: "pro" });
      expect(client.tier).toBe("pro");
    });
  });

  describe("generateApiKey", () => {
    it("generates an additional key", () => {
      const { client } = createApiClient("Key Test", "key@example.com");
      const { key, rawKey } = generateApiKey(client.id);
      expect(key.clientId).toBe(client.id);
      expect(rawKey).toMatch(/^inno_/);
      expect(key.status).toBe("active");
    });

    it("throws for non-existent client", () => {
      expect(() => generateApiKey("fake-id")).toThrow();
    });
  });

  describe("recordUsage", () => {
    it("records a usage event", () => {
      const { client } = createApiClient("Usage Test", "usage@example.com");
      const record = recordUsage({
        clientId: client.id,
        apiKeyId: client.apiKeyIds[0],
        endpoint: "/investigate",
        method: "POST",
        statusCode: 200,
        latencyMs: 150,
        tokensConsumed: 500,
      });
      expect(record.clientId).toBe(client.id);
      expect(record.timestamp).toBeDefined();
    });
  });

  describe("getUsageSummary", () => {
    it("returns usage summary for a client", () => {
      const { client } = createApiClient("Summary Test", "summary@example.com");
      recordUsage({
        clientId: client.id,
        apiKeyId: client.apiKeyIds[0],
        endpoint: "/investigate",
        method: "POST",
        statusCode: 200,
        latencyMs: 100,
        tokensConsumed: 300,
      });
      recordUsage({
        clientId: client.id,
        apiKeyId: client.apiKeyIds[0],
        endpoint: "/score",
        method: "POST",
        statusCode: 500,
        latencyMs: 50,
      });

      const summary = getUsageSummary(client.id);
      expect(summary.totalRequests).toBe(2);
      expect(summary.successfulRequests).toBe(1);
      expect(summary.failedRequests).toBe(1);
      expect(summary.byEndpoint["/investigate"]).toBeDefined();
    });

    it("throws for non-existent client", () => {
      expect(() => getUsageSummary("fake-id")).toThrow();
    });
  });

  describe("validateApiKey", () => {
    it("validates a correct API key", () => {
      const { client, rawKey } = createApiClient("Validate Test", "validate@example.com");
      const result = validateApiKey(rawKey, "/investigate");
      expect(result.client.id).toBe(client.id);
      expect(result.remaining.minute).toBeGreaterThan(0);
      expect(result.remaining.daily).toBeGreaterThan(0);
    });

    it("rejects invalid API key", () => {
      expect(() => validateApiKey("inno_fakekeyvalue", "/investigate")).toThrow("Invalid API key");
    });

    it("rejects unauthorized endpoints", () => {
      const { rawKey } = createApiClient("Endpoint Test", "ep@example.com", { tier: "free" });
      expect(() => validateApiKey(rawKey, "/batch")).toThrow("not allowed");
    });
  });

  describe("JWT session tokens", () => {
    const secret = "test-secret-key-for-jwt";

    it("generates and validates a token", () => {
      const { client } = createApiClient("JWT Test", "jwt@example.com");
      const token = generateSessionToken(client.id, secret);
      expect(token.split(".")).toHaveLength(3);

      const validated = validateSessionToken(token, secret);
      expect(validated.clientId).toBe(client.id);
      expect(validated.tier).toBe("free");
      expect(validated.expired).toBe(false);
    });

    it("rejects tokens with wrong secret", () => {
      const { client } = createApiClient("JWT Wrong", "jwt2@example.com");
      const token = generateSessionToken(client.id, secret);
      expect(() => validateSessionToken(token, "wrong-secret")).toThrow("Invalid token signature");
    });

    it("detects expired tokens", () => {
      const { client } = createApiClient("JWT Expired", "jwt3@example.com");
      const token = generateSessionToken(client.id, secret, -1);
      const validated = validateSessionToken(token, secret);
      expect(validated.expired).toBe(true);
    });

    it("rejects malformed tokens", () => {
      expect(() => validateSessionToken("not.a.valid.token", secret)).toThrow();
    });
  });
});
