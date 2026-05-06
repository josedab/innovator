import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock filesystem
const fileStore = new Map<string, string>();
const dirFiles = new Map<string, string[]>();

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => fileStore.has(path) || dirFiles.has(path)),
  mkdirSync: vi.fn((path: string) => {
    dirFiles.set(path, []);
  }),
  readFileSync: vi.fn((path: string) => {
    if (!fileStore.has(path)) throw new Error("ENOENT");
    return fileStore.get(path)!;
  }),
  writeFileSync: vi.fn((path: string, data: string) => {
    fileStore.set(path, data);
    // Track files in parent dir for readdirSync
    const parts = path.split("/");
    const fileName = parts.pop()!;
    const dir = parts.join("/");
    if (!dirFiles.has(dir)) dirFiles.set(dir, []);
    const files = dirFiles.get(dir)!;
    if (!files.includes(fileName)) files.push(fileName);
  }),
  readdirSync: vi.fn((path: string) => {
    return dirFiles.get(path) ?? [];
  }),
}));

import {
  trackIdea,
  loadTrackedIdeas,
  updateTrackedIdeaStatus,
  getTrackedIdea,
  buildDashboard,
} from "../tracker/index.js";

describe("tracker", () => {
  beforeEach(() => {
    fileStore.clear();
    dirFiles.clear();
  });

  describe("trackIdea", () => {
    it("creates tracked entry with UUID and timestamps", () => {
      const id = trackIdea({
        sessionId: "session-1",
        ideaTitle: "AI Dashboard",
        angleId: "scamper",
        platform: "github",
        externalId: "issue-42",
      });
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");

      const idea = getTrackedIdea(id);
      expect(idea).toBeDefined();
      expect(idea!.sessionId).toBe("session-1");
      expect(idea!.ideaTitle).toBe("AI Dashboard");
      expect(idea!.angleId).toBe("scamper");
      expect(idea!.platform).toBe("github");
      expect(idea!.externalId).toBe("issue-42");
      expect(idea!.status).toBe("open");
      expect(idea!.exportedAt).toBeTruthy();
      expect(idea!.statusHistory).toHaveLength(1);
      expect(idea!.statusHistory[0].status).toBe("open");
    });

    it("supports externalUrl", () => {
      const id = trackIdea({
        sessionId: "session-1",
        ideaTitle: "Test",
        angleId: "scamper",
        platform: "github",
        externalId: "issue-1",
        externalUrl: "https://github.com/org/repo/issues/1",
      });
      const idea = getTrackedIdea(id);
      expect(idea!.externalUrl).toBe("https://github.com/org/repo/issues/1");
    });
  });

  describe("updateTrackedIdeaStatus", () => {
    it("transitions open → in-progress", () => {
      const id = trackIdea({
        sessionId: "s1",
        ideaTitle: "Test",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      const result = updateTrackedIdeaStatus(id, "in-progress");
      expect(result).toBe(true);
      const idea = getTrackedIdea(id);
      expect(idea!.status).toBe("in-progress");
      expect(idea!.statusHistory).toHaveLength(2);
      expect(idea!.lastCheckedAt).toBeTruthy();
    });

    it("transitions in-progress → closed", () => {
      const id = trackIdea({
        sessionId: "s1",
        ideaTitle: "Test",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      updateTrackedIdeaStatus(id, "in-progress");
      updateTrackedIdeaStatus(id, "closed");
      const idea = getTrackedIdea(id);
      expect(idea!.status).toBe("closed");
      expect(idea!.statusHistory).toHaveLength(3);
    });

    it("returns false for nonexistent idea", () => {
      expect(updateTrackedIdeaStatus("nonexistent-id", "closed")).toBe(false);
    });

    it("records full status history", () => {
      const id = trackIdea({
        sessionId: "s1",
        ideaTitle: "Test",
        angleId: "a1",
        platform: "linear",
        externalId: "LIN-1",
      });
      updateTrackedIdeaStatus(id, "in-progress");
      updateTrackedIdeaStatus(id, "closed");
      const idea = getTrackedIdea(id);
      expect(idea!.statusHistory.map((h) => h.status)).toEqual(["open", "in-progress", "closed"]);
    });
  });

  describe("loadTrackedIdeas", () => {
    it("returns empty array when no ideas tracked", () => {
      const ideas = loadTrackedIdeas();
      expect(ideas).toEqual([]);
    });

    it("returns all tracked ideas sorted by exportedAt desc", () => {
      trackIdea({
        sessionId: "s1",
        ideaTitle: "First",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      trackIdea({
        sessionId: "s2",
        ideaTitle: "Second",
        angleId: "a2",
        platform: "linear",
        externalId: "2",
      });
      const ideas = loadTrackedIdeas();
      expect(ideas).toHaveLength(2);
    });

    it("filters by platform via dashboard", () => {
      trackIdea({
        sessionId: "s1",
        ideaTitle: "GitHub Idea",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      trackIdea({
        sessionId: "s2",
        ideaTitle: "Linear Idea",
        angleId: "a2",
        platform: "linear",
        externalId: "2",
      });
      const dashboard = buildDashboard();
      expect(dashboard.byPlatform["github"]).toBe(1);
      expect(dashboard.byPlatform["linear"]).toBe(1);
    });
  });

  describe("getTrackedIdea", () => {
    it("returns undefined for nonexistent idea", () => {
      expect(getTrackedIdea("nonexistent")).toBeUndefined();
    });

    it("returns tracked idea by ID", () => {
      const id = trackIdea({
        sessionId: "s1",
        ideaTitle: "Test",
        angleId: "a1",
        platform: "jira",
        externalId: "JIRA-1",
      });
      const idea = getTrackedIdea(id);
      expect(idea).toBeDefined();
      expect(idea!.platform).toBe("jira");
    });
  });

  describe("buildDashboard", () => {
    it("returns zero metrics for empty tracker", () => {
      const dashboard = buildDashboard();
      expect(dashboard.totalTracked).toBe(0);
      expect(dashboard.innovationHitRate).toBe(0);
      expect(dashboard.insights.length).toBeGreaterThan(0);
      expect(dashboard.insights[0]).toContain("No ideas tracked");
    });

    it("computes hit rate: all shipped → 1.0", () => {
      const id1 = trackIdea({
        sessionId: "s1",
        ideaTitle: "Idea 1",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      const id2 = trackIdea({
        sessionId: "s2",
        ideaTitle: "Idea 2",
        angleId: "a2",
        platform: "github",
        externalId: "2",
      });
      updateTrackedIdeaStatus(id1, "closed");
      updateTrackedIdeaStatus(id2, "closed");

      const dashboard = buildDashboard();
      expect(dashboard.innovationHitRate).toBe(1);
    });

    it("computes hit rate: none shipped → 0", () => {
      trackIdea({
        sessionId: "s1",
        ideaTitle: "Idea 1",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      const dashboard = buildDashboard();
      expect(dashboard.innovationHitRate).toBe(0);
    });

    it("tracks by status", () => {
      const id1 = trackIdea({
        sessionId: "s1",
        ideaTitle: "Open Idea",
        angleId: "a1",
        platform: "github",
        externalId: "1",
      });
      const id2 = trackIdea({
        sessionId: "s2",
        ideaTitle: "In Progress",
        angleId: "a2",
        platform: "github",
        externalId: "2",
      });
      updateTrackedIdeaStatus(id2, "in-progress");

      const dashboard = buildDashboard();
      expect(dashboard.byStatus["open"]).toBe(1);
      expect(dashboard.byStatus["in-progress"]).toBe(1);
    });

    it("tracks by angle", () => {
      trackIdea({
        sessionId: "s1",
        ideaTitle: "Scamper Idea",
        angleId: "scamper",
        platform: "github",
        externalId: "1",
      });
      trackIdea({
        sessionId: "s2",
        ideaTitle: "FP Idea",
        angleId: "first-principles",
        platform: "github",
        externalId: "2",
      });

      const dashboard = buildDashboard();
      expect(dashboard.byAngle["scamper"]?.exported).toBe(1);
      expect(dashboard.byAngle["first-principles"]?.exported).toBe(1);
    });

    it("supports GitHub, Linear, and Jira platforms", () => {
      trackIdea({
        sessionId: "s1",
        ideaTitle: "GH",
        angleId: "a1",
        platform: "github",
        externalId: "gh-1",
      });
      trackIdea({
        sessionId: "s2",
        ideaTitle: "LN",
        angleId: "a2",
        platform: "linear",
        externalId: "LIN-1",
      });
      trackIdea({
        sessionId: "s3",
        ideaTitle: "JR",
        angleId: "a3",
        platform: "jira",
        externalId: "JIRA-1",
      });

      const dashboard = buildDashboard();
      expect(dashboard.byPlatform["github"]).toBe(1);
      expect(dashboard.byPlatform["linear"]).toBe(1);
      expect(dashboard.byPlatform["jira"]).toBe(1);
    });

    it("generates insights for tracked ideas", () => {
      const id = trackIdea({
        sessionId: "s1",
        ideaTitle: "Test",
        angleId: "scamper",
        platform: "github",
        externalId: "1",
      });
      updateTrackedIdeaStatus(id, "in-progress");

      const dashboard = buildDashboard();
      expect(dashboard.insights.some((i) => i.includes("in progress"))).toBe(true);
    });
  });
});
