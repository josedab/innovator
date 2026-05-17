/**
 * Tests for /api/billing and /api/billing/checkout routes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCore = vi.hoisted(() => ({
  getTenant: vi.fn(),
  getUsage: vi.fn(),
  listPlans: vi.fn(),
  updateTenantPlan: vi.fn(),
  createSaasTenant: vi.fn(),
  getStripeBilling: vi.fn(),
}));

vi.mock("@innovator/core", () => mockCore);

vi.mock("../../../lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET as billingGET, POST as billingPOST } from "../billing/route";
import { POST as checkoutPOST } from "../billing/checkout/route";

// ---- Helpers ----

function createRequest(
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: unknown }
): Request {
  const init: RequestInit = {
    method: options?.method ?? "GET",
    headers: options?.headers ?? {},
  };
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  return new Request(url, init);
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockCore.listPlans.mockReturnValue([
    { id: "free", name: "Free", price: 0 },
    { id: "pro", name: "Pro", price: 29 },
  ]);
  mockCore.getTenant.mockReturnValue(null);
  mockCore.getUsage.mockReturnValue({ sessions: 0, ideas: 0 });
});

describe("/api/billing", () => {
  describe("GET /api/billing", () => {
    it("returns plans when no tenantId provided", async () => {
      const req = createRequest("http://localhost:3000/api/billing");
      const res = await billingGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plans).toHaveLength(2);
      expect(mockCore.listPlans).toHaveBeenCalledOnce();
    });

    it("returns tenant and usage when tenantId provided", async () => {
      const tenant = { id: "t-1", name: "Acme", plan: "pro" };
      const usage = { sessions: 5, ideas: 20 };
      mockCore.getTenant.mockReturnValue(tenant);
      mockCore.getUsage.mockReturnValue(usage);

      const req = createRequest("http://localhost:3000/api/billing?tenantId=t-1");
      const res = await billingGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toEqual(tenant);
      expect(body.usage).toEqual(usage);
    });

    it("returns 404 when tenantId not found", async () => {
      mockCore.getTenant.mockReturnValue(null);
      const req = createRequest("http://localhost:3000/api/billing?tenantId=nonexistent");
      const res = await billingGET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Tenant not found");
    });
  });

  describe("POST /api/billing", () => {
    it("returns plans for action=plans", async () => {
      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: { action: "plans" },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plans).toHaveLength(2);
    });

    it("returns usage for action=usage with valid tenantId", async () => {
      const tenant = { id: "t-1", name: "Acme" };
      mockCore.getTenant.mockReturnValue(tenant);
      mockCore.getUsage.mockReturnValue({ sessions: 10, ideas: 42 });

      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: { action: "usage", tenantId: "t-1" },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toEqual(tenant);
      expect(body.usage.ideas).toBe(42);
    });

    it("returns 404 for action=usage with missing tenant", async () => {
      mockCore.getTenant.mockReturnValue(null);
      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: { action: "usage", tenantId: "missing" },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(404);
    });

    it("subscribes to plan for action=subscribe", async () => {
      const tenant = { id: "t-1", name: "Acme", plan: "pro" };
      mockCore.updateTenantPlan.mockReturnValue(tenant);

      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: { action: "subscribe", tenantId: "t-1", planId: "pro" },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenant).toEqual(tenant);
      expect(body.message).toContain("pro");
      expect(mockCore.updateTenantPlan).toHaveBeenCalledWith("t-1", "pro");
    });

    it("returns 404 when subscribe fails due to missing tenant", async () => {
      mockCore.updateTenantPlan.mockReturnValue(null);
      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: { action: "subscribe", tenantId: "missing", planId: "pro" },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(404);
    });

    it("creates tenant for action=create_tenant", async () => {
      const newTenant = { id: "t-new", name: "New Corp", slug: "new-corp", plan: "free" };
      mockCore.createSaasTenant.mockReturnValue(newTenant);

      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: {
          action: "create_tenant",
          name: "New Corp",
          slug: "new-corp",
          ownerId: "user-1",
        },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tenant).toEqual(newTenant);
    });

    it("returns 400 for invalid Zod body", async () => {
      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: { action: "subscribe" }, // missing tenantId and planId
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid slug format", async () => {
      const req = createRequest("http://localhost:3000/api/billing", {
        method: "POST",
        body: {
          action: "create_tenant",
          name: "Test",
          slug: "INVALID SLUG!",
          ownerId: "user-1",
        },
      });
      const res = await billingPOST(req);
      expect(res.status).toBe(400);
    });
  });
});

describe("/api/billing/checkout", () => {
  describe("POST /api/billing/checkout", () => {
    it("returns checkout URL for valid plan", async () => {
      mockCore.getStripeBilling.mockReturnValue({
        createSubscription: vi.fn().mockResolvedValue("sub_12345"),
      });

      const req = createRequest("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: { planId: "pro", tenantId: "t-1" },
      });
      const res = await checkoutPOST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.checkoutUrl).toContain("sub_12345");
      expect(body.subscriptionId).toBe("sub_12345");
      expect(body.planId).toBe("pro");
      expect(body.cancelUrl).toContain("/billing/cancel");
    });

    it("returns 400 for invalid planId", async () => {
      const req = createRequest("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: { planId: "invalid-plan", tenantId: "t-1" },
      });
      const res = await checkoutPOST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid request");
    });

    it("returns 400 when createSubscription throws", async () => {
      mockCore.getStripeBilling.mockReturnValue({
        createSubscription: vi.fn().mockRejectedValue(new Error("Stripe unavailable")),
      });

      const req = createRequest("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: { planId: "pro", tenantId: "t-1" },
      });
      const res = await checkoutPOST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Stripe unavailable");
    });

    it("uses custom successUrl and cancelUrl when provided", async () => {
      mockCore.getStripeBilling.mockReturnValue({
        createSubscription: vi.fn().mockResolvedValue("sub_99"),
      });

      const req = createRequest("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: {
          planId: "team",
          tenantId: "t-2",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        },
      });
      const res = await checkoutPOST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.checkoutUrl).toBe("https://example.com/success");
      expect(body.cancelUrl).toBe("https://example.com/cancel");
    });

    it("returns 400 for missing tenantId", async () => {
      const req = createRequest("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: { planId: "pro" },
      });
      const res = await checkoutPOST(req);
      expect(res.status).toBe(400);
    });
  });
});
