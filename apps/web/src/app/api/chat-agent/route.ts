import { z } from "zod";
import {
  createChatSession,
  getChatSession,
  deleteChatSession,
  listChatSessions,
  chat,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers.js";

const ChatRequestSchema = z.object({
  sessionId: z.string().max(100).optional(),
  message: z.string().min(1).max(5000),
  model: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { message, model } = parsed.data;
    let { sessionId } = parsed.data;

    // Create session if not provided
    if (!sessionId) {
      const session = createChatSession();
      sessionId = session.id;
    } else if (!getChatSession(sessionId)) {
      return new Response(
        JSON.stringify({ error: `Chat session "${sessionId}" not found` }),
        { status: 404, headers: API_RESPONSE_HEADERS }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await chat(sessionId, message, model, controller.signal);
      return new Response(
        JSON.stringify({ sessionId, ...response }),
        { headers: API_RESPONSE_HEADERS }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function GET() {
  try {
    const sessions = listChatSessions().map((s) => ({
      id: s.id,
      messageCount: s.messages.length,
      state: s.state,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    return new Response(JSON.stringify({ sessions }), { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "sessionId query parameter required" }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const deleted = deleteChatSession(sessionId);
    return new Response(
      JSON.stringify({ deleted }),
      { status: deleted ? 200 : 404, headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
