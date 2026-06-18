import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const k in store) delete store[k];
  }),
};
vi.stubGlobal("localStorage", localStorageMock);

import {
  saveSession,
  loadRecentSessions,
  deleteSession,
  clearAllSessions,
  type SavedSession,
} from "../session-storage";

describe("session-storage", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns empty array when no sessions saved", () => {
    const sessions = loadRecentSessions();
    expect(sessions).toEqual([]);
  });

  it("saves and loads a session", () => {
    const result = saveSession(
      "AI Ethics",
      [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Idea 1",
              description: "D",
              potentialImpact: "High",
              implementationHint: "Start",
            },
          ],
          reasoning: "R",
        },
      ],
      null
    );

    expect(result).not.toBeNull();
    expect(result!.subject).toBe("AI Ethics");
    expect(result!.ideaCount).toBe(1);
    expect(result!.angleCount).toBe(1);

    const loaded = loadRecentSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].subject).toBe("AI Ethics");
  });

  it("deduplicates sessions by subject", () => {
    saveSession("AI Ethics", [], null);
    saveSession("AI Ethics", [], null);

    const loaded = loadRecentSessions();
    expect(loaded).toHaveLength(1);
  });

  it("limits to 10 sessions", () => {
    for (let i = 0; i < 15; i++) {
      saveSession(`Topic ${i}`, [], null);
    }

    const loaded = loadRecentSessions();
    expect(loaded.length).toBeLessThanOrEqual(10);
  });

  it("newest session appears first", () => {
    saveSession("First", [], null);
    saveSession("Second", [], null);

    const loaded = loadRecentSessions();
    expect(loaded[0].subject).toBe("Second");
  });

  it("deletes a session by id", () => {
    const session = saveSession("To Delete", [], null);
    expect(session).not.toBeNull();

    deleteSession(session!.id);

    const loaded = loadRecentSessions();
    expect(loaded.find((s) => s.id === session!.id)).toBeUndefined();
  });

  it("clears all sessions", () => {
    saveSession("A", [], null);
    saveSession("B", [], null);

    clearAllSessions();

    const loaded = loadRecentSessions();
    expect(loaded).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorageMock.getItem.mockReturnValueOnce("not-json{{{");

    const loaded = loadRecentSessions();
    expect(loaded).toEqual([]);
  });

  it("handles non-array localStorage value gracefully", () => {
    localStorageMock.getItem.mockReturnValueOnce('"string-value"');

    const loaded = loadRecentSessions();
    expect(loaded).toEqual([]);
  });

  it("returns null when localStorage throws on save", () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });

    const result = saveSession("Overflow", [], null);
    expect(result).toBeNull();
  });

  it("tracks hasSynthesis correctly", () => {
    const withSynth = saveSession("With Synth", [], {
      topIdeas: [],
      themes: [],
      recommendation: "Do this",
    });
    expect(withSynth!.hasSynthesis).toBe(true);

    const withoutSynth = saveSession("Without Synth", [], null);
    expect(withoutSynth!.hasSynthesis).toBe(false);
  });
});
