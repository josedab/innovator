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
import { GET, POST } from "../collaborate/route";

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
