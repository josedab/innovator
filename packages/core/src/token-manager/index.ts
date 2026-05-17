/**
 * @module token-manager
 *
 * Intelligent context window management with per-stage token counting,
 * budget allocation profiles, context compression via extractive summarization,
 * and token flow visualization data.
 */

import { z } from "zod";

// ---- Schemas ----

export const TokenBudgetProfileSchema = z.object({
  name: z.string().max(100),
  totalBudget: z.number().min(1),
  allocation: z.object({
    investigate: z.number().min(0).max(1).default(0.25),
    generate: z.number().min(0).max(1).default(0.45),
    synthesize: z.number().min(0).max(1).default(0.2),
    score: z.number().min(0).max(1).default(0.1),
  }),
});
export type TokenBudgetProfile = z.infer<typeof TokenBudgetProfileSchema>;

export const StageTokenAccountSchema = z.object({
  stage: z.string().max(100),
  budgeted: z.number().min(0),
  used: z.number().min(0).default(0),
  inputTokens: z.number().min(0).default(0),
  outputTokens: z.number().min(0).default(0),
  remaining: z.number().min(0),
  utilizationPct: z.number().min(0).max(100).default(0),
  truncated: z.boolean().default(false),
  compressionApplied: z.boolean().default(false),
});
export type StageTokenAccount = z.infer<typeof StageTokenAccountSchema>;

export const TokenFlowNodeSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  tokens: z.number().min(0),
  costUsd: z.number().min(0).default(0),
});
export type TokenFlowNode = z.infer<typeof TokenFlowNodeSchema>;

export const TokenFlowLinkSchema = z.object({
  source: z.string().max(100),
  target: z.string().max(100),
  value: z.number().min(0),
});
export type TokenFlowLink = z.infer<typeof TokenFlowLinkSchema>;

export const TokenFlowDiagramSchema = z.object({
  nodes: z.array(TokenFlowNodeSchema).max(50),
  links: z.array(TokenFlowLinkSchema).max(100),
  totalTokens: z.number().min(0),
  totalCostUsd: z.number().min(0),
});
export type TokenFlowDiagram = z.infer<typeof TokenFlowDiagramSchema>;

export const ModelSuggestionSchema = z.object({
  currentModel: z.string().max(100),
  suggestedModel: z.string().max(100),
  reason: z.string().max(500),
  estimatedSavingsPct: z.number().min(0).max(100),
  tradeoff: z.string().max(500),
});
export type ModelSuggestion = z.infer<typeof ModelSuggestionSchema>;

// ---- Built-in Profiles ----

export const BUDGET_PROFILES: Record<string, TokenBudgetProfile> = {
  standard: {
    name: "Standard",
    totalBudget: 128000,
    allocation: { investigate: 0.25, generate: 0.45, synthesize: 0.2, score: 0.1 },
  },
  economy: {
    name: "Economy",
    totalBudget: 32000,
    allocation: { investigate: 0.2, generate: 0.5, synthesize: 0.2, score: 0.1 },
  },
  premium: {
    name: "Premium",
    totalBudget: 200000,
    allocation: { investigate: 0.3, generate: 0.4, synthesize: 0.2, score: 0.1 },
  },
  "investigation-heavy": {
    name: "Investigation-Heavy",
    totalBudget: 128000,
    allocation: { investigate: 0.4, generate: 0.35, synthesize: 0.15, score: 0.1 },
  },
};

// ---- Token Counting ----

/** Estimate token count using character-based heuristic (4 chars ≈ 1 token). */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Count tokens with word-based refinement for more accuracy. */
export function countTokensRefined(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  // ~1.3 tokens per word on average for English
  const wordEstimate = Math.ceil(words.length * 1.3);
  const charEstimate = Math.ceil(text.length / 4);
  return Math.round((wordEstimate + charEstimate) / 2);
}

// ---- Token Budget Manager ----

export class TokenBudgetManager {
  private profile: TokenBudgetProfile;
  private accounts = new Map<string, StageTokenAccount>();
  private warnings: string[] = [];
  private static readonly MAX_WARNINGS = 200;

  constructor(profile: TokenBudgetProfile | string = "standard") {
    this.profile =
      typeof profile === "string"
        ? (BUDGET_PROFILES[profile] ?? BUDGET_PROFILES.standard)
        : profile;

    this.initializeAccounts();
  }

