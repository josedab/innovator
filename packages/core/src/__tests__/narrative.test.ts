import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  generateNarrative,
  generateNarrativeBundle,
  narrativeBundleToMarkdown,
  AUDIENCE_PROFILES,
  ARCHETYPE_STRUCTURES,
} from "../narrative/index.js";
import { generateText } from "../copilot/client.js";
import type { InnovationIdea } from "../types.js";

const mockGenerateText = vi.mocked(generateText);

const TEST_IDEA: InnovationIdea = {
  title: "Smart Calendar",
  description: "AI-powered calendar that learns preferences",
  potentialImpact: "Save 5 hours/week per user",
  implementationHint: "ML model trained on user behavior",
};

describe("narrative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AUDIENCE_PROFILES", () => {
    it("should define 8 audience profiles", () => {
      expect(Object.keys(AUDIENCE_PROFILES)).toHaveLength(8);
    });
  });

  describe("ARCHETYPE_STRUCTURES", () => {
    it("should define 7 narrative archetypes", () => {
      expect(Object.keys(ARCHETYPE_STRUCTURES)).toHaveLength(7);
    });

    it("each archetype should have 4 sections", () => {
      for (const sections of Object.values(ARCHETYPE_STRUCTURES)) {
        expect(sections).toHaveLength(4);
      }
    });
  });

  describe("generateNarrative", () => {
    it("should generate a narrative for an idea and audience", async () => {
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          title: "The Future of Time Management",
          content: "In a world where time is our most precious resource...",
          sections: [{ heading: "The Problem", content: "We waste 5 hours/week on scheduling" }],
          keyMessages: ["AI saves time"],
          callToAction: "Sign up for early access",
          estimatedReadTime: "3 min read",
        })
      );

      const narrative = await generateNarrative(TEST_IDEA, "investor", "pitch-deck-script");

      expect(narrative.title).toBe("The Future of Time Management");
      expect(narrative.audience).toBe("investor");
      expect(narrative.format).toBe("pitch-deck-script");
      expect(narrative.keyMessages.length).toBeGreaterThan(0);
    });
  });

  describe("generateNarrativeBundle", () => {
    it("should generate multiple narratives", async () => {
      mockGenerateText.mockResolvedValue(
        JSON.stringify({
          title: "Test Narrative",
          content: "Content here",
          sections: [],
          keyMessages: ["msg1"],
          callToAction: "Act now",
          estimatedReadTime: "2 min read",
        })
      );

      const bundle = await generateNarrativeBundle(TEST_IDEA, undefined, {
        audiences: ["investor", "executive"],
        formats: ["pitch-deck-script"],
      });

      expect(bundle.ideaTitle).toBe("Smart Calendar");
      expect(bundle.narratives.length).toBe(2);
    });
  });

  describe("narrativeBundleToMarkdown", () => {
    it("should produce markdown", () => {
      const md = narrativeBundleToMarkdown({
        ideaTitle: "Test",
        ideaDescription: "Test desc",
        narratives: [
          {
            id: "n1",
            ideaTitle: "Test",
            audience: "investor",
            format: "pitch-deck-script",
            archetype: "vision-reality-gap",
            title: "The Vision",
            content: "Content",
            sections: [],
            keyMessages: ["msg"],
            callToAction: "Invest now",
            estimatedReadTime: "2 min read",
          },
        ],
        generatedAt: new Date().toISOString(),
      });

      expect(md).toContain("Innovation Narrative Bundle");
      expect(md).toContain("The Vision");
    });
  });
});
