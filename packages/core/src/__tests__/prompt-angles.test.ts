import { describe, it, expect, vi } from "vitest";

vi.mock("../prompts/investigation.js", () => ({
  investigationContext: vi.fn(
    (subject: string, _inv: unknown) => `SUBJECT: """${subject}"""\n(investigation context)`
  ),
}));

import {
  buildScamperPrompt,
  buildFirstPrinciplesPrompt,
  buildCrossDomainPrompt,
  buildConstraintsPrompt,
  buildInversionPrompt,
  buildPerspectivesPrompt,
  buildWhatIfPrompt,
  buildTrendCollisionPrompt,
} from "../prompts/angles/index.js";
import type { Investigation } from "../types.js";

const fakeInvestigation: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect", description: "Description" }],
  currentState: "Current state",
  challenges: ["Challenge 1"],
  opportunities: ["Opportunity 1"],
};

const builders = [
  { name: "buildScamperPrompt", fn: buildScamperPrompt, angleId: "scamper", keyword: "SCAMPER" },
  {
    name: "buildFirstPrinciplesPrompt",
    fn: buildFirstPrinciplesPrompt,
    angleId: "first-principles",
    keyword: "First Principles",
  },
  {
    name: "buildCrossDomainPrompt",
    fn: buildCrossDomainPrompt,
    angleId: "cross-domain",
    keyword: "Cross-Domain",
  },
  {
    name: "buildConstraintsPrompt",
    fn: buildConstraintsPrompt,
    angleId: "constraints",
    keyword: "Constraint",
  },
  {
    name: "buildInversionPrompt",
    fn: buildInversionPrompt,
    angleId: "inversion",
    keyword: "Inversion",
  },
  {
    name: "buildPerspectivesPrompt",
    fn: buildPerspectivesPrompt,
    angleId: "perspectives",
    keyword: "Perspectives",
  },
  { name: "buildWhatIfPrompt", fn: buildWhatIfPrompt, angleId: "what-if", keyword: "What" },
  {
    name: "buildTrendCollisionPrompt",
    fn: buildTrendCollisionPrompt,
    angleId: "trend-collision",
    keyword: "Trend Collision",
  },
];

describe("prompts/angles", () => {
  for (const { name, fn, angleId, keyword } of builders) {
    describe(name, () => {
      it("returns string containing the subject", () => {
        const result = fn("Solar energy", fakeInvestigation);
        expect(result).toContain("Solar energy");
      });

      it("includes JSON output format instructions", () => {
        const result = fn("test subject", fakeInvestigation);
        expect(result).toContain("JSON");
        expect(result).toContain("angleId");
        expect(result).toContain("ideas");
      });

      it(`includes angle-specific keyword "${keyword}"`, () => {
        const result = fn("test", fakeInvestigation);
        expect(result).toContain(keyword);
      });

      it(`references angleId "${angleId}"`, () => {
        const result = fn("test", fakeInvestigation);
        expect(result).toContain(angleId);
      });

      it("includes investigation context", () => {
        const result = fn("AI tools", fakeInvestigation);
        expect(result).toContain("AI tools");
      });

      it("handles empty subject", () => {
        const result = fn("", fakeInvestigation);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      });

      it("handles very long subject", () => {
        const longSubject = "x".repeat(6000);
        const result = fn(longSubject, fakeInvestigation);
        expect(result).toContain(longSubject);
      });

      it("handles special characters in subject", () => {
        const result = fn('Test <script>alert("xss")</script>', fakeInvestigation);
        expect(typeof result).toBe("string");
      });
    });
  }

  describe("buildConstraintsPrompt", () => {
    it("includes constraint-specific framing", () => {
      const result = buildConstraintsPrompt("test", fakeInvestigation);
      expect(result).toContain("$0");
      expect(result).toContain("offline");
      expect(result).toContain("10-year-old");
      expect(result).toContain("24 hours");
    });
  });
});
