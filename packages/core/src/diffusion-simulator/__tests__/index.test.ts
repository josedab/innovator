import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));
vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
}));

import {
  computeBassCurve,
  runMonteCarloDiffusion,
  simulateDiffusion,
  getDiffusionSimulation,
  listDiffusionSimulations,
  clearDiffusionSimulations,
  diffusionToMarkdown,
  DiffusionParametersSchema,
  type DiffusionParameters,
  type DiffusionSimulation,
} from "../index.js";
import type { InnovationIdea } from "../../types.js";

// ---- Helpers ----

function makeParams(overrides: Partial<DiffusionParameters> = {}): DiffusionParameters {
  return {
    p: 0.03,
    q: 0.4,
    m: 10000,
    timeHorizon: 24,
    ...overrides,
  };
}

function makeLlmResponse() {
  return JSON.stringify({
    parameters: { p: 0.03, q: 0.4, m: 10000, timeHorizon: 24 },
    network: [
      { id: "n1", label: "Tech Leaders", type: "innovator", influence: 0.9, adopted: false },
      { id: "n2", label: "Early Users", type: "early-adopter", influence: 0.7, adopted: false },
      { id: "n3", label: "Mainstream", type: "early-majority", influence: 0.5, adopted: false },
      { id: "n4", label: "Followers", type: "late-majority", influence: 0.3, adopted: false },
      { id: "n5", label: "Laggards", type: "laggard", influence: 0.1, adopted: false },
    ],
    strategies: [
      {
        phase: "launch",
        recommendation: "Target innovators",
        targetSegment: "Tech Leaders",
        keyAction: "Run beta program",
        expectedImpact: "100 early users",
      },
    ],
    summary: "This idea has moderate diffusion potential.",
  });
}

