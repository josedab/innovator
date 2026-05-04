import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RealtimeRoomManager,
  getRealtimeManager,
  resetRealtimeManager,
  type RealtimeMessage,
  type RealtimeResponse,
  type SendToUser,
  type BroadcastToRoom,
} from "../realtime/index.js";

function makeMessage(overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    type: "join",
    roomId: "room-1",
    userId: "user-1",
    payload: {},
    timestamp: new Date().toISOString(),
    messageId: "msg-1",
    ...overrides,
  };
}

describe("realtime", () => {
  let manager: RealtimeRoomManager;
  let sendToUser: SendToUser;
  let broadcastToRoom: BroadcastToRoom;
  let sentMessages: Array<{ userId: string; message: RealtimeResponse }>;
  let broadcastMessages: Array<{
    roomId: string;
    message: RealtimeResponse;
    excludeUserId?: string;
  }>;

  beforeEach(() => {
    manager = new RealtimeRoomManager();
    sentMessages = [];
    broadcastMessages = [];
    sendToUser = vi.fn((userId, message) => {
      sentMessages.push({ userId, message });
    });
    broadcastToRoom = vi.fn((roomId, message, excludeUserId) => {
      broadcastMessages.push({ roomId, message, excludeUserId });
    });
  });

  // ---- getOrCreateRoom ----

  describe("getOrCreateRoom", () => {
    it("creates a new room for a session", () => {
      const room = manager.getOrCreateRoom("session-1");
      expect(room.id).toBeDefined();
      expect(room.sessionId).toBe("session-1");
      expect(room.users.size).toBe(0);
      expect(room.createdAt).toBeDefined();
    });

    it("returns the same room for the same session", () => {
      const room1 = manager.getOrCreateRoom("session-1");
      const room2 = manager.getOrCreateRoom("session-1");
      expect(room1.id).toBe(room2.id);
    });

    it("creates different rooms for different sessions", () => {
      const room1 = manager.getOrCreateRoom("session-1");
      const room2 = manager.getOrCreateRoom("session-2");
      expect(room1.id).not.toBe(room2.id);
    });
  });

  // ---- getRoom / getUserRoom ----

  describe("getRoom", () => {
    it("returns room by ID", () => {
      const room = manager.getOrCreateRoom("session-1");
      expect(manager.getRoom(room.id)).toBeDefined();
    });

    it("returns undefined for unknown room", () => {
      expect(manager.getRoom("nonexistent")).toBeUndefined();
    });
  });

  describe("getUserRoom", () => {
    it("returns undefined before user joins", () => {
      expect(manager.getUserRoom("user-1")).toBeUndefined();
    });

    it("returns the room after user joins", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      const userRoom = manager.getUserRoom("user-1");
      expect(userRoom).toBeDefined();
      expect(userRoom!.id).toBe(room.id);
    });
  });

  // ---- handleJoin ----

  describe("handleJoin", () => {
    it("adds user to room and broadcasts presence", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );

      expect(room.users.size).toBe(1);
      expect(room.users.get("user-1")!.displayName).toBe("Alice");

      // Should send presence_sync to joining user
      expect(sendToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ type: "presence_sync" })
      );
      // Should broadcast presence_update to room (excluding the joiner)
      expect(broadcastToRoom).toHaveBeenCalledWith(
        room.id,
        expect.objectContaining({ type: "presence_update" }),
        "user-1"
      );
    });

    it("sends error for non-existent room", () => {
      manager.handleMessage(
        makeMessage({ type: "join", roomId: "bad-room", userId: "user-1" }),
        sendToUser,
        broadcastToRoom
      );
      expect(sendToUser).toHaveBeenCalledWith("user-1", expect.objectContaining({ type: "error" }));
    });

    it("user joining same room twice updates their entry", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice2" },
        }),
        sendToUser,
        broadcastToRoom
      );
      expect(room.users.size).toBe(1);
      expect(room.users.get("user-1")!.displayName).toBe("Alice2");
    });

    it("uses Anonymous as default display name", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({ type: "join", roomId: room.id, userId: "user-1", payload: {} }),
        sendToUser,
        broadcastToRoom
      );
      expect(room.users.get("user-1")!.displayName).toBe("Anonymous");
    });
  });

  // ---- handleLeave ----

  describe("handleLeave", () => {
    it("removes user from room and broadcasts departure", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      vi.mocked(broadcastToRoom).mockClear();

      manager.handleMessage(
        makeMessage({ type: "leave", roomId: room.id, userId: "user-1" }),
        sendToUser,
        broadcastToRoom
      );

      expect(room.users.size).toBe(0);
      expect(broadcastToRoom).toHaveBeenCalledWith(
        room.id,
        expect.objectContaining({
          type: "presence_update",
          payload: expect.objectContaining({ action: "left" }),
        })
      );
    });

    it("cleans up empty rooms after last user leaves", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "leave", roomId: room.id, userId: "user-1" }),
        sendToUser,
        broadcastToRoom
      );
      expect(manager.getRoom(room.id)).toBeUndefined();
    });

    it("leaving unjoined room is a no-op", () => {
      const room = manager.getOrCreateRoom("session-1");
      // user-2 never joined
      manager.handleMessage(
        makeMessage({ type: "leave", roomId: room.id, userId: "user-2" }),
        sendToUser,
        broadcastToRoom
      );
      // No broadcast should happen for unknown user
      // The handleLeave delegates to handleDisconnect which checks userRooms
      expect(broadcastToRoom).not.toHaveBeenCalled();
    });
  });

  // ---- handleCursorMove ----

  describe("handleCursorMove", () => {
    it("updates cursor position and broadcasts", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      vi.mocked(broadcastToRoom).mockClear();

      manager.handleMessage(
        makeMessage({
          type: "cursor_move",
          roomId: room.id,
          userId: "user-1",
          payload: { x: 100, y: 200 },
        }),
        sendToUser,
        broadcastToRoom
      );

      const user = room.users.get("user-1")!;
      expect(user.cursor).toEqual({ x: 100, y: 200 });
      expect(broadcastToRoom).toHaveBeenCalledWith(
        room.id,
        expect.objectContaining({
          type: "presence_update",
          payload: expect.objectContaining({ action: "cursor_moved", cursor: { x: 100, y: 200 } }),
        }),
        "user-1"
      );
    });

    it("ignores cursor move for non-existent room", () => {
      manager.handleMessage(
        makeMessage({
          type: "cursor_move",
          roomId: "bad-room",
          userId: "user-1",
          payload: { x: 10, y: 20 },
        }),
        sendToUser,
        broadcastToRoom
      );
      expect(broadcastToRoom).not.toHaveBeenCalled();
    });

    it("ignores cursor move for user not in room", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "cursor_move",
          roomId: room.id,
          userId: "ghost",
          payload: { x: 10, y: 20 },
        }),
        sendToUser,
        broadcastToRoom
      );
      expect(broadcastToRoom).not.toHaveBeenCalled();
    });
  });

  // ---- handleTyping ----

  describe("handleTyping", () => {
    it("sets isTyping on typing_start and broadcasts", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      vi.mocked(broadcastToRoom).mockClear();

      manager.handleMessage(
        makeMessage({ type: "typing_start", roomId: room.id, userId: "user-1" }),
        sendToUser,
        broadcastToRoom
      );

      expect(room.users.get("user-1")!.isTyping).toBe(true);
      expect(broadcastToRoom).toHaveBeenCalledWith(
        room.id,
        expect.objectContaining({
          payload: expect.objectContaining({ action: "typing_start" }),
        }),
        "user-1"
      );
    });

    it("clears isTyping on typing_stop", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "typing_start", roomId: room.id, userId: "user-1" }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({ type: "typing_stop", roomId: room.id, userId: "user-1" }),
        sendToUser,
        broadcastToRoom
      );
      expect(room.users.get("user-1")!.isTyping).toBe(false);
    });
  });

  // ---- Collaborative events (broadcast + ack) ----

  describe("collaborative events", () => {
    it("broadcasts idea_submit and sends ack to sender", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      vi.mocked(sendToUser).mockClear();
      vi.mocked(broadcastToRoom).mockClear();

      manager.handleMessage(
        makeMessage({
          type: "idea_submit",
          roomId: room.id,
          userId: "user-1",
          payload: { title: "New Idea" },
        }),
        sendToUser,
        broadcastToRoom
      );

      expect(broadcastToRoom).toHaveBeenCalledWith(
        room.id,
        expect.objectContaining({ type: "broadcast" }),
        "user-1"
      );
      expect(sendToUser).toHaveBeenCalledWith("user-1", expect.objectContaining({ type: "ack" }));
    });
  });

  // ---- Unknown message type ----

  describe("unknown message type", () => {
    it("sends error for unknown message type", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "unknown_type" as unknown as RealtimeMessage["type"],
          roomId: room.id,
          userId: "user-1",
        }),
        sendToUser,
        broadcastToRoom
      );
      expect(sendToUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          type: "error",
          payload: expect.objectContaining({
            error: expect.stringContaining("Unknown message type"),
          }),
        })
      );
    });
  });

  // ---- handleDisconnect ----

  describe("handleDisconnect", () => {
    it("removes user from room and broadcasts", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      vi.mocked(broadcastToRoom).mockClear();

      manager.handleDisconnect("user-1", broadcastToRoom);

      expect(broadcastToRoom).toHaveBeenCalledWith(
        room.id,
        expect.objectContaining({
          type: "presence_update",
          payload: expect.objectContaining({ action: "left", displayName: "Alice" }),
        })
      );
    });

    it("handles disconnect for user not in any room", () => {
      manager.handleDisconnect("ghost-user", broadcastToRoom);
      expect(broadcastToRoom).not.toHaveBeenCalled();
    });

    it("cleans up empty rooms on disconnect", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleDisconnect("user-1", broadcastToRoom);
      expect(manager.getRoom(room.id)).toBeUndefined();
    });

    it("keeps room alive when other users remain", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-2",
          payload: { displayName: "Bob" },
        }),
        sendToUser,
        broadcastToRoom
      );
      manager.handleDisconnect("user-1", broadcastToRoom);
      expect(manager.getRoom(room.id)).toBeDefined();
      expect(room.users.size).toBe(1);
    });
  });

  // ---- getPresence ----

  describe("getPresence", () => {
    it("returns users in a room", () => {
      const room = manager.getOrCreateRoom("session-1");
      manager.handleMessage(
        makeMessage({
          type: "join",
          roomId: room.id,
          userId: "user-1",
          payload: { displayName: "Alice" },
        }),
        sendToUser,
        broadcastToRoom
      );
      const presence = manager.getPresence(room.id);
      expect(presence).toHaveLength(1);
      expect(presence[0].displayName).toBe("Alice");
    });

    it("returns empty array for non-existent room", () => {
      expect(manager.getPresence("nonexistent")).toEqual([]);
    });
  });

  // ---- Singleton ----

  describe("getRealtimeManager / resetRealtimeManager", () => {
    it("returns a singleton instance", () => {
      resetRealtimeManager();
      const m1 = getRealtimeManager();
      const m2 = getRealtimeManager();
      expect(m1).toBe(m2);
    });

    it("resetRealtimeManager clears and replaces the instance", () => {
      const m1 = getRealtimeManager();
      m1.getOrCreateRoom("session-1");
      resetRealtimeManager();
      const m2 = getRealtimeManager();
      expect(m2).not.toBe(m1);
    });
  });
});
