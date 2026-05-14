import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { computeGenomeSimilarity } from "../genome-sequencer/sequencer.js";
import type { IdeaGenome, GenomeTrait } from "../genome-sequencer/types.js";

function makeTrait(type: GenomeTrait["type"], value: string, keywords: string[]): GenomeTrait {
  return { type, value, confidence: 0.8, keywords };
}

function makeGenome(id: string, title: string, traits: GenomeTrait[]): IdeaGenome {
  return {
    id,
    ideaTitle: title,
    ideaDescription: "Test description",
    traits,
    sequencedAt: new Date().toISOString(),
  };
}

describe("genome-sequencer", () => {
  describe("computeGenomeSimilarity", () => {
    it("returns 1.0 for identical genomes", () => {
      const traits = [
        makeTrait("problem-space", "climate change", ["climate", "carbon", "emissions"]),
        makeTrait("solution-mechanism", "carbon capture", ["capture", "sequestration"]),
      ];
      const a = makeGenome("a", "Idea A", traits);
      const b = makeGenome("b", "Idea B", traits);

      const sim = computeGenomeSimilarity(a, b);
      expect(sim.overallSimilarity).toBe(1);
    });

    it("returns 0 for completely different genomes", () => {
      const a = makeGenome("a", "Idea A", [
        makeTrait("problem-space", "climate change", ["climate", "carbon"]),
      ]);
      const b = makeGenome("b", "Idea B", [
        makeTrait("problem-space", "social media", ["social", "media"]),
      ]);

      const sim = computeGenomeSimilarity(a, b);
      expect(sim.overallSimilarity).toBe(0);
    });

    it("returns partial similarity for overlapping keywords", () => {
      const a = makeGenome("a", "Idea A", [
        makeTrait("problem-space", "renewable energy", ["energy", "solar", "renewable"]),
        makeTrait("target-audience", "utilities", ["utilities", "power"]),
      ]);
      const b = makeGenome("b", "Idea B", [
        makeTrait("problem-space", "energy storage", ["energy", "battery", "storage"]),
        makeTrait("target-audience", "grid operators", ["utilities", "grid"]),
      ]);

      const sim = computeGenomeSimilarity(a, b);
      expect(sim.overallSimilarity).toBeGreaterThan(0);
      expect(sim.overallSimilarity).toBeLessThan(1);
      expect(sim.traitSimilarities.length).toBe(2);
    });

    it("handles genomes with different trait sets", () => {
      const a = makeGenome("a", "Idea A", [
        makeTrait("problem-space", "logistics", ["logistics", "shipping"]),
      ]);
      const b = makeGenome("b", "Idea B", [
        makeTrait("solution-mechanism", "AI routing", ["ai", "routing"]),
      ]);

      const sim = computeGenomeSimilarity(a, b);
      // No overlapping trait types → 0 similarity
      expect(sim.overallSimilarity).toBe(0);
      expect(sim.traitSimilarities).toHaveLength(0);
    });

    it("handles empty keyword fallback to word overlap", () => {
      const a = makeGenome("a", "Idea A", [
        makeTrait("problem-space", "machine learning for healthcare", []),
      ]);
      const b = makeGenome("b", "Idea B", [
        makeTrait("problem-space", "machine learning for education", []),
      ]);

      const sim = computeGenomeSimilarity(a, b);
      // "machine" and "learning" and "for" overlap
      expect(sim.overallSimilarity).toBeGreaterThan(0);
    });
  });
});
