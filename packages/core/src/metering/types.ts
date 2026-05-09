import { z } from "zod";

/** Rate limit tier identifier. */
export type RateLimitTier = "free" | "pro" | "enterprise";

/** Configuration for a rate-limit tier. */
export interface TierConfig {
  tier: RateLimitTier;
  dailyLimit: number; // -1 = unlimited
  windowMs: number;
  burstLimit: number; // max requests per minute
}

/** A single metering record for an API call. */
export interface MeteringRecord {
  id: string;
  keyId: string;
  route: string;
  method: string;
  statusCode: number;
  timestamp: number;
  durationMs: number;
}

/** Usage summary for an API key. */
export interface ApiUsageSummary {
  keyId: string;
  tier: RateLimitTier;
  totalCalls: number;
  callsToday: number;
  callsThisHour: number;
  dailyLimit: number;
  remainingToday: number;
  usageByRoute: Record<string, number>;
  usageByHour: Array<{ hour: string; count: number }>;
  usageByDay: Array<{ date: string; count: number }>;
}

/** Quota status for a key. */
export interface QuotaStatus {
  keyId: string;
  tier: RateLimitTier;
  allowed: boolean;
  dailyUsed: number;
  dailyLimit: number;
  remainingToday: number;
  resetAt: string;
  burstUsed: number;
  burstLimit: number;
}

/** Alert configuration for usage thresholds. */
export interface AlertConfig {
  keyId: string;
  thresholdPercent: number; // 0-100
  enabled: boolean;
}

/** Triggered alert when usage exceeds threshold. */
export interface MeteringAlert {
  keyId: string;
  tier: RateLimitTier;
  currentUsage: number;
  dailyLimit: number;
  thresholdPercent: number;
  usagePercent: number;
  triggeredAt: string;
  message: string;
}

/** Zod schema for alert configuration input. */
export const AlertConfigSchema = z.object({
  keyId: z.string().min(1).max(100),
  thresholdPercent: z.number().min(1).max(100),
  enabled: z.boolean(),
});
