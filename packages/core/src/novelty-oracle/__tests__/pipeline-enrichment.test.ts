import { describe, it, expect, beforeEach } from "vitest";
import {
  enrichSynthesisWithNovelty,
  enrichAngleResultsWithNovelty,
} from "../pipeline-enrichment.js";
import { addPriorArt, clearPriorArt } from "../index.js";
import type { Synthesis, AngleResult } from "../../types.js";

function makeSynthesis(): Synthesis {
  return {
    topIdeas: [
      {
        title: "AI-powered solar panel optimization",
        description: "Use ML to optimize solar panel angles based on weather data",
        sourceAngle: "SCAMPER",
        potentialImpact: "High",
        feasibility: "high",
      },
      {
        title: "DNA-based data storage for drones",
        description: "Store navigation data in synthetic DNA molecules for extreme durability",
        sourceAngle: "Cross-Domain Analogy",
        potentialImpact: "Very High",
        feasibility: "low",
      },
    ],
    themes: ["sustainability", "biotechnology"],
    recommendation: "Focus on AI-powered approaches with sustainability angle",
  };
}

function makeAngleResults(): AngleResult[] {
  return [
    {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Solar ML",
          description: "Machine learning for solar optimization",
          potentialImpact: "High",
          implementationHint: "Use TensorFlow",
        },
        {
          title: "Wind AI",
          description: "AI for wind turbine placement",
          potentialImpact: "Medium",
          implementationHint: "Use PyTorch",
        },
      ],
      reasoning: "Applied SCAMPER framework",
    },
    {
      angleId: "first-principles",
      angleName: "First Principles",
      ideas: [
        {
          title: "Quantum Grid",
          description: "Quantum computing for grid optimization",
          potentialImpact: "Very High",
          implementationHint: "Partner with IBM",
        },
      ],
      reasoning: "Decomposed from fundamentals",
    },
  ];
}

beforeEach(() => {
  clearPriorArt();
});

describe("enrichSynthesisWithNovelty", () => {
  it("adds novelty scores to all top ideas", () => {
    const result = enrichSynthesisWithNovelty(makeSynthesis());
    expect(result.topIdeas).toHaveLength(2);
    for (const idea of result.topIdeas) {
      expect(typeof idea.noveltyScore).toBe("number");
      expect(idea.noveltyScore).toBeGreaterThanOrEqual(0);
      expect(idea.noveltyScore).toBeLessThanOrEqual(100);
      expect(idea.noveltyAssessment).toBeTruthy();
      expect(typeof idea.patentCandidate).toBe("boolean");
      expect(Array.isArray(idea.differentiators)).toBe(true);
    }
  });

  it("returns 100% novelty when no prior art exists", () => {
    const result = enrichSynthesisWithNovelty(makeSynthesis());
    expect(result.noveltyStats.averageNovelty).toBe(100);
    expect(result.noveltyStats.highlyNovel).toBe(2);
  });

  it("detects lower novelty when prior art is seeded", () => {
    addPriorArt([
      {
        id: "pa-1",
        source: "patent",
        title: "AI-powered solar panel optimization system",
        description:
          "Machine learning algorithm that adjusts solar panel angles based on weather data",
        similarity: 0,
        patentNumber: "US10234567",
      },
    ]);
    const result = enrichSynthesisWithNovelty(makeSynthesis());
    // The solar idea should have lower novelty than the DNA idea
    const solarIdea = result.topIdeas.find((i) => i.title.includes("solar"));
    const dnaIdea = result.topIdeas.find((i) => i.title.includes("DNA"));
    expect(solarIdea!.noveltyScore).toBeLessThan(dnaIdea!.noveltyScore);
  });

  it("includes novelty stats summary", () => {
    const result = enrichSynthesisWithNovelty(makeSynthesis());
    expect(result.noveltyStats).toBeDefined();
    expect(typeof result.noveltyStats.averageNovelty).toBe("number");
    expect(typeof result.noveltyStats.highlyNovel).toBe("number");
    expect(typeof result.noveltyStats.patentCandidates).toBe("number");
  });

  it("preserves original synthesis fields", () => {
    const original = makeSynthesis();
    const result = enrichSynthesisWithNovelty(original);
    expect(result.themes).toEqual(original.themes);
    expect(result.recommendation).toBe(original.recommendation);
  });

  it("respects domain option", () => {
    const result = enrichSynthesisWithNovelty(makeSynthesis(), { domain: "renewable-energy" });
    expect(result.topIdeas).toHaveLength(2);
  });

  it("handles empty synthesis", () => {
    const result = enrichSynthesisWithNovelty({
      topIdeas: [],
      themes: [],
      recommendation: "No ideas",
    });
    expect(result.topIdeas).toHaveLength(0);
    expect(result.noveltyStats.averageNovelty).toBe(0);
  });
});

describe("enrichAngleResultsWithNovelty", () => {
  it("adds novelty scores to all angle results", () => {
    const results = enrichAngleResultsWithNovelty(makeAngleResults());
    expect(results).toHaveLength(2);
    expect(results[0].ideaNoveltyScores).toHaveLength(2);
    expect(results[1].ideaNoveltyScores).toHaveLength(1);
    for (const r of results) {
      for (const score of r.ideaNoveltyScores) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("preserves original angle result fields", () => {
    const original = makeAngleResults();
    const results = enrichAngleResultsWithNovelty(original);
    expect(results[0].angleId).toBe("scamper");
    expect(results[0].angleName).toBe("SCAMPER");
    expect(results[0].ideas).toHaveLength(2);
    expect(results[0].reasoning).toBe("Applied SCAMPER framework");
  });
});
