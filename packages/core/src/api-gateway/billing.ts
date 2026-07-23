/**
 * @module api-gateway/billing
 *
 * Billing and Stripe integration for the Innovation API.
 * Handles subscription management, usage metering for pay-as-you-go,
 * invoice generation, and payment lifecycle events.
 */

import { z } from "zod";
import type { BillingTier } from "./types.js";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const SubscriptionStatusSchema = z.enum([
  "active",
  "past_due",
  "canceled",
  "trialing",
  "paused",
]);

export const SubscriptionSchema = z.object({
  id: z.string().max(100).describe("Unique subscription identifier"),
  tenantId: z.string().max(100).describe("Tenant this subscription belongs to"),
  tier: z.enum(["free", "pro", "enterprise"]).describe("Billing tier level"),
  status: SubscriptionStatusSchema.describe("Current subscription lifecycle status"),
  stripeCustomerId: z
    .string()
    .max(200)
    .optional()
    .describe("Stripe customer ID for payment processing"),
  stripeSubscriptionId: z.string().max(200).optional().describe("Stripe subscription ID"),
  currentPeriodStart: z.string().describe("ISO 8601 start of the current billing period"),
  currentPeriodEnd: z.string().describe("ISO 8601 end of the current billing period"),
  cancelAtPeriodEnd: z
    .boolean()
    .default(false)
    .describe("Whether to cancel at the end of the current period"),
  trialEndDate: z.string().optional().describe("ISO 8601 trial expiration date"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
  updatedAt: z.string().describe("ISO 8601 last-updated timestamp"),
});

export const UsageMeterEventSchema = z.object({
  id: z.string().max(100).describe("Unique meter event identifier"),
  tenantId: z.string().max(100).describe("Tenant that generated this event"),
  eventType: z
    .enum(["api_call", "tokens_used", "pipeline_run", "artifact_generated"])
    .describe("Type of billable event"),
  quantity: z.number().min(0).describe("Quantity consumed (calls, tokens, etc.)"),
  timestamp: z.string().describe("ISO 8601 timestamp of the event"),
  metadata: z
    .record(z.string())
    .optional()
    .describe("Arbitrary key-value metadata attached to the event"),
  reported: z.boolean().default(false).describe("Whether this event has been reported to Stripe"),
});

export const InvoiceLineSchema = z.object({
  description: z.string().max(500).describe("Line item description"),
  quantity: z.number().min(0).describe("Number of units billed"),
  unitPrice: z.number().min(0).describe("Price per unit in the invoice currency"),
  amount: z.number().min(0).describe("Total amount for this line (quantity × unitPrice)"),
});

export const InvoiceSchema = z.object({
  id: z.string().max(100).describe("Unique invoice identifier"),
  tenantId: z.string().max(100).describe("Tenant this invoice belongs to"),
  subscriptionId: z.string().max(100).describe("Associated subscription ID"),
  periodStart: z.string().describe("ISO 8601 billing period start"),
  periodEnd: z.string().describe("ISO 8601 billing period end"),
  lines: z.array(InvoiceLineSchema).describe("Invoice line items"),
  subtotal: z.number().min(0).describe("Subtotal before tax"),
  tax: z.number().min(0).describe("Tax amount"),
  total: z.number().min(0).describe("Total amount due (subtotal + tax)"),
  currency: z.string().default("usd").describe("ISO 4217 currency code"),
  status: z.enum(["draft", "open", "paid", "void"]).describe("Invoice lifecycle status"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
});

export const PricingPlanSchema = z.object({
  tier: z.enum(["free", "pro", "enterprise"]).describe("Billing tier level"),
  name: z.string().describe("Human-readable plan name"),
  monthlyPrice: z.number().min(0).describe("Monthly subscription price in USD"),
  annualPrice: z.number().min(0).describe("Annual subscription price in USD"),
  features: z.array(z.string()).describe("List of feature descriptions included in the plan"),
  limits: z
    .object({
      dailyCalls: z.number().describe("Maximum API calls per day"),
      monthlyTokens: z.number().describe("Maximum tokens per month"),
      maxApiKeys: z.number().describe("Maximum number of API keys allowed"),
      webhooks: z.boolean().describe("Whether webhook notifications are enabled"),
      prioritySupport: z.boolean().describe("Whether priority support is included"),
      customModels: z.boolean().describe("Whether custom model routing is available"),
      sla: z.string().optional().describe("SLA uptime guarantee percentage"),
    })
    .describe("Resource limits for this plan"),
  overage: z
    .object({
      perCallCost: z.number().min(0).describe("Cost per API call over the daily limit"),
      perTokenCost: z.number().min(0).describe("Cost per token over the monthly limit"),
    })
    .optional()
    .describe("Overage pricing for usage beyond plan limits"),
});

// ---- Types ----

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type UsageMeterEvent = z.infer<typeof UsageMeterEventSchema>;
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type PricingPlan = z.infer<typeof PricingPlanSchema>;

// ---- Pricing Configuration ----

export const PRICING_PLANS: PricingPlan[] = [
  {
    tier: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      "10 API calls/day",
      "Basic investigation & generation",
      "Community support",
      "1 API key",
    ],
    limits: {
      dailyCalls: 10,
      monthlyTokens: 100_000,
      maxApiKeys: 1,
      webhooks: false,
      prioritySupport: false,
      customModels: false,
    },
  },
  {
    tier: "pro",
    name: "Pro",
    monthlyPrice: 49,
    annualPrice: 468,
    features: [
      "1,000 API calls/day",
      "All innovation angles",
      "Webhook notifications",
      "Priority support",
      "10 API keys",
      "Usage analytics",
    ],
    limits: {
      dailyCalls: 1_000,
      monthlyTokens: 5_000_000,
      maxApiKeys: 10,
      webhooks: true,
      prioritySupport: true,
      customModels: false,
      sla: "99.5%",
    },
    overage: {
      perCallCost: 0.01,
      perTokenCost: 0.000002,
    },
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    monthlyPrice: 299,
    annualPrice: 2868,
    features: [
      "Unlimited API calls",
      "Custom model routing",
      "Dedicated support",
      "50 API keys",
      "SLA guarantee",
      "Audit logs",
      "SSO/SAML",
    ],
    limits: {
      dailyCalls: Infinity,
      monthlyTokens: Infinity,
      maxApiKeys: 50,
      webhooks: true,
      prioritySupport: true,
      customModels: true,
      sla: "99.9%",
    },
    overage: {
      perCallCost: 0.005,
      perTokenCost: 0.000001,
    },
  },
];

// ---- In-Memory Stores ----

const subscriptions = new Map<string, Subscription>();
const usageMeterEvents: UsageMeterEvent[] = [];
const invoices = new Map<string, Invoice>();

// ---- Subscription Management ----

/** Create a subscription for a tenant. */
export function createSubscription(
  tenantId: string,
  tier: BillingTier = "free",
  trialDays?: number
): Subscription {
  const id = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const sub: Subscription = {
    id,
    tenantId,
    tier,
    status: trialDays ? "trialing" : "active",
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(trialDays && {
      trialEndDate: new Date(now.getTime() + trialDays * 86400_000).toISOString(),
    }),
  };

  subscriptions.set(id, sub);
  return sub;
}

/**
 * Get a subscription by its unique ID.
 *
 * @param id - The subscription identifier.
 * @returns The subscription, or `undefined` if not found.
 */
export function getSubscription(id: string): Subscription | undefined {
  return subscriptions.get(id);
}

/**
 * Find an active (non-canceled) subscription for a tenant.
 *
 * @param tenantId - The tenant identifier to search for.
 * @returns The first active subscription for the tenant, or `undefined` if none exists.
 */
export function findSubscriptionByTenant(tenantId: string): Subscription | undefined {
  for (const sub of subscriptions.values()) {
    if (sub.tenantId === tenantId && sub.status !== "canceled") return sub;
  }
  return undefined;
}

/** Cancel a subscription at period end. */
export function cancelSubscription(id: string): boolean {
  const sub = subscriptions.get(id);
  if (!sub) return false;
  sub.cancelAtPeriodEnd = true;
  sub.updatedAt = new Date().toISOString();
  return true;
}

/** Upgrade or downgrade a subscription tier. */
export function changeSubscriptionTier(id: string, newTier: BillingTier): boolean {
  const sub = subscriptions.get(id);
  if (!sub || sub.status === "canceled") return false;
  sub.tier = newTier;
  sub.updatedAt = new Date().toISOString();
  return true;
}

/** Process a Stripe webhook event for subscription lifecycle. */
export function processStripeWebhook(event: { type: string; data: Record<string, unknown> }): {
  handled: boolean;
  action?: string;
  error?: string;
} {
  const str = (key: string): string | undefined => {
    const v = event.data[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  switch (event.type) {
    case "customer.subscription.created": {
      const tenantId = str("tenantId");
      if (!tenantId) return { handled: false, error: "Missing tenantId" };
      const tier = (str("tier") as BillingTier) ?? "pro";
      createSubscription(tenantId, tier);
      return { handled: true, action: "subscription_created" };
    }

    case "customer.subscription.updated": {
      const subId = str("subscriptionId");
      const newTier = str("tier") as BillingTier | undefined;
      if (subId && newTier) changeSubscriptionTier(subId, newTier);
      return { handled: true, action: "subscription_updated" };
    }

    case "customer.subscription.deleted": {
      const subId = str("subscriptionId");
      if (subId) cancelSubscription(subId);
      return { handled: true, action: "subscription_canceled" };
    }

    case "invoice.payment_succeeded": {
      const invId = str("invoiceId");
      if (invId) {
        const inv = invoices.get(invId);
        if (inv) inv.status = "paid";
      }
      return { handled: true, action: "payment_succeeded" };
    }

    case "invoice.payment_failed": {
      const subId = str("subscriptionId");
      const sub = subId ? subscriptions.get(subId) : undefined;
      if (sub) {
        sub.status = "past_due";
        sub.updatedAt = new Date().toISOString();
      }
      return { handled: true, action: "payment_failed" };
    }

    default:
      return { handled: false };
  }
}

// ---- Usage Metering ----

/** Record a usage meter event for billing. */
export function recordMeterEvent(
  tenantId: string,
  eventType: UsageMeterEvent["eventType"],
  quantity: number,
  metadata?: Record<string, string>
): UsageMeterEvent {
  const event: UsageMeterEvent = {
    id: `meter_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    eventType,
    quantity,
    timestamp: new Date().toISOString(),
    metadata,
    reported: false,
  };

  usageMeterEvents.push(event);
  return event;
}

/**
 * Get unreported meter events for a tenant, pending Stripe reporting.
 *
 * @param tenantId - The tenant identifier to filter by.
 * @returns Array of unreported usage meter events.
 */
export function getUnreportedEvents(tenantId: string): UsageMeterEvent[] {
  return usageMeterEvents.filter((e) => e.tenantId === tenantId && !e.reported);
}

/**
 * Mark meter events as reported to Stripe.
 *
 * @param eventIds - Array of event IDs to mark as reported.
 * @returns The number of events that were found and marked.
 */
export function markEventsReported(eventIds: string[]): number {
  let count = 0;
  for (const event of usageMeterEvents) {
    if (eventIds.includes(event.id)) {
      event.reported = true;
      count++;
    }
  }
  return count;
}

/**
 * Get aggregated usage summary for a tenant's billing period.
 *
 * @param tenantId - The tenant identifier.
 * @param periodStart - ISO 8601 start of the billing period.
 * @param periodEnd - ISO 8601 end of the billing period.
 * @returns Breakdown of API calls, tokens, pipeline runs, and artifacts generated.
 */
export function getUsageForBilling(
  tenantId: string,
  periodStart: string,
  periodEnd: string
): {
  apiCalls: number;
  tokensUsed: number;
  pipelineRuns: number;
  artifactsGenerated: number;
} {
  const events = usageMeterEvents.filter(
    (e) => e.tenantId === tenantId && e.timestamp >= periodStart && e.timestamp <= periodEnd
  );

  return {
    apiCalls: events.filter((e) => e.eventType === "api_call").reduce((s, e) => s + e.quantity, 0),
    tokensUsed: events
      .filter((e) => e.eventType === "tokens_used")
      .reduce((s, e) => s + e.quantity, 0),
    pipelineRuns: events
      .filter((e) => e.eventType === "pipeline_run")
      .reduce((s, e) => s + e.quantity, 0),
    artifactsGenerated: events
      .filter((e) => e.eventType === "artifact_generated")
      .reduce((s, e) => s + e.quantity, 0),
  };
}

// ---- Invoice Generation ----

/** Generate an invoice for a billing period. */
export function generateInvoice(tenantId: string, subscriptionId: string): Invoice {
  const sub = subscriptions.get(subscriptionId);
  if (!sub) throw new ValidationError(`Subscription not found: ${subscriptionId}`);

  const plan = PRICING_PLANS.find((p) => p.tier === sub.tier);
  if (!plan) throw new ValidationError(`Unknown tier: ${sub.tier}`);

  const usage = getUsageForBilling(tenantId, sub.currentPeriodStart, sub.currentPeriodEnd);

  const lines: InvoiceLine[] = [
    {
      description: `${plan.name} Plan — Monthly Subscription`,
      quantity: 1,
      unitPrice: plan.monthlyPrice,
      amount: plan.monthlyPrice,
    },
  ];

  // Overage charges
  if (plan.overage && plan.limits.dailyCalls !== Infinity) {
    const periodDays = Math.ceil(
      (new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime()) /
        86400_000
    );
    const totalAllowed = plan.limits.dailyCalls * periodDays;
    const overageCalls = Math.max(0, usage.apiCalls - totalAllowed);

    if (overageCalls > 0) {
      lines.push({
        description: `API call overage (${overageCalls} calls)`,
        quantity: overageCalls,
        unitPrice: plan.overage.perCallCost,
        amount: Math.round(overageCalls * plan.overage.perCallCost * 100) / 100,
      });
    }

    const tokenOverage = Math.max(0, usage.tokensUsed - plan.limits.monthlyTokens);
    if (tokenOverage > 0) {
      lines.push({
        description: `Token overage (${tokenOverage.toLocaleString()} tokens)`,
        quantity: tokenOverage,
        unitPrice: plan.overage.perTokenCost,
        amount: Math.round(tokenOverage * plan.overage.perTokenCost * 100) / 100,
      });
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = Math.round(subtotal * 0.0 * 100) / 100; // Tax calculated by Stripe

  const invoice: Invoice = {
    id: `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    subscriptionId,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    lines,
    subtotal,
    tax,
    total: subtotal + tax,
    currency: "usd",
    status: "draft",
    createdAt: new Date().toISOString(),
  };

  invoices.set(invoice.id, invoice);
  return invoice;
}

/**
 * Get all invoices for a tenant.
 *
 * @param tenantId - The tenant identifier.
 * @returns Array of invoices belonging to the tenant.
 */
export function getInvoices(tenantId: string): Invoice[] {
  return Array.from(invoices.values()).filter((i) => i.tenantId === tenantId);
}

/** Get pricing plans for display. */
export function getPricingPlans(): PricingPlan[] {
  return [...PRICING_PLANS];
}

/**
 * Clear all billing state (subscriptions, meter events, invoices).
 * Primarily intended for test teardown.
 */
export function clearBillingState(): void {
  subscriptions.clear();
  usageMeterEvents.length = 0;
  invoices.clear();
}
