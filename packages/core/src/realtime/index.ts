/**
 * @module realtime
 *
 * WebSocket-based real-time collaboration transport layer.
 * Room-based multiplexing with presence tracking, live voting,
 * typing indicators, and optimistic conflict resolution.
 *
 * This module provides a protocol-agnostic server that can be
 * wired into any WebSocket library (ws, Socket.io, Partykit).
 */

import { randomUUID } from "node:crypto";
import type { CollaborativeEvent, AngleId } from "../types.js";

// ---- Types ----

export interface RealtimeUser {
  userId: string;
  displayName: string;
  connectedAt: string;
  /** Cursor position for canvas/document presence */
  cursor?: { x: number; y: number };
  /** Whether the user is currently typing */
  isTyping: boolean;
  /** Last activity timestamp */
  lastActivity: string;
}

export interface RealtimeRoom {
  id: string;
  sessionId: string;
  users: Map<string, RealtimeUser>;
  createdAt: string;
}

export type RealtimeMessageType =
  | "join"
  | "leave"
  | "cursor_move"
  | "typing_start"
  | "typing_stop"
  | "idea_submit"
  | "idea_vote"
  | "idea_comment"
  | "idea_merge"
  | "session_start"
  | "session_complete"
  | "angle_assign"
  | "presence_sync"
  | "error";

export interface RealtimeMessage {
  type: RealtimeMessageType;
  roomId: string;
  userId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  messageId: string;
}

export interface RealtimeResponse {
  type: RealtimeMessageType | "ack" | "presence_update" | "broadcast";
  roomId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  messageId: string;
}

/** Callback to send a message to a specific user. */
export type SendToUser = (userId: string, message: RealtimeResponse) => void;
/** Callback to broadcast a message to all users in a room. */
export type BroadcastToRoom = (
  roomId: string,
  message: RealtimeResponse,
  excludeUserId?: string
) => void;

// ---- Room Manager ----

export class RealtimeRoomManager {
  private rooms = new Map<string, RealtimeRoom>();
  private userRooms = new Map<string, string>(); // userId -> roomId

  /** Create or get a room for a collaborative session. */
  getOrCreateRoom(sessionId: string): RealtimeRoom {
    // Check if room already exists for this session
    for (const room of this.rooms.values()) {
      if (room.sessionId === sessionId) return room;
    }

    const room: RealtimeRoom = {
      id: randomUUID(),
      sessionId,
      users: new Map(),
      createdAt: new Date().toISOString(),
    };
    this.rooms.set(room.id, room);
    return room;
  }

  /** Get room by ID. */
  getRoom(roomId: string): RealtimeRoom | undefined {
    return this.rooms.get(roomId);
  }

