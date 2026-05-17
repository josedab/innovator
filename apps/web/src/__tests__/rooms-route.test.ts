import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPresence = vi.hoisted(() => ({
  joinRoom: vi.fn(),
  getActiveUsers: vi.fn(() => []),
  updateCursor: vi.fn(),
  updateSection: vi.fn(),
  heartbeat: vi.fn(),
  getPresence: vi.fn(() => ({ users: new Map() })),
}));

const mockConsensus = vi.hoisted(() => ({
  createSession: vi.fn(() => ({ id: "session-123" })),
  getTopIdeas: vi.fn(() => []),
  checkConsensus: vi.fn(() => ({ reached: false, threshold: 0.6 })),
  addIdea: vi.fn((sessionId: string, data: unknown) => ({
    id: "idea-1",
    ...(data as Record<string, unknown>),
  })),
  vote: vi.fn(() => true),
  comment: vi.fn((sessionId: string, ideaId: string, userId: string, text: string) => ({
    id: "comment-1",
    text,
  })),
  synthesize: vi.fn(() => "Synthesis result"),
}));

vi.mock("@innovator/core", () => {
  function FakePresenceManager() {
    return mockPresence;
  }
  function FakeConsensusManager() {
    return mockConsensus;
  }
  return {
    PresenceManager: FakePresenceManager,
    ConsensusManager: FakeConsensusManager,
  };
});

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/rooms/route";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/rooms", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Helper: create a room and return its parsed response data. */
async function createRoom(name = "Test Room") {
  const res = await POST(
    makePost({ action: "create_room", name, userId: "u1", displayName: "User 1" })
  );
  const json = await res.json();
  return { res, json, roomId: json.data.roomId as string, code: json.data.code as string };
}

describe("API /api/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- create_room ----

  it("creates a room and returns 201 with roomId and code", async () => {
    const { res, json } = await createRoom();
    expect(res.status).toBe(201);
    expect(json.data).toHaveProperty("roomId");
    expect(json.data).toHaveProperty("code");
    expect(json.data.name).toBe("Test Room");
    expect(mockConsensus.createSession).toHaveBeenCalledWith("room", 0.6);
    expect(mockPresence.joinRoom).toHaveBeenCalled();
  });

  // ---- join_room ----

  it("joins a room with a valid code", async () => {
    const { code } = await createRoom();
    const res = await POST(
      makePost({ action: "join_room", code, userId: "u2", displayName: "User 2" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("roomId");
    expect(json.data).toHaveProperty("name");
    expect(json.data).toHaveProperty("participants");
    expect(json.data).toHaveProperty("ideas");
    expect(json.data).toHaveProperty("consensus");
  });

  it("returns 404 when joining with an invalid code", async () => {
    const res = await POST(
      makePost({ action: "join_room", code: "INVALID", userId: "u2", displayName: "User 2" })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Room not found");
  });

  // ---- presence ----

  it("handles a presence update", async () => {
    const { roomId } = await createRoom();
    const res = await POST(
      makePost({ action: "presence", roomId, userId: "u1", cursor: { x: 10, y: 20 } })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("users");
    expect(mockPresence.updateCursor).toHaveBeenCalledWith(roomId, "u1", { x: 10, y: 20 });
  });

  // ---- add_idea ----

  it("adds an idea and returns 201", async () => {
    const { roomId } = await createRoom();
    const res = await POST(
      makePost({ action: "add_idea", roomId, content: "Great idea", author: "u1" })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toHaveProperty("id");
    expect(json.data.content).toBe("Great idea");
  });

  it("returns 404 when adding an idea to a non-existent room", async () => {
    const res = await POST(
      makePost({ action: "add_idea", roomId: "fake", content: "test", author: "u1" })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Room not found");
  });

  // ---- vote ----

  it("records a vote and returns 200", async () => {
    const { roomId } = await createRoom();
    const res = await POST(
      makePost({ action: "vote", roomId, ideaId: "idea-1", userId: "u1", value: 1 })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.success).toBe(true);
  });

  // ---- comment ----

  it("adds a comment and returns 201", async () => {
    const { roomId } = await createRoom();
    const res = await POST(
      makePost({ action: "comment", roomId, ideaId: "idea-1", userId: "u1", text: "Nice!" })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toHaveProperty("id");
    expect(json.data.text).toBe("Nice!");
  });

  // ---- consensus ----

  it("checks consensus and returns 200", async () => {
    const { roomId } = await createRoom();
    const res = await POST(makePost({ action: "consensus", roomId }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("reached");
    expect(json.data).toHaveProperty("topIdeas");
  });

  // ---- synthesize ----

  it("synthesizes ideas and returns result", async () => {
    const { roomId } = await createRoom();
    const res = await POST(makePost({ action: "synthesize", roomId }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.synthesis).toBe("Synthesis result");
  });

  // ---- error cases ----

  it("returns 400 for an invalid action", async () => {
    const res = await POST(makePost({ action: "invalid_action" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request");
  });

  it("returns 500 for malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/rooms", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Request failed");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makePost({ action: "create_room" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request");
    expect(json.details).toBeDefined();
  });
});
