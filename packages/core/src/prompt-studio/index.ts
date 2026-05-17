/**
 * @module prompt-studio
 *
 * Smart Prompt Studio — in-app prompt editor with version management,
 * performance analytics, and template composition tools.
 * Builds on prompt-lab (A/B testing) and prompt-optimizer (genetic evolution).
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const PromptTemplateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000).optional(),
  template: z.string().max(10000),
  variables: z
    .array(
      z.object({
        name: z.string().max(100),
        description: z.string().max(500).optional(),
        defaultValue: z.string().max(1000).optional(),
        required: z.boolean().default(true),
      })
    )
    .max(20),
  tags: z.array(z.string().max(50)).max(10),
  scope: z.enum(["investigation", "generation", "synthesis", "validation", "custom"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const PromptVersionEntrySchema = z.object({
  version: z.number().int().min(1),
  template: z.string().max(10000),
  changeMessage: z.string().max(500),
  author: z.string().max(200).optional(),
  createdAt: z.string(),
});

export type PromptVersionEntry = z.infer<typeof PromptVersionEntrySchema>;

export const PromptPerformanceSchema = z.object({
  templateId: z.string().max(100),
  version: z.number().int().min(1),
  usageCount: z.number().int().min(0),
  avgQualityScore: z.number().min(0).max(100),
  avgResponseTimeMs: z.number().min(0),
  avgTokenCount: z.number().min(0),
  successRate: z.number().min(0).max(1),
  percentiles: z
    .object({
      p25: z.number(),
      p50: z.number(),
      p75: z.number(),
      p95: z.number(),
    })
    .optional(),
  scoreTrend: z.number(),
  lastUsedAt: z.string().optional(),
});

export type PromptPerformance = z.infer<typeof PromptPerformanceSchema>;

export const PromptAnalyticsSchema = z.object({
  templateId: z.string().max(100),
  templateName: z.string().max(200),
  totalVersions: z.number().int().min(0),
  currentVersion: z.number().int().min(1),
  versionPerformance: z.array(PromptPerformanceSchema),
  bestVersion: z.number().int().min(1).optional(),
  overallImprovement: z.number().optional(),
  recommendations: z.array(z.string().max(500)).max(5),
});

export type PromptAnalytics = z.infer<typeof PromptAnalyticsSchema>;

// ---- In-Memory Stores ----

const templates = new Map<string, PromptTemplate>();
const versionHistory = new Map<string, PromptVersionEntry[]>();
const performanceData = new Map<
  string,
  Map<
    number,
    {
      scores: number[];
      responseTimes: number[];
      tokenCounts: number[];
      successes: number;
      failures: number;
    }
  >
>();

// ---- Template Management ----

export function createPromptTemplate(
  config: Omit<PromptTemplate, "id" | "createdAt" | "updatedAt">
): PromptTemplate {
  const template: PromptTemplate = {
    ...config,
    id: `pt-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  templates.set(template.id, template);
  versionHistory.set(template.id, [
    {
      version: 1,
      template: config.template,
      changeMessage: "Initial version",
      createdAt: template.createdAt,
    },
  ]);

  return template;
}

export function getPromptTemplate(templateId: string): PromptTemplate | undefined {
  return templates.get(templateId);
}

export function listPromptTemplates(filter?: {
  scope?: PromptTemplate["scope"];
  tag?: string;
  query?: string;
}): PromptTemplate[] {
  let results = Array.from(templates.values());

  if (filter?.scope) {
    results = results.filter((t) => t.scope === filter.scope);
  }
  if (filter?.tag) {
    const tag = filter.tag.toLowerCase();
    results = results.filter((t) => t.tags.some((tt) => tt.toLowerCase().includes(tag)));
  }
  if (filter?.query) {
    const q = filter.query.toLowerCase();
    results = results.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
    );
  }

  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deletePromptTemplate(templateId: string): boolean {
  versionHistory.delete(templateId);
  performanceData.delete(templateId);
  return templates.delete(templateId);
}

// ---- Version Management ----

export function updatePromptTemplate(
  templateId: string,
  newTemplate: string,
  changeMessage: string,
  author?: string
): PromptTemplate | undefined {
  const template = templates.get(templateId);
  if (!template) return undefined;

  template.template = newTemplate;
  template.updatedAt = new Date().toISOString();

  const history = versionHistory.get(templateId) ?? [];
  history.push({
    version: history.length + 1,
    template: newTemplate,
    changeMessage,
    author,
    createdAt: new Date().toISOString(),
  });

  versionHistory.set(templateId, history);
  return template;
}

export function getVersionHistory(templateId: string): PromptVersionEntry[] {
  return versionHistory.get(templateId) ?? [];
}

export function getTemplateVersion(
  templateId: string,
  version: number
): PromptVersionEntry | undefined {
  return (versionHistory.get(templateId) ?? []).find((v) => v.version === version);
}

export function revertToVersion(templateId: string, version: number): PromptTemplate | undefined {
  const entry = getTemplateVersion(templateId, version);
  if (!entry) return undefined;
  return updatePromptTemplate(templateId, entry.template, `Reverted to version ${version}`);
}

export function diffTemplateVersions(
  templateId: string,
  versionA: number,
  versionB: number
): { additions: string[]; deletions: string[]; unchanged: string[] } | undefined {
  const a = getTemplateVersion(templateId, versionA);
  const b = getTemplateVersion(templateId, versionB);
  if (!a || !b) return undefined;

  const linesA = a.template.split("\n");
  const linesB = b.template.split("\n");
  const setA = new Set(linesA);
  const setB = new Set(linesB);

  return {
    additions: linesB.filter((l) => !setA.has(l)),
    deletions: linesA.filter((l) => !setB.has(l)),
    unchanged: linesA.filter((l) => setB.has(l)),
  };
}

// ---- Performance Recording ----

export function recordPromptExecution(
  templateId: string,
  version: number,
  result: {
    qualityScore: number;
    responseTimeMs: number;
    tokenCount: number;
    success: boolean;
  }
): void {
  if (!templateId?.trim()) {
    throw new ValidationError("Template ID is required");
  }
  if (version < 1 || !Number.isInteger(version)) {
    throw new ValidationError("Version must be a positive integer");
  }
  if (result.qualityScore < 0 || result.qualityScore > 100) {
    throw new ValidationError("Quality score must be between 0 and 100");
  }
  if (result.responseTimeMs < 0) {
    throw new ValidationError("Response time must be non-negative");
  }
  if (result.tokenCount < 0) {
    throw new ValidationError("Token count must be non-negative");
  }
  if (!performanceData.has(templateId)) {
    performanceData.set(templateId, new Map());
  }
  const versionMap = performanceData.get(templateId)!;

  if (!versionMap.has(version)) {
    versionMap.set(version, {
      scores: [],
      responseTimes: [],
      tokenCounts: [],
      successes: 0,
      failures: 0,
    });
  }
  const data = versionMap.get(version)!;

  data.scores.push(result.qualityScore);
  data.responseTimes.push(result.responseTimeMs);
  data.tokenCounts.push(result.tokenCount);
  if (result.success) data.successes++;
  else data.failures++;
}

// ---- Analytics ----

function calculatePercentiles(values: number[]): {
  p25: number;
  p50: number;
  p75: number;
  p95: number;
} {
  if (values.length === 0) return { p25: 0, p50: 0, p75: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.min(Math.floor(pct * sorted.length), sorted.length - 1)];
  return { p25: p(0.25), p50: p(0.5), p75: p(0.75), p95: p(0.95) };
}

function calculateTrend(values: number[], windowSize: number = 10): number {
  if (values.length < 2) return 0;
  const recent = values.slice(-windowSize);
  const first = recent.slice(0, Math.ceil(recent.length / 2));
  const second = recent.slice(Math.ceil(recent.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  return avgSecond - avgFirst;
}

export function getPromptPerformance(
  templateId: string,
  version: number
): PromptPerformance | undefined {
  const data = performanceData.get(templateId)?.get(version);
  if (!data || data.scores.length === 0) return undefined;

  const total = data.successes + data.failures;
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    templateId,
    version,
    usageCount: total,
    avgQualityScore: Math.round(avg(data.scores) * 10) / 10,
    avgResponseTimeMs: Math.round(avg(data.responseTimes)),
    avgTokenCount: Math.round(avg(data.tokenCounts)),
    successRate: total > 0 ? data.successes / total : 0,
    percentiles: calculatePercentiles(data.scores),
    scoreTrend: calculateTrend(data.scores),
  };
}

export function getPromptAnalytics(templateId: string): PromptAnalytics | undefined {
  const template = templates.get(templateId);
  if (!template) return undefined;

  const history = versionHistory.get(templateId) ?? [];
  const versionPerf: PromptPerformance[] = [];
  let bestVersion: number | undefined;
  let bestScore = -1;

  for (const entry of history) {
    const perf = getPromptPerformance(templateId, entry.version);
    if (perf) {
      versionPerf.push(perf);
      if (perf.avgQualityScore > bestScore) {
        bestScore = perf.avgQualityScore;
        bestVersion = entry.version;
      }
    }
  }

  let overallImprovement: number | undefined;
  if (versionPerf.length >= 2) {
    const firstScore = versionPerf[0].avgQualityScore;
    const lastScore = versionPerf[versionPerf.length - 1].avgQualityScore;
    if (firstScore > 0) {
      overallImprovement = ((lastScore - firstScore) / firstScore) * 100;
    }
  }

  const recommendations: string[] = [];
  const latestPerf = versionPerf[versionPerf.length - 1];
  if (latestPerf) {
    if (latestPerf.successRate < 0.9) {
      recommendations.push(
        `Success rate is ${(latestPerf.successRate * 100).toFixed(0)}% — consider simplifying output format`
      );
    }
    if (latestPerf.scoreTrend < -2) {
      recommendations.push("Quality scores declining — review recent changes");
    }
    if (latestPerf.avgTokenCount > 3000) {
      recommendations.push("High token usage — consider making the prompt more concise");
    }
    if (bestVersion && bestVersion !== history.length) {
      recommendations.push(
        `Version ${bestVersion} performed best (${bestScore.toFixed(1)}) — consider reverting`
      );
    }
  }
  if (history.length === 1) {
    recommendations.push("Create variations to run A/B tests and find improvements");
  }

  return {
    templateId,
    templateName: template.name,
    totalVersions: history.length,
    currentVersion: history.length,
    versionPerformance: versionPerf,
    bestVersion,
    overallImprovement,
    recommendations,
  };
}

// ---- Template Interpolation ----

export function interpolateTemplate(
  template: PromptTemplate,
  variables: Record<string, string>
): string {
  let result = template.template;
  for (const variable of template.variables) {
    const value = variables[variable.name] ?? variable.defaultValue ?? "";
    if (variable.required && !value) {
      throw new ValidationError(`Required variable "${variable.name}" is missing`);
    }
    result = result.replace(new RegExp(`\\{${variable.name}\\}`, "g"), value);
  }
  return result;
}

/** Format analytics as markdown. */
export function promptAnalyticsToMarkdown(analytics: PromptAnalytics): string {
  const lines: string[] = [
    `# 📊 Prompt Analytics: ${analytics.templateName}`,
    "",
    `**Versions:** ${analytics.totalVersions} | **Current:** v${analytics.currentVersion}`,
    analytics.bestVersion ? `**Best Version:** v${analytics.bestVersion}` : "",
    analytics.overallImprovement !== undefined
      ? `**Improvement:** ${analytics.overallImprovement > 0 ? "+" : ""}${analytics.overallImprovement.toFixed(1)}%`
      : "",
    "",
  ];

  if (analytics.versionPerformance.length > 0) {
    lines.push("## Performance by Version", "");
    lines.push("| Version | Uses | Avg Score | Success Rate | Tokens | Trend |");
    lines.push("|---------|------|-----------|-------------|--------|-------|");
    for (const perf of analytics.versionPerformance) {
      const trend = perf.scoreTrend > 1 ? "📈" : perf.scoreTrend < -1 ? "📉" : "➡️";
      lines.push(
        `| v${perf.version} | ${perf.usageCount} | ${perf.avgQualityScore.toFixed(1)} | ${(perf.successRate * 100).toFixed(0)}% | ${perf.avgTokenCount} | ${trend} |`
      );
    }
    lines.push("");
  }

  if (analytics.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    for (const rec of analytics.recommendations) lines.push(`- 💡 ${rec}`);
  }

  return lines.filter(Boolean).join("\n");
}

export function clearPromptStudio(): void {
  templates.clear();
  versionHistory.clear();
  performanceData.clear();
}
