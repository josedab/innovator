import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  getStripeBilling: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/billing/checkout/route.js";
import { getStripeBilling } from "@innovator/core";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("API /api/billing/checkout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 for valid pro plan checkout", async () => {
    const mockBilling = { createSubscription: vi.fn().mockResolvedValue("sub_123") };
    vi.mocked(getStripeBilling).mockReturnValue(mockBilling as never);

    const res = await POST(makePost({ planId: "pro", tenantId: "t1" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subscriptionId).toBe("sub_123");
    expect(body.planId).toBe("pro");
    expect(body.checkoutUrl).toContain("sub_123");
  });

  it("returns 201 for team plan with custom URLs", async () => {
    const mockBilling = { createSubscription: vi.fn().mockResolvedValue("sub_456") };
    vi.mocked(getStripeBilling).mockReturnValue(mockBilling as never);

    const res = await POST(
      makePost({
        planId: "team",
        tenantId: "t2",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.checkoutUrl).toBe("https://example.com/success");
    expect(body.cancelUrl).toBe("https://example.com/cancel");
  });

  it("returns 201 for enterprise plan", async () => {
    const mockBilling = { createSubscription: vi.fn().mockResolvedValue("sub_789") };
    vi.mocked(getStripeBilling).mockReturnValue(mockBilling as never);

    const res = await POST(makePost({ planId: "enterprise", tenantId: "t3" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.planId).toBe("enterprise");
  });

  it("returns 400 for invalid planId", async () => {
    const res = await POST(makePost({ planId: "free", tenantId: "t1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for missing tenantId", async () => {
    const res = await POST(makePost({ planId: "pro" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for empty tenantId", async () => {
    const res = await POST(makePost({ planId: "pro", tenantId: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid successUrl format", async () => {
    const res = await POST(makePost({ planId: "pro", tenantId: "t1", successUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when billing service throws", async () => {
    const mockBilling = {
      createSubscription: vi.fn().mockRejectedValue(new Error("Stripe error")),
    };
    vi.mocked(getStripeBilling).mockReturnValue(mockBilling as never);

    const res = await POST(makePost({ planId: "pro", tenantId: "t1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Stripe error");
  });
});
