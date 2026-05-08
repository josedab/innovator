import { describe, it, expect, beforeEach } from "vitest";
import {
  createPlaygroundSession,
  getPlaygroundSession,
  getSessionByShareId,
  updatePlaygroundSession,
  getUserSessions,
  getUserUsage,
  checkUsageLimit,
  isFeatureAvailable,
  cleanupExpiredSessions,
  clearPlaygroundData,
} from "../playground/index.js";

describe("Playground / SaaS", () => {
  beforeEach(() => {
    clearPlaygroundData();
  });

  describe("createPlaygroundSession", () => {
    it("creates a session with share ID", () => {
      const session = createPlaygroundSession("AI in healthcare", "user-1");
      expect(session.id).toBeDefined();
      expect(session.shareId).toBeDefined();
      expect(session.subject).toBe("AI in healthcare");
      expect(session.status).toBe("pending");
      expect(session.tier).toBe("free");
      expect(session.expiresAt).toBeDefined();
    });

    it("creates anonymous sessions", () => {
      const session = createPlaygroundSession("test subject");
      expect(session.userId).toBeUndefined();
    });

    it("increments user usage", () => {
      createPlaygroundSession("sub 1", "user-1");
      createPlaygroundSession("sub 2", "user-1");
      const usage = getUserUsage("user-1");
      expect(usage.sessionsToday).toBe(2);
      expect(usage.totalSessions).toBe(2);
    });
  });

  describe("getPlaygroundSession", () => {
    it("retrieves session by ID", () => {
      const session = createPlaygroundSession("test", "user-1");
      const found = getPlaygroundSession(session.id);
      expect(found).toBeDefined();
      expect(found!.subject).toBe("test");
    });

    it("returns undefined for unknown ID", () => {
      expect(getPlaygroundSession("nonexistent")).toBeUndefined();
    });
  });

  describe("getSessionByShareId", () => {
    it("retrieves session by share ID", () => {
      const session = createPlaygroundSession("shared test", "user-1");
      const found = getSessionByShareId(session.shareId!);
      expect(found).toBeDefined();
      expect(found!.subject).toBe("shared test");
    });

    it("returns undefined for unknown share ID", () => {
      expect(getSessionByShareId("badshare")).toBeUndefined();
    });
  });

  describe("updatePlaygroundSession", () => {
    it("updates session status and result", () => {
      const session = createPlaygroundSession("update test", "user-1");
      const updated = updatePlaygroundSession(session.id, {
        status: "completed",
        result: { ideas: ["idea1"] },
        completedAt: new Date().toISOString(),
      });
      expect(updated!.status).toBe("completed");
      expect(updated!.result).toEqual({ ideas: ["idea1"] });
      expect(updated!.completedAt).toBeDefined();
    });

    it("returns undefined for unknown session", () => {
      expect(updatePlaygroundSession("bad-id", { status: "failed" })).toBeUndefined();
    });
  });

  describe("getUserSessions", () => {
    it("returns sessions for user", () => {
      createPlaygroundSession("first", "user-1");
      createPlaygroundSession("second", "user-1");
      const sessions = getUserSessions("user-1");
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.subject)).toContain("first");
      expect(sessions.map((s) => s.subject)).toContain("second");
    });

    it("returns empty array for unknown user", () => {
      expect(getUserSessions("nobody")).toHaveLength(0);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) createPlaygroundSession(`s${i}`, "user-1");
      expect(getUserSessions("user-1", 3)).toHaveLength(3);
    });
  });

  describe("checkUsageLimit", () => {
    it("allows sessions within daily limit", () => {
      createPlaygroundSession("s1", "user-1");
      const limit = checkUsageLimit("user-1");
      expect(limit.allowed).toBe(true);
      expect(limit.remaining).toBe(2);
    });

    it("blocks sessions exceeding daily limit", () => {
      for (let i = 0; i < 3; i++) createPlaygroundSession(`s${i}`, "user-1");
      const limit = checkUsageLimit("user-1");
      expect(limit.allowed).toBe(false);
      expect(limit.remaining).toBe(0);
      expect(limit.reason).toContain("Daily limit");
    });
  });

  describe("isFeatureAvailable", () => {
    it("free tier has basic features", () => {
      expect(isFeatureAvailable("free", "investigate")).toBe(true);
      expect(isFeatureAvailable("free", "share")).toBe(true);
    });

    it("free tier lacks advanced features", () => {
      expect(isFeatureAvailable("free", "debate")).toBe(false);
      expect(isFeatureAvailable("free", "coaching")).toBe(false);
    });

    it("enterprise tier has all features", () => {
      expect(isFeatureAvailable("enterprise", "anything")).toBe(true);
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("removes expired sessions", () => {
      const session = createPlaygroundSession("expire me", "user-1");
      // Manually expire it
      const s = getPlaygroundSession(session.id)!;
      s.expiresAt = new Date(Date.now() - 1000).toISOString();
      const cleaned = cleanupExpiredSessions();
      expect(cleaned).toBe(1);
      expect(getPlaygroundSession(session.id)).toBeUndefined();
    });
  });
});
