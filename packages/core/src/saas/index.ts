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

/** All available plan definitions keyed by plan ID. */
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

// ---- Usage Metering ----

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

// ---- API Key ----

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

// ---- In-Memory Stores ----

const tenants = new Map<string, Tenant>();
const usage = new Map<string, UsageRecord>();
const apiKeys = new Map<string, SaasApiKey>();

// ---- Tenant Management ----

/**
 * Create a new tenant with the given details.
 * Initializes usage metering and optionally starts a 14-day trial for paid plans.
 * @param input - Tenant creation parameters (name, slug, ownerId, optional planId and billingEmail).
 * @returns The newly created {@link Tenant} record.
 * @throws If a tenant with the same slug already exists.
 */
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

/**
 * Look up a tenant by its unique ID.
 * @param id - The tenant UUID.
 * @returns The {@link Tenant} record, or `undefined` if not found.
 */
export function getTenant(id: string): Tenant | undefined {
  return tenants.get(id);
}

/**
 * Look up a tenant by its URL-safe slug.
 * @param slug - The tenant slug (lowercase alphanumeric with hyphens).
 * @returns The {@link Tenant} record, or `undefined` if not found.
 */
export function getTenantBySlug(slug: string): Tenant | undefined {
  return Array.from(tenants.values()).find((t) => t.slug === slug);
}

/**
 * Change a tenant's subscription plan.
 * @param tenantId - The tenant UUID.
 * @param planId - The new plan to assign.
 * @returns The updated {@link Tenant}, or `undefined` if the tenant was not found.
 */
export function updateTenantPlan(tenantId: string, planId: PlanId): Tenant | undefined {
  const tenant = tenants.get(tenantId);
  if (!tenant) return undefined;
  tenant.planId = planId;
  tenant.updatedAt = new Date().toISOString();
  return tenant;
}

/**
 * Suspend a tenant, preventing further API access.
 * @param tenantId - The tenant UUID to suspend.
 * @returns `true` if the tenant was found and suspended, `false` otherwise.
 */
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

/**
 * Retrieve usage metrics for a tenant in the given billing period.
 * Initializes a zero-usage record if none exists for the current period.
 * @param tenantId - The tenant UUID.
 * @param period - Optional billing period in `YYYY-MM` format (defaults to current month).
 * @returns The {@link UsageRecord} for the specified period.
 */
export function getUsage(tenantId: string, period?: string): UsageRecord {
  const key = usageKey(tenantId, period);
  return usage.get(key) ?? initializeUsage(tenantId);
}

/**
 * Increment a usage counter for a tenant in the current billing period.
 * @param tenantId - The tenant UUID.
 * @param field - The usage field to increment.
 * @param amount - The amount to add (defaults to 1).
 * @returns The updated {@link UsageRecord}.
 */
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

/** Result of a plan limit check, indicating whether the action is allowed. */
export interface LimitCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  limitName: string;
  upgradeRequired?: PlanId;
}

/**
 * Check whether a tenant has remaining capacity for a given plan limit.
 * @param tenantId - The tenant UUID.
 * @param limitName - The plan limit to check (e.g., `"sessionsPerMonth"`).
 * @returns A {@link LimitCheckResult} indicating whether the action is allowed and current usage.
 */
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
    case "anglesPerSession":
      currentUsage = record.anglesGenerated;
      break;
    case "customAngles":
      currentUsage = record.anglesGenerated;
      break;
    case "storageGB": {
      const usedGB = record.storageUsedBytes / (1024 * 1024 * 1024);
      currentUsage = Math.round(usedGB * 100) / 100;
      break;
    }
    case "teamMembers":
    case "historyRetentionDays":
    case "concurrentSessions":
      currentUsage = 0;
      break;
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

/**
 * Create a new API key for a tenant.
 * The raw key is returned once and should be shown to the user immediately;
 * only the hashed version is stored.
 * @param tenantId - The tenant UUID.
 * @param name - A human-readable name for the key.
 * @param scopes - Permission scopes (defaults to `["read", "write"]`).
 * @returns An object containing the persisted {@link SaasApiKey} and the plaintext `rawKey`.
 */
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

/**
 * Validate a raw API key and return the matching key record if valid and not revoked.
 * @param rawKey - The plaintext API key to validate.
 * @param requiredScope - Optional scope that must be present on the key.
 * @returns The matching {@link SaasApiKey}, or `undefined` if invalid, revoked, or missing scope.
 */
export function validateApiKey(rawKey: string, requiredScope?: string): SaasApiKey | undefined {
  const hashed = hashKey(rawKey);
  const key = Array.from(apiKeys.values()).find((k) => k.hashedKey === hashed && !k.revokedAt);
  if (!key) return undefined;

  // Check expiration
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return undefined;

  // Validate scope if required
  if (requiredScope && !key.scopes.includes(requiredScope) && !key.scopes.includes("*")) {
    return undefined;
  }

  // Update last used timestamp
  key.lastUsedAt = new Date().toISOString();
  return key;
}

