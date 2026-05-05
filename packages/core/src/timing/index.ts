/**
 * @module timing
 *
 * Predictive Innovation Timing Engine — analyze market signals, technology
 * maturity curves, and competitive intelligence to predict optimal execution
 * windows for each idea. Classifies ideas as Too Early / Right Time /
 * Peak Window / Late Entry with confidence intervals.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";

// ---- Schemas ----

/** Timing signal source. */
export const TimingSignalSchema = z.object({
  source: z.enum(["hype-cycle", "google-trends", "competitive-density", "regulatory", "funding", "adoption-rate", "patent-filings"]),
  signalName: z.string().max(200),
  value: z.number(),
  trend: z.enum(["rising", "stable", "declining", "volatile"]),
  confidence: z.number().min(0).max(1),
  description: z.string().max(500),
});

/** Timing classification for an idea. */
export const TimingClassificationSchema = z.enum(["too-early", "right-time", "peak-window", "late-entry"]);

/** Timing analysis for a single idea. */
export const IdeaTimingSchema = z.object({
  ideaTitle: z.string().max(500),
  classification: TimingClassificationSchema,
  confidence: z.number().min(0).max(1),
  signals: z.array(TimingSignalSchema).max(20),
  optimalWindowStart: z.string().max(100),
  optimalWindowEnd: z.string().max(100),
  urgencyScore: z.number().min(0).max(100),
  risks: z.array(z.string().max(500)).max(5),
  opportunities: z.array(z.string().max(500)).max(5),
  rationale: z.string().max(2000),
});

/** Full timing analysis result. */
export const TimingAnalysisSchema = z.object({
  subject: z.string().max(2000),
  ideas: z.array(IdeaTimingSchema).max(50),
  marketMaturityStage: z.enum(["emerging", "growing", "mature", "declining"]),
  overallTimingAdvice: z.string().max(2000),
  analyzedAt: z.number(),
});

// ---- Types ----

export type TimingSignal = z.infer<typeof TimingSignalSchema>;
export type TimingClassification = z.infer<typeof TimingClassificationSchema>;
export type IdeaTiming = z.infer<typeof IdeaTimingSchema>;
export type TimingAnalysis = z.infer<typeof TimingAnalysisSchema>;

// ---- In-Memory Store ----

const timingStore = new Map<string, TimingAnalysis>();

// ---- Core Functions ----

/**
 * Analyze timing for a set of ideas.
 *
 * @param subject - Innovation subject
 * @param ideaTitles - List of idea titles with descriptions
 * @param model - Optional LLM model
 * @param signal - Optional AbortSignal
 */
export async function analyzeTimings(
  subject: string,
  ideaTitles: Array<{ title: string; description: string }>,
  model?: string,
  signal?: AbortSignal
): Promise<TimingAnalysis> {
  if (ideaTitles.length === 0) {
    throw new Error("No ideas to analyze timing for");
  }

  const ideasList = ideaTitles.map((idea, i) =>
    `${i + 1}. "${sanitizeLlmOutput(idea.title)}": ${sanitizeLlmOutput(idea.description)}`
  ).join("\n");

  const prompt = `You are a market timing strategist analyzing the optimal execution window for innovation ideas.

${wrapUserInput("SUBJECT", subject)}

IDEAS TO ANALYZE:
${ideasList}

For each idea, assess timing by analyzing:
1. Technology maturity (Gartner hype cycle position)
2. Market trends (search interest, funding activity)
3. Competitive density (how crowded is the space)
4. Regulatory trajectory (enabling or restricting)
5. Adoption readiness (is the market ready)

Classify each idea as:
- "too-early": Market not ready, technology immature
- "right-time": Optimal conditions, strong signals
- "peak-window": Window closing soon, act now
- "late-entry": Market saturated, high competition

Return valid JSON only:
{
  "ideas": [
    {
      "ideaTitle": "Exact idea title",
      "classification": "too-early|right-time|peak-window|late-entry",
      "confidence": 0.8,
      "signals": [
        {
          "source": "hype-cycle|google-trends|competitive-density|regulatory|funding|adoption-rate|patent-filings",
          "signalName": "Signal description",
          "value": 7.5,
          "trend": "rising|stable|declining|volatile",
          "confidence": 0.8,
          "description": "What this signal means"
        }
      ],
      "optimalWindowStart": "Q2 2025",
      "optimalWindowEnd": "Q4 2026",
      "urgencyScore": 75,
      "risks": ["risk1"],
      "opportunities": ["opportunity1"],
      "rationale": "Why this timing classification"
    }
  ],
  "marketMaturityStage": "emerging|growing|mature|declining",
  "overallTimingAdvice": "Strategic timing advice for the portfolio"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse timing analysis: ${jsonStr.slice(0, 200)}`);
      }
    },
    { signal, isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse") }
  );

  const rawResult = z.object({
    ideas: z.array(IdeaTimingSchema).max(50),
    marketMaturityStage: z.enum(["emerging", "growing", "mature", "declining"]),
    overallTimingAdvice: z.string().max(2000),
  }).parse(parsed);

  const result: TimingAnalysis = {
    subject,
    ...rawResult,
    analyzedAt: Date.now(),
  };

  timingStore.set(subject, result);
  return result;
}

