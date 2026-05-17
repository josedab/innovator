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
      expect(sim.genomeA).toBe("a");
      expect(sim.genomeB).toBe("b");
      expect(sim.traitSimilarities).toHaveLength(2);
      expect(sim.traitSimilarities).toEqual([
        { trait: "problem-space", similarity: 1 },
        { trait: "solution-mechanism", similarity: 1 },
      ]);
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
      expect(sim.traitSimilarities).toHaveLength(1);
      expect(sim.traitSimilarities[0]).toEqual({ trait: "problem-space", similarity: 0 });
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
      expect(sim.traitSimilarities).toHaveLength(2);

      // problem-space: "energy" overlaps → Jaccard = 1 / (solar, renewable, energy, battery, storage) = 1/5
      const psSim = sim.traitSimilarities.find((t) => t.trait === "problem-space");
      expect(psSim).toBeDefined();
      expect(psSim!.similarity).toBeCloseTo(0.2, 1);

      // target-audience: "utilities" overlaps → Jaccard = 1 / (utilities, power, grid) = 1/3
      const taSim = sim.traitSimilarities.find((t) => t.trait === "target-audience");
      expect(taSim).toBeDefined();
      expect(taSim!.similarity).toBeCloseTo(0.33, 1);
    });

    it("handles genomes with different trait sets (no overlap)", () => {
      const a = makeGenome("a", "Idea A", [
        makeTrait("problem-space", "logistics", ["logistics", "shipping"]),
      ]);
      const b = makeGenome("b", "Idea B", [
        makeTrait("solution-mechanism", "AI routing", ["ai", "routing"]),
      ]);

      const sim = computeGenomeSimilarity(a, b);
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
      // Words: {machine, learning, for, healthcare} vs {machine, learning, for, education}
      // Intersection: {machine, learning, for} = 3, Union = 5 → 3/5 = 0.6
      expect(sim.overallSimilarity).toBeCloseTo(0.6, 1);
      expect(sim.traitSimilarities).toHaveLength(1);
      expect(sim.traitSimilarities[0].trait).toBe("problem-space");
    });

    it("handles empty genomes (no traits)", () => {
      const a = makeGenome("empty-a", "Empty A", []);
      const b = makeGenome("empty-b", "Empty B", []);

      const sim = computeGenomeSimilarity(a, b);
      expect(sim.overallSimilarity).toBe(0);
      expect(sim.traitSimilarities).toHaveLength(0);
      expect(sim.genomeA).toBe("empty-a");
      expect(sim.genomeB).toBe("empty-b");
    });

    it("handles single-trait genomes", () => {
      const a = makeGenome("single-a", "Single A", [
        makeTrait("enabling-technology", "blockchain", ["blockchain", "distributed", "ledger"]),
      ]);
      const b = makeGenome("single-b", "Single B", [
        makeTrait("enabling-technology", "blockchain tech", ["blockchain", "crypto", "ledger"]),
      ]);

      const sim = computeGenomeSimilarity(a, b);
      // Jaccard: {blockchain, ledger} overlap → 2 / {blockchain, distributed, ledger, crypto} = 2/4 = 0.5
      expect(sim.overallSimilarity).toBe(0.5);
      expect(sim.traitSimilarities).toHaveLength(1);
      expect(sim.traitSimilarities[0]).toEqual({
        trait: "enabling-technology",
        similarity: 0.5,
      });
    });

    it("handles genome with all 7 trait types", () => {
      const allTraits = (kw: string[]): GenomeTrait[] => [
        makeTrait("problem-space", "p", kw),
        makeTrait("solution-mechanism", "s", kw),
        makeTrait("value-proposition", "v", kw),
        makeTrait("target-audience", "t", kw),
        makeTrait("enabling-technology", "e", kw),
        makeTrait("risk-profile", "r", kw),
        makeTrait("competitive-differentiation", "c", kw),
      ];

      const a = makeGenome("full-a", "Full A", allTraits(["alpha", "beta"]));
      const b = makeGenome("full-b", "Full B", allTraits(["alpha", "beta"]));

      const sim = computeGenomeSimilarity(a, b);
      expect(sim.overallSimilarity).toBe(1);
      expect(sim.traitSimilarities).toHaveLength(7);
      sim.traitSimilarities.forEach((ts) => expect(ts.similarity).toBe(1));
    });

    it("is case-insensitive for keyword comparison", () => {
      const a = makeGenome("case-a", "Case A", [
        makeTrait("problem-space", "AI", ["Machine", "Learning"]),
      ]);
      const b = makeGenome("case-b", "Case B", [
        makeTrait("problem-space", "ai", ["machine", "learning"]),
      ]);

      const sim = computeGenomeSimilarity(a, b);
      expect(sim.overallSimilarity).toBe(1);
    });
  });
});
