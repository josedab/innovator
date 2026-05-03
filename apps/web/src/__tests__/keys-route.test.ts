import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", async () => {
  const { z } = await import("zod");
  return {
    createApiKey: vi.fn(),
    listApiKeys: vi.fn(),
    revokeApiKey: vi.fn(),
    getUsageSummary: vi.fn(),
    BillingTierSchema: z.enum(["free", "pro", "enterprise"]),
  };
});

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

import { POST, GET, DELETE } from "../app/api/v1/keys/route.js";
import { createApiKey, listApiKeys, revokeApiKey, getUsageSummary } from "@innovator/core";
import { NextRequest } from "next/server";
import { validateJsonContentType } from "@/lib/validate-request";

function makeNextRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL("http://localhost/api/v1/keys"), init);
}

describe("API /api/v1/keys", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // ---- POST ----

  describe("POST", () => {
    it("creates key and returns 201", async () => {
      const fakeKey = {
        id: "k1",
        name: "My Key",
        key: "inv_abc123",
        tier: "free",
        enabled: true,
        createdAt: "2025-01-01",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createApiKey).mockReturnValue(fakeKey as any);

      const res = await POST(makeNextRequest("POST", { name: "My Key" }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("My Key");
      expect(body.key).toBeDefined();
    });

    it("creates key with tier", async () => {
      const fakeKey = {
        id: "k2",
        name: "Pro Key",
        key: "inv_xyz",
        tier: "pro",
        enabled: true,
        createdAt: "2025-01-01",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createApiKey).mockReturnValue(fakeKey as any);

      const res = await POST(makeNextRequest("POST", { name: "Pro Key", tier: "pro" }));
      expect(res.status).toBe(201);
      expect(createApiKey).toHaveBeenCalledWith("Pro Key", "pro");
    });

    it("returns 400 for invalid request (missing name)", async () => {
      const res = await POST(makeNextRequest("POST", {}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for invalid tier", async () => {
      const res = await POST(makeNextRequest("POST", { name: "Key", tier: "invalid-tier" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest(new URL("http://localhost/api/v1/keys"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      vi.mocked(validateJsonContentType).mockReturnValue(null);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns content-type error when validation fails", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported" }), { status: 415 })
      );
      const res = await POST(makeNextRequest("POST", { name: "Key" }));
      expect(res.status).toBe(415);
    });
  });

  // ---- GET ----

  describe("GET", () => {
    it("lists keys with usage summaries", async () => {
      vi.mocked(listApiKeys).mockReturnValue([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          id: "k1",
          name: "Key1",
          tier: "free",
          enabled: true,
          createdAt: "2025-01-01",
          lastUsedAt: null,
        } as any,
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(getUsageSummary).mockReturnValue({ requests: 10, tokens: 100 } as any);

      const res = await GET(makeNextRequest("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0].id).toBe("k1");
      expect(body.keys[0].usage).toBeDefined();
    });

    it("returns empty keys array when none exist", async () => {
      vi.mocked(listApiKeys).mockReturnValue([]);
      const res = await GET(makeNextRequest("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keys).toEqual([]);
    });
  });

  // ---- DELETE ----

  describe("DELETE", () => {
    it("revokes key and returns 200", async () => {
      vi.mocked(revokeApiKey).mockReturnValue(true);
      const res = await DELETE(makeNextRequest("DELETE", { id: "k1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 for nonexistent key", async () => {
      vi.mocked(revokeApiKey).mockReturnValue(false);
      const res = await DELETE(makeNextRequest("DELETE", { id: "nonexistent" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns 400 for missing key id", async () => {
      const res = await DELETE(makeNextRequest("DELETE", {}));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest(new URL("http://localhost/api/v1/keys"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      vi.mocked(validateJsonContentType).mockReturnValue(null);
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });
  });

  // ---- Response Headers ----

  describe("response headers", () => {
    it("includes API_RESPONSE_HEADERS on success", async () => {
      const fakeKey = {
        id: "k1",
        name: "Test",
        key: "inv_abc",
        tier: "free",
        enabled: true,
        createdAt: "2025-01-01",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createApiKey).mockReturnValue(fakeKey as any);
      const res = await POST(makeNextRequest("POST", { name: "Test" }));
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });

    it("includes API_RESPONSE_HEADERS on error", async () => {
      const res = await POST(makeNextRequest("POST", {}));
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });
  });
});
