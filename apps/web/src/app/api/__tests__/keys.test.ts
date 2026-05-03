import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@innovator/core", async () => {
  const { z: zod } = await import("zod");
  const keys: Array<{
    id: string;
    name: string;
    tier: string;
    key: string;
    enabled: boolean;
    createdAt: string;
    lastUsedAt: string | null;
  }> = [];
  let keyCounter = 0;

  return {
    BillingTierSchema: zod.enum(["free", "pro", "enterprise"]),
    createApiKey: vi.fn((name: string, tier = "free") => {
      const apiKey = {
        id: `key-${++keyCounter}`,
        name,
        tier,
        key: `sk_test_${Math.random().toString(36).slice(2)}`,
        enabled: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      keys.push(apiKey);
      return apiKey;
    }),
    listApiKeys: vi.fn(() => [...keys]),
    revokeApiKey: vi.fn((id: string) => {
      const idx = keys.findIndex((k) => k.id === id);
      if (idx === -1) return false;
      keys[idx].enabled = false;
      return true;
    }),
    getUsageSummary: vi.fn(() => ({
      totalRequests: 0,
      periodDays: 30,
    })),
  };
});

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn((request: Request) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  }),
}));

import { POST, GET, DELETE } from "../../../app/api/v1/keys/route";
import { createApiKey, revokeApiKey } from "@innovator/core";

function makeRequest(
  method: string,
  body?: unknown,
  contentType = "application/json"
): NextRequest {
  const init: RequestInit = {
    method,
    headers: { "content-type": contentType },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/v1/keys", init);
}

describe("API keys route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST - create key", () => {
    it("creates a valid API key", async () => {
      const res = await POST(makeRequest("POST", { name: "My Key" }));
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.name).toBe("My Key");
      expect(data.id).toBeTruthy();
      expect(createApiKey).toHaveBeenCalledWith("My Key", undefined);
    });

    it("creates key with tier", async () => {
      const res = await POST(makeRequest("POST", { name: "Pro Key", tier: "pro" }));
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.tier).toBe("pro");
    });

    it("returns 400 for missing name", async () => {
      const res = await POST(makeRequest("POST", {}));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Invalid");
    });

    it("returns 400 for empty name", async () => {
      const res = await POST(makeRequest("POST", { name: "" }));

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid tier", async () => {
      const res = await POST(makeRequest("POST", { name: "Test", tier: "invalid" }));

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest("http://localhost/api/v1/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("returns 415 for non-JSON content type", async () => {
      const res = await POST(makeRequest("POST", { name: "Test" }, "text/plain"));

      expect(res.status).toBe(415);
    });
  });

  describe("GET - list keys", () => {
    it("returns list of keys", async () => {
      const res = await GET(makeRequest("GET"));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.keys).toBeDefined();
      expect(Array.isArray(data.keys)).toBe(true);
    });
  });

  describe("DELETE - revoke key", () => {
    it("revokes existing key", async () => {
      vi.mocked(revokeApiKey).mockReturnValue(true);
      const res = await DELETE(makeRequest("DELETE", { id: "key-1" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("returns 404 for nonexistent key", async () => {
      vi.mocked(revokeApiKey).mockReturnValue(false);
      const res = await DELETE(makeRequest("DELETE", { id: "nonexistent" }));

      expect(res.status).toBe(404);
    });

    it("returns 400 for missing key id", async () => {
      const res = await DELETE(makeRequest("DELETE", {}));

      expect(res.status).toBe(400);
    });

    it("returns 415 for non-JSON content type", async () => {
      const res = await DELETE(makeRequest("DELETE", { id: "key-1" }, "text/plain"));

      expect(res.status).toBe(415);
    });
  });
});
