import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateText, mockExtractJson } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockExtractJson: vi.fn(),
}));

const { mockWithRetry } = vi.hoisted(() => ({
  mockWithRetry: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: mockGenerateText,
  extractJson: mockExtractJson,
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: mockWithRetry,
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: (s: string) => s,
  wrapUserInput: (_label: string, s: string) => s,
}));

import {
  generateAnglePairs,
  buildMorphologicalMatrix,
  runCombinatorialSynthesis,
  combinatorialToMarkdown,
} from "./engine.js";
import type { AngleResult } from "../types.js";

function makeAngleResult(angleId: string): AngleResult {
  return {
    angleId,
    angleName: `${angleId} Angle`,
    ideas: [
      {
        title: `${angleId} idea`,
        description: `Description for ${angleId}`,
        potentialImpact: "High",
        implementationHint: "Start here",
      },
    ],
    reasoning: `Applied ${angleId}`,
  };
}

describe("generateAnglePairs", () => {
  it("3 angles produces 3 pairs", () => {
    const results = [
      makeAngleResult("scamper"),
      makeAngleResult("inversion"),
      makeAngleResult("what-if"),
    ];
    const pairs = generateAnglePairs(results);
    expect(pairs).toHaveLength(3);
  });

  it("1 angle produces 0 pairs", () => {
    const pairs = generateAnglePairs([makeAngleResult("scamper")]);
    expect(pairs).toHaveLength(0);
  });

  it("0 angles produces empty array", () => {
    const pairs = generateAnglePairs([]);
    expect(pairs).toHaveLength(0);
  });

  it("no duplicate or reverse pairs", () => {
    const results = [
      makeAngleResult("a"),
      makeAngleResult("b"),
      makeAngleResult("c"),
      makeAngleResult("d"),
    ];
    const pairs = generateAnglePairs(results);
    // 4 choose 2 = 6
    expect(pairs).toHaveLength(6);

    // No duplicates
    const pairStrings = pairs.map((p) => `${p.angleA}-${p.angleB}`);
    expect(new Set(pairStrings).size).toBe(6);

    // No reverse pairs
    for (const pair of pairs) {
      const reverse = pairs.find((p) => p.angleA === pair.angleB && p.angleB === pair.angleA);
      expect(reverse).toBeUndefined();
    }
  });

  it("2 angles produces 1 pair", () => {
    const pairs = generateAnglePairs([makeAngleResult("a"), makeAngleResult("b")]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].angleA).toBe("a");
    expect(pairs[0].angleB).toBe("b");
  });
});

describe("buildMorphologicalMatrix", () => {
  it("maps results to 5 dimensions", () => {
    const results = [makeAngleResult("scamper"), makeAngleResult("inversion")];
    const matrix = buildMorphologicalMatrix(results);
    expect(matrix).toHaveLength(2);

    const validDimensions = [
      "problem-space",
      "solution-approach",
      "target-user",
      "technology",
      "business-model",
    ];
    for (const cell of matrix) {
      expect(validDimensions).toContain(cell.dimension);
      expect(cell.angleId).toBeDefined();
      expect(Array.isArray(cell.values)).toBe(true);
    }
  });

  it("handles empty ideas array", () => {
    const results = [
      {
        angleId: "scamper",
        angleName: "SCAMPER",
        ideas: [],
        reasoning: "empty",
      },
    ];
    const matrix = buildMorphologicalMatrix(results);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].values).toHaveLength(0);
  });
});

