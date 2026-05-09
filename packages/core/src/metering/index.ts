/**
 * @module metering
 *
 * API call metering and per-key quota management.
 * Tracks API calls per key with configurable rate-limit tiers
 * using a sliding window algorithm.
 */

export { ApiMeter, getApiMeter, resetApiMeter } from "./meter.js";
export {
  RATE_LIMIT_TIERS,
  getTierForKey,
  setKeyTier,
  removeKeyTier,
  listKeyTiers,
} from "./tiers.js";
export { AlertConfigSchema } from "./types.js";
export type {
  MeteringRecord,
  ApiUsageSummary,
  RateLimitTier,
  TierConfig,
  QuotaStatus,
  MeteringAlert,
  AlertConfig,
} from "./types.js";
