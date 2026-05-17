/**
 * @module mining
 *
 * Cross-investigation pattern mining — analyzes patterns across investigations
 * to discover meta-insights about domain-angle effectiveness. Includes ETL
 * pipeline, statistical analysis (chi-squared, correlation), and AI-narrated
 * insights generation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import { LlmParseError } from "../errors.js";

// ---- Schemas ----

/** A single data point extracted from investigation history. */
export const MiningDataPointSchema = z.object({
  subjectDomain: z.string().max(200),
  angleId: z.string().max(100),
  ideaQualityScore: z.number().min(0).max(10),
  userRating: z.number().min(0).max(10).optional(),
  timestamp: z.number(),
  sessionId: z.string().max(200).optional(),
});

/** Angle effectiveness statistics for a specific domain. */
export const AngleEffectivenessSchema = z.object({
  angleId: z.string().max(100),
  domain: z.string().max(200),
  meanQuality: z.number(),
  medianQuality: z.number(),
  stdDev: z.number(),
  sampleSize: z.number(),
  effectivenessRank: z.number().min(1),
});

/** Domain-angle heatmap cell. */
export const HeatmapCellSchema = z.object({
  domain: z.string().max(200),
  angleId: z.string().max(100),
  score: z.number(),
  sampleSize: z.number(),
});

/** Cross-domain correlation entry. */
export const CorrelationEntrySchema = z.object({
  domainA: z.string().max(200),
  domainB: z.string().max(200),
  correlation: z.number().min(-1).max(1),
});

/** Statistical test result. */
export const StatisticalTestSchema = z.object({
  testName: z.string().max(200),
  statistic: z.number(),
  pValue: z.number().min(0).max(1),
  significant: z.boolean(),
  description: z.string().max(500),
});

/** AI-narrated insight. */
export const NarratedInsightSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  category: z.enum(["effectiveness", "pattern", "anomaly", "recommendation"]),
  supportingData: z.string().max(1000).optional(),
});

/** Full mining report. */
export const MiningReportSchema = z.object({
  dataPointCount: z.number(),
  domains: z.array(z.string()).max(100),
  angleEffectiveness: z.array(AngleEffectivenessSchema).max(500),
  heatmap: z.array(HeatmapCellSchema).max(500),
  correlations: z.array(CorrelationEntrySchema).max(500),
  statisticalTests: z.array(StatisticalTestSchema).max(50),
  insights: z.array(NarratedInsightSchema).max(20),
  generatedAt: z.number(),
});

// ---- Types ----

export type MiningDataPoint = z.infer<typeof MiningDataPointSchema>;
export type AngleEffectiveness = z.infer<typeof AngleEffectivenessSchema>;
export type HeatmapCell = z.infer<typeof HeatmapCellSchema>;
export type CorrelationEntry = z.infer<typeof CorrelationEntrySchema>;
export type StatisticalTest = z.infer<typeof StatisticalTestSchema>;
export type NarratedInsight = z.infer<typeof NarratedInsightSchema>;
export type MiningReport = z.infer<typeof MiningReportSchema>;

// ---- In-Memory Data Store ----

const dataStore: MiningDataPoint[] = [];

/**
 * Ingest data points into the mining pipeline.
 *
 * @param points - Array of data points to ingest
 */
export function ingestDataPoints(points: MiningDataPoint[]): void {
  for (const point of points) {
    dataStore.push(MiningDataPointSchema.parse(point));
  }
}

/**
 * Get all ingested data points.
 */
export function getDataPoints(): MiningDataPoint[] {
  return [...dataStore];
}

/**
 * Clear all ingested data.
 */
export function clearMiningData(): void {
  dataStore.length = 0;
}

// ---- Statistical Functions ----

/**
 * Compute angle effectiveness statistics grouped by domain.
 *
 * @param data - Data points to analyze
 * @returns Array of angle effectiveness entries per domain
 */
