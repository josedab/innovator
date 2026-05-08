import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((l: string, c: string) => `[${l}]: ${c}`),
}));

import {
  computeKrippendorffsAlpha,
  computeWeightedConsensus,
  analyzeModelDivergence,
  runJuryScoring,
  synthesizeJuryVerdict,
} from "../consensus/index.js";
import type { JuryScore } from "../consensus/index.js";
import type { LLMProvider } from "../providers/index.js";

// Helper to create a mock LLMProvider
function createMockProvider(id: string, generateFn?: () => Promise<string>): LLMProvider {
  return {
    id,
    name: `Provider ${id}`,
    generateText: generateFn ?? vi.fn(async () => "{}"),
  } as unknown as LLMProvider;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- computeKrippendorffsAlpha ----

describe("computeKrippendorffsAlpha", () => {
  it("returns 1 for perfect agreement", () => {
    const ratings = [
      [5, 8, 3],
      [5, 8, 3],
      [5, 8, 3],
    ];
    expect(computeKrippendorffsAlpha(ratings)).toBe(1);
  });

  it("returns low value for complete disagreement", () => {
    const ratings = [
      [1, 10, 1],
      [10, 1, 10],
    ];
    const alpha = computeKrippendorffsAlpha(ratings);
    expect(alpha).toBeLessThan(0);
  });

  it("returns between 0 and 1 for partial agreement", () => {
    const ratings = [
      [5, 7, 3, 9],
      [6, 7, 4, 8],
      [5, 6, 3, 9],
    ];
    const alpha = computeKrippendorffsAlpha(ratings);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it("returns 1 for a single rater", () => {
    const ratings = [[5, 8, 3]];
    expect(computeKrippendorffsAlpha(ratings)).toBe(1);
  });

  it("returns 1 for empty items", () => {
    const ratings: number[][] = [[], []];
    expect(computeKrippendorffsAlpha(ratings)).toBe(1);
  });

  it("handles NaN values as missing data", () => {
    const ratings = [
      [5, NaN, 3],
      [5, 8, 3],
    ];
    const alpha = computeKrippendorffsAlpha(ratings);
    expect(typeof alpha).toBe("number");
    expect(Number.isFinite(alpha)).toBe(true);
  });
});

// ---- computeWeightedConsensus ----

describe("computeWeightedConsensus", () => {
  it("returns empty array for empty input", () => {
    expect(computeWeightedConsensus([])).toEqual([]);
  });

  it("produces correct verdict for uniform scores", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "Idea A", scores: { novelty: 8, feasibility: 7 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "Idea A", scores: { novelty: 8, feasibility: 7 }, reasoning: "" },
      { modelId: "m3", ideaTitle: "Idea A", scores: { novelty: 8, feasibility: 7 }, reasoning: "" },
    ];
    const verdicts = computeWeightedConsensus(scores);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].ideaTitle).toBe("Idea A");
    expect(verdicts[0].finalScores.novelty).toBe(8);
    expect(verdicts[0].finalScores.feasibility).toBe(7);
    expect(verdicts[0].outlierModels).toHaveLength(0);
    expect(verdicts[0].divergenceNotes).toContain("reasonable agreement");
  });

  it("flags outlier models when one score deviates significantly", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "Idea B", scores: { novelty: 8 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "Idea B", scores: { novelty: 8 }, reasoning: "" },
      { modelId: "m3", ideaTitle: "Idea B", scores: { novelty: 8 }, reasoning: "" },
      { modelId: "m4", ideaTitle: "Idea B", scores: { novelty: 8 }, reasoning: "" },
      { modelId: "m5", ideaTitle: "Idea B", scores: { novelty: 8 }, reasoning: "" },
      { modelId: "m6", ideaTitle: "Idea B", scores: { novelty: 1 }, reasoning: "" },
    ];
    const verdicts = computeWeightedConsensus(scores);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].outlierModels).toContain("m6");
    expect(verdicts[0].divergenceNotes).toContain("scored significantly differently");
  });

  it("handles multiple ideas", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "A", scores: { x: 5 }, reasoning: "" },
      { modelId: "m1", ideaTitle: "B", scores: { x: 9 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "A", scores: { x: 6 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "B", scores: { x: 8 }, reasoning: "" },
    ];
    const verdicts = computeWeightedConsensus(scores);
    expect(verdicts).toHaveLength(2);
    const titles = verdicts.map((v) => v.ideaTitle);
    expect(titles).toContain("A");
    expect(titles).toContain("B");
  });

  it("sets confidence as avgScore / 10 capped at 1", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "C", scores: { dim: 10 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "C", scores: { dim: 10 }, reasoning: "" },
    ];
    const verdicts = computeWeightedConsensus(scores);
    expect(verdicts[0].confidence).toBe(1);
  });
});

// ---- analyzeModelDivergence ----

