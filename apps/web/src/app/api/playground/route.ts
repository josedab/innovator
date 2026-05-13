/**
 * @description Hosted playground session management.
 */
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
  createPlaygroundWorkspace,
  getPlaygroundWorkspace,
  addPlaygroundWorkspaceMember,
  listPlaygroundWorkspaces,
  addPlaygroundSessionToWorkspace,
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

const CreateWorkspaceSchema = z.object({
  action: z.literal("create_workspace"),
  name: z.string().min(1).max(200),
  ownerId: z.string().min(1).max(200),
  tier: z.enum(["free", "pro", "team", "enterprise"]).optional(),
});

const WorkspaceActionSchema = z.object({
  action: z.literal("workspace"),
  workspaceId: z.string().min(1),
  operation: z.enum(["add_member", "add_session", "get"]),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  CreateSessionSchema,
  GetSessionSchema,
  UsageSchema,
  CreateWorkspaceSchema,
  WorkspaceActionSchema,
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
      const userWorkspaces = listPlaygroundWorkspaces(userId);
      return NextResponse.json({ sessions, usage, limit, workspaces: userWorkspaces }, { headers: API_RESPONSE_HEADERS });
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

    if (parsed.action === "create_workspace") {
      const workspace = createPlaygroundWorkspace(parsed.name, parsed.ownerId, parsed.tier);
      return NextResponse.json({ workspace }, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "workspace") {
      const workspace = getPlaygroundWorkspace(parsed.workspaceId);
      if (!workspace) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }

      if (parsed.operation === "get") {
        return NextResponse.json({ workspace }, { headers: API_RESPONSE_HEADERS });
      }

      if (parsed.operation === "add_member" && parsed.userId) {
        const success = addPlaygroundWorkspaceMember(parsed.workspaceId, parsed.userId);
        if (!success) {
          return NextResponse.json(
            { error: "Cannot add member — workspace at capacity" },
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        return NextResponse.json({ success: true, workspace: getPlaygroundWorkspace(parsed.workspaceId) }, { headers: API_RESPONSE_HEADERS });
      }

      if (parsed.operation === "add_session" && parsed.sessionId) {
        addPlaygroundSessionToWorkspace(parsed.workspaceId, parsed.sessionId);
        return NextResponse.json({ success: true }, { headers: API_RESPONSE_HEADERS });
      }

      return NextResponse.json(
        { error: "Missing required fields for operation" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
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
