import { describe, it, expect, beforeEach } from "vitest";
import { SharedStateManager } from "../realtime/shared-state.js";
import { PresenceManager } from "../realtime/presence.js";
import { ConsensusManager } from "../realtime/consensus.js";
import type { CRDTOperation } from "../realtime/shared-state.js";

function makeOp(overrides: Partial<CRDTOperation> = {}): CRDTOperation {
  return {
    id: "op-1",
    type: "insert",
    path: "title",
    value: "Hello",
    timestamp: Date.now(),
    userId: "user-a",
    vectorClock: { "user-a": 1 },
    ...overrides,
  };
}

describe("SharedStateManager", () => {
  let mgr: SharedStateManager;

  beforeEach(() => {
    mgr = new SharedStateManager();
  });

  describe("createDocument", () => {
    it("creates a document with version 0", () => {
      const doc = mgr.createDocument("room-1");
      expect(doc.id).toBeDefined();
      expect(doc.roomId).toBe("room-1");
      expect(doc.version).toBe(0);
      expect(doc.content.size).toBe(0);
    });
  });

  describe("applyOperation", () => {
    it("inserts a value into the document", () => {
      const doc = mgr.createDocument("room-1");
      const updated = mgr.applyOperation(doc.id, makeOp());
      expect(updated).toBeDefined();
      expect(updated!.content.get("title")?.value).toBe("Hello");
      expect(updated!.version).toBe(1);
    });

    it("updates an existing value with higher timestamp", () => {
      const doc = mgr.createDocument("room-1");
      mgr.applyOperation(doc.id, makeOp({ timestamp: 100 }));
      mgr.applyOperation(doc.id, makeOp({ type: "update", value: "World", timestamp: 200 }));
      expect(doc.content.get("title")?.value).toBe("World");
    });

    it("ignores update with lower timestamp (LWW)", () => {
      const doc = mgr.createDocument("room-1");
      mgr.applyOperation(doc.id, makeOp({ timestamp: 200 }));
      mgr.applyOperation(doc.id, makeOp({ type: "update", value: "Old", timestamp: 100 }));
      expect(doc.content.get("title")?.value).toBe("Hello");
    });

    it("deletes a path", () => {
      const doc = mgr.createDocument("room-1");
      mgr.applyOperation(doc.id, makeOp());
      mgr.applyOperation(doc.id, makeOp({ type: "delete", path: "title" }));
      expect(doc.content.has("title")).toBe(false);
    });

    it("returns undefined for unknown document", () => {
      expect(mgr.applyOperation("bad-id", makeOp())).toBeUndefined();
    });
  });

  describe("detectConflicts", () => {
    it("detects concurrent edits from different users within 1s", () => {
      const doc = mgr.createDocument("room-1");
      const now = Date.now();
      mgr.applyOperation(doc.id, makeOp({ userId: "user-a", timestamp: now }));
      mgr.applyOperation(doc.id, makeOp({ userId: "user-b", timestamp: now + 500 }));
      const conflicts = mgr.detectConflicts(doc.id);
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      expect(conflicts[0].path).toBe("title");
    });
  });

  describe("resolveConflicts", () => {
    it("clears conflicts with lww strategy", () => {
      const doc = mgr.createDocument("room-1");
      const now = Date.now();
      mgr.applyOperation(doc.id, makeOp({ userId: "user-a", timestamp: now }));
      mgr.applyOperation(doc.id, makeOp({ userId: "user-b", timestamp: now + 500 }));
      mgr.resolveConflicts(doc.id, "lww");
      expect(mgr.detectConflicts(doc.id)).toHaveLength(0);
    });

    it("returns conflicts for manual strategy then clears", () => {
      const doc = mgr.createDocument("room-1");
      const now = Date.now();
      mgr.applyOperation(doc.id, makeOp({ userId: "user-a", timestamp: now }));
      mgr.applyOperation(doc.id, makeOp({ userId: "user-b", timestamp: now + 500 }));
      const conflicts = mgr.resolveConflicts(doc.id, "manual");
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      expect(mgr.detectConflicts(doc.id)).toHaveLength(0);
    });
  });

  describe("getOperationsSince", () => {
    it("returns operations after given version", () => {
      const doc = mgr.createDocument("room-1");
      mgr.applyOperation(doc.id, makeOp({ id: "op-1" }));
      mgr.applyOperation(doc.id, makeOp({ id: "op-2", path: "body" }));
      const ops = mgr.getOperationsSince(doc.id, 1);
      expect(ops).toHaveLength(1);
    });

    it("returns empty for unknown doc", () => {
      expect(mgr.getOperationsSince("bad", 0)).toHaveLength(0);
    });
  });

  describe("deleteDocument", () => {
    it("removes a document", () => {
      const doc = mgr.createDocument("room-1");
      expect(mgr.deleteDocument(doc.id)).toBe(true);
      expect(mgr.getDocument(doc.id)).toBeUndefined();
    });
  });
});