  /** Get the room a user is in. */
  getUserRoom(userId: string): RealtimeRoom | undefined {
    const roomId = this.userRooms.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /** Handle an incoming message and produce responses. */
  handleMessage(
    message: RealtimeMessage,
    sendToUser: SendToUser,
    broadcastToRoom: BroadcastToRoom
  ): void {
    const now = new Date().toISOString();

    switch (message.type) {
      case "join":
        this.handleJoin(message, sendToUser, broadcastToRoom, now);
        break;
      case "leave":
        this.handleLeave(message, broadcastToRoom, now);
        break;
      case "cursor_move":
        this.handleCursorMove(message, broadcastToRoom, now);
        break;
      case "typing_start":
      case "typing_stop":
        this.handleTyping(message, broadcastToRoom, now);
        break;
      case "idea_submit":
      case "idea_vote":
      case "idea_comment":
      case "idea_merge":
      case "session_start":
      case "session_complete":
      case "angle_assign":
        // Broadcast collaborative events to all room members
        broadcastToRoom(
          message.roomId,
          {
            type: "broadcast",
            roomId: message.roomId,
            payload: { originalType: message.type, ...message.payload, userId: message.userId },
            timestamp: now,
            messageId: randomUUID(),
          },
          message.userId
        );
        // Ack to sender
        sendToUser(message.userId, {
          type: "ack",
          roomId: message.roomId,
          payload: { ackedMessageId: message.messageId },
          timestamp: now,
          messageId: randomUUID(),
        });
        break;
      default:
        sendToUser(message.userId, {
          type: "error",
          roomId: message.roomId,
          payload: { error: `Unknown message type: ${message.type}` },
          timestamp: now,
          messageId: randomUUID(),
        });
    }
  }

  /** Handle user disconnect (cleanup). */
  handleDisconnect(userId: string, broadcastToRoom: BroadcastToRoom): void {
    const roomId = this.userRooms.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.users.get(userId);
    room.users.delete(userId);
    this.userRooms.delete(userId);

    broadcastToRoom(roomId, {
      type: "presence_update",
      roomId,
      payload: {
        action: "left",
        userId,
        displayName: user?.displayName ?? "Unknown",
        users: this.serializeUsers(room),
      },
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
    });

    // Clean up empty rooms
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  /** Get presence info for a room. */
  getPresence(roomId: string): RealtimeUser[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  /** Clear all rooms (for testing). */
  clear(): void {
    this.rooms.clear();
    this.userRooms.clear();
  }

  // ---- Private handlers ----

  private handleJoin(
    message: RealtimeMessage,
    sendToUser: SendToUser,
    broadcastToRoom: BroadcastToRoom,
    now: string
  ): void {
    const room = this.rooms.get(message.roomId);
    if (!room) {
      sendToUser(message.userId, {
        type: "error",
        roomId: message.roomId,
        payload: { error: "Room not found" },
        timestamp: now,
        messageId: randomUUID(),
      });
      return;
    }

    const user: RealtimeUser = {
      userId: message.userId,
      displayName: (message.payload.displayName as string) ?? "Anonymous",
      connectedAt: now,
      isTyping: false,
      lastActivity: now,
    };

    room.users.set(message.userId, user);
    this.userRooms.set(message.userId, message.roomId);

    // Send current presence to the joining user
    sendToUser(message.userId, {
      type: "presence_sync",
      roomId: message.roomId,
      payload: { users: this.serializeUsers(room) },
      timestamp: now,
      messageId: randomUUID(),
    });

    // Broadcast join to existing users
    broadcastToRoom(
      message.roomId,
      {
        type: "presence_update",
        roomId: message.roomId,
        payload: {
          action: "joined",
          userId: message.userId,
          displayName: user.displayName,
          users: this.serializeUsers(room),
        },
        timestamp: now,
        messageId: randomUUID(),
      },
      message.userId
    );
  }

  private handleLeave(
    message: RealtimeMessage,
    broadcastToRoom: BroadcastToRoom,
    now: string
  ): void {
    this.handleDisconnect(message.userId, broadcastToRoom);
  }

  private handleCursorMove(
    message: RealtimeMessage,
    broadcastToRoom: BroadcastToRoom,
    now: string
  ): void {
    const room = this.rooms.get(message.roomId);
    if (!room) return;

    const user = room.users.get(message.userId);
    if (!user) return;

    user.cursor = {
      x: (message.payload.x as number) ?? 0,
      y: (message.payload.y as number) ?? 0,
    };
    user.lastActivity = now;

    broadcastToRoom(
      message.roomId,
      {
        type: "presence_update",
        roomId: message.roomId,
        payload: {
          action: "cursor_moved",
          userId: message.userId,
          cursor: user.cursor,
        },
        timestamp: now,
        messageId: randomUUID(),
      },
      message.userId
    );
  }

  private handleTyping(
    message: RealtimeMessage,
    broadcastToRoom: BroadcastToRoom,
    now: string
  ): void {
    const room = this.rooms.get(message.roomId);
    if (!room) return;

    const user = room.users.get(message.userId);
    if (!user) return;

    user.isTyping = message.type === "typing_start";
    user.lastActivity = now;

    broadcastToRoom(
      message.roomId,
      {
        type: "presence_update",
        roomId: message.roomId,
        payload: {
          action: message.type,
          userId: message.userId,
          displayName: user.displayName,
        },
        timestamp: now,
        messageId: randomUUID(),
      },
      message.userId
    );
  }

  private serializeUsers(room: RealtimeRoom): Record<string, unknown>[] {
    return Array.from(room.users.values()).map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
      connectedAt: u.connectedAt,
      cursor: u.cursor,
      isTyping: u.isTyping,
      lastActivity: u.lastActivity,
    }));
  }
}

/** Singleton room manager. */
let globalRoomManager: RealtimeRoomManager | undefined;

export function getRealtimeManager(): RealtimeRoomManager {
  if (!globalRoomManager) {
    globalRoomManager = new RealtimeRoomManager();
  }
  return globalRoomManager;
}

export function resetRealtimeManager(): void {
  globalRoomManager?.clear();
  globalRoomManager = undefined;
}

export * from "./operational-transform.js";
export * from "./workshop-templates.js";
export * from "./session-summary.js";
