import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createTenant: vi.fn(),
  getTenant: vi.fn(),
  listTenants: vi.fn(),
  updateTenantTier: vi.fn(),
  addTenantApiKey: vi.fn(),
  getDeveloperPortalInfo: vi.fn(),
  createDemoKey: vi.fn(),
  getOpenApiSpec: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/portal/route.js";
import {
  createTenant,
  getTenant,
  updateTenantTier,
  addTenantApiKey,
  getDeveloperPortalInfo,
  createDemoKey,
  getOpenApiSpec,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/portal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // --- POST: create-tenant ---

  describe("create-tenant", () => {
    it("creates a tenant successfully", async () => {
      vi.mocked(createTenant).mockReturnValue({
        id: "t1",
        name: "Acme Corp",
        tier: "free",
      } as never);
      const res = await POST(
        makePost({
          action: "create-tenant",
          name: "Acme Corp",
          ownerEmail: "admin@acme.com",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant.id).toBe("t1");
      expect(body.tenant.name).toBe("Acme Corp");
    });

    it("creates tenant with specific tier", async () => {
      vi.mocked(createTenant).mockReturnValue({ id: "t2", tier: "pro" } as never);
      const res = await POST(
        makePost({
          action: "create-tenant",
          name: "Pro Corp",
          ownerEmail: "admin@pro.com",
          tier: "pro",
        })
      );
      expect(res.status).toBe(200);
      expect(createTenant).toHaveBeenCalledWith("Pro Corp", "admin@pro.com", "pro");
    });

    it("rejects invalid email", async () => {
      const res = await POST(
        makePost({
          action: "create-tenant",
          name: "Bad Corp",
          ownerEmail: "not-an-email",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects missing name", async () => {
      const res = await POST(
        makePost({
          action: "create-tenant",
          ownerEmail: "admin@acme.com",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  // --- POST: get-portal ---

  describe("get-portal", () => {
    it("returns portal info for existing tenant", async () => {
      vi.mocked(getDeveloperPortalInfo).mockReturnValue({
        tenantId: "t1",
        name: "Acme",
        tier: "free",
        apiKeys: [],
      } as never);
      const res = await POST(
        makePost({
          action: "get-portal",
          tenantId: "t1",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.portal.tenantId).toBe("t1");
    });

    it("returns 404 for non-existent tenant", async () => {
      vi.mocked(getDeveloperPortalInfo).mockReturnValue(null as never);
      const res = await POST(
        makePost({
          action: "get-portal",
          tenantId: "nonexistent",
        })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Tenant not found");
    });
  });

  // --- POST: upgrade-tier lifecycle ---

  describe("upgrade-tier", () => {
    it("upgrades tenant from free to pro", async () => {
      vi.mocked(updateTenantTier).mockReturnValue(true as never);
      vi.mocked(getTenant).mockReturnValue({ id: "t1", tier: "pro" } as never);
      const res = await POST(
        makePost({
          action: "upgrade-tier",
          tenantId: "t1",
          tier: "pro",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant.tier).toBe("pro");
    });

    it("upgrades from pro to enterprise", async () => {
      vi.mocked(updateTenantTier).mockReturnValue(true as never);
      vi.mocked(getTenant).mockReturnValue({ id: "t1", tier: "enterprise" } as never);
      const res = await POST(
        makePost({
          action: "upgrade-tier",
          tenantId: "t1",
          tier: "enterprise",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant.tier).toBe("enterprise");
    });

    it("returns 404 for nonexistent tenant upgrade", async () => {
      vi.mocked(updateTenantTier).mockReturnValue(false as never);
      const res = await POST(
        makePost({
          action: "upgrade-tier",
          tenantId: "bad-id",
          tier: "pro",
        })
      );
      expect(res.status).toBe(404);
    });
  });

  // --- POST: add-key ---

  describe("add-key", () => {
    it("adds API key scoped to tenant", async () => {
      vi.mocked(addTenantApiKey).mockReturnValue({
        id: "k1",
        key: "inv_abc123",
        name: "Production",
      } as never);
      const res = await POST(
        makePost({
          action: "add-key",
          tenantId: "t1",
          keyName: "Production",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.apiKey.name).toBe("Production");
    });

    it("returns 400 when key cannot be added", async () => {
      vi.mocked(addTenantApiKey).mockReturnValue(null as never);
      const res = await POST(
        makePost({
          action: "add-key",
          tenantId: "t1",
          keyName: "Overflow Key",
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Cannot add key");
    });
  });

  // --- POST: demo ---

  describe("demo", () => {
    it("provisions demo key", async () => {
      vi.mocked(createDemoKey).mockReturnValue("demo_key_xyz" as never);
      const res = await POST(makePost({ action: "demo" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.demoKey).toBe("demo_key_xyz");
      expect(body.message).toContain("Demo key");
    });
  });

  // --- POST: error paths ---

  describe("error paths", () => {
    it("returns 400 for invalid action", async () => {
      const res = await POST(makePost({ action: "invalid-action" }));
      expect(res.status).toBe(400);
    });

    it("returns content-type error", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
          status: 415,
        })
      );
      const res = await POST(makePost({ action: "demo" }));
      expect(res.status).toBe(415);
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(createTenant).mockImplementation(() => {
        throw new Error("DB error");
      });
      const res = await POST(
        makePost({
          action: "create-tenant",
          name: "Fail Corp",
          ownerEmail: "admin@fail.com",
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Internal server error");
    });
  });

  // --- GET: OpenAPI spec ---

  describe("GET", () => {
    it("returns OpenAPI spec", async () => {
      vi.mocked(getOpenApiSpec).mockReturnValue({
        openapi: "3.0.0",
        info: { title: "Innovator API", version: "1.0.0" },
      } as never);
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe("3.0.0");
    });
  });
});