describe("PresenceManager", () => {
  let pm: PresenceManager;

  beforeEach(() => {
    pm = new PresenceManager();
  });

  describe("joinRoom", () => {
    it("adds a user to a room", () => {
      const room = pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      expect(room.roomId).toBe("r1");
      expect(room.users.get("u1")?.displayName).toBe("Alice");
      expect(room.users.get("u1")?.status).toBe("online");
    });

    it("reconnects an existing user", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      const room = pm.joinRoom("r1", { userId: "u1", displayName: "Alice Updated" });
      expect(room.users.get("u1")?.displayName).toBe("Alice Updated");
      expect(room.users.size).toBe(1);
    });
  });

  describe("leaveRoom", () => {
    it("removes a user from a room", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      expect(pm.leaveRoom("r1", "u1")).toBe(true);
    });

    it("returns false for unknown room", () => {
      expect(pm.leaveRoom("bad", "u1")).toBe(false);
    });

    it("cleans up empty rooms", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      pm.leaveRoom("r1", "u1");
      expect(pm.getPresence("r1")).toBeUndefined();
    });
  });

  describe("updateCursor", () => {
    it("updates cursor position", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      expect(pm.updateCursor("r1", "u1", { x: 10, y: 20 })).toBe(true);
      const room = pm.getPresence("r1");
      expect(room?.users.get("u1")?.cursorPosition).toEqual({ x: 10, y: 20 });
    });

    it("returns false for unknown user", () => {
      expect(pm.updateCursor("r1", "u1", { x: 0, y: 0 })).toBe(false);
    });
  });

  describe("updateSection", () => {
    it("tracks active section for a user", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      expect(pm.updateSection("r1", "u1", "introduction")).toBe(true);
      const room = pm.getPresence("r1");
      expect(room?.activeSections.get("introduction")).toContain("u1");
    });

    it("moves user between sections", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      pm.updateSection("r1", "u1", "intro");
      pm.updateSection("r1", "u1", "body");
      const room = pm.getPresence("r1");
      expect(room?.activeSections.has("intro")).toBe(false);
      expect(room?.activeSections.get("body")).toContain("u1");
    });
  });

  describe("getActiveUsers", () => {
    it("returns only online users", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      pm.joinRoom("r1", { userId: "u2", displayName: "Bob" });
      const active = pm.getActiveUsers("r1");
      expect(active).toHaveLength(2);
    });

    it("returns empty for unknown room", () => {
      expect(pm.getActiveUsers("bad")).toHaveLength(0);
    });
  });

  describe("heartbeat", () => {
    it("refreshes user lastSeen", () => {
      pm.joinRoom("r1", { userId: "u1", displayName: "Alice" });
      expect(pm.heartbeat("r1", "u1")).toBe(true);
    });

    it("returns false for unknown user", () => {
      expect(pm.heartbeat("r1", "nobody")).toBe(false);
    });
  });
});

