import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `innovator-history-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const {
  saveSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  querySessions,
  querySessionsPaginated,
  compareSessions,
  getSessionStats,
} = await import("../history/index.js");

const sampleAngleResult = {
  angleId: "scamper",
  angleName: "SCAMPER",
  ideas: [
    {
      title: "Test Idea",
      description: "A test idea description",
      potentialImpact: "High",
      implementationHint: "Start here",
    },
  ],
  reasoning: "Applied SCAMPER method",
};

describe("history", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "history"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("saves and retrieves a session", () => {
    const id = saveSession({
      subject: "Solar energy",
      angleResults: [sampleAngleResult],
      tags: ["energy"],
    });
    expect(id).toBeTruthy();
    const session = getSession(id);
    expect(session?.subject).toBe("Solar energy");
    expect(session?.tags).toEqual(["energy"]);
  });

  it("lists sessions in reverse chronological order", async () => {
    saveSession({ subject: "First", angleResults: [] });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    saveSession({ subject: "Second", angleResults: [] });
    const sessions = listSessions();
    expect(sessions.length).toBe(2);
    expect(sessions[0].subject).toBe("Second");
  });

  it("updates session tags and notes", () => {
    const id = saveSession({ subject: "Test", angleResults: [], tags: [] });
    updateSession(id, { tags: ["updated"], notes: "Some notes" });
    const session = getSession(id);
    expect(session?.tags).toEqual(["updated"]);
    expect(session?.notes).toBe("Some notes");
  });

  it("deletes a session", () => {
    const id = saveSession({ subject: "Delete me", angleResults: [] });
    expect(deleteSession(id)).toBe(true);
    expect(getSession(id)).toBeUndefined();
  });

  it("returns false when deleting non-existent session", () => {
    expect(deleteSession("nonexistent")).toBe(false);
  });

  it("searches sessions by subject", () => {
    saveSession({ subject: "Solar energy innovations", angleResults: [] });
    saveSession({ subject: "Wind power research", angleResults: [] });
    const results = querySessions({ search: "solar" });
    expect(results).toHaveLength(1);
    expect(results[0].subject).toContain("Solar");
  });

  it("filters sessions by tag", () => {
    saveSession({ subject: "Tagged", angleResults: [], tags: ["energy"] });
    saveSession({ subject: "Untagged", angleResults: [], tags: [] });
    const results = querySessions({ tags: ["energy"] });
    expect(results).toHaveLength(1);
  });

  it("limits results", () => {
    for (let i = 0; i < 5; i++) {
      saveSession({ subject: `Session ${i}`, angleResults: [] });
    }
    const results = querySessions({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("compares two sessions", () => {
    const id1 = saveSession({
      subject: "A",
      angleResults: [sampleAngleResult],
      synthesis: { topIdeas: [], themes: ["AI", "Green"], recommendation: "" },
    });
    const id2 = saveSession({
      subject: "B",
      angleResults: [{ ...sampleAngleResult, angleId: "first-principles", angleName: "First Principles" }],
      synthesis: { topIdeas: [], themes: ["AI", "Speed"], recommendation: "" },
    });
    const comparison = compareSessions(id1, id2);
    expect(comparison?.sharedThemes).toContain("AI");
    expect(comparison?.sharedAngles).toEqual([]);
    expect(comparison?.uniqueAngles1).toContain("scamper");
    expect(comparison?.uniqueAngles2).toContain("first-principles");
  });

  it("compares sessions with shared angles", () => {
    const id1 = saveSession({
      subject: "A",
      angleResults: [sampleAngleResult],
    });
    const id2 = saveSession({
      subject: "B",
      angleResults: [sampleAngleResult],
    });
    const comparison = compareSessions(id1, id2);
    expect(comparison?.sharedAngles).toContain("scamper");
    expect(comparison?.uniqueAngles1).toEqual([]);
    expect(comparison?.uniqueAngles2).toEqual([]);
  });

  it("returns stats for empty history", () => {
    const stats = getSessionStats();
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalIdeas).toBe(0);
    expect(stats.tagFrequency).toEqual({});
    expect(stats.angleFrequency).toEqual({});
    expect(stats.earliestSession).toBeUndefined();
    expect(stats.latestSession).toBeUndefined();
  });

  it("computes aggregate session stats", () => {
    saveSession({
      subject: "Solar",
      angleResults: [sampleAngleResult],
      tags: ["energy", "green"],
    });
    saveSession({
      subject: "Wind",
      angleResults: [
        sampleAngleResult,
        { ...sampleAngleResult, angleId: "first-principles", angleName: "First Principles" },
      ],
      tags: ["energy"],
    });
    const stats = getSessionStats();
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalIdeas).toBe(3);
    expect(stats.tagFrequency).toEqual({ energy: 2, green: 1 });
    expect(stats.angleFrequency).toEqual({ scamper: 2, "first-principles": 1 });
    expect(stats.earliestSession).toBeDefined();
    expect(stats.latestSession).toBeDefined();
  });

  it("querySessionsPaginated returns totalCount with paginated results", () => {
    for (let i = 0; i < 5; i++) {
      saveSession({ subject: `Session ${i}`, angleResults: [], tags: ["batch"] });
    }
    const result = querySessionsPaginated({ limit: 2 });
    expect(result.sessions).toHaveLength(2);
    expect(result.totalCount).toBe(5);
  });

  it("querySessionsPaginated totalCount reflects filtered count", () => {
    saveSession({ subject: "Match A", angleResults: [], tags: ["target"] });
    saveSession({ subject: "Match B", angleResults: [], tags: ["target"] });
    saveSession({ subject: "No match", angleResults: [], tags: ["other"] });
    const result = querySessionsPaginated({ tags: ["target"], limit: 1 });
    expect(result.sessions).toHaveLength(1);
    expect(result.totalCount).toBe(2);
  });
});
