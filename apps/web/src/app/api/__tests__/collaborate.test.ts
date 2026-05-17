import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  createCollaborativeSession: vi.fn(),
  findSessionByCode: vi.fn(),
  getCollaborativeSession: vi.fn(),
  joinSession: vi.fn(),
  submitIdea: vi.fn(),
  voteForIdea: vi.fn(),
  addComment: vi.fn(),
  startSession: vi.fn(),
  completeSession: vi.fn(),
  assignAngles: vi.fn(),
  mergeIdeas: vi.fn(),
  getRankedIdeas: vi.fn(),
}));

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
} from "@innovator/core";

const mockCreate = vi.mocked(createCollaborativeSession);
const mockFindByCode = vi.mocked(findSessionByCode);
const mockGetSession = vi.mocked(getCollaborativeSession);
const mockJoin = vi.mocked(joinSession);
const mockSubmitIdea = vi.mocked(submitIdea);
const mockVote = vi.mocked(voteForIdea);
const mockComment = vi.mocked(addComment);
const mockStart = vi.mocked(startSession);
const mockComplete = vi.mocked(completeSession);
const mockAssignAngles = vi.mocked(assignAngles);
const mockMerge = vi.mocked(mergeIdeas);

// Inline route handler (following existing test patterns)
import { z } from "zod";

const API_RESPONSE_HEADERS = { "Content-Type": "application/json" };

const CreateSessionSchema = z.object({
  subject: z.string().min(1).max(500),
  hostUserId: z.string().min(1),
  hostDisplayName: z.string().min(1).max(100),
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
  z.object({ action: z.literal("start"), sessionId: z.string(), userId: z.string() }),
  z.object({ action: z.literal("complete"), sessionId: z.string(), userId: z.string() }),
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

async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const code = searchParams.get("code");

  if (id) {
    const session = getCollaborativeSession(id);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: session }), { headers: API_RESPONSE_HEADERS });
  }

  if (code) {
    const session = findSessionByCode(code);
    if (!session) {
      return new Response(JSON.stringify({ error: "Room not found" }), {
        status: 404,
        headers: API_RESPONSE_HEADERS,
      });
    }
    return new Response(JSON.stringify({ data: session }), { headers: API_RESPONSE_HEADERS });
  }

  return new Response(JSON.stringify({ error: "Provide 'id' or 'code' parameter" }), {
    status: 400,
    headers: API_RESPONSE_HEADERS,
  });
}

