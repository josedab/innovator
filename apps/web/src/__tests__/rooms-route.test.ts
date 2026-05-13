import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockJoinRoom,
  mockGetActiveUsers,
  mockGetPresence,
  mockUpdateCursor,
  mockUpdateSection,
  mockHeartbeat,
  mockCreateSession,
  mockAddIdea,
  mockVote,
  mockComment,
  mockCheckConsensus,
  mockGetTopIdeas,
  mockSynthesize,
} = vi.hoisted(() => ({
  mockJoinRoom: vi.fn(),
  mockGetActiveUsers: vi.fn(),
  mockGetPresence: vi.fn(),
  mockUpdateCursor: vi.fn(),
  mockUpdateSection: vi.fn(),
  mockHeartbeat: vi.fn(),
  mockCreateSession: vi.fn(),
  mockAddIdea: vi.fn(),
  mockVote: vi.fn(),
  mockComment: vi.fn(),
  mockCheckConsensus: vi.fn(),
  mockGetTopIdeas: vi.fn(),
  mockSynthesize: vi.fn(),
}));

vi.mock("@innovator/core", () => ({
  PresenceManager: function () {
    return {
      joinRoom: mockJoinRoom,
      getActiveUsers: mockGetActiveUsers,
      getPresence: mockGetPresence,
      updateCursor: mockUpdateCursor,
      updateSection: mockUpdateSection,
      heartbeat: mockHeartbeat,
    };
  },
  ConsensusManager: function () {
    return {
      createSession: mockCreateSession,
      addIdea: mockAddIdea,
      vote: mockVote,
      comment: mockComment,
      checkConsensus: mockCheckConsensus,
      getTopIdeas: mockGetTopIdeas,
      synthesize: mockSynthesize,
    };
  },
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/rooms/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/rooms", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a room and returns 201", async () => {
    mockCreateSession.mockReturnValue({ id: "room-1" });
    const res = await POST(
      makePost({
        action: "create_room",
        name: "Test Room",
        userId: "u1",
        displayName: "Alice",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.roomId).toBe("room-1");
    expect(body.data.name).toBe("Test Room");
    expect(body.data.code).toBeTruthy();
  });

  it("returns 404 when joining non-existent room code", async () => {
    const res = await POST(
      makePost({
        action: "join_room",
        code: "BADCODE",
        userId: "u1",
        displayName: "Bob",
      })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Room not found");
  });

  it("joins an existing room successfully", async () => {
    mockCreateSession.mockReturnValue({ id: "room-2" });
    // Create room first
    const createRes = await POST(
      makePost({
        action: "create_room",
        name: "Join Test",
        userId: "u1",
        displayName: "Alice",
      })
    );
    const createBody = await createRes.json();
    const code = createBody.data.code;

    mockGetActiveUsers.mockReturnValue([
      { userId: "u1", displayName: "Alice", status: "active" },
    ]);
    mockGetTopIdeas.mockReturnValue([]);
    mockCheckConsensus.mockReturnValue({ reached: false });

    const res = await POST(
      makePost({
        action: "join_room",
        code,
        userId: "u2",
        displayName: "Bob",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.roomId).toBe("room-2");
    expect(body.data.participants).toHaveLength(1);
  });

  it("adds an idea to a room and returns 201", async () => {
    mockCreateSession.mockReturnValue({ id: "room-3" });
    await POST(
      makePost({
        action: "create_room",
        name: "Idea Room",
        userId: "u1",
        displayName: "Alice",
      })
    );

    mockAddIdea.mockReturnValue({ id: "idea-1", content: "Great idea" });
    const res = await POST(
      makePost({
        action: "add_idea",
        roomId: "room-3",
        content: "Great idea",
        author: "u1",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("idea-1");
  });

  it("returns 404 when adding idea to non-existent room", async () => {
    const res = await POST(
      makePost({
        action: "add_idea",
        roomId: "nonexistent",
        content: "idea",
        author: "u1",
      })
    );
    expect(res.status).toBe(404);
  });

  it("votes on an idea", async () => {
    mockCreateSession.mockReturnValue({ id: "room-4" });
    await POST(
      makePost({
        action: "create_room",
        name: "Vote Room",
        userId: "u1",
        displayName: "Alice",
      })
    );

    mockVote.mockReturnValue(true);
    const res = await POST(
      makePost({
        action: "vote",
        roomId: "room-4",
        ideaId: "idea-1",
        userId: "u1",
        value: 1,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("checks consensus for a room", async () => {
    mockCreateSession.mockReturnValue({ id: "room-5" });
    await POST(
      makePost({
        action: "create_room",
        name: "Consensus Room",
        userId: "u1",
        displayName: "Alice",
      })
    );

    mockCheckConsensus.mockReturnValue({ reached: true, score: 0.8 });
    mockGetTopIdeas.mockReturnValue([{ id: "i1" }]);
    const res = await POST(
      makePost({ action: "consensus", roomId: "room-5" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reached).toBe(true);
    expect(body.data.topIdeas).toHaveLength(1);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(makePost({ action: "destroy_room" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields on create_room", async () => {
    const res = await POST(makePost({ action: "create_room" }));
    expect(res.status).toBe(400);
  });
});
