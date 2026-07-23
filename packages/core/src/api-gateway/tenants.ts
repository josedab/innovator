import { createApiKey, getApiKey, revokeApiKey, updateApiKeyTier } from "./api-keys.js";
import { TIER_LIMITS } from "./config.js";
import { tenants } from "./state.js";
import type { ApiKey, BillingTier, DeveloperPortalInfo, Tenant } from "./types.js";
import { getWebhooks } from "./webhook-state.js";

/**
 * Create a new tenant for multi-tenant SaaS.
 */
export function createTenant(name: string, ownerEmail: string, tier: BillingTier = "free"): Tenant {
  const id = `tenant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 100);

  const initialKey = createApiKey(`${name} Default Key`, tier);

  const tenant: Tenant = {
    id,
    name,
    slug,
    tier,
    ownerId: ownerEmail,
    ownerEmail,
    apiKeys: [initialKey.id],
    createdAt: new Date().toISOString(),
    status: "active",
    settings: {
      maxKeys: tier === "enterprise" ? 50 : tier === "pro" ? 10 : 2,
      webhooksEnabled: tier !== "free",
    },
    usage: {
      currentPeriodCalls: 0,
      currentPeriodTokens: 0,
      periodStart: new Date().toISOString(),
    },
  };

  tenants.set(id, tenant);
  return tenant;
}

/**
 * Get a tenant by its unique identifier.
 *
 * @param id - The tenant identifier.
 * @returns The tenant, or `undefined` if not found.
 */
export function getTenant(id: string): Tenant | undefined {
  return tenants.get(id);
}

/** Find a tenant by slug. */
export function findTenantBySlug(slug: string): Tenant | undefined {
  for (const tenant of tenants.values()) {
    if (tenant.slug === slug) return tenant;
  }
  return undefined;
}

/** List all tenants. */
export function listTenants(): Tenant[] {
  return Array.from(tenants.values());
}

/** Update tenant tier (upgrade/downgrade). */
export function updateTenantTier(tenantId: string, tier: BillingTier): boolean {
  const tenant = tenants.get(tenantId);
  if (!tenant) return false;
  tenant.tier = tier;
  tenant.settings.maxKeys = tier === "enterprise" ? 50 : tier === "pro" ? 10 : 2;
  tenant.settings.webhooksEnabled = tier !== "free";
  for (const keyId of tenant.apiKeys) {
    updateApiKeyTier(keyId, tier);
  }
  return true;
}

/** Suspend a tenant. */
export function suspendTenant(tenantId: string): boolean {
  const tenant = tenants.get(tenantId);
  if (!tenant) return false;
  tenant.status = "suspended";
  for (const keyId of tenant.apiKeys) {
    revokeApiKey(keyId);
  }
  return true;
}

/** Add a new API key to a tenant. */
export function addTenantApiKey(tenantId: string, name: string): ApiKey | null {
  const tenant = tenants.get(tenantId);
  if (!tenant || tenant.status !== "active") return null;
  if (tenant.apiKeys.length >= tenant.settings.maxKeys) return null;
  const key = createApiKey(name, tenant.tier);
  tenant.apiKeys.push(key.id);
  return key;
}

/**
 * Get developer portal information for a tenant.
 */
export function getDeveloperPortalInfo(tenantId: string): DeveloperPortalInfo | null {
  const tenant = tenants.get(tenantId);
  if (!tenant) return null;

  const keys = tenant.apiKeys
    .map((id) => getApiKey(id))
    .filter((k): k is ApiKey => k !== undefined);

  const limits = TIER_LIMITS[tenant.tier];

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tier: tenant.tier,
    apiKeys: keys,
    usage: {
      currentPeriodCalls: tenant.usage.currentPeriodCalls,
      currentPeriodTokens: tenant.usage.currentPeriodTokens,
      dailyLimit: limits.dailyLimit,
      minuteLimit: limits.minuteLimit,
    },
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/investigate",
        description: "Investigate a subject for innovation opportunities",
      },
      {
        method: "POST",
        path: "/api/v1/innovate",
        description: "Generate innovation ideas using creativity angles",
      },
      {
        method: "POST",
        path: "/api/v1/auto",
        description: "Run the full innovation pipeline (SSE streaming)",
      },
      {
        method: "POST",
        path: "/api/v1/validate",
        description: "Validate ideas against market and feasibility data",
      },
      {
        method: "POST",
        path: "/api/v1/artifacts",
        description: "Generate structured artifacts (PRD, tech spec, etc.)",
      },
      {
        method: "POST",
        path: "/api/v1/pipeline",
        description: "Run a natural language pipeline (SSE streaming)",
      },
      { method: "GET", path: "/api/v1/health", description: "Check API health and status" },
    ],
    webhooks: tenant.settings.webhooksEnabled ? getWebhooks(tenant.apiKeys[0] ?? "") : [],
  };
}
