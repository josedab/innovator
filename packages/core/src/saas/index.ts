/**
 * @module saas
 *
 * SaaS tier: multi-tenancy, plan management, usage metering,
 * billing integration interfaces, and API key management.
 * Provides the business logic layer for a hosted Innovator offering.
 */

// Re-export sub-modules
export {
  getAuthorizationUrl,
  validateState,
  exchangeCodeForUser,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
  getAuthenticatedUser,
  clearAuthData,
  GitHubUserSchema,
  OAuthStateSchema,
} from "./github-oauth.js";
export type { GitHubUser, OAuthState, OAuthConfig } from "./github-oauth.js";

export { StripeBillingProvider, getStripeBilling } from "./stripe-billing.js";

export {
  InMemoryStorageAdapter,
  PostgresStorageAdapter,
  getStorage,
  setStorage,
  POSTGRES_MIGRATION,
  PostgresConfigSchema,
} from "./storage.js";
export type { StorageAdapter, PostgresConfig } from "./storage.js";

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Plan Definitions ----

export const PlanIdSchema = z.enum(["free", "pro", "team", "enterprise"]);
export type PlanId = z.infer<typeof PlanIdSchema>;

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  limits: PlanLimits;
  features: string[];
}

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

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "Get started with AI-powered innovation",
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      sessionsPerMonth: 5,
      anglesPerSession: 3,
      teamMembers: 1,
      storageGB: 0.1,
      apiRequestsPerDay: 10,
      customAngles: 2,
      historyRetentionDays: 30,
      concurrentSessions: 1,
    },
    features: ["5 sessions/month", "3 angles per session", "30-day history", "Community support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Unlimited innovation for professionals",
    priceMonthly: 19,
    priceYearly: 190,
    limits: {
      sessionsPerMonth: 100,
      anglesPerSession: 8,
      teamMembers: 1,
      storageGB: 5,
      apiRequestsPerDay: 500,
      customAngles: 20,
      historyRetentionDays: 365,
      concurrentSessions: 3,
    },
    features: [
      "100 sessions/month",
      "All 8 angles",
      "Custom angles",
      "1-year history",
      "API access",
      "Export to all formats",
      "Priority support",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    description: "Collaborative innovation for teams",
    priceMonthly: 49,
    priceYearly: 490,
    limits: {
      sessionsPerMonth: 500,
      anglesPerSession: 8,
      teamMembers: 25,
      storageGB: 50,
      apiRequestsPerDay: 2000,
      customAngles: 100,
      historyRetentionDays: 730,
      concurrentSessions: 10,
    },
    features: [
      "500 sessions/month",
      "Up to 25 members",
      "Collaborative sessions",
      "Team workspaces",
      "Analytics dashboard",
      "Knowledge graph",
      "Webhook integrations",
      "SSO (Google/GitHub)",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Full-scale innovation management",
    priceMonthly: 0, // Custom pricing
    priceYearly: 0,
    limits: {
      sessionsPerMonth: -1, // Unlimited
      anglesPerSession: 8,
      teamMembers: -1,
      storageGB: -1,
      apiRequestsPerDay: -1,
      customAngles: -1,
      historyRetentionDays: -1,
      concurrentSessions: -1,
    },
    features: [
      "Unlimited everything",
      "SAML/OIDC SSO",
      "Audit logging",
      "Data residency controls",
      "SLA guarantee",
      "Dedicated support",
      "Custom integrations",
      "On-premise option",
    ],
  },
};

// ---- Tenant / Account ----

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
export type Tenant = z.infer<typeof TenantSchema>;

// ---- Usage Metering ----

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
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

// ---- API Key ----

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
export type SaasApiKey = z.infer<typeof SaasApiKeySchema>;

// ---- In-Memory Stores ----

const tenants = new Map<string, Tenant>();
const usage = new Map<string, UsageRecord>();
const apiKeys = new Map<string, SaasApiKey>();

// ---- Tenant Management ----

export function createTenant(input: {
  name: string;
  slug: string;
  ownerId: string;
  planId?: PlanId;
  billingEmail?: string;
}): Tenant {
  if (Array.from(tenants.values()).some((t) => t.slug === input.slug)) {
    throw new Error(`Tenant slug "${input.slug}" already exists`);
  }

  const now = new Date().toISOString();
  const tenant: Tenant = {
    id: randomUUID(),
    name: input.name,
    slug: input.slug,
    ownerId: input.ownerId,
    planId: input.planId ?? "free",
    status: "active",
    billingEmail: input.billingEmail,
    createdAt: now,
    updatedAt: now,
    trialEndsAt:
      input.planId === "pro" || input.planId === "team"
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
  };

  tenants.set(tenant.id, tenant);
  initializeUsage(tenant.id);
  return tenant;
}

export function getTenant(id: string): Tenant | undefined {
  return tenants.get(id);
}

export function getTenantBySlug(slug: string): Tenant | undefined {
  return Array.from(tenants.values()).find((t) => t.slug === slug);
}

export function updateTenantPlan(tenantId: string, planId: PlanId): Tenant | undefined {
  const tenant = tenants.get(tenantId);
  if (!tenant) return undefined;
  tenant.planId = planId;
  tenant.updatedAt = new Date().toISOString();
  return tenant;
}

export function suspendTenant(tenantId: string): boolean {
  const tenant = tenants.get(tenantId);
  if (!tenant) return false;
  tenant.status = "suspended";
  tenant.updatedAt = new Date().toISOString();
  return true;
}

// ---- Usage Metering ----

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usageKey(tenantId: string, period?: string): string {
  return `${tenantId}:${period ?? currentPeriod()}`;
}

function initializeUsage(tenantId: string): UsageRecord {
  const period = currentPeriod();
  const record: UsageRecord = {
    tenantId,
    period,
    sessionsUsed: 0,
    anglesGenerated: 0,
    apiRequests: 0,
    storageUsedBytes: 0,
    llmTokensUsed: 0,
    lastUpdated: new Date().toISOString(),
  };
  usage.set(usageKey(tenantId), record);
  return record;
}

export function getUsage(tenantId: string, period?: string): UsageRecord {
  const key = usageKey(tenantId, period);
  return usage.get(key) ?? initializeUsage(tenantId);
}

export function incrementUsage(
  tenantId: string,
  field: "sessionsUsed" | "anglesGenerated" | "apiRequests" | "llmTokensUsed",
  amount: number = 1
): UsageRecord {
  const record = getUsage(tenantId);
  record[field] += amount;
  record.lastUpdated = new Date().toISOString();
  usage.set(usageKey(tenantId), record);
  return record;
}

// ---- Limit Checking ----

export interface LimitCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  limitName: string;
  upgradeRequired?: PlanId;
}

