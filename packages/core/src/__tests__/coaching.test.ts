import { describe, it, expect, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  CoachPersonalitySchema,
  CoachQuestionSchema,
  AssumptionSchema,
  CoachInterventionSchema,
} from "../coaching/index.js";

describe("coaching", () => {
  it("validates personality schema", () => {
    expect(CoachPersonalitySchema.parse("socratic")).toBe("socratic");
    expect(CoachPersonalitySchema.parse("provocateur")).toBe("provocateur");
    expect(CoachPersonalitySchema.parse("supportive")).toBe("supportive");
    expect(CoachPersonalitySchema.parse("analytical")).toBe("analytical");
    expect(() => CoachPersonalitySchema.parse("invalid")).toThrow();
  });

  it("validates coach question schema", () => {
    const valid = {
      question: "What problem does this actually solve?",
      intent: "Clarify the core value proposition",
      category: "clarification",
    };
    expect(() => CoachQuestionSchema.parse(valid)).not.toThrow();
  });

  it("validates assumption schema", () => {
    const valid = {
      assumption: "Users want this feature",
      risk: "high",
      challenge: "What evidence do you have for user demand?",
    };
    expect(() => AssumptionSchema.parse(valid)).not.toThrow();
  });

  it("validates full intervention schema", () => {
    const valid = {
      questions: [{ question: "Q1?", intent: "Clarify", category: "clarification" as const }],
      assumptions: [{ assumption: "A1", risk: "medium" as const, challenge: "C1?" }],
      pivots: [
        {
          currentDirection: "Current",
          suggestedPivot: "Alternative",
          rationale: "Because...",
          confidence: 0.7,
        },
      ],
      summary: "Brief summary",
    };
    expect(() => CoachInterventionSchema.parse(valid)).not.toThrow();
  });

  it("rejects invalid category in question", () => {
    const invalid = {
      question: "Q?",
      intent: "I",
      category: "invalid-category",
    };
    expect(() => CoachQuestionSchema.parse(invalid)).toThrow();
  });
});
