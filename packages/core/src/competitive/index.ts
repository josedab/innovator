/**
 * @module competitive
 *
 * Competitive Intelligence Angle: analyze competitors to generate differentiation
 * strategies, identify competitive gaps, and discover flanking opportunities.
 * Accepts competitor names/URLs and generates AI-powered competitive analysis.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for a competitor profile. */
export const CompetitorProfileSchema = z.object({
  name: z.string().max(500),
  url: z.string().max(500).optional(),
  description: z.string().max(2000),
  strengths: z.array(z.string().max(500)).max(10),
  weaknesses: z.array(z.string().max(500)).max(10),
  keyProducts: z.array(z.string().max(500)).max(10),
  targetMarket: z.string().max(1000),
  estimatedSize: z.enum(["startup", "small", "medium", "large", "enterprise"]).optional(),
  fundingStage: z.string().max(200).optional(),
});

/** Schema for a competitive gap. */
export const CompetitiveGapSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  gap_type: z.enum(["feature", "market", "pricing", "experience", "technology", "distribution"]),
  opportunity_size: z.enum(["small", "medium", "large", "massive"]),
  difficulty: z.enum(["easy", "moderate", "hard", "very-hard"]),
  timeToCapture: z.enum(["weeks", "months", "quarters", "years"]),
});

/** Schema for a differentiation strategy. */
export const DifferentiationStrategySchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  type: z.enum([
    "cost-leadership",
    "feature-differentiation",
    "niche-focus",
    "experience-differentiation",
    "technology-moat",
    "network-effects",
    "brand-positioning",
    "speed-to-market",
  ]),
  competitorsTargeted: z.array(z.string().max(500)).max(10),
  requiredCapabilities: z.array(z.string().max(500)).max(10),
  riskLevel: z.enum(["low", "medium", "high"]),
  expectedImpact: z.enum(["incremental", "significant", "transformative"]),
});

/** Schema for a flanking opportunity. */
export const FlankingOpportunitySchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  targetSegment: z.string().max(500),
  approach: z.string().max(2000),
  competitorBlindSpot: z.string().max(1000),
  winProbability: z.number().min(0).max(1),
});

/** Schema for the full competitive analysis. */
export const CompetitiveAnalysisSchema = z.object({
  subject: z.string().max(2000),
  competitors: z.array(CompetitorProfileSchema).max(20),
  gaps: z.array(CompetitiveGapSchema).max(20),
  strategies: z.array(DifferentiationStrategySchema).max(10),
  flankingOpportunities: z.array(FlankingOpportunitySchema).max(10),
  marketPositionSummary: z.string().max(5000),
  recommendedActions: z.array(z.string().max(1000)).max(10),
});

// ---- Types ----

export type CompetitorProfile = z.infer<typeof CompetitorProfileSchema>;
export type CompetitiveGap = z.infer<typeof CompetitiveGapSchema>;
export type DifferentiationStrategy = z.infer<typeof DifferentiationStrategySchema>;
export type FlankingOpportunity = z.infer<typeof FlankingOpportunitySchema>;
export type CompetitiveAnalysis = z.infer<typeof CompetitiveAnalysisSchema>;

// ---- In-memory store ----

const analysisStore: Map<string, CompetitiveAnalysis> = new Map();

// ---- Prompt builders ----

function buildCompetitivePrompt(
  subject: string,
  competitors: Array<{ name: string; url?: string }>,
  investigation?: Investigation
): string {
  const competitorList = competitors
    .map((c) => `- ${c.name}${c.url ? ` (${c.url})` : ""}`)
    .join("\n");

  const context = investigation
    ? `\nINVESTIGATION CONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}\nOpportunities: ${investigation.opportunities.join("; ")}`
    : "";

  return `You are a competitive intelligence analyst and strategy expert. Analyze the competitive landscape for the following subject.

${wrapUserInput("SUBJECT", subject)}

COMPETITORS TO ANALYZE:
"""
${sanitizeLlmOutput(competitorList)}
"""
${context}

Provide a comprehensive competitive analysis including:
1. **competitors**: Detailed profile for each competitor (strengths, weaknesses, key products, target market)
2. **gaps**: Competitive gaps and unserved opportunities in the market
3. **strategies**: Differentiation strategies to win against these competitors
4. **flankingOpportunities**: Indirect attack vectors through underserved segments or blind spots
5. **marketPositionSummary**: Overall market position and dynamics
6. **recommendedActions**: Top 5-8 priority actions

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "subject": "the subject",
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "What they do",
      "strengths": ["strength 1"],
      "weaknesses": ["weakness 1"],
      "keyProducts": ["product 1"],
      "targetMarket": "Their target market",
      "estimatedSize": "medium"
    }
  ],
  "gaps": [
    {
      "title": "Gap title",
      "description": "Gap description",
      "gap_type": "feature|market|pricing|experience|technology|distribution",
      "opportunity_size": "large",
      "difficulty": "moderate",
      "timeToCapture": "months"
    }
  ],
  "strategies": [
    {
      "title": "Strategy title",
      "description": "Strategy description",
      "type": "feature-differentiation",
      "competitorsTargeted": ["Competitor 1"],
      "requiredCapabilities": ["capability 1"],
      "riskLevel": "medium",
      "expectedImpact": "significant"
    }
  ],
  "flankingOpportunities": [
    {
      "title": "Opportunity title",
      "description": "Opportunity description",
      "targetSegment": "Underserved segment",
      "approach": "How to approach",
      "competitorBlindSpot": "Why competitors miss this",
      "winProbability": 0.7
    }
  ],
  "marketPositionSummary": "Overall analysis...",
  "recommendedActions": ["Action 1", "Action 2"]
}`;
}

