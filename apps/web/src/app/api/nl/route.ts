/**
 * @description Natural language command processing for innovation workflows.
 */
export const runtime = "nodejs";

import {
  createConversationSession,
  getConversationSession,
  getSmartDefaults,
  generateFollowUps,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const StartSchema = z.object({
  action: z.literal("start"),
  model: z.string().optional(),
});

const MessageSchema = z.object({
  action: z.literal("message"),
  sessionId: z.string().min(1),
  prompt: z.string().min(1).max(10000),
});

const DefaultsSchema = z.object({
  action: z.literal("defaults"),
  subject: z.string().min(1).max(5000),
});

const FollowUpsSchema = z.object({
  action: z.literal("follow_ups"),
  sessionId: z.string().min(1),
});

const PostBodySchema = z.discriminatedUnion("action", [
  StartSchema,
  MessageSchema,
  DefaultsSchema,
  FollowUpsSchema,
]);

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;

  if (data.action === "start") {
    const session = createConversationSession(data.model);
    return Response.json(
      { sessionId: session.id, createdAt: session.createdAt },
      { status: 201, headers: API_RESPONSE_HEADERS }
    );
  }

  if (data.action === "defaults") {
    const defaults = getSmartDefaults(data.subject);
    return Response.json({ defaults }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "message") {
    const session = getConversationSession(data.sessionId);
    if (!session) {
      return Response.json(
        { error: "Session not found" },
        { status: 404, headers: API_RESPONSE_HEADERS }
      );
    }

    // Stream the response via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reply = await session.processMessage(data.prompt, (event) => {
            const chunk = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          });

          const followUps = generateFollowUps(session);
          const finalEvent = {
            type: "conversation_reply",
            reply,
            followUps,
            state: session.toState(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalEvent)}\n\n`));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Execution error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (data.action === "follow_ups") {
    const session = getConversationSession(data.sessionId);
    if (!session) {
      return Response.json(
        { error: "Session not found" },
        { status: 404, headers: API_RESPONSE_HEADERS }
      );
    }
    const followUps = generateFollowUps(session);
    return Response.json({ followUps }, { headers: API_RESPONSE_HEADERS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