describe("ConsensusManager", () => {
  let cm: ConsensusManager;

  beforeEach(() => {
    cm = new ConsensusManager();
  });

  describe("createSession", () => {
    it("creates a session with voting open", () => {
      const session = cm.createSession("room-1", 0.5);
      expect(session.id).toBeDefined();
      expect(session.roomId).toBe("room-1");
      expect(session.votingOpen).toBe(true);
      expect(session.consensusThreshold).toBe(0.5);
    });

    it("clamps threshold to [0, 1]", () => {
      const session = cm.createSession("room-1", 2.0);
      expect(session.consensusThreshold).toBeLessThanOrEqual(1);
    });

    it("records a voting_opened event", () => {
      const session = cm.createSession("room-1");
      expect(session.events.some((e) => e.type === "voting_opened")).toBe(true);
    });
  });

  describe("addIdea", () => {
    it("adds an idea card to the session", () => {
      const session = cm.createSession("room-1");
      const idea = cm.addIdea(session.id, { content: "Use AI", author: "alice" });
      expect(idea).toBeDefined();
      expect(idea!.content).toBe("Use AI");
      expect(idea!.author).toBe("alice");
      expect(idea!.votes).toHaveLength(0);
    });

    it("returns undefined for unknown session", () => {
      expect(cm.addIdea("bad", { content: "x", author: "a" })).toBeUndefined();
    });
  });

  describe("vote", () => {
    it("casts a positive vote", () => {
      const session = cm.createSession("room-1");
      const idea = cm.addIdea(session.id, { content: "Idea", author: "alice" })!;
      expect(cm.vote(session.id, idea.id, "bob", 1)).toBe(true);
      expect(idea.score).toBe(1);
      expect(idea.votes).toContain("bob");
    });

    it("prevents duplicate votes from same user", () => {
      const session = cm.createSession("room-1");
      const idea = cm.addIdea(session.id, { content: "Idea", author: "alice" })!;
      cm.vote(session.id, idea.id, "bob", 1);
      expect(cm.vote(session.id, idea.id, "bob", -1)).toBe(false);
    });

    it("returns false when voting is closed", () => {
      const session = cm.createSession("room-1");
      const idea = cm.addIdea(session.id, { content: "Idea", author: "alice" })!;
      cm.synthesize(session.id); // closes voting
      expect(cm.vote(session.id, idea.id, "bob", 1)).toBe(false);
    });
  });

  describe("comment", () => {
    it("adds a comment to an idea", () => {
      const session = cm.createSession("room-1");
      const idea = cm.addIdea(session.id, { content: "Idea", author: "alice" })!;
      const comment = cm.comment(session.id, idea.id, "bob", "Great idea!");
      expect(comment).toBeDefined();
      expect(comment!.text).toBe("Great idea!");
      expect(idea.comments).toHaveLength(1);
    });

    it("returns undefined for unknown idea", () => {
      const session = cm.createSession("room-1");
      expect(cm.comment(session.id, "bad-idea", "bob", "text")).toBeUndefined();
    });
  });

  describe("checkConsensus", () => {
    it("detects consensus when threshold met", () => {
      const session = cm.createSession("room-1", 0.5);
      const idea = cm.addIdea(session.id, { content: "Idea", author: "alice" })!;
      cm.vote(session.id, idea.id, "bob", 1);
      cm.vote(session.id, idea.id, "charlie", 1);
      const result = cm.checkConsensus(session.id);
      expect(result.reached).toBe(true);
      expect(result.topIdea).toBeDefined();
      expect(result.ratio).toBe(1);
    });

    it("returns not reached when no votes", () => {
      const session = cm.createSession("room-1");
      cm.addIdea(session.id, { content: "Idea", author: "alice" });
      const result = cm.checkConsensus(session.id);
      expect(result.reached).toBe(false);
      expect(result.ratio).toBe(0);
    });

    it("handles unknown session", () => {
      const result = cm.checkConsensus("bad");
      expect(result.reached).toBe(false);
      expect(result.topIdea).toBeNull();
    });
  });

  describe("synthesize", () => {
    it("produces a markdown synthesis and closes voting", () => {
      const session = cm.createSession("room-1");
      cm.addIdea(session.id, { content: "Idea A", author: "alice", tags: ["ai"] });
      cm.addIdea(session.id, { content: "Idea B", author: "bob", tags: ["ai"] });
      const synthesis = cm.synthesize(session.id);
      expect(synthesis).toBeDefined();
      expect(synthesis).toContain("Innovation Room Synthesis");
      expect(synthesis).toContain("2 ideas submitted");
      const updated = cm.getSession(session.id);
      expect(updated!.votingOpen).toBe(false);
    });

    it("returns undefined for empty session", () => {
      const session = cm.createSession("room-1");
      expect(cm.synthesize(session.id)).toBeUndefined();
    });

    it("returns undefined for unknown session", () => {
      expect(cm.synthesize("bad")).toBeUndefined();
    });
  });

  describe("getSessionRecording", () => {
    it("returns ordered event log", () => {
      const session = cm.createSession("room-1");
      cm.addIdea(session.id, { content: "Idea", author: "alice" });
      const events = cm.getSessionRecording(session.id);
      expect(events.length).toBeGreaterThanOrEqual(2); // voting_opened + idea_added
      expect(events[0].type).toBe("voting_opened");
    });
  });
});