export function computeAngleEffectiveness(data: MiningDataPoint[]): AngleEffectiveness[] {
  const grouped = new Map<string, MiningDataPoint[]>();

  for (const point of data) {
    const key = `${point.subjectDomain}::${point.angleId}`;
    const existing = grouped.get(key) ?? [];
    existing.push(point);
    grouped.set(key, existing);
  }

  const results: AngleEffectiveness[] = [];

  for (const [key, points] of grouped) {
    const [domain, angleId] = key.split("::");
    const scores = points.map((p) => p.ideaQualityScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sorted = [...scores].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    const variance =
      scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / Math.max(scores.length - 1, 1);
    const stdDev = Math.sqrt(variance);

    results.push({
      angleId,
      domain,
      meanQuality: Math.round(mean * 100) / 100,
      medianQuality: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      sampleSize: points.length,
      effectivenessRank: 0, // computed after sorting
    });
  }

  // Compute ranks within each domain
  const byDomain = new Map<string, AngleEffectiveness[]>();
  for (const r of results) {
    const existing = byDomain.get(r.domain) ?? [];
    existing.push(r);
    byDomain.set(r.domain, existing);
  }
  for (const entries of byDomain.values()) {
    entries.sort((a, b) => b.meanQuality - a.meanQuality);
    entries.forEach((e, i) => {
      e.effectivenessRank = i + 1;
    });
  }

  return results;
}

/**
 * Build a domain-angle heatmap from data points.
 *
 * @param data - Data points to build heatmap from
 * @returns Array of heatmap cells
 */
export function buildHeatmap(data: MiningDataPoint[]): HeatmapCell[] {
  const grouped = new Map<string, number[]>();

  for (const point of data) {
    const key = `${point.subjectDomain}::${point.angleId}`;
    const scores = grouped.get(key) ?? [];
    scores.push(point.ideaQualityScore);
    grouped.set(key, scores);
  }

  return Array.from(grouped.entries()).map(([key, scores]) => {
    const [domain, angleId] = key.split("::");
    return {
      domain,
      angleId,
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
      sampleSize: scores.length,
    };
  });
}

/**
 * Compute cross-domain correlation matrix using Pearson correlation.
 *
 * @param data - Data points to analyze
 * @returns Array of correlation entries between domain pairs
 */
export function computeCorrelationMatrix(data: MiningDataPoint[]): CorrelationEntry[] {
  const domains = [...new Set(data.map((d) => d.subjectDomain))];
  const results: CorrelationEntry[] = [];

  // Build domain score vectors keyed by angleId
  const domainVectors = new Map<string, Map<string, number[]>>();
  for (const point of data) {
    if (!domainVectors.has(point.subjectDomain)) {
      domainVectors.set(point.subjectDomain, new Map());
    }
    const angles = domainVectors.get(point.subjectDomain)!;
    const scores = angles.get(point.angleId) ?? [];
    scores.push(point.ideaQualityScore);
    angles.set(point.angleId, scores);
  }

  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const vecA = domainVectors.get(domains[i]);
      const vecB = domainVectors.get(domains[j]);
      if (!vecA || !vecB) continue;

      // Use shared angles to compute correlation
      const sharedAngles = [...vecA.keys()].filter((a) => vecB.has(a));
      if (sharedAngles.length < 2) continue;

      const aScores = sharedAngles.map(
        (a) => vecA.get(a)!.reduce((s, v) => s + v, 0) / vecA.get(a)!.length
      );
      const bScores = sharedAngles.map(
        (a) => vecB.get(a)!.reduce((s, v) => s + v, 0) / vecB.get(a)!.length
      );

      results.push({
        domainA: domains[i],
        domainB: domains[j],
        correlation: Math.round(pearsonCorrelation(aScores, bScores) * 100) / 100,
      });
    }
  }

  return results;
}

/**
 * Run chi-squared test for angle effectiveness independence across domains.
 *
 * @param data - Data points to test
 * @returns Statistical test result
 */
