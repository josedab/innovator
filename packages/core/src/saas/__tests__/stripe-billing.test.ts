import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StripeBillingProvider, getStripeBilling } from "../stripe-billing.js";

describe("StripeBillingProvider", () => {
  let provider: StripeBillingProvider;

  beforeEach(() => {
    provider = new StripeBillingProvider();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_456");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---- createCustomer ----

  describe("createCustomer", () => {
    it("creates a customer and returns the ID", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id: "cus_abc123" }),
        })
      );

      const id = await provider.createCustomer("test@example.com", "Test User");
      expect(id).toBe("cus_abc123");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("throws on Stripe API error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Bad Request"),
        })
      );

      await expect(provider.createCustomer("bad@example.com", "Bad")).rejects.toThrow(
        "Stripe API error (400)"
      );
    });

    it("throws when STRIPE_SECRET_KEY is not configured", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "");

      await expect(provider.createCustomer("a@b.com", "A")).rejects.toThrow(
        "STRIPE_SECRET_KEY not configured"
      );
    });
  });

  // ---- createSubscription ----

  describe("createSubscription", () => {
    it("returns free subscription ID for free plan", async () => {
      const id = await provider.createSubscription("cus_123", "free");
      expect(id).toBe("free_cus_123");
    });

    it("creates a paid subscription via Stripe", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id: "sub_xyz" }),
        })
      );

      const id = await provider.createSubscription("cus_123", "pro");
      expect(id).toBe("sub_xyz");
    });
  });

  // ---- cancelSubscription ----

  describe("cancelSubscription", () => {
    it("no-ops for free subscriptions", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      await provider.cancelSubscription("free_cus_123");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("cancels a paid subscription via DELETE", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        })
      );

      await provider.cancelSubscription("sub_abc");
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ---- updateSubscription ----

  describe("updateSubscription", () => {
    it("no-ops for free subscriptions", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      await provider.updateSubscription("free_cus_123", "pro");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("updates subscription with proration", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: { data: [{ id: "si_item1" }] } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });
      vi.stubGlobal("fetch", mockFetch);

      await provider.updateSubscription("sub_abc", "team");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws when no subscription item found", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ items: { data: [] } }),
        })
      );

      await expect(provider.updateSubscription("sub_abc", "pro")).rejects.toThrow(
        "No subscription item found"
      );
    });
  });

  // ---- getInvoices ----

  describe("getInvoices", () => {
    it("returns mapped invoices", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "inv_1",
                  amount_due: 1900,
                  currency: "usd",
                  status: "paid",
                  period_start: 1700000000,
                  period_end: 1702592000,
                  invoice_pdf: "https://stripe.com/invoice.pdf",
                },
              ],
            }),
        })
      );

      const invoices = await provider.getInvoices("cus_123");
      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({
        id: "inv_1",
        amount: 19,
        currency: "usd",
        status: "paid",
        pdfUrl: "https://stripe.com/invoice.pdf",
      });
    });

    it("maps invoice statuses correctly", async () => {
      const statuses = [
        { input: "draft", expected: "draft" },
        { input: "open", expected: "open" },
        { input: "paid", expected: "paid" },
        { input: "void", expected: "void" },
        { input: "uncollectible", expected: "void" },
        { input: "unknown_status", expected: "open" },
      ];

      for (const { input, expected } of statuses) {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [
                  {
                    id: "inv_s",
                    amount_due: 100,
                    currency: "usd",
                    status: input,
                    period_start: 1700000000,
                    period_end: 1702592000,
                    invoice_pdf: null,
                  },
                ],
              }),
          })
        );

        const invoices = await provider.getInvoices("cus_x");
        expect(invoices[0].status).toBe(expected);
        expect(invoices[0].pdfUrl).toBeUndefined();
      }
    });
  });

  // ---- processWebhook ----

  describe("processWebhook", () => {
    it("processes subscription.created webhook", async () => {
      const payload = JSON.stringify({
        type: "customer.subscription.created",
        data: {
          object: { id: "sub_1", metadata: { tenantId: "tenant-1" } },
        },
      });

      const event = await provider.processWebhook(payload, "sig_valid");
      expect(event.type).toBe("subscription.created");
      expect(event.tenantId).toBe("tenant-1");
    });

    it("processes invoice.paid webhook", async () => {
      const payload = JSON.stringify({
        type: "invoice.paid",
        data: { object: { id: "inv_1" } },
      });

      const event = await provider.processWebhook(payload, "sig_valid");
      expect(event.type).toBe("invoice.paid");
      expect(event.tenantId).toBeUndefined();
    });

    it("processes all mapped webhook types", async () => {
      const typeMap: Record<string, string> = {
        "customer.subscription.created": "subscription.created",
        "customer.subscription.updated": "subscription.updated",
        "customer.subscription.deleted": "subscription.deleted",
        "invoice.paid": "invoice.paid",
        "invoice.payment_failed": "invoice.failed",
        "charge.failed": "payment.failed",
      };

      for (const [stripeType, expectedType] of Object.entries(typeMap)) {
        const payload = JSON.stringify({
          type: stripeType,
          data: { object: {} },
        });
        const event = await provider.processWebhook(payload, "sig_valid");
        expect(event.type).toBe(expectedType);
      }
    });

    it("throws for unhandled webhook type", async () => {
      const payload = JSON.stringify({
        type: "unknown.event",
        data: { object: {} },
      });

      await expect(provider.processWebhook(payload, "sig_valid")).rejects.toThrow(
        "Unhandled webhook type: unknown.event"
      );
    });

    it("throws when webhook secret is not configured", async () => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

      await expect(provider.processWebhook("{}", "sig")).rejects.toThrow(
        "STRIPE_WEBHOOK_SECRET not configured"
      );
    });

    it("throws for empty signature", async () => {
      await expect(provider.processWebhook("{}", "")).rejects.toThrow("Invalid webhook signature");
    });

    it("throws for empty payload", async () => {
      await expect(provider.processWebhook("", "sig")).rejects.toThrow("Invalid webhook signature");
    });
  });

  // ---- getStripeBilling ----

  describe("getStripeBilling", () => {
    it("returns a singleton instance", () => {
      const a = getStripeBilling();
      const b = getStripeBilling();
      expect(a).toBe(b);
      expect(a).toBeInstanceOf(StripeBillingProvider);
    });
  });
});
