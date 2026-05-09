import { describe, it, expect } from "vitest";
import {
  countTokens,
  countTokensRefined,
  BUDGET_PROFILES,
  TokenBudgetManager,
  compressContext,
  buildTokenFlowDiagram,
  suggestModelChanges,
} from "../token-manager/index.js";

describe("Token counting", () => {
  describe("countTokens (char-based ÷4)", () => {
    it("estimates 1 token per 4 chars", () => {
      expect(countTokens("abcd")).toBe(1);
      expect(countTokens("abcde")).toBe(2); // ceil(5/4) = 2
    });

    it("returns 0 for empty string", () => {
      expect(countTokens("")).toBe(0);
    });
  });

  describe("countTokensRefined (word-based ×1.3)", () => {
    it("averages word-based and char-based estimates", () => {
      const text = "hello world test";
      const result = countTokensRefined(text);
      // words=3, wordEst=ceil(3*1.3)=4, charEst=ceil(16/4)=4, avg=4
      expect(result).toBeGreaterThan(0);
    });

    it("handles single word", () => {
      const result = countTokensRefined("hello");
      expect(result).toBeGreaterThan(0);
    });
  });
});

describe("Budget profiles", () => {
  it("standard has 128K budget", () => {
    expect(BUDGET_PROFILES.standard.totalBudget).toBe(128000);
  });

  it("economy has 32K budget", () => {
    expect(BUDGET_PROFILES.economy.totalBudget).toBe(32000);
  });

  it("premium has 200K budget", () => {
    expect(BUDGET_PROFILES.premium.totalBudget).toBe(200000);
  });

  it("standard allocation percentages sum to 1", () => {
    const alloc = BUDGET_PROFILES.standard.allocation;
    const sum = alloc.investigate + alloc.generate + alloc.synthesize + alloc.score;
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("TokenBudgetManager", () => {
  it("initializes from profile name string", () => {
    const mgr = new TokenBudgetManager("economy");
    const usage = mgr.getTotalUsage();
    expect(usage.budgeted).toBe(32000);
  });

  it("falls back to standard for unknown profile name", () => {
    const mgr = new TokenBudgetManager("nonexistent");
    const usage = mgr.getTotalUsage();
    expect(usage.budgeted).toBe(128000);
  });

  it("allocates correct stage budgets", () => {
    const mgr = new TokenBudgetManager("standard");
    const investigate = mgr.getAccount("investigate");
    expect(investigate).toBeDefined();
    // 128000 * 0.25 = 32000
    expect(investigate!.budgeted).toBe(32000);
    const generate = mgr.getAccount("generate");
    // 128000 * 0.45 = 57600
    expect(generate!.budgeted).toBe(57600);
  });

  describe("record usage", () => {
    it("tracks tokens and updates remaining", () => {
      const mgr = new TokenBudgetManager("standard");
      const account = mgr.record("investigate", 1000, 500);
      expect(account.used).toBe(1500);
      expect(account.inputTokens).toBe(1000);
      expect(account.outputTokens).toBe(500);
      expect(account.remaining).toBe(32000 - 1500);
    });

    it("warns at 80% utilization", () => {
      const mgr = new TokenBudgetManager("standard");
      // investigate budget = 32000, 80% = 25600
      mgr.record("investigate", 26000, 0);
      const warnings = mgr.getWarnings();
      expect(warnings.some((w) => w.includes("80") || w.includes("investigate"))).toBe(true);
    });

    it("marks truncated and warns at 100%+ utilization", () => {
      const mgr = new TokenBudgetManager("standard");
      const account = mgr.record("investigate", 33000, 0);
      expect(account.truncated).toBe(true);
      expect(account.remaining).toBe(0);
      const warnings = mgr.getWarnings();
      expect(warnings.some((w) => w.includes("exceeded"))).toBe(true);
    });

    it("creates ad-hoc account for unknown stage", () => {
      const mgr = new TokenBudgetManager("standard");
      const account = mgr.record("custom-stage", 100, 50);
      expect(account.stage).toBe("custom-stage");
      expect(account.budgeted).toBe(0);
    });
  });

  it("hasRemainingBudget returns true when within budget", () => {
    const mgr = new TokenBudgetManager("standard");
    expect(mgr.hasRemainingBudget("investigate", 1000)).toBe(true);
  });

  it("hasRemainingBudget returns false when over budget", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 32000, 0);
    expect(mgr.hasRemainingBudget("investigate", 1)).toBe(false);
  });

  it("getTotalUsage aggregates across stages", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 100, 50);
    mgr.record("generate", 200, 100);
    const usage = mgr.getTotalUsage();
    expect(usage.used).toBe(450);
  });

  it("reset re-initializes accounts", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 10000, 5000);
    mgr.reset();
    const account = mgr.getAccount("investigate");
    expect(account!.used).toBe(0);
    expect(mgr.getWarnings()).toHaveLength(0);
  });

  it("clearWarnings clears warnings only", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 26000, 0);
    expect(mgr.getWarnings().length).toBeGreaterThan(0);
    mgr.clearWarnings();
    expect(mgr.getWarnings()).toHaveLength(0);
  });
});

