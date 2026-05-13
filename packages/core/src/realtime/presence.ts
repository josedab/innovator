/**
 * @module realtime/presence
 *
 * Room presence tracking with cursor positions, active section tracking,
 * and automatic expiry for inactive users.
 */

// ---- Types ----

export type PresenceStatus = "online" | "away" | "offline";

/** Presence state for a single user in a room. */
export interface UserPresence {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  cursorPosition?: { x: number; y: number };
  activeSection?: string;
  lastSeen: number;
  status: PresenceStatus;
}

/** Full presence state for a room. */
export interface RoomPresenceState {
  roomId: string;
  users: Map<string, UserPresence>;
  /** Tracks which sections have which users editing. */
  activeSections: Map<string, string[]>;
}

// ---- Constants ----

/** Users are expired after 30 seconds without a heartbeat. */
const HEARTBEAT_TIMEOUT_MS = 30_000;

// ---- Presence Manager ----

export class PresenceManager {
  private rooms = new Map<string, RoomPresenceState>();

  /** Join a room, adding or reconnecting the user. */
  joinRoom(
    roomId: string,
    user: { userId: string; displayName: string; avatarUrl?: string }
  ): RoomPresenceState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        users: new Map(),
        activeSections: new Map(),
      };
      this.rooms.set(roomId, room);
    }

    const existing = room.users.get(user.userId);
    if (existing) {
      existing.status = "online";
      existing.lastSeen = Date.now();
      existing.displayName = user.displayName;
      if (user.avatarUrl !== undefined) existing.avatarUrl = user.avatarUrl;
    } else {
      room.users.set(user.userId, {
        userId: user.userId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        lastSeen: Date.now(),
        status: "online",
      });
    }

    return room;
  }

  /** Remove a user from a room. */
  leaveRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Remove from active sections
    for (const [section, users] of room.activeSections) {
      const idx = users.indexOf(userId);
      if (idx !== -1) {
        users.splice(idx, 1);
        if (users.length === 0) room.activeSections.delete(section);
      }
    }

    const deleted = room.users.delete(userId);

    // Clean up empty rooms
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
    }

    return deleted;
  }

  /** Update a user's cursor position (also acts as heartbeat). */
  updateCursor(
    roomId: string,
    userId: string,
    position: { x: number; y: number }
  ): boolean {
    const user = this.getUser(roomId, userId);
    if (!user) return false;

    user.cursorPosition = position;
    user.lastSeen = Date.now();
    user.status = "online";
    return true;
  }

  /** Track which section a user is editing (also acts as heartbeat). */
  updateSection(roomId: string, userId: string, section: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const user = room.users.get(userId);
    if (!user) return false;

    // Remove from previous section
    if (user.activeSection && user.activeSection !== section) {
      const prev = room.activeSections.get(user.activeSection);
      if (prev) {
        const idx = prev.indexOf(userId);
        if (idx !== -1) prev.splice(idx, 1);
        if (prev.length === 0) room.activeSections.delete(user.activeSection);
      }
    }

    // Add to new section
    user.activeSection = section;
    user.lastSeen = Date.now();
    user.status = "online";

    const sectionUsers = room.activeSections.get(section) ?? [];
    if (!sectionUsers.includes(userId)) {
      sectionUsers.push(userId);
      room.activeSections.set(section, sectionUsers);
    }

    return true;
  }

  /** Get full presence state for a room (runs expiry check). */
  getPresence(roomId: string): RoomPresenceState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    this.expireStaleUsers(room);
    return room;
  }

  /** Get online users for a room. */
  getActiveUsers(roomId: string): UserPresence[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    this.expireStaleUsers(room);
    return Array.from(room.users.values()).filter((u) => u.status === "online");
  }

  /** Heartbeat: update lastSeen to keep user active. */
  heartbeat(roomId: string, userId: string): boolean {
    const user = this.getUser(roomId, userId);
    if (!user) return false;
    user.lastSeen = Date.now();
    user.status = "online";
    return true;
  }

  /** Clear all rooms (for testing). */
  clear(): void {
    this.rooms.clear();
  }

  // ---- Private helpers ----

  private getUser(roomId: string, userId: string): UserPresence | undefined {
    return this.rooms.get(roomId)?.users.get(userId);
  }

  /** Mark users as away/offline based on heartbeat timeout. */
  private expireStaleUsers(room: RoomPresenceState): void {
    const now = Date.now();
    for (const user of room.users.values()) {
      if (user.status === "offline") continue;
      const elapsed = now - user.lastSeen;
      if (elapsed > HEARTBEAT_TIMEOUT_MS * 2) {
        user.status = "offline";
      } else if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        user.status = "away";
      }
    }
  }
}
