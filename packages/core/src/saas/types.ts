import { z } from "zod";

/** Zod schema for validating plan identifiers. */
export const PlanIdSchema = z.enum(["free", "pro", "team", "enterprise"]);
/** A valid plan tier identifier. */
export type PlanId = z.infer<typeof PlanIdSchema>;

/** Full definition of a SaaS plan including pricing, limits, and feature list. */
export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  limits: PlanLimits;
  features: string[];
}

/** Numeric limits enforced per plan tier. A value of `-1` means unlimited. */
export interface PlanLimits {
  sessionsPerMonth: number;
  anglesPerSession: number;
  teamMembers: number;
  storageGB: number;
  apiRequestsPerDay: number;
  customAngles: number;
  historyRetentionDays: number;
  concurrentSessions: number;
}

/** Zod schema for validating tenant records. */
export const TenantSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  ownerId: z.string(),
  planId: PlanIdSchema,
  status: z.enum(["active", "suspended", "cancelled"]),
  billingEmail: z.string().email().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  trialEndsAt: z.string().optional(),
});
/** A tenant (organization or individual account) in the SaaS system. */
export type Tenant = z.infer<typeof TenantSchema>;

/** Zod schema for validating usage metering records. */
export const UsageRecordSchema = z.object({
  tenantId: z.string(),
  period: z.string().describe("YYYY-MM format"),
  sessionsUsed: z.number().min(0),
  anglesGenerated: z.number().min(0),
  apiRequests: z.number().min(0),
  storageUsedBytes: z.number().min(0),
  llmTokensUsed: z.number().min(0),
  lastUpdated: z.string(),
});
/** Aggregated usage metrics for a tenant within a billing period. */
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

/** Zod schema for validating SaaS API key records. */
export const SaasApiKeySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().max(200),
  prefix: z.string().max(10),
  hashedKey: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  revokedAt: z.string().optional(),
});
/** A SaaS API key with hashed secret, scopes, and lifecycle timestamps. */
export type SaasApiKey = z.infer<typeof SaasApiKeySchema>;

/** Result of a plan limit check, indicating whether the action is allowed. */
export interface LimitCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  limitName: string;
  upgradeRequired?: PlanId;
}

/** Interface for external billing providers (e.g., Stripe). */
export interface BillingProvider {
  createCustomer(email: string, name: string): Promise<string>;
  createSubscription(customerId: string, planId: PlanId): Promise<string>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  updateSubscription(subscriptionId: string, planId: PlanId): Promise<void>;
  getInvoices(customerId: string): Promise<Invoice[]>;
  processWebhook(payload: string, signature: string): Promise<BillingEvent>;
}

/** A billing invoice record. */
export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void";
  periodStart: string;
  periodEnd: string;
  pdfUrl?: string;
}

/** A billing lifecycle event received from the payment provider webhook. */
export interface BillingEvent {
  type:
    | "subscription.created"
    | "subscription.updated"
    | "subscription.deleted"
    | "invoice.paid"
    | "invoice.failed"
    | "payment.failed";
  tenantId?: string;
  data: Record<string, unknown>;
}

/** Zod schema for validating workspace records. */
export const WorkspaceSchema = z.object({
  id: z.string().max(200),
  tenantId: z.string().max(200),
  name: z.string().max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  members: z
    .array(
      z.object({
        userId: z.string().max(200),
        role: z.enum(["owner", "admin", "member", "viewer"]),
        joinedAt: z.string(),
      })
    )
    .max(200),
  settings: z.object({
    defaultAngles: z.array(z.string().max(100)).max(10).optional(),
    defaultModel: z.string().max(100).optional(),
    sharedKnowledgeGraph: z.boolean().default(true),
    autoShareResults: z.boolean().default(false),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Zod schema for shareable result records. */
export const SharedResultSchema = z.object({
  id: z.string().max(200),
  hash: z.string().max(64),
  tenantId: z.string().max(200).optional(),
  workspaceId: z.string().max(200).optional(),
  createdBy: z.string().max(200),
  title: z.string().max(500),
  resultType: z.enum(["investigation", "pipeline", "session", "portfolio"]),
  resultData: z.unknown(),
  visibility: z.enum(["public", "team", "private"]).default("public"),
  expiresAt: z.string().optional(),
  viewCount: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type SharedResult = z.infer<typeof SharedResultSchema>;
