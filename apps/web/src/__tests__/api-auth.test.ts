import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateApiKey } from "../lib/api-auth";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    headers,
  });
}

describe("validateApiKey", () => {
  const originalEnv = process.env.INNOVATOR_API_KEYS;
  const originalLegacyKey = process.env.INNOVATOR_API_KEY;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalEnv !== undefined) {
      process.env.INNOVATOR_API_KEYS = originalEnv;
    } else {
      delete process.env.INNOVATOR_API_KEYS;
    }
    if (originalLegacyKey !== undefined) {
      process.env.INNOVATOR_API_KEY = originalLegacyKey;
    } else {
      delete process.env.INNOVATOR_API_KEY;
    }
  });

  describe("dev mode (no keys configured)", () => {
    it("allows all requests when INNOVATOR_API_KEYS is unset", () => {
      delete process.env.INNOVATOR_API_KEYS;
      const result = validateApiKey(makeRequest());
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe("anonymous");
    });

    it("allows all requests when INNOVATOR_API_KEYS is empty", () => {
      process.env.INNOVATOR_API_KEYS = "";
      const result = validateApiKey(makeRequest());
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe("anonymous");
    });
  });

  describe("Bearer token auth", () => {
    beforeEach(() => {
      process.env.INNOVATOR_API_KEYS = "valid-key-1,valid-key-2";
    });

    it("accepts valid Bearer token", () => {
      const result = validateApiKey(makeRequest({ Authorization: "Bearer valid-key-1" }));
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe("key-0");
    });

    it("accepts second valid key", () => {
      const result = validateApiKey(makeRequest({ Authorization: "Bearer valid-key-2" }));
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe("key-1");
    });

    it("rejects invalid Bearer token", () => {
      const result = validateApiKey(makeRequest({ Authorization: "Bearer wrong-key" }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("rejects malformed Bearer with no token (just 'Bearer ')", () => {
      const result = validateApiKey(makeRequest({ Authorization: "Bearer " }));
      expect(result.valid).toBe(false);
    });

    it("does not match 'Bearer' without space", () => {
      const result = validateApiKey(makeRequest({ Authorization: "Bearertoken" }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing API key");
    });
  });

  describe("X-API-Key header fallback", () => {
    beforeEach(() => {
      process.env.INNOVATOR_API_KEYS = "api-key-123";
    });

    it("accepts valid X-API-Key header", () => {
      const result = validateApiKey(makeRequest({ "X-API-Key": "api-key-123" }));
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe("key-0");
    });

    it("rejects invalid X-API-Key header", () => {
      const result = validateApiKey(makeRequest({ "X-API-Key": "wrong" }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("prefers Bearer token over X-API-Key", () => {
      process.env.INNOVATOR_API_KEYS = "bearer-key,xapi-key";
      const result = validateApiKey(
        makeRequest({ Authorization: "Bearer bearer-key", "X-API-Key": "xapi-key" })
      );
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe("key-0"); // bearer-key is at index 0
    });
  });

  describe("missing auth", () => {
    beforeEach(() => {
      process.env.INNOVATOR_API_KEYS = "some-key";
    });

    it("returns error when both headers are missing", () => {
      const result = validateApiKey(makeRequest());
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing API key");
    });

    it("returns error for Authorization header without Bearer prefix", () => {
      const result = validateApiKey(makeRequest({ Authorization: "Basic abc123" }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing API key");
    });
  });

  describe("production fail-closed behavior", () => {
    it("rejects requests when production keys are missing", () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.INNOVATOR_API_KEYS;
      delete process.env.INNOVATOR_API_KEY;

      const result = validateApiKey(makeRequest());

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("accepts a configured production key", () => {
      const key = "p".repeat(32);
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("INNOVATOR_API_KEYS", key);

      const result = validateApiKey(makeRequest({ Authorization: `Bearer ${key}` }));

      expect(result).toEqual({ valid: true, keyId: "key-0" });
    });
  });
});