export function chiSquaredAngleEffectiveness(data: MiningDataPoint[]): StatisticalTest {
  const domains = [...new Set(data.map((d) => d.subjectDomain))];
  const angles = [...new Set(data.map((d) => d.angleId))];

  if (domains.length < 2 || angles.length < 2) {
    return {
      testName: "Chi-Squared Angle Effectiveness",
      statistic: 0,
      pValue: 1,
      significant: false,
      description: "Insufficient data for chi-squared test (need 2+ domains and 2+ angles)",
    };
  }

  // Build contingency table: count of "high quality" (>=7) vs "low quality" (<7)
  const observed = new Map<string, { high: number; low: number }>();
  for (const point of data) {
    const key = `${point.subjectDomain}::${point.angleId}`;
    const cell = observed.get(key) ?? { high: 0, low: 0 };
    if (point.ideaQualityScore >= 7) {
      cell.high++;
    } else {
      cell.low++;
    }
    observed.set(key, cell);
  }

  const total = data.length;
  const totalHigh = data.filter((d) => d.ideaQualityScore >= 7).length;
  const totalLow = total - totalHigh;

  let chiSquared = 0;
  const df = (domains.length - 1) * (angles.length - 1);

  for (const domain of domains) {
    const domainTotal = data.filter((d) => d.subjectDomain === domain).length;
    for (const angle of angles) {
      const cell = observed.get(`${domain}::${angle}`) ?? { high: 0, low: 0 };
      const angleTotal = data.filter((d) => d.angleId === angle).length;

      const expectedHigh = (domainTotal * angleTotal * (totalHigh / total)) / total;
      const expectedLow = (domainTotal * angleTotal * (totalLow / total)) / total;

      if (expectedHigh > 0) {
        chiSquared += (cell.high - expectedHigh) ** 2 / expectedHigh;
      }
      if (expectedLow > 0) {
        chiSquared += (cell.low - expectedLow) ** 2 / expectedLow;
      }
    }
  }

  // Approximate p-value using chi-squared distribution (simplified)
  const pValue = approximateChiSquaredPValue(chiSquared, df);

  return {
    testName: "Chi-Squared Angle Effectiveness",
    statistic: Math.round(chiSquared * 100) / 100,
    pValue: Math.round(pValue * 10000) / 10000,
    significant: pValue < 0.05,
    description: `Chi-squared test for independence between domain and angle effectiveness (df=${df})`,
  };
}

/**
 * Generate a full mining report with statistics and AI-narrated insights.
 *
 * @param data - Data points to analyze (defaults to ingested store)
 * @param model - Optional LLM model for narrated insights
 * @param signal - Optional AbortSignal
 * @returns Complete mining report
 */
export async function generateMiningReport(
  data?: MiningDataPoint[],
  model?: string,
  signal?: AbortSignal
): Promise<MiningReport> {
  const points = data ?? dataStore;
  const domains = [...new Set(points.map((d) => d.subjectDomain))];
  const effectiveness = computeAngleEffectiveness(points);
  const heatmap = buildHeatmap(points);
  const correlations = computeCorrelationMatrix(points);
  const chiTest = chiSquaredAngleEffectiveness(points);
  const statisticalTests = [chiTest];

  let insights: NarratedInsight[] = [];
  if (points.length > 0) {
    try {
      insights = await generateNarratedInsights(
        effectiveness,
        heatmap,
        correlations,
        model,
        signal
      );
    } catch {
      insights = [
        {
          title: "Automated Insights Unavailable",
          description:
            "Could not generate AI-narrated insights. Review the statistical data manually.",
          confidence: 1,
          category: "pattern",
        },
      ];
    }
  }

  return {
    dataPointCount: points.length,
    domains,
    angleEffectiveness: effectiveness,
    heatmap,
    correlations,
    statisticalTests,
    insights,
    generatedAt: Date.now(),
  };
}

// ---- Internal Helpers ----

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/** Simplified chi-squared p-value approximation. */
function approximateChiSquaredPValue(chiSq: number, df: number): number {
  if (df <= 0 || chiSq <= 0) return 1;
  // Wilson-Hilferty approximation
  const z = Math.pow(chiSq / df, 1 / 3) - (1 - 2 / (9 * df));
  const se = Math.sqrt(2 / (9 * df));
  const standardNormal = z / se;
  // Approximate using logistic function
  return 1 / (1 + Math.exp(0.07056 * standardNormal ** 3 + 1.5976 * standardNormal));
}

async function generateNarratedInsights(
  effectiveness: AngleEffectiveness[],
  heatmap: HeatmapCell[],
  correlations: CorrelationEntry[],
  model?: string,
  signal?: AbortSignal
): Promise<NarratedInsight[]> {
  const statsContext = {
    topAngles: effectiveness.filter((e) => e.effectivenessRank <= 3).slice(0, 10),
    heatmapSample: heatmap.slice(0, 20),
    strongCorrelations: correlations.filter((c) => Math.abs(c.correlation) > 0.5),
  };

  const prompt = `You are an innovation analytics expert narrating data insights.

STATISTICAL DATA:
${sanitizeLlmOutput(JSON.stringify(statsContext, null, 2))}

Generate 3-5 key insights about innovation patterns. Categories: effectiveness, pattern, anomaly, recommendation.

Return valid JSON only:
{
  "insights": [
    { "title": "...", "description": "...", "confidence": 0.85, "category": "pattern", "supportingData": "..." }
  ]
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse mining insights: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  const result = z.object({ insights: z.array(NarratedInsightSchema).max(20) }).parse(parsed);
  return result.insights;
}