/**
 * Get stored timing analysis.
 */
export function getTimingAnalysis(subject: string): TimingAnalysis | undefined {
  return timingStore.get(subject);
}

/**
 * List all timing analyses.
 */
export function listTimingAnalyses(): TimingAnalysis[] {
  return [...timingStore.values()];
}

/**
 * Get ideas that are in the "peak-window" or "right-time" classification.
 */
export function getActionableIdeas(analysis: TimingAnalysis): IdeaTiming[] {
  return analysis.ideas.filter(
    (i) => i.classification === "right-time" || i.classification === "peak-window"
  ).sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Format timing analysis as Markdown.
 */
export function timingToMarkdown(analysis: TimingAnalysis): string {
  const classificationEmoji: Record<string, string> = {
    "too-early": "🕐",
    "right-time": "✅",
    "peak-window": "🔥",
    "late-entry": "⚠️",
  };

  const lines: string[] = [
    `# ⏰ Innovation Timing Analysis: ${analysis.subject}`,
    "",
    `**Market Maturity:** ${analysis.marketMaturityStage}`,
    `**Analyzed:** ${new Date(analysis.analyzedAt).toISOString().slice(0, 10)}`,
    "",
    "## Idea Timing",
    "",
    "| Idea | Classification | Urgency | Window | Confidence |",
    "|------|---------------|---------|--------|------------|",
  ];

  for (const idea of analysis.ideas) {
    const emoji = classificationEmoji[idea.classification] ?? "";
    lines.push(
      `| ${idea.ideaTitle} | ${emoji} ${idea.classification} | ${idea.urgencyScore}/100 | ${idea.optimalWindowStart} - ${idea.optimalWindowEnd} | ${(idea.confidence * 100).toFixed(0)}% |`
    );
  }

  lines.push("");
  for (const idea of analysis.ideas) {
    lines.push(`### ${idea.ideaTitle}`);
    lines.push(`**Classification:** ${classificationEmoji[idea.classification] ?? ""} ${idea.classification}`);
    lines.push(`**Rationale:** ${idea.rationale}`);
    if (idea.signals.length > 0) {
      lines.push("**Key Signals:**");
      for (const s of idea.signals.slice(0, 3)) {
        lines.push(`- ${s.signalName} (${s.source}): ${s.trend}, confidence ${(s.confidence * 100).toFixed(0)}%`);
      }
    }
    lines.push("");
  }

  lines.push("## Overall Advice", "", analysis.overallTimingAdvice);
  return lines.join("\n");
}

/**
 * Clear all timing data (for testing).
 */
export function clearTimingData(): void {
  timingStore.clear();
}
