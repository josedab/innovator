/**
 * @description SaaS usage metering — track sessions, API calls, and token usage.
 */
export const runtime = "nodejs";

import {
  getApiMeter,
  getTierForKey,
  setKeyTier,
  removeKeyTier,
  listKeyTiers,
  AlertConfigSchema,
} from "@innovator/core";
import type { RateLimitTier } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { setMeteringKeyTier, getMeteringLog } from "@/middleware";

const UsageSchema = z.object({
  action: z.literal("usage"),
  keyId: z.string().min(1).max(100),
});

const QuotaSchema = z.object({
  action: z.literal("quota"),
  keyId: z.string().min(1).max(100),
});

const SetTierSchema = z.object({
  action: z.literal("set-tier"),
  keyId: z.string().min(1).max(100),
  tier: z.enum(["free", "pro", "enterprise"]),
});

const RemoveTierSchema = z.object({
  action: z.literal("remove-tier"),
  keyId: z.string().min(1).max(100),
});

const SetAlertSchema = z.object({
  action: z.literal("set-alert"),
  keyId: z.string().min(1).max(100),
  thresholdPercent: z.number().min(1).max(100),
  enabled: z.boolean(),
});

const CheckAlertsSchema = z.object({
  action: z.literal("check-alerts"),
  keyId: z.string().min(1).max(100),
});

const ListKeysSchema = z.object({
  action: z.literal("list-keys"),
});

const RequestSchema = z.discriminatedUnion("action", [
  UsageSchema,
  QuotaSchema,
  SetTierSchema,
  RemoveTierSchema,
  SetAlertSchema,
  CheckAlertsSchema,
  ListKeysSchema,
]);

/** POST /api/metering — manage API metering, quotas, and alerts. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const meter = getApiMeter();

    switch (parsed.data.action) {
      case "usage": {
        const summary = meter.getUsageSummary(parsed.data.keyId);
        return Response.json(summary, { headers: API_RESPONSE_HEADERS });
      }
      case "quota": {
        const quota = meter.checkQuota(parsed.data.keyId);
        return Response.json(quota, { headers: API_RESPONSE_HEADERS });
      }
      case "set-tier": {
        const tierName = parsed.data.tier as RateLimitTier;
        setKeyTier(parsed.data.keyId, tierName);
        // Sync with middleware's per-key rate limiting
        setMeteringKeyTier(parsed.data.keyId, tierName);
        const tier = getTierForKey(parsed.data.keyId);
        return Response.json(
          { success: true, keyId: parsed.data.keyId, tier },
          { headers: API_RESPONSE_HEADERS }
        );
      }
      case "remove-tier": {
        removeKeyTier(parsed.data.keyId);
        return Response.json(
          { success: true, keyId: parsed.data.keyId, tier: "free" },
          { headers: API_RESPONSE_HEADERS }
        );
      }
      case "set-alert": {
        const alertConfig = AlertConfigSchema.parse({
          keyId: parsed.data.keyId,
          thresholdPercent: parsed.data.thresholdPercent,
          enabled: parsed.data.enabled,
        });
        meter.setAlert(alertConfig);
        return Response.json(
          { success: true, alert: alertConfig },
          { headers: API_RESPONSE_HEADERS }
        );
      }
      case "check-alerts": {
        const alert = meter.checkAlerts(parsed.data.keyId);
        return Response.json({ alert }, { headers: API_RESPONSE_HEADERS });
      }
      case "list-keys": {
        const keys = meter.listKeys();
        const tiers = listKeyTiers();
        return Response.json({ keys, tiers }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Metering error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/metering",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/metering — get all metered keys and tier assignments. */
export async function GET() {
  try {
    const meter = getApiMeter();
    const keys = meter.listKeys();
    const tiers = listKeyTiers();
    const summaries = keys.map((keyId) => meter.getUsageSummary(keyId));
    const middlewareLogSize = getMeteringLog().length;
    return Response.json(
      { keys, tiers, summaries, middlewareLogSize },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    logger.error("Metering GET error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/metering",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
