/**
 * @description Webhook event delivery and management.
 */
export const runtime = "nodejs";

import { WebhookManager, EventTypeSchema, listWebhookTemplates } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const manager = new WebhookManager();

const RegisterSchema = z.object({
  action: z.literal("register"),
  url: z.string().url(),
  events: z.array(EventTypeSchema).min(1),
  secret: z.string().min(16),
  active: z.boolean().default(true),
  description: z.string().max(500).optional(),
});

const UnregisterSchema = z.object({
  action: z.literal("unregister"),
  id: z.string(),
});

const ListSchema = z.object({
  action: z.literal("list"),
});

const TemplatesSchema = z.object({
  action: z.literal("templates"),
});

const DeliveryLogSchema = z.object({
  action: z.literal("delivery-log"),
  webhookId: z.string().optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  RegisterSchema,
  UnregisterSchema,
  ListSchema,
  TemplatesSchema,
  DeliveryLogSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "register": {
        const webhook = manager.registerWebhook({
          url: parsed.url,
          events: parsed.events,
          secret: parsed.secret,
          active: parsed.active,
          description: parsed.description,
        });
        logger.info("Webhook registered", { webhookId: webhook.id });
        return Response.json({ webhook }, { headers: API_RESPONSE_HEADERS });
      }
      case "unregister": {
        const removed = manager.unregisterWebhook(parsed.id);
        return Response.json({ removed }, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const webhooks = manager.listWebhooks();
        return Response.json({ webhooks }, { headers: API_RESPONSE_HEADERS });
      }
      case "templates": {
        const templates = listWebhookTemplates();
        return Response.json({ templates }, { headers: API_RESPONSE_HEADERS });
      }
      case "delivery-log": {
        const log = manager.getDeliveryLog(parsed.webhookId);
        const deadLetters = manager.getDeadLetters();
        return Response.json({ log, deadLetters }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", {
      route: "/api/webhooks",
    });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
