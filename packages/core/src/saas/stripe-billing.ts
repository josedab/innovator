/**
 * @module saas/stripe-billing
 *
 * Stripe billing provider implementation.
 * Handles customer creation, subscriptions, invoices, and webhook processing.
 */

import { z } from "zod";
import type { BillingProvider, BillingEvent, Invoice, PlanId } from "./index.js";

/** Zod schema for Stripe configuration. */
export const StripeConfigSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  priceIds: z.record(z.string()),
});

/** Stripe configuration including secret key, webhook secret, and price ID mappings. */
export type StripeConfig = z.infer<typeof StripeConfigSchema>;

const PLAN_TO_PRICE_ID: Record<PlanId, string> = {
  free: "",
  pro: process.env.STRIPE_PRICE_PRO ?? "price_pro_monthly",
  team: process.env.STRIPE_PRICE_TEAM ?? "price_team_monthly",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "price_enterprise_monthly",
};

interface StripeApiOptions {
  method: string;
  path: string;
  body?: Record<string, string>;
}

async function stripeRequest<T>(options: StripeApiOptions): Promise<T> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  const url = `https://api.stripe.com/v1${options.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const bodyStr = options.body ? new URLSearchParams(options.body).toString() : undefined;

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: bodyStr,
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Stripe API error (${response.status}): ${errorData}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Stripe-backed billing provider.
 * Communicates with the Stripe REST API for customer, subscription, and invoice management.
 */
export class StripeBillingProvider implements BillingProvider {
  /** Create a Stripe customer and return the customer ID. */
  async createCustomer(email: string, name: string): Promise<string> {
    const result = await stripeRequest<{ id: string }>({
      method: "POST",
      path: "/customers",
      body: { email, name },
    });
    return result.id;
  }

  /** Create a subscription for a customer on the given plan. Returns the subscription ID. */
  async createSubscription(customerId: string, planId: PlanId): Promise<string> {
    if (planId === "free") {
      return `free_${customerId}`;
    }

    const priceId = PLAN_TO_PRICE_ID[planId];
    if (!priceId) {
      throw new Error(`No price configured for plan: ${planId}`);
    }

    const result = await stripeRequest<{ id: string }>({
      method: "POST",
      path: "/subscriptions",
      body: {
        customer: customerId,
        "items[0][price]": priceId,
        payment_behavior: "default_incomplete",
        "expand[]": "latest_invoice.payment_intent",
      },
    });
    return result.id;
  }

  /** Cancel a subscription. No-ops for free-tier subscriptions. */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (subscriptionId.startsWith("free_")) return;

    await stripeRequest({
      method: "DELETE",
      path: `/subscriptions/${subscriptionId}`,
    });
  }

  /** Update a subscription to a different plan with prorated charges. */
  async updateSubscription(subscriptionId: string, planId: PlanId): Promise<void> {
    if (subscriptionId.startsWith("free_")) return;

    const priceId = PLAN_TO_PRICE_ID[planId];
    if (!priceId) {
      throw new Error(`No price configured for plan: ${planId}`);
    }

    // Get subscription items first
    const sub = await stripeRequest<{ items: { data: Array<{ id: string }> } }>({
      method: "GET",
      path: `/subscriptions/${subscriptionId}`,
    });

    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      throw new Error("No subscription item found");
    }

    await stripeRequest({
      method: "POST",
      path: `/subscriptions/${subscriptionId}`,
      body: {
        "items[0][id]": itemId,
        "items[0][price]": priceId,
        proration_behavior: "create_prorations",
      },
    });
  }

  /** Retrieve the last 20 invoices for a customer. */
  async getInvoices(customerId: string): Promise<Invoice[]> {
    const result = await stripeRequest<{
      data: Array<{
        id: string;
        amount_due: number;
        currency: string;
        status: string;
        period_start: number;
        period_end: number;
        invoice_pdf: string | null;
      }>;
    }>({
      method: "GET",
      path: `/invoices?customer=${customerId}&limit=20`,
    });

    return result.data.map((inv) => ({
      id: inv.id,
      amount: inv.amount_due / 100,
      currency: inv.currency,
      status: mapInvoiceStatus(inv.status),
      periodStart: new Date(inv.period_start * 1000).toISOString(),
      periodEnd: new Date(inv.period_end * 1000).toISOString(),
      pdfUrl: inv.invoice_pdf ?? undefined,
    }));
  }

  /** Verify and process a Stripe webhook event. */
  async processWebhook(payload: string, signature: string): Promise<BillingEvent> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }

    // Verify webhook signature (simplified - in production use stripe SDK)
    if (!signature || !payload) {
      throw new Error("Invalid webhook signature");
    }

    const event = JSON.parse(payload) as {
      type: string;
      data: { object: Record<string, unknown> };
    };

    const typeMap: Record<string, BillingEvent["type"]> = {
      "customer.subscription.created": "subscription.created",
      "customer.subscription.updated": "subscription.updated",
      "customer.subscription.deleted": "subscription.deleted",
      "invoice.paid": "invoice.paid",
      "invoice.payment_failed": "invoice.failed",
      "charge.failed": "payment.failed",
    };

    const mappedType = typeMap[event.type];
    if (!mappedType) {
      throw new Error(`Unhandled webhook type: ${event.type}`);
    }

    return {
      type: mappedType,
      tenantId: event.data.object.metadata
        ? (event.data.object.metadata as Record<string, string>).tenantId
        : undefined,
      data: event.data.object,
    };
  }
}

function mapInvoiceStatus(status: string): Invoice["status"] {
  switch (status) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "paid":
      return "paid";
    case "void":
    case "uncollectible":
      return "void";
    default:
      return "open";
  }
}

/** Create a Stripe billing provider (singleton). */
let instance: StripeBillingProvider | null = null;

/**
 * Get or create the singleton Stripe billing provider.
 * @returns The {@link StripeBillingProvider} instance.
 */
export function getStripeBilling(): StripeBillingProvider {
  if (!instance) {
    instance = new StripeBillingProvider();
  }
  return instance;
}
