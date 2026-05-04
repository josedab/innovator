import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: (s: string) => s,
  sanitizeLlmOutput: (s: string) => s,
  wrapUserInput: (_label: string, val: string) => val,
}));

import {
  extractPattern,
  buildDataset,
  routeRequest,
  getCostDashboard,
  exportDatasetJsonl,
  clearDistillationData,
  getPatterns,
  listDatasets,
  generateFineTuneConfig,
} from "../knowledge-distillation/index.js";

describe("knowledge-distillation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDistillationData();
  });

  describe("extractPattern", () => {
    it("calls LLM and parses pattern JSON with normalized quality score", async () => {
      const patternResponse = JSON.stringify({
        inputPattern: "Analyze [TOPIC]",
        outputPattern: "Summary of [TOPIC]",
        qualityScore: 0.85,
        complexity: "moderate",
      });
      mockGenerateText.mockResolvedValue(patternResponse);
      mockExtractJson.mockReturnValue(patternResponse);

      const pattern = await extractPattern("Test input", "Test output", "investigation");

      expect(pattern.category).toBe("investigation");
      expect(pattern.qualityScore).toBeCloseTo(0.85, 2);
      expect(pattern.complexity).toBe("moderate");
      expect(pattern.inputPattern).toBe("Analyze [TOPIC]");
      expect(pattern.id).toMatch(/^pattern-/);
      expect(mockGenerateText).toHaveBeenCalledOnce();
    });

    it("clamps quality score to 0-1 range", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "test",
        qualityScore: 5.0,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      const pattern = await extractPattern("in", "out", "synthesis");
      expect(pattern.qualityScore).toBe(1);
    });

    it("clamps negative quality score to 0", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "test",
        qualityScore: -0.5,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      const pattern = await extractPattern("in", "out", "scoring");
      expect(pattern.qualityScore).toBe(0);
    });

    it("throws when input or output is empty", async () => {
      await expect(extractPattern("", "output", "investigation")).rejects.toThrow(
        "Both input and output are required"
      );
      await expect(extractPattern("input", "", "investigation")).rejects.toThrow(
        "Both input and output are required"
      );
    });

    it("stores pattern in internal store", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "test",
        qualityScore: 0.7,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      await extractPattern("in", "out", "investigation");
      expect(getPatterns()).toHaveLength(1);
    });
  });

  describe("routeRequest", () => {
    it("routes simple queries to distilled model", () => {
      const decision = routeRequest("What is AI?");
      expect(decision.complexity).toBe("simple");
      expect(decision.selectedModel).toBe("ollama-local");
      expect(decision.estimatedCost).toBe(0);
    });

    it("routes complex queries to premium model", () => {
      const complexInput =
        "Please analyze the architecture and algorithm for patent regulatory compliance. " +
        "Then next step is to evaluate the framework. " +
        "What is the best approach? How do we handle edge cases? " +
        "What about the scalability? And the performance? " +
        "Also describe the implementation details thoroughly. ".repeat(5);
      const decision = routeRequest(complexInput);
      expect(decision.complexity).toBe("complex");
      expect(decision.selectedModel).toBe("gpt-4o");
    });

    it("logs routing decision", () => {
      routeRequest("simple query");
      const dashboard = getCostDashboard();
      expect(dashboard.routingDecisions).toBe(1);
    });
  });

  describe("buildDataset", () => {
    it("aggregates patterns into training examples", async () => {
      // Add some patterns first
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "result",
        qualityScore: 0.9,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      await extractPattern("in1", "out1", "investigation");
      await extractPattern("in2", "out2", "synthesis");

      const dataset = buildDataset("test-dataset", "gpt-4o", "llama3");
      expect(dataset.name).toBe("test-dataset");
      expect(dataset.totalExamples).toBe(2);
      expect(dataset.avgQuality).toBeCloseTo(0.9, 1);
      expect(dataset.sourceModel).toBe("gpt-4o");
      expect(dataset.targetModel).toBe("llama3");
    });

    it("throws when no patterns are available", () => {
      expect(() => buildDataset("empty", "gpt-4o", "llama3")).toThrow("No patterns available");
    });

    it("filters by pattern IDs when provided", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "result",
        qualityScore: 0.8,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      const p1 = await extractPattern("in1", "out1", "investigation");
      await extractPattern("in2", "out2", "synthesis");

      const dataset = buildDataset("filtered", "gpt-4o", "llama3", [p1.id]);
      expect(dataset.totalExamples).toBe(1);
    });
  });

  describe("getCostDashboard", () => {
    it("calculates savings percentage", () => {
      routeRequest("simple query 1");
      routeRequest("simple query 2");
      const dashboard = getCostDashboard();
      expect(dashboard.routingDecisions).toBe(2);
      expect(dashboard.savingsPercent).toBeGreaterThan(0);
      expect(dashboard.totalSaved).toBeGreaterThanOrEqual(0);
    });

    it("returns zero values when no routing has occurred", () => {
      const dashboard = getCostDashboard();
      expect(dashboard.routingDecisions).toBe(0);
      expect(dashboard.totalSpent).toBe(0);
      expect(dashboard.savingsPercent).toBe(0);
    });
  });

  describe("exportDatasetJsonl", () => {
    it("outputs one JSON line per entry", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "result",
        qualityScore: 0.8,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      await extractPattern("in1", "out1", "investigation");
      await extractPattern("in2", "out2", "synthesis");
      const dataset = buildDataset("export-test", "gpt-4o", "llama3");

      const jsonl = exportDatasetJsonl(dataset.id);
      const lines = jsonl.split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].role).toBe("system");
      expect(parsed.messages[1].role).toBe("user");
      expect(parsed.messages[2].role).toBe("assistant");
    });

    it("throws for non-existent dataset", () => {
      expect(() => exportDatasetJsonl("nonexistent")).toThrow("Dataset not found");
    });
  });

  describe("clearDistillationData", () => {
    it("resets all stores", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "result",
        qualityScore: 0.8,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      await extractPattern("in", "out", "investigation");
      routeRequest("test");
      clearDistillationData();

      expect(getPatterns()).toHaveLength(0);
      expect(listDatasets()).toHaveLength(0);
      expect(getCostDashboard().routingDecisions).toBe(0);
    });
  });

  describe("generateFineTuneConfig", () => {
    it("generates config with auto-tuned epochs", async () => {
      const response = JSON.stringify({
        inputPattern: "test",
        outputPattern: "result",
        qualityScore: 0.8,
        complexity: "simple",
      });
      mockGenerateText.mockResolvedValue(response);
      mockExtractJson.mockReturnValue(response);

      await extractPattern("in", "out", "investigation");
      const dataset = buildDataset("test", "gpt-4o", "llama3");
      const config = generateFineTuneConfig(dataset.id);

      expect(config.baseModel).toBe("llama3.2:3b");
      expect(config.datasetId).toBe(dataset.id);
      expect(config.epochs).toBe(5); // < 50 examples
      expect(config.loraRank).toBe(16);
    });

    it("throws for non-existent dataset", () => {
      expect(() => generateFineTuneConfig("nonexistent")).toThrow("Dataset not found");
    });
  });
});