describe("runCombinatorialSynthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(async (fn: () => Promise<string>) => fn());
    mockGenerateText.mockResolvedValue("json");
  });

  it("with mocked LLM returns valid pairwise results", async () => {
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        ideas: [
          {
            title: "Combined Idea",
            description: "A combined idea",
            potentialImpact: "High",
            implementationHint: "Combine approaches",
            synergyScore: 80,
            noveltyBoost: 60,
            emergentProperties: ["cross-pollination"],
          },
        ],
        synergyRating: 75,
        reasoning: "These angles complement each other",
      })
    );

    const results = [makeAngleResult("scamper"), makeAngleResult("inversion")];
    const result = await runCombinatorialSynthesis("AI", results, undefined, {
      includeHigherOrder: false,
    });

    expect(result.subject).toBe("AI");
    expect(result.pairwiseResults).toHaveLength(1);
    expect(result.pairwiseResults[0].ideas).toHaveLength(1);
    expect(result.pairwiseResults[0].ideas[0].title).toBe("Combined Idea");
    expect(result.totalCombinationsExplored).toBe(1);
  });

  it("minSynergyThreshold filters correctly", async () => {
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        ideas: [
          {
            title: "Low Synergy",
            description: "desc",
            potentialImpact: "low",
            implementationHint: "hint",
            synergyScore: 10,
            noveltyBoost: 5,
            emergentProperties: [],
          },
        ],
        synergyRating: 10,
        reasoning: "Weak combination",
      })
    );

    const results = [makeAngleResult("a"), makeAngleResult("b")];
    const result = await runCombinatorialSynthesis("Test", results, undefined, {
      minSynergyThreshold: 50,
      includeHigherOrder: false,
    });

    // All ideas below threshold, topCombinations should be empty
    expect(result.topCombinations).toHaveLength(0);
  });

  it("returns top 10 maximum", async () => {
    const ideas = Array.from({ length: 15 }, (_, i) => ({
      title: `Idea ${i}`,
      description: "desc",
      potentialImpact: "high",
      implementationHint: "hint",
      synergyScore: 50 + i,
      noveltyBoost: 30,
      emergentProperties: [],
    }));

    mockExtractJson.mockReturnValue(
      JSON.stringify({ ideas, synergyRating: 80, reasoning: "good" })
    );

    const results = [makeAngleResult("a"), makeAngleResult("b")];
    const result = await runCombinatorialSynthesis("Test", results, undefined, {
      includeHigherOrder: false,
    });

    expect(result.topCombinations.length).toBeLessThanOrEqual(10);
  });

  it("throws for less than 2 angle results", async () => {
    await expect(runCombinatorialSynthesis("Test", [makeAngleResult("a")])).rejects.toThrow(
      "Need at least 2 angle results"
    );
  });

  it("progress callback receives stage updates", async () => {
    mockExtractJson.mockReturnValue(
      JSON.stringify({
        ideas: [
          {
            title: "Idea",
            description: "d",
            potentialImpact: "h",
            implementationHint: "i",
            synergyScore: 50,
            noveltyBoost: 50,
            emergentProperties: [],
          },
        ],
        synergyRating: 50,
        reasoning: "ok",
      })
    );

    const stages: string[] = [];
    const results = [makeAngleResult("a"), makeAngleResult("b")];
    await runCombinatorialSynthesis("Test", results, (p) => stages.push(p.stage), {
      includeHigherOrder: false,
    });

    expect(stages).toContain("pairing");
    expect(stages).toContain("combining");
    expect(stages).toContain("ranking");
    expect(stages).toContain("complete");
  });
});

describe("combinatorialToMarkdown", () => {
  it("includes all sections", () => {
    const result = {
      subject: "AI Innovation",
      pairwiseResults: [
        {
          pair: { angleA: "scamper", angleB: "inversion" },
          ideas: [
            {
              id: "1",
              title: "Combined Idea",
              description: "desc",
              potentialImpact: "high",
              implementationHint: "hint",
              sourceAngles: ["scamper", "inversion"],
              synergyScore: 80,
              noveltyBoost: 60,
              emergentProperties: ["cross-domain"],
            },
          ],
          synergyRating: 75,
          reasoning: "Good combo",
        },
      ],
      higherOrderIdeas: [
        {
          id: "2",
          title: "Meta Idea",
          description: "A meta-innovation combining multiple angles for maximum impact",
          potentialImpact: "very high",
          implementationHint: "start big",
          sourceAngles: ["scamper", "inversion", "what-if"],
          synergyScore: 90,
          noveltyBoost: 80,
          emergentProperties: [],
        },
      ],
      morphologicalMatrix: [],
      topCombinations: [
        {
          id: "1",
          title: "Combined Idea",
          description: "desc",
          potentialImpact: "high",
          implementationHint: "hint",
          sourceAngles: ["scamper", "inversion"],
          synergyScore: 80,
          noveltyBoost: 60,
          emergentProperties: ["cross-domain"],
        },
      ],
      totalCombinationsExplored: 3,
      coveragePercentage: 100,
      createdAt: "2024-01-01T00:00:00Z",
    };

    const md = combinatorialToMarkdown(result as any);
    expect(md).toContain("# Combinatorial Synthesis: AI Innovation");
    expect(md).toContain("**Pairs explored:** 3");
    expect(md).toContain("**Coverage:** 100%");
    expect(md).toContain("## Top Combinations");
    expect(md).toContain("Combined Idea");
    expect(md).toContain("**Emergent:** cross-domain");
    expect(md).toContain("## Higher-Order Innovations");
    expect(md).toContain("Meta Idea");
  });

  it("handles empty arrays", () => {
    const result = {
      subject: "Test",
      pairwiseResults: [],
      higherOrderIdeas: [],
      morphologicalMatrix: [],
      topCombinations: [],
      totalCombinationsExplored: 0,
      coveragePercentage: 0,
      createdAt: "2024-01-01T00:00:00Z",
    };

    const md = combinatorialToMarkdown(result as any);
    expect(md).toContain("# Combinatorial Synthesis: Test");
    expect(md).toContain("**Pairs explored:** 0");
    expect(md).not.toContain("## Higher-Order Innovations");
  });
});
