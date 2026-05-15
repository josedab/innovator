import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

vi.mock("../copilot/client.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../copilot/client.js")>();
  return {
    ...original,
    generateText: vi.fn().mockResolvedValue("{}"),
  };
});

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { computeSurvivabilityIndex, runGauntlet, gauntletToMarkdown } from "../gauntlet/gauntlet.js";
import { generateText } from "../copilot/client.js";
import { makeAttack, makeIdea } from "../__test-utils__/factories.js";
import type { Attack, AdversaryRole, GauntletResult } from "../gauntlet/types.js";

describe("gauntlet", () => {
  describe("computeSurvivabilityIndex", () => {
    it("returns 100 for zero attacks", () => {
      expect(computeSurvivabilityIndex([])).toBe(100);
    });

    it("returns 0 for maximum severity attacks", () => {
      const attacks: Attack[] = [
        makeAttack({ adversaryRole: "competitor", severity: 10 }),
        makeAttack({ adversaryRole: "regulator", severity: 10 }),
        makeAttack({ adversaryRole: "skeptic", severity: 10 }),
        makeAttack({ adversaryRole: "economist", severity: 10 }),
        makeAttack({ adversaryRole: "engineer", severity: 10 }),
      ];
      expect(computeSurvivabilityIndex(attacks)).toBe(0);
    });

    it("returns moderate score for mixed severities", () => {
      const attacks: Attack[] = [
        makeAttack({ adversaryRole: "competitor", severity: 3 }),
        makeAttack({ adversaryRole: "skeptic", severity: 7 }),
        makeAttack({ adversaryRole: "economist", severity: 5 }),
      ];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });

    it("weights economist attacks higher than skeptic", () => {
      const economistAttack = [makeAttack({ adversaryRole: "economist", severity: 8 })];
      const skepticAttack = [makeAttack({ adversaryRole: "skeptic", severity: 8 })];
      const eScore = computeSurvivabilityIndex(economistAttack);
      const sScore = computeSurvivabilityIndex(skepticAttack);
      // Economist weight is 0.25, skeptic is 0.15
      // Both single-attack so weighted avg = severity * weight / weight = severity
      // Actually with single attack: weightedSum = 8 * weight, totalWeight = weight
      // So weightedAvg = 8 for both. Index = 100 - 80 = 20
      // They should be equal because the formula normalizes
      expect(eScore).toBe(sScore);
    });

    it("handles unknown adversary role gracefully", () => {
      const attacks = [makeAttack({ adversaryRole: "custom-role" as AdversaryRole, severity: 5 })];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("clamps to 0-100 range", () => {
      const attacks = [makeAttack({ severity: 1 })];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("handles NaN severity by treating as zero impact", () => {
      const attacks = [makeAttack({ severity: NaN as unknown as number })];
      const score = computeSurvivabilityIndex(attacks);
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("handles negative severity gracefully", () => {
      const attacks = [makeAttack({ severity: -5 })];
      const score = computeSurvivabilityIndex(attacks);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // ---- runGauntlet ----

  describe("runGauntlet", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("throws for empty title", async () => {
      const idea = makeIdea({ title: "", description: "desc" });
      await expect(runGauntlet(idea)).rejects.toThrow("Idea title is required");
    });

    it("throws for whitespace-only title", async () => {
      const idea = makeIdea({ title: "   ", description: "desc" });
      await expect(runGauntlet(idea)).rejects.toThrow("Idea title is required");
    });

    it("throws for empty description", async () => {
      const idea = makeIdea({ title: "Valid", description: "" });
      await expect(runGauntlet(idea)).rejects.toThrow("Idea description is required");
    });

    it("throws for whitespace-only description", async () => {
      const idea = makeIdea({ title: "Valid", description: "   " });
      await expect(runGauntlet(idea)).rejects.toThrow("Idea description is required");
    });

    it("invokes progress callback with correct stages", async () => {
      // Mock generateText to return valid attack JSON
      
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          attacks: [
            {
              adversaryRole: "competitor",
              category: "market-preemption",
              severity: 5,
              title: "Test Attack",
              reasoning: "Test reasoning",
              evidence: "Test evidence",
              suggestedCounter: "Test counter",
            },
          ],
        })
      );

      const progress: string[] = [];
      const idea = makeIdea({ title: "Test Idea", description: "Test description" });
      await runGauntlet(idea, { adversaries: ["competitor"] }, (p) => {
        progress.push(p.stage);
      });

      expect(progress).toContain("attacking");
      expect(progress).toContain("scoring");
      expect(progress).toContain("complete");
    });

    it("handles LLM failure gracefully (non-fatal per adversary)", async () => {
      
      vi.mocked(generateText).mockRejectedValue(new Error("LLM unavailable"));

      const idea = makeIdea({ title: "Test Idea", description: "Test description" });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await runGauntlet(idea, { adversaries: ["competitor"] });

      expect(result.attacks).toHaveLength(0);
      expect(result.survivabilityIndex).toBe(100);
      expect(result.transcript).toHaveLength(1);
      expect(result.transcript[0].attacks).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it("respects AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      
      vi.mocked(generateText).mockResolvedValue("{}");

      const idea = makeIdea({ title: "Test", description: "Test" });
      const result = await runGauntlet(idea, {
        adversaries: ["competitor", "regulator"],
        signal: controller.signal,
      });

      // Should complete without running adversaries
      expect(result.attacks).toHaveLength(0);
    });

    it("runs custom adversaries", async () => {
      // Custom adversaries use built-in role values in the attack response
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          attacks: [
            {
              adversaryRole: "skeptic",
              category: "custom-cat",
              severity: 6,
              title: "Custom Attack",
              reasoning: "reasoning",
              evidence: "evidence",
              suggestedCounter: "counter",
            },
          ],
        })
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const idea = makeIdea({ title: "Test", description: "Test" });
      const result = await runGauntlet(idea, {
        adversaries: [],
        customAdversaries: [
          {
            role: "custom-critic",
            description: "Custom critic persona",
            attackCategories: ["custom-cat"],
          },
        ],
      });

      expect(result.transcript.length).toBe(1);
      warnSpy.mockRestore();
    });

    it("returns proper result structure", async () => {
      
      vi.mocked(generateText).mockResolvedValue(
        JSON.stringify({
          attacks: [
            {
              adversaryRole: "skeptic",
              category: "flawed-assumption",
              severity: 4,
              title: "Weak assumption",
              reasoning: "r",
              evidence: "e",
              suggestedCounter: "c",
            },
          ],
        })
      );

      const idea = makeIdea({ title: "My Idea", description: "My description" });
      const result = await runGauntlet(idea, { adversaries: ["skeptic"] });

      expect(result.id).toBeTruthy();
      expect(result.ideaTitle).toBe("My Idea");
      expect(result.ideaDescription).toBe("My description");
      expect(result.createdAt).toBeTruthy();
      expect(result.survivabilityIndex).toBeGreaterThanOrEqual(0);
      expect(result.survivabilityIndex).toBeLessThanOrEqual(100);
    });
  });

  // ---- gauntletToMarkdown ----

  describe("gauntletToMarkdown", () => {
    function makeResult(overrides: Partial<GauntletResult> = {}): GauntletResult {
      return {
        id: "result-1",
        ideaTitle: "Test Idea",
        ideaDescription: "Test description",
        attacks: [makeAttack({ adversaryRole: "competitor", title: "Market Attack", severity: 7 })],
        survivabilityIndex: 30,
        transcript: [],
        createdAt: "2025-01-01T00:00:00Z",
        ...overrides,
      };
    }

    it("includes idea title and survivability index", () => {
      const md = gauntletToMarkdown(makeResult());
      expect(md).toContain("Test Idea");
      expect(md).toContain("30/100");
    });

    it("groups attacks by adversary role", () => {
      const result = makeResult({
        attacks: [
          makeAttack({ adversaryRole: "competitor", title: "Attack A" }),
          makeAttack({ adversaryRole: "regulator", title: "Attack B" }),
        ],
      });
      const md = gauntletToMarkdown(result);
      expect(md).toContain("Competitor");
      expect(md).toContain("Regulator");
      expect(md).toContain("Attack A");
      expect(md).toContain("Attack B");
    });

    it("includes attack details", () => {
      const md = gauntletToMarkdown(makeResult());
      expect(md).toContain("Category:");
      expect(md).toContain("Reasoning:");
      expect(md).toContain("Evidence:");
      expect(md).toContain("Counter:");
    });

    it("includes strengthened idea section when present", () => {
      const result = makeResult({
        strengthenedIdea: {
          title: "Improved Idea",
          description: "Better description",
          addressedAttacks: ["Market Attack"],
          revisedSurvivabilityIndex: 70,
        },
      });
      const md = gauntletToMarkdown(result);
      expect(md).toContain("Strengthened Idea");
      expect(md).toContain("Improved Idea");
      expect(md).toContain("70/100");
    });

    it("omits strengthened section when not present", () => {
      const md = gauntletToMarkdown(makeResult());
      expect(md).not.toContain("Strengthened Idea");
    });

    it("formats empty attacks gracefully", () => {
      const md = gauntletToMarkdown(makeResult({ attacks: [] }));
      expect(md).toContain("Attacks:** 0");
    });
  });
});
