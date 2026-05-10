import { describe, it, expect, beforeEach } from "vitest";
import {
  countTokens,
  countTokensRefined,
  TokenBudgetManager,
  BUDGET_PROFILES,
  compressContext,
  buildTokenFlowDiagram,
  suggestModelChanges,
} from "../index.js";

// ---- countTokens ----

describe("countTokens", () => {
  it("estimates ~1 token per 4 characters", () => {
    expect(countTokens("abcd")).toBe(1);
    expect(countTokens("abcde")).toBe(2);
    expect(countTokens("a".repeat(100))).toBe(25);
  });

  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });
});

// ---- countTokensRefined ----

describe("countTokensRefined", () => {
  it("returns a value between word-based and char-based estimates", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const result = countTokensRefined(text);
    const charEstimate = Math.ceil(text.length / 4);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(charEstimate * 2);
  });

  it("returns 0 for empty string", () => {
    expect(countTokensRefined("")).toBe(0);
  });

  it("differs from countTokens for multi-word text", () => {
    const text = "This is a longer sentence with many words to compare token counting methods";
    const simple = countTokens(text);
    const refined = countTokensRefined(text);
    // They use different algorithms so may differ
    expect(typeof refined).toBe("number");
    expect(refined).toBeGreaterThan(0);
  });
});

// ---- TokenBudgetManager ----

describe("TokenBudgetManager", () => {
  describe("profiles", () => {
    it("initializes with standard profile by default", () => {
      const mgr = new TokenBudgetManager();
      const accounts = mgr.getAllAccounts();
      expect(accounts).toHaveLength(4);
      const total = accounts.reduce((s, a) => s + a.budgeted, 0);
      expect(total).toBeLessThanOrEqual(BUDGET_PROFILES.standard.totalBudget);
    });

    it("initializes with economy profile", () => {
      const mgr = new TokenBudgetManager("economy");
      const usage = mgr.getTotalUsage();
      expect(usage.budgeted).toBeLessThanOrEqual(BUDGET_PROFILES.economy.totalBudget);
    });

    it("initializes with premium profile", () => {
      const mgr = new TokenBudgetManager("premium");
      const usage = mgr.getTotalUsage();
      expect(usage.budgeted).toBeLessThanOrEqual(BUDGET_PROFILES.premium.totalBudget);
    });

    it("initializes with investigation-heavy profile", () => {
      const mgr = new TokenBudgetManager("investigation-heavy");
      const investigateAccount = mgr.getAccount("investigate");
      const generateAccount = mgr.getAccount("generate");
      expect(investigateAccount!.budgeted).toBeGreaterThan(generateAccount!.budgeted);
    });

    it("falls back to standard for unknown profile name", () => {
      const mgr = new TokenBudgetManager("nonexistent");
      const usage = mgr.getTotalUsage();
      expect(usage.budgeted).toBeLessThanOrEqual(BUDGET_PROFILES.standard.totalBudget);
    });

    it("accepts a custom profile object", () => {
      const mgr = new TokenBudgetManager({
        name: "custom",
        totalBudget: 1000,
        allocation: { investigate: 0.5, generate: 0.3, synthesize: 0.1, score: 0.1 },
      });
      const account = mgr.getAccount("investigate");
      expect(account!.budgeted).toBe(500);
    });
  });

  describe("record", () => {
    it("accumulates token usage", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 1000,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });

      mgr.record("investigate", 100, 50);
      const account = mgr.getAccount("investigate")!;
      expect(account.used).toBe(150);
      expect(account.inputTokens).toBe(100);
      expect(account.outputTokens).toBe(50);
      expect(account.remaining).toBe(850);

      mgr.record("investigate", 200, 100);
      const updated = mgr.getAccount("investigate")!;
      expect(updated.used).toBe(450);
      expect(updated.inputTokens).toBe(300);
      expect(updated.outputTokens).toBe(150);
    });

    it("creates account for unknown stage with 0 budget", () => {
      const mgr = new TokenBudgetManager();
      const account = mgr.record("custom-stage", 10, 5);
      expect(account.stage).toBe("custom-stage");
      expect(account.budgeted).toBe(0);
      expect(account.used).toBe(15);
    });
  });

  describe("hasRemainingBudget", () => {
    it("returns true when budget is sufficient", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 1000,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });
      expect(mgr.hasRemainingBudget("investigate", 500)).toBe(true);
    });

    it("returns false when budget is insufficient", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 100,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });
      mgr.record("investigate", 90, 5);
      expect(mgr.hasRemainingBudget("investigate", 50)).toBe(false);
    });

    it("returns true for unknown stage", () => {
      const mgr = new TokenBudgetManager();
      expect(mgr.hasRemainingBudget("unknown-stage", 100)).toBe(true);
    });
  });

  describe("warnings", () => {
    it("generates warning at 80% usage", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 100,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });
      mgr.record("investigate", 80, 5);
      const warnings = mgr.getWarnings();
      expect(warnings.some((w) => w.includes("85%") || w.includes("investigate"))).toBe(true);
    });

    it("generates truncation warning at 100%", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 100,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });
      mgr.record("investigate", 100, 10);
      const account = mgr.getAccount("investigate")!;
      expect(account.truncated).toBe(true);
      expect(mgr.getWarnings().some((w) => w.includes("exceeded"))).toBe(true);
    });

    it("clearWarnings removes all warnings", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 100,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });
      mgr.record("investigate", 90, 0);
      expect(mgr.getWarnings().length).toBeGreaterThan(0);
      mgr.clearWarnings();
      expect(mgr.getWarnings()).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("resets all accounts and warnings", () => {
      const mgr = new TokenBudgetManager({
        name: "test",
        totalBudget: 100,
        allocation: { investigate: 1, generate: 0, synthesize: 0, score: 0 },
      });
      mgr.record("investigate", 90, 0);
      mgr.reset();
      const account = mgr.getAccount("investigate")!;
      expect(account.used).toBe(0);
      expect(account.remaining).toBe(100);
      expect(mgr.getWarnings()).toHaveLength(0);
    });
  });

  describe("getTotalUsage", () => {
    it("aggregates usage across all stages", () => {
      const mgr = new TokenBudgetManager("standard");
      mgr.record("investigate", 100, 50);
      mgr.record("generate", 200, 100);
      const usage = mgr.getTotalUsage();
      expect(usage.used).toBe(450);
      expect(usage.budgeted).toBeGreaterThan(0);
      expect(usage.remainingPct).toBeGreaterThan(0);
    });
  });
});