// ---- Core functions ----

/**
 * Run a competitive intelligence analysis.
 */
export async function analyzeCompetitors(
  subject: string,
  competitors: Array<{ name: string; url?: string }>,
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<CompetitiveAnalysis> {
  if (competitors.length === 0) {
    throw new Error("At least one competitor is required for analysis");
  }

  const prompt = buildCompetitivePrompt(subject, competitors, investigation);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse competitive analysis as JSON: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const analysis = CompetitiveAnalysisSchema.parse(parsed);
  analysisStore.set(subject, analysis);
  return analysis;
}

/**
 * Get a stored competitive analysis.
 */
export function getCompetitiveAnalysis(subject: string): CompetitiveAnalysis | undefined {
  return analysisStore.get(subject);
}

/**
 * List all stored competitive analyses.
 */
export function listCompetitiveAnalyses(): CompetitiveAnalysis[] {
  return Array.from(analysisStore.values());
}

/**
 * Clear all stored analyses.
 */
export function clearCompetitiveAnalyses(): void {
  analysisStore.clear();
}

/**
 * Rank competitive gaps by opportunity score (size vs difficulty).
 */
export function rankGaps(gaps: CompetitiveGap[]): CompetitiveGap[] {
  const sizeScore: Record<string, number> = { massive: 4, large: 3, medium: 2, small: 1 };
  const difficultyScore: Record<string, number> = { easy: 4, moderate: 3, hard: 2, "very-hard": 1 };

  return [...gaps].sort((a, b) => {
    const scoreA = sizeScore[a.opportunity_size] * difficultyScore[a.difficulty];
    const scoreB = sizeScore[b.opportunity_size] * difficultyScore[b.difficulty];
    return scoreB - scoreA;
  });
}

/**
 * Rank differentiation strategies by expected impact and risk.
 */
export function rankStrategies(strategies: DifferentiationStrategy[]): DifferentiationStrategy[] {
  const impactScore: Record<string, number> = { transformative: 3, significant: 2, incremental: 1 };
  const riskScore: Record<string, number> = { low: 3, medium: 2, high: 1 };

  return [...strategies].sort((a, b) => {
    const scoreA = impactScore[a.expectedImpact] * riskScore[a.riskLevel];
    const scoreB = impactScore[b.expectedImpact] * riskScore[b.riskLevel];
    return scoreB - scoreA;
  });
}

/**
 * Generate a competitive positioning matrix summary.
 */
export function generatePositioningMatrix(
  analysis: CompetitiveAnalysis
): Array<{
  competitor: string;
  strengths: number;
  weaknesses: number;
  threatLevel: "high" | "medium" | "low";
}> {
  return analysis.competitors.map((c) => ({
    competitor: c.name,
    strengths: c.strengths.length,
    weaknesses: c.weaknesses.length,
    threatLevel:
      c.strengths.length > c.weaknesses.length * 2
        ? "high"
        : c.strengths.length > c.weaknesses.length
          ? "medium"
          : "low",
  }));
}

// ---- Continuous Monitoring ----

export const CompetitiveSignalSchema = z.object({
  id: z.string().max(100),
  source: z.enum(["github-trending", "product-hunt", "news", "patent", "manual"]),
  title: z.string().max(500),
  description: z.string().max(2000),
  url: z.string().max(1000).optional(),
  relevanceScore: z.number().min(0).max(1),
  detectedAt: z.string(),
  domain: z.string().max(200).optional(),
  competitor: z.string().max(200).optional(),
  signalType: z.enum(["new-product", "funding", "partnership", "feature-launch", "market-entry", "acquisition", "trend"]),
});

export const MonitorConfigSchema = z.object({
  id: z.string().max(100),
  domain: z.string().max(200),
  competitors: z.array(z.string().max(200)).max(20),
  keywords: z.array(z.string().max(100)).max(20),
  enabled: z.boolean().default(true),
  frequency: z.enum(["hourly", "daily", "weekly"]).default("daily"),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
});

export const MonitorReportSchema = z.object({
  monitorId: z.string().max(100),
  generatedAt: z.string(),
  signals: z.array(CompetitiveSignalSchema).max(100),
  trendSummary: z.array(z.object({
    trend: z.string().max(200),
    direction: z.enum(["rising", "stable", "declining"]),
    signalCount: z.number(),
  })).max(20),
  suggestedInvestigations: z.array(z.string().max(500)).max(10),
});

export type CompetitiveSignal = z.infer<typeof CompetitiveSignalSchema>;
export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;
export type MonitorReport = z.infer<typeof MonitorReportSchema>;

// ---- Monitor Store ----

const monitors = new Map<string, MonitorConfig>();
const signalStore: CompetitiveSignal[] = [];

/**
 * Create a competitive monitor for a domain.
 */
export function createMonitor(
  config: Omit<MonitorConfig, "id">
): MonitorConfig {
  const id = `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nextRun = new Date();
  if (config.frequency === "hourly") nextRun.setHours(nextRun.getHours() + 1);
  else if (config.frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
  else nextRun.setDate(nextRun.getDate() + 7);

  const monitor: MonitorConfig = {
    ...config,
    id,
    nextRunAt: nextRun.toISOString(),
  };
  monitors.set(id, monitor);
  return monitor;
}

/**
 * List all monitors.
 */
export function listMonitors(): MonitorConfig[] {
  return [...monitors.values()];
}

/**
 * Get a monitor by ID.
 */
export function getMonitor(id: string): MonitorConfig | undefined {
  return monitors.get(id);
}

/**
 * Delete a monitor.
 */
export function deleteMonitor(id: string): boolean {
  return monitors.delete(id);
}

/**
 * Record a competitive signal.
 */
export function recordSignal(signal: Omit<CompetitiveSignal, "id" | "detectedAt">): CompetitiveSignal {
  const record: CompetitiveSignal = {
    ...signal,
    id: `signal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    detectedAt: new Date().toISOString(),
  };

  // Deduplicate by title similarity
  const isDuplicate = signalStore.some(
    (s) => s.title.toLowerCase() === record.title.toLowerCase() && s.source === record.source
  );
  if (!isDuplicate) {
    signalStore.push(record);
  }
  return record;
}

