import { describe, it, expect, beforeEach } from "vitest";

import {
  createSubscription,
  getSubscription,
  findSubscriptionByTenant,
  cancelSubscription,
  changeSubscriptionTier,
  processStripeWebhook,
  recordMeterEvent,
  getUnreportedEvents,
  markEventsReported,
  getUsageForBilling,
  generateInvoice,
  getInvoices,
  getPricingPlans,
  clearBillingState,
  PRICING_PLANS,
} from "../api-gateway/billing.js";

describe("api-gateway/billing", () => {
  beforeEach(() => {
    clearBillingState();
  });

  describe("subscriptions", () => {
    it("creates a subscription", () => {
      const sub = createSubscription("tenant-1", "pro");
      expect(sub.tenantId).toBe("tenant-1");
      expect(sub.tier).toBe("pro");
      expect(sub.status).toBe("active");
    });

    it("creates a trial subscription", () => {
      const sub = createSubscription("tenant-2", "pro", 14);
      expect(sub.status).toBe("trialing");
      expect(sub.trialEndDate).toBeDefined();
    });

    it("finds subscription by tenant", () => {
      createSubscription("tenant-3", "free");
      const found = findSubscriptionByTenant("tenant-3");
      expect(found).toBeDefined();
      expect(found?.tier).toBe("free");
    });

    it("returns undefined for unknown tenant", () => {
      expect(findSubscriptionByTenant("nonexistent")).toBeUndefined();
    });

    it("cancels subscription at period end", () => {
      const sub = createSubscription("tenant-4", "pro");
      expect(cancelSubscription(sub.id)).toBe(true);
      const updated = getSubscription(sub.id);
      expect(updated?.cancelAtPeriodEnd).toBe(true);
    });

    it("changes subscription tier", () => {
      const sub = createSubscription("tenant-5", "free");
      expect(changeSubscriptionTier(sub.id, "enterprise")).toBe(true);
      expect(getSubscription(sub.id)?.tier).toBe("enterprise");
    });

    it("rejects changing canceled subscription", () => {
      const sub = createSubscription("tenant-6", "pro");
      sub.status = "canceled";
      expect(changeSubscriptionTier(sub.id, "enterprise")).toBe(false);
    });
  });

  describe("processStripeWebhook", () => {
    it("handles subscription created", () => {
      const result = processStripeWebhook({
        type: "customer.subscription.created",
        data: { tenantId: "tenant-7", tier: "pro" },
      });
      expect(result.handled).toBe(true);
      expect(result.action).toBe("subscription_created");
      expect(findSubscriptionByTenant("tenant-7")).toBeDefined();
    });

    it("rejects missing tenantId", () => {
      const result = processStripeWebhook({
        type: "customer.subscription.created",
        data: {},
      });
      expect(result.handled).toBe(false);
      expect(result.error).toContain("tenantId");
    });

    it("handles unknown event type", () => {
      const result = processStripeWebhook({
        type: "unknown.event",
        data: {},
      });
      expect(result.handled).toBe(false);
    });
  });

  describe("usage metering", () => {
    it("records and retrieves meter events", () => {
      const event = recordMeterEvent("tenant-8", "api_call", 1);
      expect(event.tenantId).toBe("tenant-8");
      expect(event.reported).toBe(false);

      const unreported = getUnreportedEvents("tenant-8");
      expect(unreported).toHaveLength(1);
    });

    it("marks events as reported", () => {
      const e1 = recordMeterEvent("tenant-9", "api_call", 1);
      const e2 = recordMeterEvent("tenant-9", "tokens_used", 500);
      markEventsReported([e1.id]);

      const unreported = getUnreportedEvents("tenant-9");
      expect(unreported).toHaveLength(1);
      expect(unreported[0].id).toBe(e2.id);
    });

    it("computes usage for billing period", () => {
      const start = new Date(Date.now() - 86400_000).toISOString();
      const end = new Date(Date.now() + 86400_000).toISOString();
      recordMeterEvent("tenant-10", "api_call", 5);
      recordMeterEvent("tenant-10", "tokens_used", 1000);
      recordMeterEvent("tenant-10", "pipeline_run", 2);

      const usage = getUsageForBilling("tenant-10", start, end);
      expect(usage.apiCalls).toBe(5);
      expect(usage.tokensUsed).toBe(1000);
      expect(usage.pipelineRuns).toBe(2);
    });
  });

  describe("invoices", () => {
    it("generates invoice with base subscription", () => {
      const sub = createSubscription("tenant-11", "pro");
      const invoice = generateInvoice("tenant-11", sub.id);
      expect(invoice.tenantId).toBe("tenant-11");
      expect(invoice.lines.length).toBeGreaterThanOrEqual(1);
      expect(invoice.total).toBe(49); // Pro plan
      expect(invoice.status).toBe("draft");
    });

    it("retrieves invoices by tenant", () => {
      const sub = createSubscription("tenant-12", "free");
      generateInvoice("tenant-12", sub.id);
      const invoices = getInvoices("tenant-12");
      expect(invoices).toHaveLength(1);
    });

    it("throws for unknown subscription", () => {
      expect(() => generateInvoice("tenant-x", "nonexistent")).toThrow();
    });
  });

  describe("pricing plans", () => {
    it("returns all pricing plans", () => {
      const plans = getPricingPlans();
      expect(plans).toHaveLength(3);
      expect(plans.map((p) => p.tier)).toEqual(["free", "pro", "enterprise"]);
    });

    it("has valid pricing for all plans", () => {
      for (const plan of PRICING_PLANS) {
        expect(plan.monthlyPrice).toBeGreaterThanOrEqual(0);
        expect(plan.features.length).toBeGreaterThan(0);
      }
    });
  });
});
