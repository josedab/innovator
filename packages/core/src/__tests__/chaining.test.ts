import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../innovation/generate.js", () => ({
  generateForAngle: vi.fn(),
}));

import { getChainById, listChains, AngleChainSchema, runChain } from "../chaining/index.js";
import { generateForAngle } from "../innovation/generate.js";
import type { AngleResult, Investigation } from "../types.js";

const mockGenerateForAngle = vi.mocked(generateForAngle);

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "A1", description: "D1" }],
  currentState: "Current",
  challenges: ["C1"],
  opportunities: ["O1"],
};

function makeAngleResult(angleId: string): AngleResult {
  return {
    angleId,
    angleName: angleId.toUpperCase(),
    ideas: [
      {
        title: `${angleId} Idea`,
        description: `Description for ${angleId}`,
        potentialImpact: "High",
        implementationHint: "Start now",
      },
    ],
    reasoning: `Reasoning for ${angleId}`,
  };
}

describe("chaining", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getChainById", () => {
    it("returns a chain for existing ID", () => {
      const chain = getChainById("deep-disruption");
      expect(chain).toBeDefined();
      expect(chain!.id).toBe("deep-disruption");
      expect(chain!.steps.length).toBeGreaterThanOrEqual(2);
    });

    it("returns undefined for nonexistent chain", () => {
      expect(getChainById("nonexistent")).toBeUndefined();
    });
  });

  describe("listChains", () => {
    it("returns all 5 default chains", () => {
      const chains = listChains();
      expect(chains).toHaveLength(5);
    });

    it("returns a copy (not the same reference)", () => {
      const chains = listChains();
      chains.pop();
      expect(listChains()).toHaveLength(5);
    });
  });

  describe("AngleChainSchema", () => {
    it("validates correct chain shape", () => {
      expect(() =>
        AngleChainSchema.parse({
          id: "test-chain",
          name: "Test Chain",
          description: "A test chain",
          steps: [{ angleId: "scamper" }, { angleId: "inversion", contextFilter: "top3" }],
        })
      ).not.toThrow();
    });

    it("requires id to match ^[a-z0-9-]+$", () => {
      expect(() =>
        AngleChainSchema.parse({
          id: "Invalid ID!",
          name: "N",
          description: "D",
          steps: [{ angleId: "a" }, { angleId: "b" }],
        })
      ).toThrow();
    });

    it("requires minimum 2 steps", () => {
      expect(() =>
        AngleChainSchema.parse({
          id: "test",
          name: "N",
          description: "D",
          steps: [{ angleId: "a" }],
        })
      ).toThrow();
    });

    it("allows maximum 10 steps", () => {
      const steps = Array.from({ length: 11 }, (_, i) => ({ angleId: `a${i}` }));
      expect(() =>
        AngleChainSchema.parse({
          id: "test",
          name: "N",
          description: "D",
          steps,
        })
      ).toThrow();
    });
  });

  describe("runChain", () => {
    it("runs chain with mocked generateForAngle and enriched investigation", async () => {
      const chain = getChainById("deep-disruption")!;

      mockGenerateForAngle.mockImplementation(async (_subject, _inv, angleId) => {
        return makeAngleResult(angleId as string);
      });

      const results = await runChain(chain, "test subject", MOCK_INVESTIGATION);

      expect(results).toHaveLength(chain.steps.length);
      expect(results[0].angleId).toBe("first-principles");
      expect(mockGenerateForAngle).toHaveBeenCalledTimes(chain.steps.length);

      // Second call should have enriched investigation with prior results
      const secondCall = mockGenerateForAngle.mock.calls[1];
      const enrichedInv = secondCall[1] as Investigation;
      expect(enrichedInv.summary).toContain("PRIOR CHAIN RESULTS");
    });

    it("respects AbortSignal", async () => {
      const chain = getChainById("deep-disruption")!;
      const controller = new AbortController();
      controller.abort();

      const results = await runChain(
        chain,
        "subject",
        MOCK_INVESTIGATION,
        undefined,
        undefined,
        controller.signal
      );

      expect(results).toHaveLength(0);
      expect(mockGenerateForAngle).not.toHaveBeenCalled();
    });

    it("calls onProgress with correct step counts", async () => {
      const chain = getChainById("deep-disruption")!;
      mockGenerateForAngle.mockImplementation(async (_s, _i, angleId) =>
        makeAngleResult(angleId as string)
      );

      const progressCalls: Record<string, unknown>[] = [];
      await runChain(chain, "subject", MOCK_INVESTIGATION, (p) => progressCalls.push(p));

      expect(progressCalls).toHaveLength(chain.steps.length);
      expect(progressCalls[0].currentStep).toBe(1);
      expect(progressCalls[0].totalSteps).toBe(chain.steps.length);
      expect(progressCalls[chain.steps.length - 1].currentStep).toBe(chain.steps.length);
    });
  });
});