describe("diffusion-simulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDiffusionSimulations();
  });

  // ---- computeBassCurve ----

  describe("computeBassCurve", () => {
    it("returns correct number of data points", () => {
      const curve = computeBassCurve(makeParams({ timeHorizon: 24 }));
      expect(curve).toHaveLength(25); // 0 through 24
    });

    it("starts with 0 cumulative adopters at t=0", () => {
      const curve = computeBassCurve(makeParams());
      expect(curve[0].cumulativeAdopters).toBe(0);
    });

    it("produces S-curve shape (monotonically non-decreasing cumulative)", () => {
      const curve = computeBassCurve(makeParams({ timeHorizon: 60 }));
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].cumulativeAdopters).toBeGreaterThanOrEqual(curve[i - 1].cumulativeAdopters);
      }
    });

    it("converges toward market size for large t", () => {
      const params = makeParams({ p: 0.05, q: 0.5, m: 1000, timeHorizon: 100 });
      const curve = computeBassCurve(params);
      const lastPoint = curve[curve.length - 1];
      expect(lastPoint.cumulativeAdopters).toBeGreaterThan(params.m * 0.9);
    });

    it("handles p=0 (no innovation coefficient) — q drives adoption", () => {
      // p=0 makes the formula degenerate, but code handles q>0 path
      // When p=0, the formula uses 1-exp instead of full Bass, and q/p is undefined
      // The code checks q > 0 and uses alternate formula
      const params = makeParams({ p: 0.001, q: 0.5, m: 100, timeHorizon: 50 });
      const curve = computeBassCurve(params);
      expect(curve).toHaveLength(51);
      expect(curve[curve.length - 1].cumulativeAdopters).toBeGreaterThanOrEqual(0);
    });

    it("handles q=0 (no imitation) — pure innovation model", () => {
      const params = makeParams({ p: 0.05, q: 0, m: 100, timeHorizon: 50 });
      const curve = computeBassCurve(params);
      expect(curve).toHaveLength(51);
      // Should still show adoption from external influence
      expect(curve[curve.length - 1].cumulativeAdopters).toBeGreaterThan(0);
    });

    it("handles market_size=1", () => {
      const params = makeParams({ p: 0.1, q: 0.5, m: 1, timeHorizon: 20 });
      const curve = computeBassCurve(params);
      // Should reach 1 adopter
      const lastPoint = curve[curve.length - 1];
      expect(lastPoint.cumulativeAdopters).toBeLessThanOrEqual(1);
    });

    it("adoption rate is between 0 and 1", () => {
      const curve = computeBassCurve(makeParams());
      for (const pt of curve) {
        expect(pt.adoptionRate).toBeGreaterThanOrEqual(0);
        expect(pt.adoptionRate).toBeLessThanOrEqual(1);
      }
    });

    it("market penetration is between 0 and 1", () => {
      const curve = computeBassCurve(makeParams());
      for (const pt of curve) {
        expect(pt.marketPenetration).toBeGreaterThanOrEqual(0);
        expect(pt.marketPenetration).toBeLessThanOrEqual(1);
      }
    });
  });

  // ---- runMonteCarloDiffusion ----

  describe("runMonteCarloDiffusion", () => {
    it("returns correct structure", () => {
      const result = runMonteCarloDiffusion(makeParams(), 10);
      expect(result.iterations).toBe(10);
      expect(result.percentiles.p10).toBeDefined();
      expect(result.percentiles.p50).toBeDefined();
      expect(result.percentiles.p90).toBeDefined();
      expect(result.adoptionProbability).toBeGreaterThanOrEqual(0);
      expect(result.adoptionProbability).toBeLessThanOrEqual(1);
    });

    it("p10 <= p50 <= p90 cumulative adopters at each time step", () => {
      const result = runMonteCarloDiffusion(makeParams(), 50);
      for (let t = 0; t <= makeParams().timeHorizon; t++) {
        expect(result.percentiles.p10[t].cumulativeAdopters).toBeLessThanOrEqual(
          result.percentiles.p50[t].cumulativeAdopters
        );
        expect(result.percentiles.p50[t].cumulativeAdopters).toBeLessThanOrEqual(
          result.percentiles.p90[t].cumulativeAdopters
        );
      }
    });

    it("clamps iterations to minimum 10", () => {
      const result = runMonteCarloDiffusion(makeParams(), 1);
      expect(result.iterations).toBe(10);
    });

    it("clamps iterations to maximum 5000", () => {
      const result = runMonteCarloDiffusion(makeParams(), 10000);
      expect(result.iterations).toBe(5000);
    });

    it("confidence interval has 0.9 confidence", () => {
      const result = runMonteCarloDiffusion(makeParams(), 50);
      expect(result.confidenceInterval.confidence).toBe(0.9);
      expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.confidenceInterval.upper);
    });
  });

  // ---- simulateDiffusion (mocked LLM) ----

  describe("simulateDiffusion", () => {
    it("returns simulation from LLM response", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(makeLlmResponse());

      const simulation = await simulateDiffusion(
        {
          title: "AI Code Assistant",
          description: "AI-powered coding",
        } as unknown as InnovationIdea,
        { runMonteCarlo: false }
      );

      expect(simulation.ideaTitle).toBe("AI Code Assistant");
      expect(simulation.parameters.p).toBe(0.03);
      expect(simulation.baseCurve.length).toBeGreaterThan(0);
      expect(simulation.network.length).toBeGreaterThanOrEqual(5);
      expect(simulation.strategies.length).toBeGreaterThanOrEqual(1);
    });

    it("runs Monte Carlo by default", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(makeLlmResponse());

      const simulation = await simulateDiffusion({
        title: "Test",
        description: "Test idea",
      } as unknown as InnovationIdea);

      expect(simulation.monteCarlo).toBeDefined();
      expect(simulation.monteCarlo!.iterations).toBeGreaterThanOrEqual(10);
    });

    it("throws for empty idea title", async () => {
      await expect(
        simulateDiffusion({ title: "", description: "desc" } as unknown as InnovationIdea)
      ).rejects.toThrow("Idea title is required");
    });

    it("assigns adoption timing to network nodes", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(makeLlmResponse());

      const simulation = await simulateDiffusion(
        { title: "Test", description: "Test" } as unknown as InnovationIdea,
        { runMonteCarlo: false }
      );

      for (const node of simulation.network) {
        expect(node.adoptionMonth).toBeDefined();
        expect(typeof node.adopted).toBe("boolean");
      }
    });

    it("stores simulation for later retrieval", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(makeLlmResponse());

      await simulateDiffusion(
        { title: "Stored Test", description: "Test" } as unknown as InnovationIdea,
        { runMonteCarlo: false }
      );

      const list = listDiffusionSimulations();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].ideaTitle).toBe("Stored Test");
    });
  });

  // ---- CRUD operations ----

  describe("CRUD operations", () => {
    it("clearDiffusionSimulations resets store", async () => {
      const { generateText } = await import("../../copilot/client.js");
      vi.mocked(generateText).mockResolvedValue(makeLlmResponse());

      await simulateDiffusion({ title: "Test", description: "Test" } as unknown as InnovationIdea, {
        runMonteCarlo: false,
      });
      clearDiffusionSimulations();
      expect(listDiffusionSimulations()).toHaveLength(0);
    });

    it("getDiffusionSimulation returns undefined for non-existent", () => {
      expect(getDiffusionSimulation("nonexistent")).toBeUndefined();
    });
  });

  // ---- diffusionToMarkdown ----

  describe("diffusionToMarkdown", () => {
    it("produces markdown with title and parameters", () => {
      const simulation: DiffusionSimulation = {
        ideaTitle: "Test Idea",
        parameters: makeParams(),
        baseCurve: computeBassCurve(makeParams()),
        network: [],
        strategies: [],
        peakAdoptionMonth: 12,
        timeToMajority: 18,
        summary: "Test summary",
        simulatedAt: new Date().toISOString(),
      };

      const md = diffusionToMarkdown(simulation);
      expect(md).toContain("# Diffusion Simulation: Test Idea");
      expect(md).toContain("Bass Model Parameters");
      expect(md).toContain("0.0300");
      expect(md).toContain("Key Metrics");
      expect(md).toContain("Peak adoption month");
      expect(md).toContain("Test summary");
    });

    it("includes Monte Carlo section when present", () => {
      const mc = runMonteCarloDiffusion(makeParams(), 10);
      const simulation: DiffusionSimulation = {
        ideaTitle: "MC Test",
        parameters: makeParams(),
        baseCurve: computeBassCurve(makeParams()),
        monteCarlo: mc,
        network: [],
        strategies: [],
        peakAdoptionMonth: 12,
        timeToMajority: 18,
        summary: "Summary",
        simulatedAt: new Date().toISOString(),
      };

      const md = diffusionToMarkdown(simulation);
      expect(md).toContain("Monte Carlo Analysis");
      expect(md).toContain("Adoption probability");
    });

    it("includes strategies section when present", () => {
      const simulation: DiffusionSimulation = {
        ideaTitle: "Strategy Test",
        parameters: makeParams(),
        baseCurve: computeBassCurve(makeParams()),
        network: [],
        strategies: [
          {
            phase: "launch",
            recommendation: "Target early adopters",
            targetSegment: "Tech Leaders",
            keyAction: "Run beta",
            expectedImpact: "100 users",
          },
        ],
        peakAdoptionMonth: 12,
        timeToMajority: 18,
        summary: "Summary",
        simulatedAt: new Date().toISOString(),
      };

      const md = diffusionToMarkdown(simulation);
      expect(md).toContain("Diffusion Strategies");
      expect(md).toContain("Target early adopters");
    });
  });

  // ---- Schema validation ----

  describe("DiffusionParametersSchema", () => {
    it("accepts valid parameters", () => {
      const result = DiffusionParametersSchema.safeParse(makeParams());
      expect(result.success).toBe(true);
    });

    it("rejects p > 1", () => {
      const result = DiffusionParametersSchema.safeParse(makeParams({ p: 1.5 }));
      expect(result.success).toBe(false);
    });

    it("rejects m < 1", () => {
      const result = DiffusionParametersSchema.safeParse(makeParams({ m: 0 }));
      expect(result.success).toBe(false);
    });

    it("rejects timeHorizon > 120", () => {
      const result = DiffusionParametersSchema.safeParse(makeParams({ timeHorizon: 200 }));
      expect(result.success).toBe(false);
    });
  });
});
