import { describe, it, expect, beforeEach } from "vitest";
import {
  RealtimeRoomManager,
  getRealtimeManager,
  resetRealtimeManager,
  type RealtimeMessage,
  type RealtimeResponse,
  type SendToUser,
  type BroadcastToRoom,
} from "../index.js";

function makeMessage(overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    type: "join",
    roomId: "room1",
    userId: "user1",
    payload: {},
    timestamp: new Date().toISOString(),
    messageId: "msg1",
    ...overrides,
  };
}

describe("realtime", () => {
  let manager: RealtimeRoomManager;
  let sentMessages: Array<{ userId: string; message: RealtimeResponse }>;
  let broadcastMessages: Array<{
    roomId: string;
    message: RealtimeResponse;
    excludeUserId?: string;
  }>;
  let sendToUser: SendToUser;
  let broadcastToRoom: BroadcastToRoom;

  beforeEach(() => {
    resetRealtimeManager();
    manager = new RealtimeRoomManager();
    sentMessages = [];
    broadcastMessages = [];
    sendToUser = (userId, message) => sentMessages.push({ userId, message });
    broadcastToRoom = (roomId, message, excludeUserId) =>
      broadcastMessages.push({ roomId, message, excludeUserId });
  });

  describe("getOrCreateRoom", () => {
    it("creates a room on first call", () => {
      const room = manager.getOrCreateRoom("session1");
      expect(room.id).toBeTruthy();
      expect(room.sessionId).toBe("session1");
      expect(room.users.size).toBe(0);
    });

    it("returns existing room on second call for same session", () => {
      const room1 = manager.getOrCreateRoom("session1");
      const room2 = manager.getOrCreateRoom("session1");
      expect(room1.id).toBe(room2.id);
    });

    it("creates different rooms for different sessions", () => {
      const room1 = manager.getOrCreateRoom("session1");
      const room2 = manager.getOrCreateRoom("session2");
      expect(room1.id).not.toBe(room2.id);
    });
  });

  describe("handleMessage - join", () => {
    it("adds user to room and sends presence_sync to joiner", () => {
      const room = manager.getOrCreateRoom("session1");
      const msg = makeMessage({
        type: "join",
        roomId: room.id,
        userId: "user1",
        payload: { displayName: "Alice" },
      });
      manager.handleMessage(msg, sendToUser, broadcastToRoom);

      expect(room.users.size).toBe(1);
      expect(room.users.get("user1")!.displayName).toBe("Alice");
      // Sends presence_sync to the joining user
      expect(sentMessages.some((m) => m.message.type === "presence_sync")).toBe(true);
      // Broadcasts join to room
      expect(broadcastMessages.some((m) => m.message.type === "presence_update")).toBe(true);
    });

    it("sends error when room not found", () => {
      const msg = makeMessage({
        type: "join",
        roomId: "nonexistent",
        userId: "user1",
      });
      manager.handleMessage(msg, sendToUser, broadcastToRoom);
      expect(sentMessages.some((m) => m.message.type === "error")).toBe(true);
    });

    it("defaults displayName to Anonymous", () => {
      const room = manager.getOrCreateRoom("session1");
      const msg = makeMessage({
        type: "join",
        roomId: room.id,
        userId: "user1",
        payload: {},
      });
      manager.handleMessage(msg, sendToUser, broadcastToRoom);
      expect(room.users.get("user1")!.displayName).toBe("Anonymous");
    });
  });

  describe("handleMessage - leave", () => {
    it("removes user from room and broadcasts leave", () => {
      const room = manager.getOrCreateRoom("session1");
      // First join
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      sentMessages = [];
      broadcastMessages = [];

      // Then leave
      manager.handleMessage(
        makeMessage({ type: "leave", roomId: room.id, userId: "user1" }),
        sendToUser,
        broadcastToRoom
      );
      expect(room.users.size).toBe(0);
      expect(broadcastMessages.some((m) => m.message.type === "presence_update")).toBe(true);
    });
  });

  describe("handleMessage - cursor_move", () => {
    it("updates user cursor and broadcasts", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "A" },
        }),
        sendToUser,
        broadcastToRoom
      );
      broadcastMessages = [];

      manager.handleMessage(
        makeMessage({
          type: "cursor_move",
          roomId: room.id,
          userId: "user1",
          payload: { x: 100, y: 200 },
        }),
        sendToUser,
        broadcastToRoom
      );

      const user = room.users.get("user1")!;
      expect(user.cursor).toEqual({ x: 100, y: 200 });
      expect(
        broadcastMessages.some(
          (m) =>
            m.message.type === "presence_update" &&
            (m.message.payload as Record<string, unknown>).action === "cursor_moved"
        )
      ).toBe(true);
    });
  });

  describe("handleMessage - typing_start / typing_stop", () => {
    it("typing_start sets isTyping to true", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "A" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "typing_start", roomId: room.id, userId: "user1" }),
        sendToUser,
        broadcastToRoom
      );
      expect(room.users.get("user1")!.isTyping).toBe(true);
    });

    it("typing_stop sets isTyping to false", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "A" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "typing_start", roomId: room.id, userId: "user1" }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "typing_stop", roomId: room.id, userId: "user1" }),
        sendToUser,
        broadcastToRoom
      );
      expect(room.users.get("user1")!.isTyping).toBe(false);
    });
  });

  describe("handleMessage - collaborative events (idea_submit, idea_vote, etc.)", () => {
    const eventTypes = [
      "idea_submit",
      "idea_vote",
      "idea_comment",
      "idea_merge",
      "session_start",
      "session_complete",
      "angle_assign",
    ] as const;

    for (const eventType of eventTypes) {
      it(`${eventType}: broadcasts to room and acks sender`, () => {
        const room = manager.getOrCreateRoom("session1");
        manager.handleMessage(
          makeMessage({
            type: "join",
            roomId: room.id,
            userId: "user1",
            payload: { displayName: "A" },
          }),
          sendToUser,
          broadcastToRoom
        );
        sentMessages = [];
        broadcastMessages = [];

        manager.handleMessage(
          makeMessage({
            type: eventType,
            roomId: room.id,
            userId: "user1",
            payload: { data: "test" },
          }),
          sendToUser,
          broadcastToRoom
        );

        // Broadcast to room
        expect(broadcastMessages.some((m) => m.message.type === "broadcast")).toBe(true);
        // Ack to sender
        expect(sentMessages.some((m) => m.message.type === "ack")).toBe(true);
      });
    }
  });

  describe("handleMessage - unknown type", () => {
    it("sends error for unknown message type", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "unknown_type" as unknown as Parameters<typeof manager.handleMessage>[0]["type"],
          roomId: room.id,
          userId: "user1",
        }),
        sendToUser,
        broadcastToRoom
      );
      expect(sentMessages.some((m) => m.message.type === "error")).toBe(true);
    });
  });

  describe("handleDisconnect", () => {
    it("removes user and broadcasts leave", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      broadcastMessages = [];

      manager.handleDisconnect("user1", broadcastToRoom);
      expect(room.users.size).toBe(0);
      expect(
        broadcastMessages.some(
          (m) =>
            m.message.type === "presence_update" &&
            (m.message.payload as Record<string, unknown>).action === "left"
        )
      ).toBe(true);
    });

    it("cleans up empty rooms after last user disconnects", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "A" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleDisconnect("user1", broadcastToRoom);
      expect(manager.getRoom(room.id)).toBeUndefined();
    });

    it("disconnect non-existent user is a no-op", () => {
      manager.handleDisconnect("nonexistent", broadcastToRoom);
      expect(broadcastMessages).toHaveLength(0);
    });
  });

  describe("getPresence", () => {
    it("returns active users with cursor and typing status", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({
          type: "cursor_move",
          roomId: room.id,
          userId: "user1",
          payload: { x: 10, y: 20 },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "typing_start", roomId: room.id, userId: "user1" }),
        sendToUser,
        broadcastToRoom
      );

      const presence = manager.getPresence(room.id);
      expect(presence).toHaveLength(1);
      expect(presence[0].userId).toBe("user1");
      expect(presence[0].cursor).toEqual({ x: 10, y: 20 });
      expect(presence[0].isTyping).toBe(true);
    });

    it("returns empty for non-existent room", () => {
      expect(manager.getPresence("nonexistent")).toHaveLength(0);
    });
  });

  describe("singleton pattern", () => {
    it("getRealtimeManager returns same instance", () => {
      const m1 = getRealtimeManager();
      const m2 = getRealtimeManager();
      expect(m1).toBe(m2);
    });

    it("resetRealtimeManager creates new instance", () => {
      const m1 = getRealtimeManager();
      resetRealtimeManager();
      const m2 = getRealtimeManager();
      expect(m1).not.toBe(m2);
    });
  });

  describe("getUserRoom", () => {
    it("returns room for joined user", () => {
      const room = manager.getOrCreateRoom("session1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user1",
          payload: { displayName: "A" },
        }),
        sendToUser,
        broadcastToRoom
      );
      expect(manager.getUserRoom("user1")!.id).toBe(room.id);
    });

    it("returns undefined for unknown user", () => {
      expect(manager.getUserRoom("unknown")).toBeUndefined();
    });
  });
});
