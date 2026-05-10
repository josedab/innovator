import { beforeEach, describe, expect, it, vi } from "vitest";

const MOCK_RECIPE = {
  productAnalysis: {
    productName: "TestProduct",
    category: "SaaS",
    coreProblem: "Testing",
    targetAudience: "Developers",
    keyInnovations: ["Innovation1"],
    competitiveAdvantage: "Speed",
    marketContext: "Growing",
    disruptionType: "incremental",
  },
  patterns: [
    {
      name: "Pattern1",
      description: "Desc",
      angle: "scamper",
      confidence: 0.9,
      evidence: ["Evidence1"],
    },
  ],
  recipe: {
    title: "Recipe: TestProduct",
    summary: "Summary",
    steps: [
      {
        order: 1,
        prompt: "Think about...",
        expectedInsight: "Insight",
        technique: "Technique1",
        rationale: "Why",
      },
    ],
    suggestedAngles: ["scamper"],
    estimatedDifficulty: "moderate",
    keyInsight: "Key insight",
  },
  learnings: [
    {
      principle: "Principle1",
      application: "Apply it",
      transferability: "high",
    },
  ],
  similarProducts: [
    {
      name: "Similar1",
      similarity: "Both SaaS",
      divergence: "Different market",
    },
  ],
  generatedAt: new Date().toISOString(),
} satisfies import("../inverse-decoder/index.js").InnovationRecipe;

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => raw),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  analyzeProduct,
  getRecipe,
  listRecipes,
  clearRecipes,
  recipeToMarkdown,
} from "../inverse-decoder/index.js";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

describe("inverse-decoder", () => {
  beforeEach(() => {
    clearRecipes();
    vi.clearAllMocks();
    vi.mocked(generateText).mockResolvedValue(JSON.stringify(MOCK_RECIPE));
    vi.mocked(extractJson).mockImplementation((raw: string) => raw);
    vi.mocked(withRetry).mockImplementation(((fn: () => Promise<unknown>) =>
      fn()) as typeof withRetry);
  });

  describe("analyzeProduct", () => {
    it("analyzes a valid product description and stores the generated recipe", async () => {
      const signal = new AbortController().signal;

      const recipe = await analyzeProduct("Developer collaboration platform", {
        model: "gpt-4o-mini",
        signal,
      });

      expect(recipe).toEqual(MOCK_RECIPE);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-mini", signal })
      );
      expect(listRecipes()).toHaveLength(1);
      expect(listRecipes()[0]).toEqual(
        expect.objectContaining({
          productName: "TestProduct",
          generatedAt: MOCK_RECIPE.generatedAt,
        })
      );
      expect(getRecipe(listRecipes()[0].id)).toEqual(MOCK_RECIPE);
      expect(withRetry).toHaveBeenCalledTimes(1);
    });

    it("accepts descriptions at the 5000 character boundary", async () => {
      const description = "a".repeat(5000);

      await expect(analyzeProduct(description)).resolves.toEqual(MOCK_RECIPE);
    });

    it("throws when the description is empty", async () => {
      await expect(analyzeProduct("   ")).rejects.toThrow("Product description is required");
    });

    it("throws when the description exceeds 5000 characters", async () => {
      await expect(analyzeProduct("a".repeat(5001))).rejects.toThrow(
        "Product description must be under 5000 characters"
      );
    });

    it("throws when the LLM response cannot be parsed as JSON", async () => {
      vi.mocked(generateText).mockResolvedValueOnce("not-json");

      await expect(analyzeProduct("Developer collaboration platform")).rejects.toThrow(
        "Failed to parse recipe response as JSON"
      );
    });
  });

  describe("recipe store helpers", () => {
    it("returns undefined for unknown recipe ids", () => {
      expect(getRecipe("missing")).toBeUndefined();
      expect(listRecipes()).toEqual([]);
    });

    it("clears all stored recipes", async () => {
      await analyzeProduct("Developer collaboration platform");
      await analyzeProduct("Another product");
      expect(listRecipes()).toHaveLength(2);

      clearRecipes();

      expect(listRecipes()).toEqual([]);
    });
  });

  describe("recipeToMarkdown", () => {
    it("renders all major sections and recipe content", () => {
      const markdown = recipeToMarkdown(MOCK_RECIPE);

      expect(markdown).toContain("# Recipe: TestProduct");
      expect(markdown).toContain("## Product Analysis");
      expect(markdown).toContain("### Key Innovations");
      expect(markdown).toContain("## Innovation Patterns Detected");
      expect(markdown).toContain("### Pattern1 (scamper, confidence: 90%)");
      expect(markdown).toContain("**Evidence:**");
      expect(markdown).toContain("## Innovation Recipe");
      expect(markdown).toContain("**Step 1: Technique1**");
      expect(markdown).toContain("## Transferable Learnings");
      expect(markdown).toContain("### Principle1 (transferability: high)");
      expect(markdown).toContain("## Similar Products");
      expect(markdown).toContain("**Similar1**: Both SaaS | Diverges: Different market");
    });

    it("omits the similar products section when none are present", () => {
      const markdown = recipeToMarkdown({
        ...MOCK_RECIPE,
        similarProducts: [],
      });

      expect(markdown).not.toContain("## Similar Products");
    });
  });
});
