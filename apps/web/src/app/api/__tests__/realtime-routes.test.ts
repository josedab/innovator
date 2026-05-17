/**
 * Tests for /api/realtime route (GET presence, POST messages).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockManager = vi.hoisted(() => ({
  getRoom: vi.fn(),
  getPresence: vi.fn(),
  handleMessage: vi.fn(),
}));

vi.mock("@innovator/core", () => ({
  getRealtimeManager: () => mockManager,
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../realtime/route";
import { NextRequest } from "next/server";

// ---- Helpers ----

function createNextRequest(
  url: string,
  options?: { method?: string; body?: unknown }
): NextRequest {
  const init: RequestInit = { method: options?.method ?? "GET" };
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockManager.getRoom.mockReturnValue(null);
  mockManager.getPresence.mockReturnValue([]);
  mockManager.handleMessage.mockImplementation(() => {});
});

describe("/api/realtime", () => {
  describe("GET /api/realtime", () => {
    it("returns presence list for valid roomId and userId", async () => {
      mockManager.getRoom.mockReturnValue({ id: "room-1" });
      mockManager.getPresence.mockReturnValue([
        { userId: "user-1", name: "Alice" },
        { userId: "user-2", name: "Bob" },
      ]);

      const req = createNextRequest(
        "http://localhost:3000/api/realtime?roomId=room-1&userId=user-1"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.roomId).toBe("room-1");
      expect(body.users).toHaveLength(2);
    });

    it("returns 400 when roomId is missing", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime?userId=user-1");
      const res = await GET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("roomId");
    });

    it("returns 400 when userId is missing", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime?roomId=room-1");
      const res = await GET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("userId");
    });

    it("returns 404 for non-existent room", async () => {
      mockManager.getRoom.mockReturnValue(null);
      const req = createNextRequest(
        "http://localhost:3000/api/realtime?roomId=nonexistent&userId=user-1"
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Room not found");
    });
  });

  describe("POST /api/realtime", () => {
    it("handles join message", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "join",
          roomId: "room-1",
          userId: "user-1",
          payload: {},
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockManager.handleMessage).toHaveBeenCalledOnce();
    });

    it("handles leave message", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "leave",
          roomId: "room-1",
          userId: "user-1",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("handles idea_vote message type", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "idea_vote",
          roomId: "room-1",
          userId: "user-1",
          payload: { ideaId: "idea-1", vote: 1 },
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("handles idea_merge message type", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "idea_merge",
          roomId: "room-1",
          userId: "user-1",
          payload: { sourceId: "idea-1", targetId: "idea-2" },
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest(new URL("http://localhost:3000/api/realtime"), {
        method: "POST",
        body: "not json{{{",
        headers: { "Content-Type": "application/json" },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns 400 for Zod validation failure (missing roomId)", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "join",
          userId: "user-1",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid message");
      expect(body.details).toBeDefined();
    });

    it("returns 400 for missing userId", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "join",
          roomId: "room-1",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid message type", async () => {
      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "invalid_type",
          roomId: "room-1",
          userId: "user-1",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("collects broadcast responses from handleMessage", async () => {
      mockManager.handleMessage.mockImplementation(
        (
          _msg: unknown,
          _sendToUser: (...args: unknown[]) => void,
          broadcastToRoom: (...args: unknown[]) => void
        ) => {
          broadcastToRoom("room-1", { type: "user_joined", userId: "user-1" });
        }
      );

      const req = createNextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        body: {
          type: "join",
          roomId: "room-1",
          userId: "user-1",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.responses).toBeDefined();
      expect(body.responses.length).toBeGreaterThan(0);
      expect(body.responses[0].target).toBe("room");
    });
  });
});
