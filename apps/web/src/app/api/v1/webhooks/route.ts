/**
 * @description V1 API — webhook registration and management.
 */
export const runtime = "nodejs";

import {
  createWebhookSubscription,
  listWebhookSubscriptions,
  deleteWebhookSubscription,
  toggleWebhookSubscription,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { validateApiKey } from "@/lib/api-auth";
import { checkRateLimit, addRateLimitHeaders } from "@/lib/rate-limit";

const CreateWebhookSchema = z.object({
  url: z.string().url().max(2000),
  events: z
    .array(
      z.enum([
        "pipeline.complete",
        "investigation.complete",
        "usage.limit.warning",
        "usage.limit.reached",
        "idea.scored",
        "experiment.complete",
      ])
    )
    .min(1)
    .max(10),
});

const DeleteWebhookSchema = z.object({
  id: z.string().min(1).max(100),
});

/** POST /api/v1/webhooks — create a webhook subscription. */
export async function POST(request: Request) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const rateLimit = checkRateLimit(auth.keyId ?? "anonymous", { limit: 10, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: addRateLimitHeaders(
        API_RESPONSE_HEADERS as unknown as Record<string, string>,
        rateLimit
      ),
    });
  }

  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = CreateWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const subscription = createWebhookSubscription(
      auth.keyId ?? "anonymous",
      parsed.data.url,
      parsed.data.events
    );

    logger.info("Webhook subscription created", { id: subscription.id });

    return new Response(JSON.stringify({ data: subscription }), {
      status: 201,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Webhook creation error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to create webhook" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/v1/webhooks — list webhook subscriptions. */
export async function GET(request: Request) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const subscriptions = listWebhookSubscriptions(auth.keyId ?? "anonymous");
  return new Response(JSON.stringify({ data: subscriptions }), {
    headers: API_RESPONSE_HEADERS,
  });
}

/** DELETE /api/v1/webhooks — delete a webhook subscription. */
export async function DELETE(request: Request) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: API_RESPONSE_HEADERS,
    });
  }

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

    const parsed = DeleteWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const deleted = deleteWebhookSubscription(parsed.data.id);
    if (!deleted) {
      return new Response(JSON.stringify({ error: "Webhook not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }

    return new Response(JSON.stringify({ data: { deleted: true } }), {
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Webhook deletion error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to delete webhook" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