/**
 * Get competitive signals, optionally filtered.
 */
export function getSignals(options?: {
  domain?: string;
  source?: CompetitiveSignal["source"];
  minRelevance?: number;
  limit?: number;
}): CompetitiveSignal[] {
  let filtered = [...signalStore];

  if (options?.domain) {
    filtered = filtered.filter((s) => s.domain === options.domain);
  }
  if (options?.source) {
    filtered = filtered.filter((s) => s.source === options.source);
  }
  if (options?.minRelevance) {
    filtered = filtered.filter((s) => s.relevanceScore >= options.minRelevance!);
  }

  filtered.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Detect trends from accumulated signals.
 */
export function detectTrends(domain?: string): MonitorReport["trendSummary"] {
  const signals = domain ? signalStore.filter((s) => s.domain === domain) : signalStore;
  const trendMap = new Map<string, CompetitiveSignal[]>();

  for (const signal of signals) {
    // Group by signal type
    const key = signal.signalType;
    const group = trendMap.get(key) ?? [];
    group.push(signal);
    trendMap.set(key, group);
  }

  return [...trendMap.entries()].map(([trend, sigs]) => {
    // Determine direction based on recency
    const now = Date.now();
    const recentCount = sigs.filter((s) => now - new Date(s.detectedAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
    const olderCount = sigs.length - recentCount;
    const direction = recentCount > olderCount ? "rising" : recentCount === olderCount ? "stable" : "declining";

    return {
      trend,
      direction: direction as "rising" | "stable" | "declining",
      signalCount: sigs.length,
    };
  }).sort((a, b) => b.signalCount - a.signalCount);
}

/**
 * Generate investigation subjects from detected signals.
 */
export function generateInvestigationSuggestions(
  domain?: string,
  limit: number = 5
): string[] {
  const signals = getSignals({ domain, minRelevance: 0.5, limit: 20 });
  const suggestions: string[] = [];

  for (const signal of signals) {
    if (signal.signalType === "new-product") {
      suggestions.push(`Competitive response to "${signal.title}" — how can we differentiate?`);
    } else if (signal.signalType === "market-entry") {
      suggestions.push(`Market impact of ${signal.competitor ?? "competitor"} entering ${signal.domain ?? "our space"}`);
    } else if (signal.signalType === "trend") {
      suggestions.push(`Innovation opportunities from trend: ${signal.title}`);
    } else if (signal.signalType === "funding") {
      suggestions.push(`Strategic implications of ${signal.title}`);
    }
  }

  return [...new Set(suggestions)].slice(0, limit);
}

/** Clear all monitoring data (for testing). */
export function clearMonitoring(): void {
  monitors.clear();
  signalStore.length = 0;
}
