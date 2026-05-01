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
  compareSessions,
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
      angleResults: [],
      synthesis: { topIdeas: [], themes: ["AI", "Green"], recommendation: "" },
    });
    const id2 = saveSession({
      subject: "B",
      angleResults: [],
      synthesis: { topIdeas: [], themes: ["AI", "Speed"], recommendation: "" },
    });
    const comparison = compareSessions(id1, id2);
    expect(comparison?.sharedThemes).toContain("AI");
  });
});
