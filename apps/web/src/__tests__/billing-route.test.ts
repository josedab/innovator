import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getTenant: vi.fn(),
  getUsage: vi.fn(),
  listPlans: vi.fn(),
  updateTenantPlan: vi.fn(),
  createTenant: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/billing/route.js";
import { getTenant, getUsage, listPlans, updateTenantPlan, createTenant } from "@innovator/core";

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
});
