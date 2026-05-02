import { describe, it, expect, vi } from "vitest";

// Mock copilot at the path the temporal module imports from
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  buildTemporalPrompt,
  getHorizonConfig,
  TimeHorizonSchema,
} from "../prompts/temporal/index.js";

describe("temporal", () => {
  it("validates time horizon schema", () => {
    expect(TimeHorizonSchema.parse("near")).toBe("near");
    expect(TimeHorizonSchema.parse("mid")).toBe("mid");
    expect(TimeHorizonSchema.parse("far")).toBe("far");
    expect(() => TimeHorizonSchema.parse("invalid")).toThrow();
  });

  it("returns horizon configs with correct labels", () => {
    const near = getHorizonConfig("near");
    expect(near.label).toBe("Near-Term");
    expect(near.yearRange).toBe("0-1 years");

    const mid = getHorizonConfig("mid");
    expect(mid.label).toBe("Mid-Term");

    const far = getHorizonConfig("far");
    expect(far.label).toBe("Far-Future");
  });

  it("builds temporal prompt with subject and horizon", () => {
    const prompt = buildTemporalPrompt("AI in education", "near");
    expect(prompt).toContain("AI in education");
    expect(prompt).toContain("Near-Term");
    expect(prompt).toContain("0-1 years");
    expect(prompt).toContain("near");
  });

  it("builds temporal prompt with investigation context", () => {
    const investigation = {
      summary: "AI is transforming education",
      keyAspects: [],
      currentState: "Early adoption",
      challenges: ["Cost", "Access"],
      opportunities: ["Personalization"],
    };
    const prompt = buildTemporalPrompt("AI in education", "mid", investigation);
    expect(prompt).toContain("AI is transforming education");
    expect(prompt).toContain("Cost");
  });

  it("respects ideasPerHorizon parameter", () => {
    const prompt = buildTemporalPrompt("AI", "far", undefined, 7);
    expect(prompt).toContain("7");
  });
});
