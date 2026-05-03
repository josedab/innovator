export const runtime = "nodejs";

import {
  createCollaborativeSession,
  findSessionByCode,
  getCollaborativeSession,
  joinSession,
  submitIdea,
  voteForIdea,
  addComment,
  startSession,
  completeSession,
  assignAngles,
  mergeIdeas,
  getRankedIdeas,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateSessionSchema = z.object({
  subject: z.string().min(1).max(500),
  hostUserId: z.string().min(1),
  hostDisplayName: z.string().min(1).max(100),
});

const JoinSchema = z.object({
  roomCode: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1).max(100),
});

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    sessionId: z.string(),
    userId: z.string(),
    displayName: z.string(),
  }),
  z.object({
    action: z.literal("submit_idea"),
    sessionId: z.string(),
    authorId: z.string(),
    angleId: z.string(),
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    potentialImpact: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("vote"),
    sessionId: z.string(),
    ideaId: z.string(),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("comment"),
    sessionId: z.string(),
    ideaId: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    content: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("start"),
    sessionId: z.string(),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("complete"),
    sessionId: z.string(),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("assign_angles"),
    sessionId: z.string(),
    userId: z.string(),
    angles: z.array(z.string()),
  }),
  z.object({
    action: z.literal("merge"),
    sessionId: z.string(),
    ideaIds: z.array(z.string()).min(2),
    title: z.string(),
    description: z.string(),
    authorId: z.string(),
  }),
]);

/**
 * Retrieve a collaborative session by ID or room code.
 *
 * @route GET /api/collaborate
 * @param request - Query parameters: `id` (session ID) or `code` (room code). One is required.
 * @returns JSON `{ data: CollaborativeSession }`
 * @status 400 — neither `id` nor `code` provided
 * @status 404 — session or room not found
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const code = searchParams.get("code");

  if (id) {
    const session = getCollaborativeSession(id);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404, headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: session }), { headers: API_RESPONSE_HEADERS });
  }

  if (code) {
    const session = findSessionByCode(code);
    if (!session) {
      return new Response(JSON.stringify({ error: "Room not found" }), {
        status: 404, headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: session }), { headers: API_RESPONSE_HEADERS });
  }

  return new Response(JSON.stringify({ error: "Provide 'id' or 'code' parameter" }), {
    status: 400, headers: API_RESPONSE_HEADERS,
  });
}

/**
 * Create a collaborative session or perform an action on an existing one.
 *
 * @route POST /api/collaborate
 * @param request - JSON body, either:
 *   - **Create session**: `{ subject, hostUserId, hostDisplayName }`
 *   - **Action**: `{ action, sessionId, ... }` where action is one of:
 *     `join`, `submit_idea`, `vote`, `comment`, `start`, `complete`, `assign_angles`, `merge`
 * @returns JSON `{ data: ... }` on success, or `{ success: boolean }` for state-change actions
 * @status 201 — session/idea/comment created successfully
 * @status 400 — invalid request body or action cannot be performed
 * @status 500 — unexpected server error
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check if it's a create request
    const createParsed = CreateSessionSchema.safeParse(body);
    if (createParsed.success) {
      const { subject, hostUserId, hostDisplayName } = createParsed.data;
      const session = createCollaborativeSession(subject, hostUserId, hostDisplayName);
      return new Response(JSON.stringify({ data: session }), {
        status: 201, headers: API_RESPONSE_HEADERS,
      });
    }

    // Otherwise, it's an action
    const actionParsed = ActionSchema.safeParse(body);
    if (!actionParsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: actionParsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const action = actionParsed.data;

    switch (action.action) {
      case "join": {
        const participant = joinSession(action.sessionId, action.userId, action.displayName);
        if (!participant) {
          return new Response(JSON.stringify({ error: "Cannot join session" }), {
            status: 400, headers: API_RESPONSE_HEADERS,
          });
        }
        return new Response(JSON.stringify({ data: participant }), { headers: API_RESPONSE_HEADERS });
      }

      case "submit_idea": {
        const idea = submitIdea(
          action.sessionId, action.authorId, action.angleId,
          action.title, action.description, action.potentialImpact
        );
        if (!idea) {
          return new Response(JSON.stringify({ error: "Cannot submit idea" }), {
            status: 400, headers: API_RESPONSE_HEADERS,
          });
        }
        return new Response(JSON.stringify({ data: idea }), {
          status: 201, headers: API_RESPONSE_HEADERS,
        });
      }

      case "vote": {
        const success = voteForIdea(action.sessionId, action.ideaId, action.userId);
        return new Response(JSON.stringify({ success }), { headers: API_RESPONSE_HEADERS });
      }

      case "comment": {
        const comment = addComment(
          action.sessionId, action.ideaId,
          action.authorId, action.authorName, action.content
        );
        if (!comment) {
          return new Response(JSON.stringify({ error: "Cannot add comment" }), {
            status: 400, headers: API_RESPONSE_HEADERS,
          });
        }
        return new Response(JSON.stringify({ data: comment }), {
          status: 201, headers: API_RESPONSE_HEADERS,
        });
      }

      case "start": {
        const started = startSession(action.sessionId, action.userId);
        return new Response(JSON.stringify({ success: started }), { headers: API_RESPONSE_HEADERS });
      }

      case "complete": {
        const completed = completeSession(action.sessionId, action.userId);
        return new Response(JSON.stringify({ success: completed }), { headers: API_RESPONSE_HEADERS });
      }

      case "assign_angles": {
        const assigned = assignAngles(action.sessionId, action.userId, action.angles as any);
        return new Response(JSON.stringify({ success: assigned }), { headers: API_RESPONSE_HEADERS });
      }

      case "merge": {
        const merged = mergeIdeas(
          action.sessionId, action.ideaIds,
          action.title, action.description, action.authorId
        );
        if (!merged) {
          return new Response(JSON.stringify({ error: "Cannot merge ideas" }), {
            status: 400, headers: API_RESPONSE_HEADERS,
          });
        }
        return new Response(JSON.stringify({ data: merged }), {
          status: 201, headers: API_RESPONSE_HEADERS,
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: API_RESPONSE_HEADERS,
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500, headers: API_RESPONSE_HEADERS,
    });
  }
}
