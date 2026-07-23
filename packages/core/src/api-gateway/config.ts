import type { ApiVersion, BillingTier } from "./types.js";

/** Rate limits per billing tier (daily and per-minute). */
export const TIER_LIMITS: Record<BillingTier, { dailyLimit: number; minuteLimit: number }> = {
  free: { dailyLimit: 10, minuteLimit: 5 },
  pro: { dailyLimit: 1000, minuteLimit: 60 },
  enterprise: { dailyLimit: Infinity, minuteLimit: 300 },
};

export const API_VERSIONS: Record<
  ApiVersion,
  {
    version: string;
    status: "stable" | "beta" | "deprecated";
    deprecationDate?: string;
    endpoints: string[];
  }
> = {
  v1: {
    version: "1.0.0",
    status: "stable",
    endpoints: [
      "/api/v1/investigate",
      "/api/v1/innovate",
      "/api/v1/auto",
      "/api/v1/keys",
      "/api/v1/openapi",
      "/api/v1/plugins",
    ],
  },
  v2: {
    version: "2.0.0",
    status: "beta",
    endpoints: [
      "/api/v2/investigate",
      "/api/v2/innovate",
      "/api/v2/auto",
      "/api/v2/experiments",
      "/api/v2/scoring",
      "/api/v2/webhooks",
      "/api/v2/replay",
    ],
  },
};

const ENDPOINT_RATE_LIMITS: Record<
  string,
  Record<BillingTier, { limit: number; windowMs: number }>
> = {
  "/investigate": {
    free: { limit: 5, windowMs: 60_000 },
    pro: { limit: 30, windowMs: 60_000 },
    enterprise: { limit: 120, windowMs: 60_000 },
  },
  "/innovate": {
    free: { limit: 5, windowMs: 60_000 },
    pro: { limit: 30, windowMs: 60_000 },
    enterprise: { limit: 120, windowMs: 60_000 },
  },
  "/auto": {
    free: { limit: 2, windowMs: 60_000 },
    pro: { limit: 10, windowMs: 60_000 },
    enterprise: { limit: 60, windowMs: 60_000 },
  },
};

/** Get version info for an API version. */
export function getApiVersionInfo(version: ApiVersion) {
  return API_VERSIONS[version];
}

/** List all API versions. */
export function listApiVersions() {
  return Object.entries(API_VERSIONS).map(([key, val]) => ({
    apiVersion: key,
    ...val,
  }));
}

/** Get rate limit config for an endpoint and tier. */
export function getEndpointRateLimit(
  endpoint: string,
  tier: BillingTier
): { limit: number; windowMs: number } {
  const endpointConfig = ENDPOINT_RATE_LIMITS[endpoint];
  if (endpointConfig) return endpointConfig[tier];
  return TIER_LIMITS[tier].minuteLimit
    ? { limit: TIER_LIMITS[tier].minuteLimit, windowMs: 60_000 }
    : { limit: 10, windowMs: 60_000 };
}
