import type { ApiKey, Tenant, UsageRecord, WebhookSubscription } from "./types.js";

export const apiKeys = new Map<string, ApiKey>();
export const usageRecords: UsageRecord[] = [];
export const webhookUrls = new Map<string, string[]>();
export const buckets = new Map<string, { tokens: number; lastRefill: number }>();
export const webhookSubscriptions = new Map<string, WebhookSubscription>();
export const tenants = new Map<string, Tenant>();

/** Clear all API gateway state (for testing). */
export function clearApiGateway(): void {
  apiKeys.clear();
  usageRecords.length = 0;
  webhookUrls.clear();
  buckets.clear();
  tenants.clear();
  webhookSubscriptions.clear();
}
