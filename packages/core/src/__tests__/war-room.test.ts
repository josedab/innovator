import { describe, it, expect, beforeEach } from "vitest";

import {
  createWarRoom,
  getWarRoom,
  joinWarRoom,
  leaveWarRoom,
  advanceWarRoomPhase,
  applyCanvasOperation,
  castWarRoomVote,
  getWarRoomVoteTallies,
  deleteWarRoom,
  clearWarRooms,
  listWarRooms,
  setMemberRole,
  findWarRoomByCode,
} from "../realtime/war-room.js";
import type { Operation } from "../realtime/war-room.js";

function makeRoom(overrides: Record<string, unknown> = {}) {
  return createWarRoom({
    name: "Test War Room",
    facilitatorId: "fac-1",
    facilitatorName: "Alice",
    ...overrides,
  });
}

describe("realtime/war-room", () => {
  beforeEach(() => {
    clearWarRooms();
  });

  // ---- Lifecycle ----

  describe("war room lifecycle", () => {
    it("create → join → set phase → vote → close", () => {
      const room = makeRoom();
      expect(room.phase).toBe("lobby");
      expect(room.members).toHaveLength(1);
      expect(room.joinCode).toHaveLength(6);

      // Join
      joinWarRoom(room.id, "user-2", "Bob");
      expect(getWarRoom(room.id)!.members).toHaveLength(2);

      // Advance to ideation
      advanceWarRoomPhase(room.id, "fac-1"); // investigation
      advanceWarRoomPhase(room.id, "fac-1"); // ideation
      expect(getWarRoom(room.id)!.phase).toBe("ideation");

      // Advance to scoring and vote
      advanceWarRoomPhase(room.id, "fac-1"); // scoring
      castWarRoomVote(room.id, "user-2", "idea-1", 1, "Great idea");

      const tallies = getWarRoomVoteTallies(room.id);
      expect(tallies).toHaveLength(1);
      expect(tallies[0].score).toBe(1);

      // Close
      advanceWarRoomPhase(room.id, "fac-1"); // synthesis
      advanceWarRoomPhase(room.id, "fac-1"); // review
      advanceWarRoomPhase(room.id, "fac-1"); // closed
      expect(getWarRoom(room.id)!.phase).toBe("closed");
    });
  });

  // ---- Phase transition validation ----

  describe("advanceWarRoomPhase", () => {
    it("only facilitator can advance phase", () => {
      const room = makeRoom();
      joinWarRoom(room.id, "user-2", "Bob");
      expect(() => advanceWarRoomPhase(room.id, "user-2")).toThrow("Only facilitators");
    });

    it("throws when already in final phase", () => {
      const room = makeRoom();
      // Advance through all phases to closed
      for (let i = 0; i < 6; i++) {
        advanceWarRoomPhase(room.id, "fac-1");
      }
      expect(getWarRoom(room.id)!.phase).toBe("closed");
      expect(() => advanceWarRoomPhase(room.id, "fac-1")).toThrow("final phase");
    });

    it("increments version on phase advance", () => {
      const room = makeRoom();
      expect(room.version).toBe(0);
      advanceWarRoomPhase(room.id, "fac-1");
      expect(getWarRoom(room.id)!.version).toBe(1);
    });
  });

  // ---- Vote deduplication ----

  describe("castWarRoomVote", () => {
    it("replaces previous vote from same user on same idea", () => {
      const room = makeRoom();
      castWarRoomVote(room.id, "fac-1", "idea-1", 1);
      castWarRoomVote(room.id, "fac-1", "idea-1", -1); // change vote

      const tallies = getWarRoomVoteTallies(room.id);
      expect(tallies).toHaveLength(1);
      expect(tallies[0].score).toBe(-1);
      expect(tallies[0].totalVotes).toBe(1);
    });

    it("observers cannot vote", () => {
      const room = makeRoom();
      joinWarRoom(room.id, "obs-1", "Observer", "observer");
      expect(() => castWarRoomVote(room.id, "obs-1", "idea-1", 1)).toThrow("observer");
    });

    it("throws when voting is disabled", () => {
      const room = makeRoom({ settings: { votingEnabled: false } });
      expect(() => castWarRoomVote(room.id, "fac-1", "idea-1", 1)).toThrow("not enabled");
    });

    it("clamps vote value to [-1, 1]", () => {
      const room = makeRoom();
      castWarRoomVote(room.id, "fac-1", "idea-1", 5);
      const tallies = getWarRoomVoteTallies(room.id);
      expect(tallies[0].score).toBe(1); // clamped
    });
  });

  // ---- Canvas operations ----

  describe("applyCanvasOperation", () => {
    it("inserts a canvas object", () => {
      const room = makeRoom();
      const op: Operation = {
        id: "op-1",
        type: "insert",
        targetId: "obj-1",
        userId: "fac-1",
        data: { type: "sticky-note", content: "Hello", position: { x: 10, y: 20 } },
        version: 0,
        timestamp: new Date().toISOString(),
      };

      applyCanvasOperation(room.id, op);
      const updated = getWarRoom(room.id)!;
      expect(updated.canvas).toHaveLength(1);
      expect(updated.canvas[0].content).toBe("Hello");
    });

    it("updates a canvas object", () => {
      const room = makeRoom();
      applyCanvasOperation(room.id, {
        id: "op-1",
        type: "insert",
        targetId: "obj-1",
        userId: "fac-1",
        data: { type: "sticky-note", content: "Before", position: { x: 0, y: 0 } },
        version: 0,
        timestamp: new Date().toISOString(),
      });

      applyCanvasOperation(room.id, {
        id: "op-2",
        type: "update",
        targetId: "obj-1",
        userId: "fac-1",
        data: { content: "After" },
        version: 1,
        timestamp: new Date().toISOString(),
      });

      expect(getWarRoom(room.id)!.canvas[0].content).toBe("After");
    });

    it("deletes a canvas object", () => {
      const room = makeRoom();
      applyCanvasOperation(room.id, {
        id: "op-1",
        type: "insert",
        targetId: "obj-1",
        userId: "fac-1",
        data: { type: "sticky-note", content: "X", position: { x: 0, y: 0 } },
        version: 0,
        timestamp: new Date().toISOString(),
      });

      applyCanvasOperation(room.id, {
        id: "op-2",
        type: "delete",
        targetId: "obj-1",
        userId: "fac-1",
        data: {},
        version: 1,
        timestamp: new Date().toISOString(),
      });

      expect(getWarRoom(room.id)!.canvas).toHaveLength(0);
    });

    it("observers cannot modify canvas", () => {
      const room = makeRoom();
      joinWarRoom(room.id, "obs-1", "Observer", "observer");

      expect(() =>
        applyCanvasOperation(room.id, {
          id: "op-1",
          type: "insert",
          targetId: "obj-1",
          userId: "obs-1",
          data: { type: "sticky-note", content: "X", position: { x: 0, y: 0 } },
          version: 0,
          timestamp: new Date().toISOString(),
        })
      ).toThrow("Observers cannot modify");
    });

    it("throws for non-member", () => {
      const room = makeRoom();
      expect(() =>
        applyCanvasOperation(room.id, {
          id: "op-1",
          type: "insert",
          targetId: "obj-1",
          userId: "stranger",
          data: {},
          version: 0,
          timestamp: new Date().toISOString(),
        })
      ).toThrow("Not a member");
    });
  });

  // ---- Role management ----

  describe("setMemberRole", () => {
    it("facilitator can change member role", () => {
      const room = makeRoom();
      joinWarRoom(room.id, "user-2", "Bob");
      setMemberRole(room.id, "fac-1", "user-2", "observer");
      const member = getWarRoom(room.id)!.members.find((m) => m.userId === "user-2")!;
      expect(member.role).toBe("observer");
    });

    it("non-facilitator cannot change roles", () => {
      const room = makeRoom();
      joinWarRoom(room.id, "user-2", "Bob");
      expect(() => setMemberRole(room.id, "user-2", "fac-1", "participant")).toThrow(
        "Only facilitators"
      );
    });
  });

  // ---- Join / Leave ----

  describe("joinWarRoom", () => {
    it("reconnects existing member", () => {
      const room = makeRoom();
      joinWarRoom(room.id, "user-2", "Bob");
      leaveWarRoom(room.id, "user-2");
      joinWarRoom(room.id, "user-2", "Bob");

      const members = getWarRoom(room.id)!.members;
      expect(members.filter((m) => m.userId === "user-2")).toHaveLength(1);
      expect(members.find((m) => m.userId === "user-2")!.isActive).toBe(true);
    });

    it("throws when room is at capacity", () => {
      const room = makeRoom({ settings: { maxParticipants: 2 } });
      joinWarRoom(room.id, "u2", "B");
      expect(() => joinWarRoom(room.id, "u3", "C")).toThrow("capacity");
    });

    it("throws when room is closed", () => {
      const room = makeRoom();
      for (let i = 0; i < 6; i++) advanceWarRoomPhase(room.id, "fac-1");
      expect(() => joinWarRoom(room.id, "u2", "B")).toThrow("closed");
    });

    it("throws for non-existent room", () => {
      expect(() => joinWarRoom("missing", "u1", "A")).toThrow("not found");
    });
  });

  // ---- findWarRoomByCode ----

  describe("findWarRoomByCode", () => {
    it("finds room by join code (case-insensitive)", () => {
      const room = makeRoom();
      const found = findWarRoomByCode(room.joinCode.toLowerCase());
      expect(found).toBeDefined();
      expect(found!.id).toBe(room.id);
    });

    it("returns undefined for invalid code", () => {
      expect(findWarRoomByCode("XXXXXX")).toBeUndefined();
    });
  });

  // ---- Delete / List ----

  describe("deleteWarRoom", () => {
    it("deletes existing room", () => {
      const room = makeRoom();
      expect(deleteWarRoom(room.id)).toBe(true);
      expect(getWarRoom(room.id)).toBeUndefined();
    });

    it("returns false for non-existent room", () => {
      expect(deleteWarRoom("missing")).toBe(false);
    });
  });

  describe("listWarRooms", () => {
    it("lists rooms sorted by updatedAt", () => {
      makeRoom({ name: "Room 1" });
      makeRoom({ name: "Room 2" });
      const list = listWarRooms();
      expect(list).toHaveLength(2);
    });
  });
});
