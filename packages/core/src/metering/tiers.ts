/**
 * Rate-limit tier configuration and per-key tier assignment.
 */
import type { RateLimitTier, TierConfig } from "./types.js";

/** Built-in tier definitions. */
export const RATE_LIMIT_TIERS: Record<RateLimitTier, TierConfig> = {
  free: {
    tier: "free",
    dailyLimit: 100,
    windowMs: 86_400_000, // 24 hours
    burstLimit: 10, // 10 per minute
  },
  pro: {
    tier: "pro",
    dailyLimit: 10_000,
    windowMs: 86_400_000,
    burstLimit: 60,
  },
  enterprise: {
    tier: "enterprise",
    dailyLimit: -1, // unlimited
    windowMs: 86_400_000,
    burstLimit: 200,
  },
};

const keyTierMap = new Map<string, RateLimitTier>();

/** Get the tier for a given API key. Defaults to "free". */
export function getTierForKey(keyId: string): TierConfig {
  const tier = keyTierMap.get(keyId) ?? "free";
  return RATE_LIMIT_TIERS[tier];
}

/** Assign a tier to an API key. */
export function setKeyTier(keyId: string, tier: RateLimitTier): void {
  keyTierMap.set(keyId, tier);
}

/** Remove a key's tier assignment (reverts to free). */
export function removeKeyTier(keyId: string): void {
  keyTierMap.delete(keyId);
}

/** List all explicit key-to-tier assignments. */
export function listKeyTiers(): Array<{ keyId: string; tier: RateLimitTier }> {
  return Array.from(keyTierMap.entries()).map(([keyId, tier]) => ({ keyId, tier }));
}
