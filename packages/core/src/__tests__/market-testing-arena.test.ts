import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { generateText, extractJson } from "../copilot/client.js";
import {
  generatePersonas,
  runMarketTest,
  clearMarketTests,
  listMarketTests,
  getMarketTest,
  marketTestToMarkdown,
  ConsumerPersonaSchema,
  MarketTestResultSchema,
} from "../market-testing-arena/index.js";
import type { InnovationIdea } from "../types.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

const mockIdea: InnovationIdea = {
  title: "AI-Powered Code Review",
  description: "Automated code review using LLMs",
  potentialImpact: "Reduces review time by 50%",
  implementationHint: "Use GPT-4 API with AST parsing",
};

const mockAssessment = {
  appealScore: 0.7,
  suggestedPriceUsd: 29,
  topInsights: ["Growing market", "Strong demand"],
  segmentFit: {},
};

describe("market-testing-arena", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMarketTests();
  });

  // ---- generatePersonas ----

  describe("generatePersonas", () => {
    it("generates default 1000 personas", () => {
      const personas = generatePersonas();
      expect(personas).toHaveLength(1000);
    });

    it("clamps count to minimum 10", () => {
      const personas = generatePersonas(1);
      expect(personas).toHaveLength(10);
    });

    it("clamps count to maximum 10000", () => {
      const personas = generatePersonas(50000);
      expect(personas).toHaveLength(10000);
    });

    it("distributes adoption types (innovator ~3%, early-adopter ~13%)", () => {
      const personas = generatePersonas(10000);
      const innovators = personas.filter((p) => p.adoptionType === "innovator").length;
      const earlyAdopters = personas.filter((p) => p.adoptionType === "early-adopter").length;
      const laggards = personas.filter((p) => p.adoptionType === "laggard").length;

      // With 10000 personas, innovators should be ~300 (3%)
      expect(innovators).toBeGreaterThan(100);
      expect(innovators).toBeLessThan(600);
      expect(earlyAdopters).toBeGreaterThan(500);
      expect(laggards).toBeGreaterThan(500);
    });

    it("uses custom segments when provided", () => {
      const personas = generatePersonas(20, ["custom-segment"]);
      expect(personas.every((p) => p.segment === "custom-segment")).toBe(true);
    });

    it("validates persona schema", () => {
      const personas = generatePersonas(10);
      for (const p of personas) {
        expect(() => ConsumerPersonaSchema.parse(p)).not.toThrow();
      }
    });
  });

  // ---- runMarketTest ----

  describe("runMarketTest", () => {
    it("throws for empty idea title", async () => {
      await expect(
        runMarketTest({ ...mockIdea, title: "" })
      ).rejects.toThrow("Idea title is required");
    });

    it("throws for whitespace-only title", async () => {
      await expect(
        runMarketTest({ ...mockIdea, title: "   " })
      ).rejects.toThrow("Idea title is required");
    });

    it("runs full pipeline with mocked LLM", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));

      const result = await runMarketTest(mockIdea, { personaCount: 100 });

      expect(result.ideaTitle).toBe("AI-Powered Code Review");
      expect(result.totalPersonas).toBe(100);
      expect(result.overallAdoptionRate).toBeGreaterThanOrEqual(0);
      expect(result.overallAdoptionRate).toBeLessThanOrEqual(1);
      expect(result.segmentAnalysis.length).toBeGreaterThan(0);
      expect(result.pricingSensitivity.length).toBeGreaterThan(0);
      expect(result.topInsights).toEqual(["Growing market", "Strong demand"]);
    });

    it("uses defaults when assessment fields missing", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({}));

      const result = await runMarketTest(mockIdea, { personaCount: 10 });
      // appealScore defaults to 0.5, price defaults to 29
      expect(result.totalPersonas).toBe(10);
    });

    it("classifies viability based on adoption thresholds", async () => {
      // High appeal should lead to higher adoption
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(
        JSON.stringify({ ...mockAssessment, appealScore: 0.95 })
      );

      const result = await runMarketTest(mockIdea, { personaCount: 1000 });
      expect(["high", "moderate", "low", "not-viable"]).toContain(result.marketViability);
    });

    it("caps confidence at 0.95", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));

      const result = await runMarketTest(mockIdea, { personaCount: 10000 });
      expect(result.confidenceLevel).toBeLessThanOrEqual(0.95);
    });

    it("uses custom basePrice", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));

      const result = await runMarketTest(mockIdea, { personaCount: 10, basePrice: 99 });
      // Pricing sensitivity should be based on 99
      expect(result.pricingSensitivity[0].priceUsd).toBeCloseTo(49.5, 0);
    });

    it("stores result and retrieves by ID", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));

      await runMarketTest(mockIdea, { personaCount: 10 });
      const list = listMarketTests();
      expect(list).toHaveLength(1);
      expect(list[0].ideaTitle).toBe("AI-Powered Code Review");

      const stored = getMarketTest(list[0].id);
      expect(stored).toBeDefined();
      expect(stored!.ideaTitle).toBe("AI-Powered Code Review");
    });

    it("includes investigation context when provided", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));

      const result = await runMarketTest(
        mockIdea,
        { personaCount: 10 },
        { investigation: { summary: "Strong market signals", keyAspects: [], currentState: "", challenges: [], opportunities: [] } }
      );
      expect(result.ideaTitle).toBe("AI-Powered Code Review");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("segment recommendation reflects adoption rate thresholds", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify({ ...mockAssessment, appealScore: 0.9 }));

      const result = await runMarketTest(mockIdea, { personaCount: 500 });
      for (const seg of result.segmentAnalysis) {
        if (seg.adoptionRate > 0.5) {
          expect(seg.recommendation).toBe("Strong target segment");
        } else if (seg.adoptionRate > 0.3) {
          expect(seg.recommendation).toContain("Moderate potential");
        } else {
          expect(seg.recommendation).toContain("Low fit");
        }
      }
    });
  });

  // ---- marketTestToMarkdown ----

  describe("marketTestToMarkdown", () => {
    it("formats result as markdown", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));

      const result = await runMarketTest(mockIdea, { personaCount: 50 });
      const md = marketTestToMarkdown(result);

      expect(md).toContain("# Market Test: AI-Powered Code Review");
      expect(md).toContain("Overall Adoption");
      expect(md).toContain("Market Viability");
      expect(md).toContain("Segment Analysis");
      expect(md).toContain("Pricing Sensitivity");
      expect(md).toContain("Key Insights");
    });
  });

  // ---- clearMarketTests ----

  describe("clearMarketTests", () => {
    it("clears all stored tests", async () => {
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(JSON.stringify(mockAssessment));
      await runMarketTest(mockIdea, { personaCount: 10 });
      expect(listMarketTests().length).toBeGreaterThan(0);
      clearMarketTests();
      expect(listMarketTests()).toHaveLength(0);
    });
  });
});
