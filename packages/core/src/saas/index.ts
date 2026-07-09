/**
 * @module saas
 *
 * Compatibility barrel for the SaaS plan, tenant, billing, storage, and hosted-platform APIs.
 */

export {
  PlanIdSchema,
  TenantSchema,
  UsageRecordSchema,
  SaasApiKeySchema,
  WorkspaceSchema,
  SharedResultSchema,
} from "./types.js";
export type {
  PlanId,
  PlanDefinition,
  PlanLimits,
  Tenant,
  UsageRecord,
  SaasApiKey,
  LimitCheckResult,
  BillingProvider,
  Invoice,
  BillingEvent,
  Workspace,
  SharedResult,
} from "./types.js";

export {
  PLANS,
  createTenant,
  getTenant,
  getTenantBySlug,
  updateTenantPlan,
  suspendTenant,
  getUsage,
  incrementUsage,
  checkLimit,
  createApiKey,
  validateApiKey,
  revokeApiKey,
  listTenantApiKeys,
  clearSaasData,
  getPlan,
  listPlans,
  createWorkspace,
  getWorkspace,
  listTenantWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember,
  createSharedResult,
  getSharedResult,
  listSharedResults,
} from "./saas.js";

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

export {
  getGoogleAuthorizationUrl,
  validateGoogleState,
  exchangeGoogleCode,
  getAuthenticatedGoogleUser,
  clearGoogleAuthData,
  GoogleUserSchema,
  GoogleOAuthStateSchema,
} from "./google-oauth.js";
export type { GoogleUser, GoogleOAuthState, GoogleOAuthConfig } from "./google-oauth.js";

export {
  RateLimitConfigSchema,
  RateLimitResultSchema,
  RateLimitStatusSchema,
  DEFAULT_RATE_LIMITS,
  checkRateLimit,
  getRateLimitStatus,
  clearRateLimits,
} from "./rate-limiter.js";
export type { RateLimitConfig, RateLimitResult, RateLimitStatus } from "./rate-limiter.js";

export {
  OnboardingStepSchema,
  OnboardingProgressSchema,
  ONBOARDING_STEPS,
  startOnboarding,
  completeStep,
  getOnboardingProgress,
  skipOnboarding,
  clearOnboardingData,
} from "./onboarding.js";
export type { OnboardingStep, OnboardingProgress } from "./onboarding.js";

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

export {
  TenantRoleSchema,
  TenantMemberSchema,
  TenantWorkspaceSchema,
  BillingTierSchema as TenantWorkspaceBillingTierSchema,
  UsageMeterSchema as TenantWorkspaceUsageMeterSchema,
  createTenantWorkspace,
  getTenantWorkspace,
  listTenantWorkspaces as listOwnedTenantWorkspaces,
  addTenantMember,
  removeTenantMember,
  updateTenantMemberRole,
  getTierLimits as getTenantWorkspaceTierLimits,
  recordUsage as recordTenantWorkspaceUsage,
  getUsage as getTenantWorkspaceUsage,
  isWithinLimits as isTenantWorkspaceWithinLimits,
  deleteTenantWorkspace,
  clearTenantData,
} from "./multi-tenancy.js";
export type {
  TenantRole,
  TenantMember,
  TenantWorkspace,
  BillingTier as TenantWorkspaceBillingTier,
  UsageMeter as TenantWorkspaceUsageMeter,
} from "./multi-tenancy.js";
