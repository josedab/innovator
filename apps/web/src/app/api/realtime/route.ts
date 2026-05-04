/**
 * Real-time collaboration API route.
 * Provides SSE-based fallback for environments without native WebSocket support
 * (e.g., Vercel serverless). For full WebSocket support, use the standalone
 * WebSocket server or a service like Partykit.
 *
 * GET  /api/realtime?roomId=...&userId=...  → SSE presence stream
 * POST /api/realtime                        → Send a realtime message
 */

import { NextRequest, NextResponse } from "next/server";
import { getRealtimeManager } from "@innovator/core";
import type { RealtimeMessage } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { z } from "zod";

const MessageSchema = z.object({
  type: z.enum([
    "join",
    "leave",
    "cursor_move",
    "typing_start",
    "typing_stop",
    "idea_submit",
    "idea_vote",
    "idea_comment",
    "idea_merge",
    "session_start",
    "session_complete",
    "angle_assign",
  ]),
  roomId: z.string().min(1),
  userId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  messageId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId");
  const userId = request.nextUrl.searchParams.get("userId");

  if (!roomId || !userId) {
    return NextResponse.json(
      { error: "roomId and userId are required" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const manager = getRealtimeManager();
  const room = manager.getRoom(roomId);
  if (!room) {
    return NextResponse.json(
      { error: "Room not found" },
      { status: 404, headers: API_RESPONSE_HEADERS }
    );
  }

  // Return current presence as JSON (SSE fallback)
  const presence = manager.getPresence(roomId);
  return NextResponse.json({ roomId, users: presence }, { headers: API_RESPONSE_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const manager = getRealtimeManager();
  const msg: RealtimeMessage = {
    ...parsed.data,
    messageId: parsed.data.messageId ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  // Collect responses (in SSE fallback mode, we return them as JSON)
  const responses: Record<string, unknown>[] = [];

  manager.handleMessage(
    msg,
    (_userId, response) => {
      responses.push({ target: _userId, ...response });
    },
    (_roomId, response, _excludeUserId) => {
      responses.push({ target: "room", ...response });
    }
  );

  return NextResponse.json({ ok: true, responses }, { headers: API_RESPONSE_HEADERS });
}