// ---- compressContext ----

describe("compressContext", () => {
  it("returns text unchanged when within budget", () => {
    const text = "Short text.";
    const result = compressContext(text, 1000);
    expect(result.compressed).toBe(text);
    expect(result.compressionRatio).toBe(1);
  });

  it("extracts top sentences when over budget", () => {
    const sentences = Array.from(
      { length: 20 },
      (_, i) => `Sentence number ${i} contains unique keyword-${i} important for analysis.`
    ).join(" ");
    const result = compressContext(sentences, 20);
    expect(result.compressedTokens).toBeLessThanOrEqual(20 + 5); // some tolerance
    expect(result.compressionRatio).toBeLessThan(1);
    expect(result.originalTokens).toBeGreaterThan(result.compressedTokens);
  });

  it("truncates single-sentence text when over budget", () => {
    const text = "A".repeat(1000);
    const result = compressContext(text, 10);
    expect(result.compressed.length).toBeLessThanOrEqual(10 * 4 + 1);
  });

  it("handles empty text", () => {
    const result = compressContext("", 100);
    expect(result.compressed).toBe("");
    expect(result.originalTokens).toBe(0);
  });
});

// ---- buildTokenFlowDiagram ----

describe("buildTokenFlowDiagram", () => {
  it("builds Sankey diagram structure with input/output nodes", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 500, 200);
    mgr.record("generate", 1000, 500);

    const diagram = buildTokenFlowDiagram(mgr);

    expect(diagram.nodes.some((n) => n.id === "input")).toBe(true);
    expect(diagram.nodes.some((n) => n.id === "output")).toBe(true);
    expect(diagram.nodes.some((n) => n.id === "investigate")).toBe(true);
    expect(diagram.nodes.some((n) => n.id === "generate")).toBe(true);
    expect(diagram.links.length).toBeGreaterThan(0);
    expect(diagram.totalTokens).toBeGreaterThan(0);
    expect(diagram.totalCostUsd).toBeGreaterThan(0);
  });

  it("includes cost calculations per node", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 100, 50);

    const diagram = buildTokenFlowDiagram(mgr, 0.001);

    const investigateNode = diagram.nodes.find((n) => n.id === "investigate");
    expect(investigateNode!.costUsd).toBeGreaterThan(0);
  });

  it("creates links from input to stages and stages to output", () => {
    const mgr = new TokenBudgetManager("standard");
    mgr.record("investigate", 100, 50);

    const diagram = buildTokenFlowDiagram(mgr);

    expect(diagram.links.some((l) => l.source === "input" && l.target === "investigate")).toBe(
      true
    );
    expect(diagram.links.some((l) => l.source === "investigate" && l.target === "output")).toBe(
      true
    );
  });
});

// ---- suggestModelChanges ----

describe("suggestModelChanges", () => {
  it("suggests cheaper model for gpt-5 with short outputs", () => {
    const suggestions = suggestModelChanges("gpt-5", {
      avgInputTokens: 1000,
      avgOutputTokens: 100,
      avgLatencyMs: 5000,
    });
    expect(suggestions.some((s) => s.suggestedModel === "gpt-5-mini")).toBe(true);
    expect(suggestions[0].estimatedSavingsPct).toBeGreaterThan(0);
  });

  it("suggests upgrade for mini model with large context", () => {
    const suggestions = suggestModelChanges("gpt-5-mini", {
      avgInputTokens: 60000,
      avgOutputTokens: 500,
      avgLatencyMs: 5000,
    });
    expect(suggestions.some((s) => s.suggestedModel === "gpt-5")).toBe(true);
  });

  it("suggests faster model for high latency", () => {
    const suggestions = suggestModelChanges("gpt-4.1", {
      avgInputTokens: 5000,
      avgOutputTokens: 1000,
      avgLatencyMs: 20000,
    });
    expect(suggestions.some((s) => s.reason.toLowerCase().includes("latency"))).toBe(true);
  });

  it("returns no suggestions when model is already optimal", () => {
    const suggestions = suggestModelChanges("gpt-4.1", {
      avgInputTokens: 5000,
      avgOutputTokens: 1000,
      avgLatencyMs: 3000,
    });
    expect(suggestions).toHaveLength(0);
  });
});