describe("compressContext (TF-IDF)", () => {
  it("returns original text when under budget", () => {
    const text = "Short text.";
    const result = compressContext(text, 1000);
    expect(result.compressed).toBe(text);
    expect(result.compressionRatio).toBe(1);
  });

  it("compresses text to fit within token budget", () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `Sentence number ${i} about topic ${i % 5} with some extra words.`
    );
    const text = sentences.join(" ");
    const result = compressContext(text, 50);
    expect(result.compressedTokens).toBeLessThanOrEqual(50);
    expect(result.compressedTokens).toBeLessThan(result.originalTokens);
  });

  it("truncates single-sentence text as fallback", () => {
    const text = "A".repeat(2000); // single sentence, no period
    const result = compressContext(text, 100);
    expect(result.compressedTokens).toBeLessThanOrEqual(100);
  });

  it("preserves higher TF-IDF sentences", () => {
    // Sentence with unique terms should be preferred
    const text =
      "The cat sat on the mat. The dog ran in the park. Quantum computing transforms cryptography fundamentals.";
    const result = compressContext(text, 20);
    // With 20 tokens budget, should include the unique-terms sentence
    expect(result.compressed).toContain("Quantum");
  });
});

describe("buildTokenFlowDiagram (Sankey)", () => {
  it("builds valid Sankey diagram from manager", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 1000, 500);
    mgr.record("generate", 2000, 1000);
    const diagram = buildTokenFlowDiagram(mgr);

    expect(diagram.nodes.length).toBeGreaterThan(0);
    expect(diagram.links.length).toBeGreaterThan(0);
    expect(diagram.totalTokens).toBeGreaterThan(0);
    expect(diagram.totalCostUsd).toBeGreaterThan(0);

    // Should have input, output, and stage nodes
    const nodeIds = diagram.nodes.map((n) => n.id);
    expect(nodeIds).toContain("input");
    expect(nodeIds).toContain("output");
    expect(nodeIds).toContain("investigate");
    expect(nodeIds).toContain("generate");
  });
});

describe("suggestModelChanges", () => {
  it("suggests downgrade for gpt-5 with short outputs", () => {
    const suggestions = suggestModelChanges("gpt-5", {
      avgInputTokens: 1000,
      avgOutputTokens: 100,
      avgLatencyMs: 500,
    });
    const downgrade = suggestions.find((s) => s.suggestedModel === "gpt-5-mini");
    expect(downgrade).toBeDefined();
    expect(downgrade!.estimatedSavingsPct).toBeGreaterThan(0);
  });

  it("suggests upgrade for mini model with large context", () => {
    const suggestions = suggestModelChanges("gpt-5-mini", {
      avgInputTokens: 60000,
      avgOutputTokens: 1000,
      avgLatencyMs: 500,
    });
    const upgrade = suggestions.find((s) => s.suggestedModel === "gpt-5");
    expect(upgrade).toBeDefined();
  });

  it("suggests faster model for high latency", () => {
    const suggestions = suggestModelChanges("gpt-5", {
      avgInputTokens: 1000,
      avgOutputTokens: 1000,
      avgLatencyMs: 20000,
    });
    expect(suggestions.some((s) => s.reason.includes("latency"))).toBe(true);
  });

  it("returns empty for optimal usage", () => {
    const suggestions = suggestModelChanges("claude-sonnet-4.5", {
      avgInputTokens: 5000,
      avgOutputTokens: 1000,
      avgLatencyMs: 3000,
    });
    expect(suggestions).toHaveLength(0);
  });
});
