import type { TokenUsage, CostSummary, BudgetConfig } from "./types.js";
import { estimateCost } from "./pricing.js";

/** Approximate token count using a simple heuristic (4 chars ≈ 1 token). */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Cost tracker that records token usage across an entire session
 * and enforces optional budget caps.
 */
export class CostTracker {
  private records: TokenUsage[] = [];
  private budget: BudgetConfig | null = null;
  private counter = 0;

  /** Set a budget cap for this tracker. */
  setBudget(config: BudgetConfig): void {
    this.budget = config;
  }

  /** Get current budget config. */
  getBudget(): BudgetConfig | null {
    return this.budget;
  }

  /** Record a token usage entry. */
  record(
    model: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    stage: string
  ): TokenUsage {
    const costUsd = estimateCost(model, inputTokens, outputTokens);

    const usage: TokenUsage = {
      id: `usage-${++this.counter}`,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      stage,
      timestamp: new Date().toISOString(),
    };

    this.records.push(usage);

    // Check budget
    if (this.budget) {
      const totalCost = this.getTotalCost();
      if (totalCost >= this.budget.maxCostUsd) {
        this.budget.abortController?.abort(
          `Budget exceeded: $${totalCost.toFixed(4)} >= $${this.budget.maxCostUsd.toFixed(4)}`
        );
      }
    }

    return usage;
  }

  /** Get total cost so far. */
  getTotalCost(): number {
    return this.records.reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** Get all usage records. */
  getRecords(): TokenUsage[] {
    return [...this.records];
  }

  /** Get aggregated cost summary. */
  getSummary(): CostSummary {
    const summary: CostSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
      callCount: this.records.length,
      byModel: {},
      byStage: {},
    };

    for (const r of this.records) {
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;
      summary.totalCostUsd += r.costUsd;
      summary.totalLatencyMs += r.latencyMs;

      if (!summary.byModel[r.model]) {
        summary.byModel[r.model] = { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
      }
      summary.byModel[r.model].inputTokens += r.inputTokens;
      summary.byModel[r.model].outputTokens += r.outputTokens;
      summary.byModel[r.model].costUsd += r.costUsd;
      summary.byModel[r.model].calls += 1;

      if (!summary.byStage[r.stage]) {
        summary.byStage[r.stage] = { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
      }
      summary.byStage[r.stage].inputTokens += r.inputTokens;
      summary.byStage[r.stage].outputTokens += r.outputTokens;
      summary.byStage[r.stage].costUsd += r.costUsd;
      summary.byStage[r.stage].calls += 1;
    }

    return summary;
  }

  /** Clear all records. */
  clear(): void {
    this.records = [];
    this.counter = 0;
  }
}

/** Global singleton cost tracker. */
let globalTracker: CostTracker | null = null;

/** Get or create the global cost tracker. */
export function getCostTracker(): CostTracker {
  if (!globalTracker) {
    globalTracker = new CostTracker();
  }
  return globalTracker;
}

/** Reset the global cost tracker. */
export function resetCostTracker(): void {
  globalTracker = null;
}
