import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => raw),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((label: string, text: string) => `[${label}] ${text}`),
  sanitizeLlmOutput: vi.fn((text: string) => text),
}));

import {
  createCoachingSession,
  getCoachingSession,
  addCoachMessage,
  detectBlindSpots,
  suggestNextAngles,
  getBuiltInLearningPaths,
  clearCoachingSessions,
  LearningPathSchema,
} from "../coaching/index.js";

describe("coaching enhancements", () => {
  beforeEach(() => {
    clearCoachingSessions();
  });

  it("creates and retrieves a coaching session with initial guidance", () => {
    const session = createCoachingSession("AI copilots for customer support");

    expect(getCoachingSession(session.id)).toEqual(session);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toMatchObject({ role: "coach", type: "question" });
    expect(session.blindSpots.length).toBeGreaterThan(0);
    expect(session.suggestedAngles.length).toBe(3);
  });

  it("adds messages and refreshes blind spots based on discussed angles", () => {
    const session = createCoachingSession("Go-to-market strategy");
    const updated = addCoachMessage(
      session.id,
      "user",
      "We already explored inversion and what-if in earlier workshops.",
      "insight"
    );

    expect(updated?.messages.at(-1)).toMatchObject({ role: "user", type: "insight" });
    expect(updated?.blindSpots).not.toContain("inversion");
    expect(updated?.suggestedAngles).not.toContain("inversion");
  });

  it("detects blind spots, suggests next angles, and exposes built-in learning paths", () => {
    expect(detectBlindSpots(["scamper"], ["scamper", "constraints", "what-if"])).toEqual([
      "constraints",
      "what-if",
    ]);
    expect(
      suggestNextAngles(["scamper"], ["scamper", "constraints", "what-if", "inversion"])
    ).toEqual(["constraints", "what-if", "inversion"]);

    const paths = getBuiltInLearningPaths();
    expect(paths.length).toBeGreaterThanOrEqual(3);
    for (const path of paths) {
      expect(() => LearningPathSchema.parse(path)).not.toThrow();
    }
  });
});
