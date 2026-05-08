import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlaygroundSession,
  getPlaygroundSession,
  getSessionByShareId,
  updatePlaygroundSession,
  checkUsageLimit,
  getUserSessions,
  getUserUsage,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const CreateSessionSchema = z.object({
  action: z.literal("create"),
  subject: z.string().min(1).max(5000),
  userId: z.string().max(200).optional(),
});

const GetSessionSchema = z.object({
  action: z.literal("get"),
  sessionId: z.string().max(100).optional(),
  shareId: z.string().max(50).optional(),
});

const UsageSchema = z.object({
  action: z.literal("usage"),
  userId: z.string().max(200),
});

const PostBodySchema = z.discriminatedUnion("action", [
  CreateSessionSchema,
  GetSessionSchema,
  UsageSchema,
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get("share");
    const sessionId = searchParams.get("id");
    const userId = searchParams.get("user");

    if (shareId) {
      const session = getSessionByShareId(shareId);
      if (!session) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json({ session }, { headers: API_RESPONSE_HEADERS });
    }

    if (sessionId) {
      const session = getPlaygroundSession(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json({ session }, { headers: API_RESPONSE_HEADERS });
    }

    if (userId) {
      const sessions = getUserSessions(userId);
      const usage = getUserUsage(userId);
      const limit = checkUsageLimit(userId);
      return NextResponse.json({ sessions, usage, limit }, { headers: API_RESPONSE_HEADERS });
    }

    return NextResponse.json(
      { error: "Provide share, id, or user parameter" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "create") {
      const userId = parsed.userId ?? "anonymous";
      const limit = checkUsageLimit(userId);

      if (!limit.allowed) {
        return NextResponse.json(
          { error: limit.reason, remaining: 0, limit: limit.limit },
          { status: 429, headers: API_RESPONSE_HEADERS }
        );
      }

      const session = createPlaygroundSession(parsed.subject, userId);
      const shareUrl = `/playground?share=${session.shareId}`;

      return NextResponse.json(
        {
          session,
          shareUrl,
          remaining: limit.remaining - 1,
        },
        { status: 201, headers: API_RESPONSE_HEADERS }
      );
    }

    if (parsed.action === "get") {
      if (parsed.shareId) {
        const session = getSessionByShareId(parsed.shareId);
        if (!session) {
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return NextResponse.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      if (parsed.sessionId) {
        const session = getPlaygroundSession(parsed.sessionId);
        if (!session) {
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return NextResponse.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      return NextResponse.json(
        { error: "Provide sessionId or shareId" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    if (parsed.action === "usage") {
      const usage = getUserUsage(parsed.userId);
      const limit = checkUsageLimit(parsed.userId);
      return NextResponse.json({ usage, limit }, { headers: API_RESPONSE_HEADERS });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