export function checkLimit(tenantId: string, limitName: keyof PlanLimits): LimitCheckResult {
  const tenant = tenants.get(tenantId);
  if (!tenant) {
    return { allowed: false, currentUsage: 0, limit: 0, limitName };
  }

  const plan = PLANS[tenant.planId];
  const limit = plan.limits[limitName];

  if (limit === -1) {
    return { allowed: true, currentUsage: 0, limit: -1, limitName };
  }

  const record = getUsage(tenantId);
  let currentUsage = 0;

  switch (limitName) {
    case "sessionsPerMonth":
      currentUsage = record.sessionsUsed;
      break;
    case "apiRequestsPerDay":
      currentUsage = record.apiRequests;
      break;
    default:
      currentUsage = 0;
  }

  const allowed = currentUsage < limit;
  const upgradeRequired = !allowed ? suggestUpgrade(tenant.planId) : undefined;

  return { allowed, currentUsage, limit, limitName, upgradeRequired };
}

function suggestUpgrade(currentPlan: PlanId): PlanId | undefined {
  const upgradePath: Record<PlanId, PlanId | undefined> = {
    free: "pro",
    pro: "team",
    team: "enterprise",
    enterprise: undefined,
  };
  return upgradePath[currentPlan];
}

// ---- API Key Management ----

export function createApiKey(
  tenantId: string,
  name: string,
  scopes: string[] = ["read", "write"]
): { apiKey: SaasApiKey; rawKey: string } {
  const rawKey = `inv_${randomUUID().replace(/-/g, "")}`;
  const hashedKey = hashKey(rawKey);
  const prefix = rawKey.slice(0, 8);

  const key: SaasApiKey = {
    id: randomUUID(),
    tenantId,
    name,
    prefix,
    hashedKey,
    scopes,
    createdAt: new Date().toISOString(),
  };

  apiKeys.set(key.id, key);
  return { apiKey: key, rawKey };
}

export function validateApiKey(rawKey: string): SaasApiKey | undefined {
  const hashed = hashKey(rawKey);
  return Array.from(apiKeys.values()).find((k) => k.hashedKey === hashed && !k.revokedAt);
}

export function revokeApiKey(keyId: string): boolean {
  const key = apiKeys.get(keyId);
  if (!key) return false;
  key.revokedAt = new Date().toISOString();
  return true;
}

export function listTenantApiKeys(tenantId: string): SaasApiKey[] {
  return Array.from(apiKeys.values()).filter((k) => k.tenantId === tenantId && !k.revokedAt);
}

function hashKey(key: string): string {
  // In production, use crypto.createHash('sha256'). Simplified for portability.
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const chr = key.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}

// ---- Billing Integration Interface ----

export interface BillingProvider {
  createCustomer(email: string, name: string): Promise<string>;
  createSubscription(customerId: string, planId: PlanId): Promise<string>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  updateSubscription(subscriptionId: string, planId: PlanId): Promise<void>;
  getInvoices(customerId: string): Promise<Invoice[]>;
  processWebhook(payload: string, signature: string): Promise<BillingEvent>;
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void";
  periodStart: string;
  periodEnd: string;
  pdfUrl?: string;
}

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

// ---- Cleanup ----

export function clearSaasData(): void {
  tenants.clear();
  usage.clear();
  apiKeys.clear();
}

export function getPlan(planId: PlanId): PlanDefinition {
  return PLANS[planId];
}

export function listPlans(): PlanDefinition[] {
  return Object.values(PLANS);
}