/**
 * Revoke an API key by ID, marking it as unusable.
 * @param keyId - The API key UUID.
 * @returns `true` if the key was found and revoked, `false` otherwise.
 */
export function revokeApiKey(keyId: string): boolean {
  const key = apiKeys.get(keyId);
  if (!key) return false;
  key.revokedAt = new Date().toISOString();
  return true;
}

/**
 * List all active (non-revoked) API keys for a tenant.
 * @param tenantId - The tenant UUID.
 * @returns Array of active {@link SaasApiKey} records.
 */
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

// ---- Cleanup ----

/**
 * Clear all in-memory SaaS data (tenants, usage, API keys).
 * Intended for test teardown.
 */
export function clearSaasData(): void {
  tenants.clear();
  usage.clear();
  apiKeys.clear();
  workspaces.clear();
  sharedResults.clear();
}

/**
 * Get the full plan definition for a given plan ID.
 * @param planId - The plan identifier.
 * @returns The {@link PlanDefinition} for the requested plan.
 */
export function getPlan(planId: PlanId): PlanDefinition {
  return PLANS[planId];
}

/**
 * List all available plan definitions.
 * @returns Array of all {@link PlanDefinition} records.
 */
export function listPlans(): PlanDefinition[] {
  return Object.values(PLANS);
}

// ---- Team Workspaces ----

/** Zod schema for validating workspace records. */
export const WorkspaceSchema = z.object({
  id: z.string().max(200),
  tenantId: z.string().max(200),
  name: z.string().max(200),
  slug: z.string().max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  members: z.array(
    z.object({
      userId: z.string().max(200),
      role: z.enum(["owner", "admin", "member", "viewer"]),
      joinedAt: z.string(),
    })
  ).max(200),
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

const workspaces = new Map<string, Workspace>();

export function createWorkspace(input: {
  tenantId: string;
  name: string;
  slug: string;
  ownerId: string;
  description?: string;
}): Workspace {
  if (Array.from(workspaces.values()).some((w) => w.slug === input.slug && w.tenantId === input.tenantId)) {
    throw new Error(`Workspace slug "${input.slug}" already exists in this tenant`);
  }

  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: randomUUID(),
    tenantId: input.tenantId,
    name: input.name,
    slug: input.slug,
    description: input.description,
    members: [{ userId: input.ownerId, role: "owner", joinedAt: now }],
    settings: {
      sharedKnowledgeGraph: true,
      autoShareResults: false,
    },
    createdAt: now,
    updatedAt: now,
  };

  workspaces.set(workspace.id, workspace);
  return workspace;
}

export function getWorkspace(id: string): Workspace | undefined {
  return workspaces.get(id);
}

export function listTenantWorkspaces(tenantId: string): Workspace[] {
  return Array.from(workspaces.values()).filter((w) => w.tenantId === tenantId);
}

export function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: "admin" | "member" | "viewer" = "member"
): Workspace | undefined {
  const ws = workspaces.get(workspaceId);
  if (!ws) return undefined;
  if (ws.members.some((m) => m.userId === userId)) return ws;

  ws.members.push({ userId, role, joinedAt: new Date().toISOString() });
  ws.updatedAt = new Date().toISOString();
  return ws;
}

export function removeWorkspaceMember(
  workspaceId: string,
  userId: string
): boolean {
  const ws = workspaces.get(workspaceId);
  if (!ws) return false;

  const ownerCount = ws.members.filter((m) => m.role === "owner").length;
  const member = ws.members.find((m) => m.userId === userId);
  if (member?.role === "owner" && ownerCount <= 1) {
    throw new Error("Cannot remove the last owner of a workspace");
  }

  ws.members = ws.members.filter((m) => m.userId !== userId);
  ws.updatedAt = new Date().toISOString();
  return true;
}

// ---- Shareable Result URLs ----

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

const sharedResults = new Map<string, SharedResult>();

function generateShareHash(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export function createSharedResult(input: {
  createdBy: string;
  title: string;
  resultType: SharedResult["resultType"];
  resultData: unknown;
  tenantId?: string;
  workspaceId?: string;
  visibility?: SharedResult["visibility"];
  expiresInDays?: number;
}): SharedResult {
  const hash = generateShareHash();
  const now = new Date().toISOString();

  const result: SharedResult = {
    id: randomUUID(),
    hash,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    title: input.title,
    resultType: input.resultType,
    resultData: input.resultData,
    visibility: input.visibility ?? "public",
    expiresAt: input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
      : undefined,
    viewCount: 0,
    createdAt: now,
  };

  sharedResults.set(hash, result);
  return result;
}

export function getSharedResult(hash: string): SharedResult | undefined {
  const result = sharedResults.get(hash);
  if (!result) return undefined;

  if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
    sharedResults.delete(hash);
    return undefined;
  }

  result.viewCount++;
  return result;
}

export function listSharedResults(createdBy: string): SharedResult[] {
  return Array.from(sharedResults.values())
    .filter((r) => r.createdBy === createdBy)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
