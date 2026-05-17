import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getTenant: vi.fn(),
  getUsage: vi.fn(),
  listPlans: vi.fn(),
  updateTenantPlan: vi.fn(),
  createSaasTenant: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/billing/route.js";
import {
  getTenant,
  getUsage,
  listPlans,
  updateTenantPlan,
  createSaasTenant as createTenant,
} from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/billing");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/billing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- GET ----

  describe("GET", () => {
    it("returns plans when no tenantId", async () => {
      vi.mocked(listPlans).mockReturnValue([{ id: "free", name: "Free" }] as never);
      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plans).toEqual([{ id: "free", name: "Free" }]);
    });

    it("returns tenant and usage when tenantId provided", async () => {
      vi.mocked(getTenant).mockReturnValue({ id: "t1", plan: "free" } as never);
      vi.mocked(getUsage).mockReturnValue({ requests: 10 } as never);
      const res = await GET(makeGet({ tenantId: "t1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toEqual({ id: "t1", plan: "free" });
      expect(body.usage).toEqual({ requests: 10 });
    });

    it("returns 404 for unknown tenantId", async () => {
      vi.mocked(getTenant).mockReturnValue(null as never);
      const res = await GET(makeGet({ tenantId: "nonexistent" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Tenant not found");
    });
  });

  // ---- POST: plans ----

  describe("POST plans", () => {
    it("returns plans list", async () => {
      vi.mocked(listPlans).mockReturnValue([{ id: "pro" }] as never);
      const res = await POST(makePost({ action: "plans" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plans).toEqual([{ id: "pro" }]);
    });
  });

  // ---- POST: usage ----

  describe("POST usage", () => {
    it("returns tenant and usage", async () => {
      vi.mocked(getTenant).mockReturnValue({ id: "t1" } as never);
      vi.mocked(getUsage).mockReturnValue({ calls: 5 } as never);
      const res = await POST(makePost({ action: "usage", tenantId: "t1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toEqual({ id: "t1" });
      expect(body.usage).toEqual({ calls: 5 });
    });

    it("returns 404 for missing tenant", async () => {
      vi.mocked(getTenant).mockReturnValue(null as never);
      const res = await POST(makePost({ action: "usage", tenantId: "bad" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Tenant not found");
    });
  });

  // ---- POST: subscribe ----

  describe("POST subscribe", () => {
    it("updates tenant plan successfully", async () => {
      vi.mocked(updateTenantPlan).mockReturnValue({ id: "t1", plan: "pro" } as never);
      const res = await POST(makePost({ action: "subscribe", tenantId: "t1", planId: "pro" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toEqual({ id: "t1", plan: "pro" });
      expect(body.message).toBe("Plan updated to pro");
    });

    it("returns 404 for nonexistent tenant on subscribe", async () => {
      vi.mocked(updateTenantPlan).mockReturnValue(null as never);
      const res = await POST(makePost({ action: "subscribe", tenantId: "bad", planId: "pro" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Tenant not found");
    });

    it("rejects invalid planId via Zod", async () => {
      const res = await POST(makePost({ action: "subscribe", tenantId: "t1", planId: "invalid" }));
      expect(res.status).toBe(400);
    });

    it("rejects missing tenantId via Zod", async () => {
      const res = await POST(makePost({ action: "subscribe", planId: "pro" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: create_tenant ----

  describe("POST create_tenant", () => {
    it("creates a tenant and returns 201", async () => {
      vi.mocked(createTenant).mockReturnValue({ id: "t-new", slug: "acme" } as never);
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Acme Corp",
          slug: "acme",
          ownerId: "user-1",
          planId: "pro",
          billingEmail: "billing@acme.com",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tenant).toEqual({ id: "t-new", slug: "acme" });
      expect(createTenant).toHaveBeenCalledWith({
        name: "Acme Corp",
        slug: "acme",
        ownerId: "user-1",
        planId: "pro",
        billingEmail: "billing@acme.com",
      });
    });

    it("rejects invalid slug format", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "Invalid Slug!",
          ownerId: "user-1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await POST(
        makePost({ action: "create_tenant", name: "", slug: "valid", ownerId: "u1" })
      );
      expect(res.status).toBe(400);
    });
  });

  // ---- POST: invalid actions ----

  describe("POST error paths", () => {
    it("returns 400 for unknown action", async () => {
      const res = await POST(makePost({ action: "delete" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  // ---- Security boundary tests ----

  describe("cross-tenant access prevention", () => {
    it("cannot read another tenant's data with wrong tenantId", async () => {
      vi.mocked(getTenant).mockReturnValue(null as never);
      const res = await GET(makeGet({ tenantId: "other-tenant-id" }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Tenant not found");
    });

    it("usage endpoint returns 404 for non-existent tenant", async () => {
      vi.mocked(getTenant).mockReturnValue(null as never);
      const res = await POST(makePost({ action: "usage", tenantId: "stranger-tenant" }));
      expect(res.status).toBe(404);
    });

    it("subscribe returns 404 for non-existent tenant", async () => {
      vi.mocked(updateTenantPlan).mockReturnValue(null as never);
      const res = await POST(
        makePost({ action: "subscribe", tenantId: "stranger", planId: "pro" })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("plan validation", () => {
    it("rejects subscribe with invalid plan", async () => {
      const res = await POST(makePost({ action: "subscribe", tenantId: "t1", planId: "platinum" }));
      expect(res.status).toBe(400);
    });

    it("accepts all valid plan IDs", async () => {
      for (const planId of ["free", "pro", "team", "enterprise"]) {
        vi.mocked(updateTenantPlan).mockReturnValue({ id: "t1", plan: planId } as never);
        const res = await POST(makePost({ action: "subscribe", tenantId: "t1", planId }));
        expect(res.status).toBe(200);
      }
    });
  });

  describe("concurrent plan update", () => {
    it("handles rapid sequential plan updates", async () => {
      vi.mocked(updateTenantPlan)
        .mockReturnValueOnce({ id: "t1", plan: "pro" } as never)
        .mockReturnValueOnce({ id: "t1", plan: "enterprise" } as never);

      const res1 = await POST(makePost({ action: "subscribe", tenantId: "t1", planId: "pro" }));
      const res2 = await POST(
        makePost({ action: "subscribe", tenantId: "t1", planId: "enterprise" })
      );
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.message).toBe("Plan updated to enterprise");
    });
  });

  describe("tenant slug injection", () => {
    it("rejects slugs with special characters", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "test; DROP TABLE",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects slugs with SQL-like patterns", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "test' OR '1'='1",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects slugs with uppercase", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "TestSlug",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("accepts valid kebab-case slug", async () => {
      vi.mocked(createTenant).mockReturnValue({ id: "t1", slug: "my-company-123" } as never);
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "My Company",
          slug: "my-company-123",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(201);
    });
  });

  describe("duplicate slug handling", () => {
    it("returns 400 when createTenant throws on duplicate slug", async () => {
      vi.mocked(createTenant).mockImplementation(() => {
        throw new Error("Tenant with slug already exists");
      });
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Acme",
          slug: "acme",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("already exists");
    });
  });

  describe("create_tenant edge cases", () => {
    it("rejects empty slug", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "",
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects very long slug (> 100 chars)", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "a".repeat(101),
          ownerId: "u1",
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid billing email", async () => {
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "valid",
          ownerId: "u1",
          billingEmail: "not-an-email",
        })
      );
      expect(res.status).toBe(400);
    });

    it("accepts valid billing email", async () => {
      vi.mocked(createTenant).mockReturnValue({ id: "t1" } as never);
      const res = await POST(
        makePost({
          action: "create_tenant",
          name: "Test",
          slug: "valid",
          ownerId: "u1",
          billingEmail: "billing@example.com",
        })
      );
      expect(res.status).toBe(201);
    });
  });
});
