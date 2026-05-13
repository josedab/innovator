/**
 * @description User notification management.
 */
export const runtime = "nodejs";

import {
  sendNotification,
  registerChannel,
  getChannels,
  testChannel,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RegisterChannelSchema = z.object({
  type: z.enum(["slack", "email", "teams", "push", "webhook"]),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

const SendNotificationSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z
    .enum(["session_complete", "high_score_idea", "collaboration", "digest", "system"])
    .optional(),
  channelIds: z.array(z.string()).optional(),
});

/** GET /api/notifications — list registered notification channels. */
export async function GET() {
  try {
    const channels = getChannels();
    return Response.json(channels, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Channels list error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/notifications",
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve channels." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** POST /api/notifications — send a notification or register a channel. */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
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

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "register") {
      const parsed = RegisterChannelSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: "Invalid channel config." }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel = registerChannel(parsed.data as any);
      logger.info("Channel registered", {
        route: "/api/notifications",
        requestId,
        channelId: channel.id,
      });
      return Response.json(channel, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (action === "test") {
      const { channelId } = body as { channelId: string };
      if (!channelId) {
        return new Response(JSON.stringify({ error: "channelId required." }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const channels = getChannels();
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) {
        return new Response(JSON.stringify({ error: "Channel not found." }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      const result = await testChannel(channel);
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }

    const parsed = SendNotificationSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid notification payload." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const channels = getChannels();
    const targetChannels = parsed.data.channelIds
      ? channels.filter((c) => parsed.data.channelIds!.includes(c.id))
      : channels.filter((c) => c.enabled);

    const payload = {
      title: parsed.data.title,
      body: parsed.data.body,
      priority: parsed.data.priority ?? ("medium" as const),
      category: parsed.data.category ?? ("system" as const),
      timestamp: new Date().toISOString(),
    };
    const results = await sendNotification(payload, targetChannels);

    logger.info("Notification sent", {
      route: "/api/notifications",
      requestId,
      durationMs: Date.now() - startTime,
      channelCount: targetChannels.length,
    });

    return Response.json({ results }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Notification error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/notifications",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Notification delivery failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
