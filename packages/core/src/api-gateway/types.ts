import { z } from "zod";

export const BillingTierSchema = z.enum(["free", "pro", "enterprise"]);

export const ApiKeySchema = z.object({
  id: z.string().max(100).describe("Unique API key identifier"),
  key: z.string().max(200).describe("The API key value (prefixed by tier, e.g. inv_free_...)"),
  name: z.string().max(200).describe("Human-readable label for the key"),
  tier: BillingTierSchema.describe("Billing tier associated with this key"),
  createdAt: z.string().describe("ISO 8601 creation timestamp"),
  lastUsedAt: z
    .string()
    .optional()
    .describe("ISO 8601 timestamp of the last API call using this key"),
  enabled: z.boolean().describe("Whether the key is active and can be used for requests"),
  rateLimit: z
    .object({
      dailyLimit: z.number().describe("Maximum API calls per day"),
      minuteLimit: z.number().describe("Maximum API calls per minute"),
    })
    .describe("Rate limit configuration for this key"),
  metadata: z.record(z.string()).optional().describe("Arbitrary key-value metadata"),
});

export const UsageRecordSchema = z.object({
  keyId: z.string().max(100).describe("API key ID that made this request"),
  endpoint: z.string().max(200).describe("API endpoint path that was called"),
  timestamp: z.string().describe("ISO 8601 timestamp of the request"),
  durationMs: z.number().describe("Request duration in milliseconds"),
  tokensUsed: z.number().optional().describe("Number of LLM tokens consumed"),
  statusCode: z.number().describe("HTTP response status code"),
  error: z.string().optional().describe("Error message if the request failed"),
});

export const UsageSummarySchema = z.object({
  keyId: z.string().max(100).describe("API key ID this summary is for"),
  tier: BillingTierSchema.describe("Billing tier of the key"),
  period: z.string().describe("Human-readable period description (e.g. '30 days')"),
  totalCalls: z.number().describe("Total number of API calls in the period"),
  totalTokens: z.number().describe("Total LLM tokens consumed in the period"),
  averageLatencyMs: z.number().describe("Average request latency in milliseconds"),
  errorRate: z.number().min(0).max(1).describe("Fraction of requests that returned errors (0-1)"),
  endpointBreakdown: z.record(z.number()).describe("Call count per endpoint path"),
  dailyUsage: z
    .array(
      z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
        calls: z.number().describe("Number of API calls on this date"),
      })
    )
    .describe("Daily usage breakdown"),
});

export const WebhookEventSchema = z.object({
  id: z.string().describe("Unique webhook event identifier"),
  type: z
    .enum([
      "pipeline.complete",
      "investigation.complete",
      "usage.limit.warning",
      "usage.limit.reached",
    ])
    .describe("Type of event that triggered this webhook"),
  payload: z.record(z.unknown()).describe("Event-specific payload data"),
  timestamp: z.string().describe("ISO 8601 timestamp of the event"),
  keyId: z.string().describe("API key ID associated with this event"),
});

export const WebhookSubscriptionSchema = z.object({
  id: z.string().max(100),
  keyId: z.string().max(100),
  url: z.string().url().max(2000),
  events: z.array(
    z.enum([
      "pipeline.complete",
      "investigation.complete",
      "usage.limit.warning",
      "usage.limit.reached",
      "idea.scored",
      "experiment.complete",
    ])
  ),
  secret: z.string().max(200),
  active: z.boolean(),
  createdAt: z.string(),
  lastDeliveredAt: z.string().optional(),
  failureCount: z.number().default(0),
});

export const ApiVersionSchema = z.enum(["v1", "v2"]);

export const RateLimitConfigSchema = z.object({
  tier: BillingTierSchema,
  endpoint: z.string().max(200),
  limit: z.number().min(1),
  windowMs: z.number().min(1000),
  burstLimit: z.number().optional(),
});

export const TenantSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  tier: BillingTierSchema,
  ownerId: z.string().max(200),
  ownerEmail: z.string().max(300),
  apiKeys: z.array(z.string().max(100)),
  createdAt: z.string(),
  status: z.enum(["active", "suspended", "cancelled"]),
  settings: z.object({
    maxKeys: z.number().min(1).max(100),
    webhooksEnabled: z.boolean(),
    customModels: z.array(z.string().max(100)).max(20).optional(),
  }),
  usage: z.object({
    currentPeriodCalls: z.number().min(0),
    currentPeriodTokens: z.number().min(0),
    periodStart: z.string(),
  }),
});

export const DeveloperPortalInfoSchema = z.object({
  tenantId: z.string().max(100),
  tenantName: z.string().max(200),
  tier: BillingTierSchema,
  apiKeys: z.array(ApiKeySchema),
  usage: z.object({
    currentPeriodCalls: z.number(),
    currentPeriodTokens: z.number(),
    dailyLimit: z.number(),
    minuteLimit: z.number(),
  }),
  endpoints: z.array(
    z.object({
      method: z.string(),
      path: z.string(),
      description: z.string(),
    })
  ),
  webhooks: z.array(z.string()),
});

export type BillingTier = z.infer<typeof BillingTierSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;
export type ApiVersion = z.infer<typeof ApiVersionSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type DeveloperPortalInfo = z.infer<typeof DeveloperPortalInfoSchema>;