describe("analyzeModelDivergence", () => {
  it("returns divergence details for high spread (> 3)", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "Idea X", scores: { novelty: 2 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "Idea X", scores: { novelty: 9 }, reasoning: "" },
    ];
    const details = analyzeModelDivergence(scores);
    expect(details).toHaveLength(1);
    expect(details[0].spread).toBe(7);
    expect(details[0].dimension).toBe("novelty");
    expect(details[0].explanation).toContain("m2");
    expect(details[0].explanation).toContain("m1");
  });

  it("returns empty for low spread (<= 3)", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "Idea Y", scores: { novelty: 5 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "Idea Y", scores: { novelty: 7 }, reasoning: "" },
    ];
    const details = analyzeModelDivergence(scores);
    expect(details).toHaveLength(0);
  });

  it("returns empty for single model", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "Idea Z", scores: { novelty: 5 }, reasoning: "" },
    ];
    const details = analyzeModelDivergence(scores);
    expect(details).toHaveLength(0);
  });

  it("sorts by spread descending", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "A", scores: { d1: 1, d2: 3 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "A", scores: { d1: 5, d2: 10 }, reasoning: "" },
    ];
    const details = analyzeModelDivergence(scores);
    expect(details.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < details.length; i++) {
      expect(details[i - 1].spread).toBeGreaterThanOrEqual(details[i].spread);
    }
  });

  it("skips dimensions where scores are 0", () => {
    const scores: JuryScore[] = [
      { modelId: "m1", ideaTitle: "A", scores: { d1: 0 }, reasoning: "" },
      { modelId: "m2", ideaTitle: "A", scores: { d1: 9 }, reasoning: "" },
    ];
    // vals with v > 0 filter means only m2's 9 is counted, so < 2 vals → skipped
    const details = analyzeModelDivergence(scores);
    expect(details).toHaveLength(0);
  });
});

// ---- runJuryScoring ----

describe("runJuryScoring", () => {
  it("returns scores from all providers", async () => {
    const provider1 = createMockProvider("p1", async () =>
      JSON.stringify({ scores: { novelty: 7, feasibility: 8 }, reasoning: "good" })
    );
    const provider2 = createMockProvider("p2", async () =>
      JSON.stringify({ scores: { novelty: 6, feasibility: 9 }, reasoning: "nice" })
    );

    mockExtractJson.mockImplementation((s: string) => s);

    const results = await runJuryScoring({
      ideas: [{ title: "Test Idea", description: "A test" }],
      providers: [{ provider: provider1 }, { provider: provider2 }],
      dimensions: ["novelty", "feasibility"],
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.modelId).sort()).toEqual(["p1", "p2"]);
  });

  it("returns fallback scores on provider error", async () => {
    const failingProvider = createMockProvider("fail", async () => {
      throw new Error("LLM failed");
    });

    const results = await runJuryScoring({
      ideas: [{ title: "Fail Idea", description: "test" }],
      providers: [{ provider: failingProvider }],
      dimensions: ["novelty"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].scores.novelty).toBe(0);
    expect(results[0].reasoning).toContain("Error");
  });

  it("handles multiple ideas across providers", async () => {
    const provider = createMockProvider("p1", async () =>
      JSON.stringify({ scores: { novelty: 5 }, reasoning: "ok" })
    );

    mockExtractJson.mockImplementation((s: string) => s);

    const results = await runJuryScoring({
      ideas: [
        { title: "Idea 1", description: "d1" },
        { title: "Idea 2", description: "d2" },
      ],
      providers: [{ provider }],
      dimensions: ["novelty"],
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.ideaTitle)).toContain("Idea 1");
    expect(results.map((r) => r.ideaTitle)).toContain("Idea 2");
  });
});

// ---- synthesizeJuryVerdict ----

describe("synthesizeJuryVerdict", () => {
  const juryScores: JuryScore[] = [
    { modelId: "m1", ideaTitle: "Idea A", scores: { novelty: 8 }, reasoning: "r1" },
    { modelId: "m2", ideaTitle: "Idea A", scores: { novelty: 7 }, reasoning: "r2" },
  ];

  it("falls back to weighted consensus when no model is provided", async () => {
    const verdicts = await synthesizeJuryVerdict(juryScores);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].ideaTitle).toBe("Idea A");
    expect(verdicts[0].finalScores.novelty).toBeDefined();
  });

  it("uses meta-LLM to synthesize verdict", async () => {
    const metaResult: Array<{
      ideaTitle: string;
      finalScores: Record<string, number>;
      confidence: number;
      outlierModels: string[];
      divergenceNotes: string;
    }> = [
      {
        ideaTitle: "Idea A",
        finalScores: { novelty: 7.5 },
        confidence: 0.9,
        outlierModels: [],
        divergenceNotes: "Models agree.",
      },
    ];

    const metaProvider = createMockProvider("meta", async () => JSON.stringify(metaResult));

    mockExtractJson.mockImplementation((s: string) => s);

    const verdicts = await synthesizeJuryVerdict(juryScores, {
      provider: metaProvider,
      model: "gpt-4",
    });

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].ideaTitle).toBe("Idea A");
    expect(verdicts[0].confidence).toBe(0.9);
  });

  it("falls back to weighted consensus on LLM failure", async () => {
    const failProvider = createMockProvider("fail", async () => {
      throw new Error("LLM failed");
    });

    const verdicts = await synthesizeJuryVerdict(juryScores, { provider: failProvider });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].ideaTitle).toBe("Idea A");
    expect(verdicts[0].finalScores.novelty).toBeDefined();
  });

  it("wraps non-array LLM response into array", async () => {
    const singleVerdict = {
      ideaTitle: "Idea A",
      finalScores: { novelty: 8 },
      confidence: 0.85,
      outlierModels: [],
      divergenceNotes: "ok",
    };

    const metaProvider = createMockProvider("meta", async () => JSON.stringify(singleVerdict));

    mockExtractJson.mockImplementation((s: string) => s);

    const verdicts = await synthesizeJuryVerdict(juryScores, { provider: metaProvider });

    // Non-array result gets wrapped: Array.isArray(parsed) ? parsed : [parsed]
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].confidence).toBe(0.85);
  });
});
