/**
 * @module api-gateway
 *
 * Compatibility barrel for API Gateway management.
 */

export {
  BillingTierSchema,
  ApiKeySchema,
  UsageRecordSchema,
  UsageSummarySchema,
  WebhookEventSchema,
  WebhookSubscriptionSchema,
  ApiVersionSchema,
  RateLimitConfigSchema,
  TenantSchema,
  DeveloperPortalInfoSchema,
} from "./types.js";
export type {
  BillingTier,
  ApiKey,
  UsageRecord,
  UsageSummary,
  WebhookEvent,
  WebhookSubscription,
  ApiVersion,
  RateLimitConfig,
  Tenant,
  DeveloperPortalInfo,
} from "./types.js";

export {
  TIER_LIMITS,
  API_VERSIONS,
  getApiVersionInfo,
  listApiVersions,
  getEndpointRateLimit,
} from "./config.js";

export {
  createApiKey,
  getApiKey,
  findApiKeyByValue,
  listApiKeys,
  revokeApiKey,
  updateApiKeyTier,
  deleteApiKey,
  recordUsage,
  getUsageSummary,
  checkDailyLimit,
  checkTokenBucket,
  checkUsageRateLimit,
  createDemoKey,
} from "./api-keys.js";

export {
  registerWebhook,
  getWebhooks,
  removeWebhook,
  createWebhookSubscription,
  listWebhookSubscriptions,
  getWebhookSubscription,
  deleteWebhookSubscription,
  toggleWebhookSubscription,
  dispatchWebhookEvent,
} from "./webhook-state.js";

export { getOpenApiSpec } from "./openapi.js";

export {
  createTenant,
  getTenant,
  findTenantBySlug,
  listTenants,
  updateTenantTier,
  suspendTenant,
  addTenantApiKey,
  getDeveloperPortalInfo,
} from "./tenants.js";

export { clearApiGateway } from "./state.js";
