/**
 * @module api-economy
 *
 * Innovation API Economy — metered public API management with client
 * registration, API key generation, usage metering, pricing tiers,
 * and usage analytics. Builds on api-gateway module.
 */

import { z } from "zod";

// ---- API Client ----

export const ApiClientSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(300),
  email: z.string().max(500),
  /** Organization name. */
  organization: z.string().max(300).optional(),
  /** Pricing tier. */
  tier: z.enum(["free", "starter", "pro", "enterprise"]),
  /** API keys issued. */
  apiKeyIds: z.array(z.string().max(200)).max(10),
  createdAt: z.string(),
  status: z.enum(["active", "suspended", "cancelled"]),
});

export type ApiClient = z.infer<typeof ApiClientSchema>;

// ---- API Key ----

export const ApiKeySchema = z.object({
  id: z.string().max(200),
  clientId: z.string().max(200),
  /** Key prefix for identification (first 8 chars). */
  keyPrefix: z.string().max(20),
  /** Hashed key (never store raw). */
  keyHash: z.string().max(200),
  /** Rate limit: requests per minute. */
  rateLimit: z.number().int().min(1).max(100000),
  /** Daily request quota. */
  dailyQuota: z.number().int().min(1).max(10000000),
  /** Allowed endpoints. */
  allowedEndpoints: z.array(z.string().max(200)).max(50),
  status: z.enum(["active", "revoked"]),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

// ---- Usage Record ----

export const UsageRecordSchema = z.object({
  id: z.string().max(200),
  clientId: z.string().max(200),
  apiKeyId: z.string().max(200),
  endpoint: z.string().max(200),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  /** HTTP status code. */
  statusCode: z.number().int().min(100).max(599),
  /** Response latency in ms. */
  latencyMs: z.number().int().min(0),
  /** Tokens consumed (for LLM endpoints). */
  tokensConsumed: z.number().int().min(0).optional(),
  /** Request timestamp. */
  timestamp: z.string(),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;

// ---- Usage Summary ----

export const UsageSummarySchema = z.object({
  clientId: z.string().max(200),
  period: z.string().max(50),
  totalRequests: z.number().int().min(0),
  successfulRequests: z.number().int().min(0),
  failedRequests: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  averageLatencyMs: z.number().min(0),
  /** Usage by endpoint. */
  byEndpoint: z.record(
    z.string(),
    z.object({
      requests: z.number().int().min(0),
      avgLatencyMs: z.number().min(0),
      errorRate: z.number().min(0).max(1),
    })
  ),
  /** Estimated cost in USD. */
  estimatedCost: z.number().min(0),
  /** Percentage of quota used. */
  quotaUtilization: z.number().min(0).max(1),
});

export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// ---- Pricing Tier ----

export const PricingTierSchema = z.object({
  id: z.enum(["free", "starter", "pro", "enterprise"]),
  name: z.string().max(200),
  /** Monthly price in USD. */
  monthlyPrice: z.number().min(0),
  /** Included requests per month. */
  includedRequests: z.number().int().min(0),
  /** Price per additional request in USD. */
  overagePrice: z.number().min(0),
  /** Rate limit: requests per minute. */
  rateLimit: z.number().int().min(1),
  /** Daily quota. */
  dailyQuota: z.number().int().min(1),
  /** Available endpoints. */
  endpoints: z.array(z.string().max(200)),
  /** Features. */
  features: z.array(z.string().max(500)),
});

export type PricingTier = z.infer<typeof PricingTierSchema>;

// ---- Config ----

export interface ApiEconomyConfig {
  /** Default tier for new clients. */
  defaultTier?: ApiClient["tier"];
}