  private initializeAccounts(): void {
    for (const [stage, fraction] of Object.entries(this.profile.allocation)) {
      const budgeted = Math.floor(this.profile.totalBudget * fraction);
      this.accounts.set(stage, {
        stage,
        budgeted,
        used: 0,
        inputTokens: 0,
        outputTokens: 0,
        remaining: budgeted,
        utilizationPct: 0,
        truncated: false,
        compressionApplied: false,
      });
    }
  }

  /** Record token usage for a stage. */
  record(stage: string, inputTokens: number, outputTokens: number): StageTokenAccount {
    let account = this.accounts.get(stage);
    if (!account) {
      account = {
        stage,
        budgeted: 0,
        used: 0,
        inputTokens: 0,
        outputTokens: 0,
        remaining: 0,
        utilizationPct: 0,
        truncated: false,
        compressionApplied: false,
      };
      this.accounts.set(stage, account);
    }

    const totalTokens = inputTokens + outputTokens;
    account.used += totalTokens;
    account.inputTokens += inputTokens;
    account.outputTokens += outputTokens;
    account.remaining = Math.max(0, account.budgeted - account.used);
    account.utilizationPct =
      account.budgeted > 0 ? Math.round((account.used / account.budgeted) * 100 * 10) / 10 : 0;

    // Warning when approaching budget
    if (account.utilizationPct >= 80 && account.utilizationPct < 100) {
      this.warnings.push(`Stage "${stage}" at ${account.utilizationPct}% of token budget`);
    } else if (account.utilizationPct >= 100) {
      account.truncated = true;
      this.warnings.push(`Stage "${stage}" exceeded token budget (${account.utilizationPct}%)`);
    }
    // Cap warnings to prevent unbounded growth
    if (this.warnings.length > TokenBudgetManager.MAX_WARNINGS) {
      this.warnings.splice(0, this.warnings.length - TokenBudgetManager.MAX_WARNINGS);
    }

    return account;
  }

  /** Check if a stage has budget remaining. */
  hasRemainingBudget(stage: string, requiredTokens: number): boolean {
    const account = this.accounts.get(stage);
    if (!account) return true;
    return account.remaining >= requiredTokens;
  }

  /** Get account for a stage. */
  getAccount(stage: string): StageTokenAccount | undefined {
    return this.accounts.get(stage);
  }

  /** Get all accounts. */
  getAllAccounts(): StageTokenAccount[] {
    return Array.from(this.accounts.values());
  }

  /** Get total usage across all stages. */
  getTotalUsage(): { used: number; budgeted: number; remainingPct: number } {
    let used = 0;
    let budgeted = 0;
    for (const account of this.accounts.values()) {
      used += account.used;
      budgeted += account.budgeted;
    }
    return {
      used,
      budgeted,
      remainingPct: budgeted > 0 ? Math.round(((budgeted - used) / budgeted) * 100 * 10) / 10 : 0,
    };
  }

  /** Get warnings. */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /** Clear warnings. */
  clearWarnings(): void {
    this.warnings = [];
  }

  /** Reset all accounts. */
  reset(): void {
    this.initializeAccounts();
    this.warnings = [];
  }
}

// ---- Context Compression (TF-IDF Extractive Summarization) ----

interface _TermFrequency {
  term: string;
  tf: number;
  idf: number;
  tfidf: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Compute TF-IDF scores for sentences. */
function computeTfIdf(sentences: string[]): Map<number, number> {
  const docFreq = new Map<string, number>();
  const sentenceTokens = sentences.map((s) => tokenize(s));

  // Document frequency
  for (const tokens of sentenceTokens) {
    const unique = new Set(tokens);
    for (const token of unique) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
  }

  // Score each sentence by sum of TF-IDF
  const scores = new Map<number, number>();
  const N = sentences.length;

  for (let i = 0; i < sentenceTokens.length; i++) {
    const tokens = sentenceTokens[i];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const [term, count] of tf) {
      const termTf = count / tokens.length;
      const idf = Math.log(N / (docFreq.get(term) ?? 1));
      score += termTf * idf;
    }

    scores.set(i, score);
  }

  return scores;
}

/**
 * Compress text to fit within a token budget using extractive summarization.
 * Selects the highest-scoring sentences by TF-IDF until the budget is met.
 */