async function POST(request: Request) {
  try {
    const body = await request.json();
    const createParsed = CreateSessionSchema.safeParse(body);
    if (createParsed.success) {
      const { subject, hostUserId, hostDisplayName } = createParsed.data;
      const session = createCollaborativeSession(subject, hostUserId, hostDisplayName);
      return new Response(JSON.stringify({ data: session }), {
        status: 201,
        headers: API_RESPONSE_HEADERS,
      });
    }

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
        if (!participant)
          return new Response(JSON.stringify({ error: "Cannot join session" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        return new Response(JSON.stringify({ data: participant }), {
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "submit_idea": {
        const idea = submitIdea(
          action.sessionId,
          action.authorId,
          action.angleId,
          action.title,
          action.description,
          action.potentialImpact
        );
        if (!idea)
          return new Response(JSON.stringify({ error: "Cannot submit idea" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        return new Response(JSON.stringify({ data: idea }), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "vote": {
        const success = voteForIdea(action.sessionId, action.ideaId, action.userId);
        return new Response(JSON.stringify({ success }), { headers: API_RESPONSE_HEADERS });
      }
      case "comment": {
        const comment = addComment(
          action.sessionId,
          action.ideaId,
          action.authorId,
          action.authorName,
          action.content
        );
        if (!comment)
          return new Response(JSON.stringify({ error: "Cannot add comment" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        return new Response(JSON.stringify({ data: comment }), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "start": {
        const started = startSession(action.sessionId, action.userId);
        return new Response(JSON.stringify({ success: started }), {
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "complete": {
        const completed = completeSession(action.sessionId, action.userId);
        return new Response(JSON.stringify({ success: completed }), {
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "assign_angles": {
        const assigned = assignAngles(action.sessionId, action.userId, action.angles as any);
        return new Response(JSON.stringify({ success: assigned }), {
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "merge": {
        const merged = mergeIdeas(
          action.sessionId,
          action.ideaIds,
          action.title,
          action.description,
          action.authorId
        );
        if (!merged)
          return new Response(JSON.stringify({ error: "Cannot merge ideas" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        return new Response(JSON.stringify({ data: merged }), {
          status: 201,
          headers: API_RESPONSE_HEADERS,
        });
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

function makeGetRequest(params: string): Request {
  return new Request(`http://localhost/api/collaborate${params}`);
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/collaborate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_SESSION = { id: "session-1", subject: "Test", roomCode: "ABC123" };

describe("GET /api/collaborate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns session by id", async () => {
    mockGetSession.mockReturnValue(MOCK_SESSION as any);
    const res = await GET(makeGetRequest("?id=session-1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.id).toBe("session-1");
  });

  it("returns 404 for unknown id", async () => {
    mockGetSession.mockReturnValue(undefined as any);
    const res = await GET(makeGetRequest("?id=unknown"));
    expect(res.status).toBe(404);
  });

  it("returns session by room code", async () => {
    mockFindByCode.mockReturnValue(MOCK_SESSION as any);
    const res = await GET(makeGetRequest("?code=ABC123"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.roomCode).toBe("ABC123");
  });

  it("returns 404 for unknown room code", async () => {
    mockFindByCode.mockReturnValue(undefined as any);
    const res = await GET(makeGetRequest("?code=INVALID"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when no params provided", async () => {
    const res = await GET(makeGetRequest(""));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Provide");
  });
});

describe("POST /api/collaborate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates session and returns 201", async () => {
    mockCreate.mockReturnValue(MOCK_SESSION as any);
    const res = await POST(
      makePostRequest({ subject: "New Session", hostUserId: "u1", hostDisplayName: "User 1" })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.data).not.toBeNull();
    expect(typeof data.data).toBe("object");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith("New Session", "u1", "User 1");
  });

  it("handles join action", async () => {
    mockJoin.mockReturnValue({ userId: "u1", displayName: "User" } as any);
    const res = await POST(
      makePostRequest({ action: "join", sessionId: "s1", userId: "u1", displayName: "User" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.userId).toBe("u1");
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(mockJoin).toHaveBeenCalledWith("s1", "u1", "User");
  });

  it("handles submit_idea action", async () => {
    mockSubmitIdea.mockReturnValue({ id: "idea-1", title: "Test" } as any);
    const res = await POST(
      makePostRequest({
        action: "submit_idea",
        sessionId: "s1",
        authorId: "u1",
        angleId: "scamper",
        title: "Great Idea",
        description: "A great idea description",
        potentialImpact: "High",
      })
    );
    expect(res.status).toBe(201);
    expect(mockSubmitIdea).toHaveBeenCalledTimes(1);
    expect(mockSubmitIdea).toHaveBeenCalledWith(
      "s1",
      "u1",
      "scamper",
      "Great Idea",
      "A great idea description",
      "High"
    );
  });

  it("handles vote action", async () => {
    mockVote.mockReturnValue(true);
    const res = await POST(
      makePostRequest({ action: "vote", sessionId: "s1", ideaId: "i1", userId: "u1" })
    );
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("handles comment action", async () => {
    mockComment.mockReturnValue({ id: "c1", content: "Nice!" } as any);
    const res = await POST(
      makePostRequest({
        action: "comment",
        sessionId: "s1",
        ideaId: "i1",
        authorId: "u1",
        authorName: "User",
        content: "Great idea!",
      })
    );
    expect(res.status).toBe(201);
  });

  it("handles start action", async () => {
    mockStart.mockReturnValue(true);
    const res = await POST(makePostRequest({ action: "start", sessionId: "s1", userId: "u1" }));
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("handles complete action", async () => {
    mockComplete.mockReturnValue(true);
    const res = await POST(makePostRequest({ action: "complete", sessionId: "s1", userId: "u1" }));
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("handles assign_angles action", async () => {
    mockAssignAngles.mockReturnValue(true);
    const res = await POST(
      makePostRequest({
        action: "assign_angles",
        sessionId: "s1",
        userId: "u1",
        angles: ["scamper"],
      })
    );
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("handles merge action", async () => {
    mockMerge.mockReturnValue({ id: "merged-1", title: "Merged" } as any);
    const res = await POST(
      makePostRequest({
        action: "merge",
        sessionId: "s1",
        ideaIds: ["i1", "i2"],
        title: "Merged Idea",
        description: "Combined",
        authorId: "u1",
      })
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid action body with Zod details", async () => {
    const res = await POST(
      makePostRequest({ action: "join" }) // missing required fields
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.details).not.toBeNull();
    expect(typeof data.details).toBe("object");
  });

  it("returns 400 when join fails", async () => {
    mockJoin.mockReturnValue(undefined as any);
    const res = await POST(
      makePostRequest({ action: "join", sessionId: "s1", userId: "u1", displayName: "U" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 on internal error", async () => {
    const req = new Request("http://localhost/api/collaborate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