export function compressContext(
  text: string,
  maxTokens: number
): {
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
} {
  const originalTokens = countTokens(text);

  if (originalTokens <= maxTokens) {
    return {
      compressed: text,
      originalTokens,
      compressedTokens: originalTokens,
      compressionRatio: 1,
    };
  }

  // Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length <= 1) {
    const truncated = text.slice(0, maxTokens * 4);
    return {
      compressed: truncated,
      originalTokens,
      compressedTokens: countTokens(truncated),
      compressionRatio: countTokens(truncated) / originalTokens,
    };
  }

  const scores = computeTfIdf(sentences);

  // Rank sentences by TF-IDF score
  const ranked = Array.from(scores.entries()).sort(([, a], [, b]) => b - a);

  // Select top sentences until budget is reached, maintaining original order
  const selected = new Set<number>();
  let currentTokens = 0;

  for (const [idx] of ranked) {
    const sentenceTokens = countTokens(sentences[idx]);
    if (currentTokens + sentenceTokens > maxTokens) continue;
    selected.add(idx);
    currentTokens += sentenceTokens;
  }

  // Reconstruct in original order
  const compressed = sentences.filter((_, i) => selected.has(i)).join(" ");

  const compressedTokens = countTokens(compressed);

  return {
    compressed,
    originalTokens,
    compressedTokens,
    compressionRatio: Math.round((compressedTokens / originalTokens) * 100) / 100,
  };
}

// ---- Token Flow Visualization ----

/** Build Sankey diagram data for token flow across pipeline stages. */
export function buildTokenFlowDiagram(
  manager: TokenBudgetManager,
  costPerToken = 0.00003
): TokenFlowDiagram {
  const accounts = manager.getAllAccounts();
  const nodes: TokenFlowNode[] = [{ id: "input", label: "Context Input", tokens: 0, costUsd: 0 }];
  const links: TokenFlowLink[] = [];
  let totalTokens = 0;

  for (const account of accounts) {
    nodes.push({
      id: account.stage,
      label: account.stage,
      tokens: account.used,
      costUsd: Math.round(account.used * costPerToken * 10000) / 10000,
    });

    if (account.inputTokens > 0) {
      links.push({
        source: "input",
        target: account.stage,
        value: account.inputTokens,
      });
      nodes[0].tokens += account.inputTokens;
    }

    totalTokens += account.used;
  }

  nodes[0].costUsd = Math.round(nodes[0].tokens * costPerToken * 10000) / 10000;

  // Add output node
  nodes.push({
    id: "output",
    label: "Generated Output",
    tokens: accounts.reduce((s, a) => s + a.outputTokens, 0),
    costUsd: 0,
  });

  for (const account of accounts) {
    if (account.outputTokens > 0) {
      links.push({
        source: account.stage,
        target: "output",
        value: account.outputTokens,
      });
    }
  }

  const totalCostUsd = Math.round(totalTokens * costPerToken * 10000) / 10000;

  return { nodes, links, totalTokens, totalCostUsd };
}

// ---- Model Upgrade Suggestions ----

/** Suggest model upgrades/downgrades based on usage patterns. */
export function suggestModelChanges(
  currentModel: string,
  usageStats: { avgInputTokens: number; avgOutputTokens: number; avgLatencyMs: number }
): ModelSuggestion[] {
  const suggestions: ModelSuggestion[] = [];

  // If using expensive model with short outputs, suggest cheaper
  if (currentModel.includes("gpt-5") && usageStats.avgOutputTokens < 500) {
    suggestions.push({
      currentModel,
      suggestedModel: "gpt-5-mini",
      reason: "Short output lengths suggest a smaller model would suffice",
      estimatedSavingsPct: 60,
      tradeoff: "Slightly lower quality for simple tasks",
    });
  }

  // If using mini model with long context, suggest upgrade
  if (currentModel.includes("mini") && usageStats.avgInputTokens > 50000) {
    suggestions.push({
      currentModel,
      suggestedModel: currentModel.replace("-mini", ""),
      reason: "Large context windows benefit from full-size models",
      estimatedSavingsPct: -100,
      tradeoff: "Higher cost but better long-context comprehension",
    });
  }

  // High latency suggests looking at faster models
  if (usageStats.avgLatencyMs > 15000) {
    suggestions.push({
      currentModel,
      suggestedModel: "gpt-5-mini",
      reason: "High latency detected — a faster model could improve throughput",
      estimatedSavingsPct: 40,
      tradeoff: "Faster but potentially lower quality",
    });
  }

  return suggestions;
}
