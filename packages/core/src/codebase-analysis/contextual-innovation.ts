/**
 * @module codebase-analysis/contextual-innovation
 *
 * Contextual Codebase Innovation — scans repositories for tech debt and
 * opportunities, runs the innovation pipeline on code context, and generates
 * PR-ready improvement proposals. Unique developer-facing feature.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { CodePattern, CodebaseSubject } from "./index.js";

// ---- Schemas ----

export const TechDebtItemSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  description: z.string().max(2000),
  category: z.enum([
    "code-quality",
    "architecture",
    "dependency",
    "testing",
    "documentation",
    "performance",
    "security",
    "accessibility",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  effort: z.enum(["trivial", "small", "medium", "large", "epic"]),
  files: z.array(z.string().max(500)).max(20),
  suggestedFix: z.string().max(2000).optional(),
  innovationOpportunity: z.string().max(1000).optional(),
});

export type TechDebtItem = z.infer<typeof TechDebtItemSchema>;

export const CodeInnovationSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  description: z.string().max(3000),
  category: z.enum([
    "refactoring",
    "new-feature",
    "architecture-improvement",
    "performance-optimization",
    "developer-experience",
    "testing-improvement",
    "security-hardening",
  ]),
  impact: z.enum(["low", "medium", "high", "transformative"]),
  effort: z.enum(["trivial", "small", "medium", "large", "epic"]),
  /** Specific files to modify. */
  affectedFiles: z.array(z.string().max(500)).max(30),
  /** PR title suggestion. */
  prTitle: z.string().max(200),
  /** PR body content. */
  prBody: z.string().max(5000),
  /** Feature branch name. */
  branchName: z.string().max(100),
  /** Implementation steps. */
  steps: z.array(z.string().max(500)).max(10),
  /** Source patterns that inspired this innovation. */
  sourcePatterns: z.array(z.string().max(200)).max(5),
});

export type CodeInnovation = z.infer<typeof CodeInnovationSchema>;

export const CodebaseInnovationReportSchema = z.object({
  id: z.string().max(100),
  repositoryPath: z.string().max(1000),
  /** Tech debt items discovered. */
  techDebt: z.array(TechDebtItemSchema).max(50),
  /** Innovation proposals generated. */
  innovations: z.array(CodeInnovationSchema).max(20),
  /** Summary statistics. */
  stats: z.object({
    filesScanned: z.number().int().min(0),
    patternsFound: z.number().int().min(0),
    techDebtItems: z.number().int().min(0),
    innovationsGenerated: z.number().int().min(0),
    totalEstimatedEffort: z.string().max(200),
  }),
  generatedAt: z.string(),
});

export type CodebaseInnovationReport = z.infer<typeof CodebaseInnovationReportSchema>;

// ---- Tech Debt Scanner ----

/**
 * Analyze code patterns to identify tech debt items.
 * Converts raw code patterns into actionable tech debt items.
 */
export function identifyTechDebt(patterns: CodePattern[]): TechDebtItem[] {
  return patterns
    .filter((p) =>
      [
        "anti-pattern",
        "tech-debt",
        "complexity-hotspot",
        "security-concern",
        "performance-bottleneck",
      ].includes(p.type)
    )
    .map((p) => {
      const categoryMap: Record<string, TechDebtItem["category"]> = {
        "anti-pattern": "code-quality",
        "tech-debt": "architecture",
        "complexity-hotspot": "code-quality",
        "security-concern": "security",
        "performance-bottleneck": "performance",
        "missing-abstraction": "architecture",
        "dependency-risk": "dependency",
      };

      const effortMap: Record<string, TechDebtItem["effort"]> = {
        low: "small",
        medium: "medium",
        high: "large",
      };

      return TechDebtItemSchema.parse({
        id: `debt-${randomUUID().slice(0, 8)}`,
        title: p.name,
        description: p.description,
        category: categoryMap[p.type] ?? "code-quality",
        severity: p.severity,
        effort: effortMap[p.severity] ?? "medium",
        files: p.locations.slice(0, 20),
        innovationOpportunity:
          p.innovationPotential > 0.6
            ? `High innovation potential (${(p.innovationPotential * 100).toFixed(0)}%): this area could benefit from a novel approach.`
            : undefined,
      });
    });
}

// ---- Innovation from Code Context ----

const CodeInnovationLLMResponseSchema = z.object({
  innovations: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      category: z.enum([
        "refactoring",
        "new-feature",
        "architecture-improvement",
        "performance-optimization",
        "developer-experience",
        "testing-improvement",
        "security-hardening",
      ]),
      impact: z.enum(["low", "medium", "high", "transformative"]),
      effort: z.enum(["trivial", "small", "medium", "large", "epic"]),
      affectedFiles: z.array(z.string()).max(30),
      prTitle: z.string(),
      steps: z.array(z.string()).max(10),
    })
  ),
});

/**
 * Run the innovation pipeline on codebase context to generate
 * improvement proposals from tech debt and code patterns.
 */
export async function generateCodeInnovations(
  techDebt: TechDebtItem[],
  subjects: CodebaseSubject[],
  repoContext: string,
  config?: { model?: string; signal?: AbortSignal; maxInnovations?: number }
): Promise<CodeInnovation[]> {
  const debtContext = techDebt
    .slice(0, 10)
    .map((d) => `- [${d.severity}] ${d.title}: ${d.description.slice(0, 200)}`)
    .join("\n");

  const subjectContext = subjects
    .slice(0, 10)
    .map((s) => `- ${s.subject}: ${s.rationale?.slice(0, 200) ?? ""}`)
    .join("\n");

  const prompt = `You are a senior software architect identifying innovation opportunities in a codebase.

Repository Context: ${wrapUserInput("REPO", repoContext.slice(0, 2000))}

Tech Debt Found:
${wrapUserInput("DEBT", debtContext)}

Innovation Subjects:
${wrapUserInput("SUBJECTS", subjectContext)}

Generate ${config?.maxInnovations ?? 5} concrete innovation proposals that:
1. Address real technical problems found in the codebase
2. Go beyond simple fixes — propose novel architectural improvements
3. Include specific files to modify and implementation steps
4. Generate PR-ready titles and descriptions

Respond in JSON:
{
  "innovations": [
    {
      "title": "Innovation title",
      "description": "Detailed description of the improvement...",
      "category": "refactoring",
      "impact": "high",
      "effort": "medium",
      "affectedFiles": ["src/module/file.ts"],
      "prTitle": "refactor: implement X pattern for Y",
      "steps": ["Step 1: ...", "Step 2: ..."]
    }
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config?.model, signal: config?.signal });
      return CodeInnovationLLMResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
    },
    { signal: config?.signal }
  );

  return result.innovations.slice(0, config?.maxInnovations ?? 5).map((inn) => {
    const slug = inn.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);
    const sourcePatterns = techDebt
      .filter((d) =>
        inn.affectedFiles.some((f) => d.files.some((df) => f.includes(df) || df.includes(f)))
      )
      .map((d) => d.title)
      .slice(0, 5);

    return CodeInnovationSchema.parse({
      id: `ci-${randomUUID().slice(0, 8)}`,
      title: inn.title.slice(0, 300),
      description: inn.description.slice(0, 3000),
      category: inn.category,
      impact: inn.impact,
      effort: inn.effort,
      affectedFiles: inn.affectedFiles.slice(0, 30).map((f) => f.slice(0, 500)),
      prTitle: inn.prTitle.slice(0, 200),
      prBody: [
        `## Description\n`,
        inn.description,
        "",
        `## Changes`,
        "",
        ...inn.steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        `## Affected Files`,
        "",
        ...inn.affectedFiles.map((f) => `- \`${f}\``),
        "",
        `---`,
        `*Generated by Innovator Codebase Innovation Pipeline*`,
      ]
        .join("\n")
        .slice(0, 5000),
      branchName: `innovate/${slug}`,
      steps: inn.steps.slice(0, 10).map((s) => String(s).slice(0, 500)),
      sourcePatterns,
    });
  });
}

// ---- Full Pipeline ----

/**
 * Run a full contextual codebase innovation pipeline.
 * Scans patterns, identifies tech debt, and generates innovations.
 */
export function buildCodebaseInnovationReport(
  repositoryPath: string,
  patterns: CodePattern[],
  subjects: CodebaseSubject[],
  innovations: CodeInnovation[]
): CodebaseInnovationReport {
  const techDebt = identifyTechDebt(patterns);

  const effortEstimate = innovations.reduce((sum, inn) => {
    const effortDays: Record<string, number> = {
      trivial: 0.5,
      small: 2,
      medium: 5,
      large: 15,
      epic: 40,
    };
    return sum + (effortDays[inn.effort] ?? 5);
  }, 0);

  return CodebaseInnovationReportSchema.parse({
    id: `cir-${randomUUID().slice(0, 8)}`,
    repositoryPath,
    techDebt,
    innovations,
    stats: {
      filesScanned: patterns.reduce((s, p) => s + p.locations.length, 0),
      patternsFound: patterns.length,
      techDebtItems: techDebt.length,
      innovationsGenerated: innovations.length,
      totalEstimatedEffort: `${Math.round(effortEstimate)} person-days`,
    },
    generatedAt: new Date().toISOString(),
  });
}

/** Format the report as markdown. */
export function codebaseInnovationReportToMarkdown(report: CodebaseInnovationReport): string {
  const lines: string[] = [
    `# 🔬 Codebase Innovation Report`,
    "",
    `**Repository:** ${report.repositoryPath}`,
    `**Files Scanned:** ${report.stats.filesScanned}`,
    `**Patterns Found:** ${report.stats.patternsFound}`,
    `**Tech Debt Items:** ${report.stats.techDebtItems}`,
    `**Innovations Generated:** ${report.stats.innovationsGenerated}`,
    `**Estimated Effort:** ${report.stats.totalEstimatedEffort}`,
    "",
  ];

  if (report.techDebt.length > 0) {
    lines.push("## Tech Debt", "");
    lines.push("| Severity | Category | Title | Effort |");
    lines.push("|----------|----------|-------|--------|");
    for (const item of report.techDebt.slice(0, 15)) {
      const icon =
        item.severity === "critical"
          ? "🔴"
          : item.severity === "high"
            ? "🟠"
            : item.severity === "medium"
              ? "🟡"
              : "🟢";
      lines.push(
        `| ${icon} ${item.severity} | ${item.category} | ${item.title} | ${item.effort} |`
      );
    }
    lines.push("");
  }

  if (report.innovations.length > 0) {
    lines.push("## Innovation Proposals", "");
    for (const inn of report.innovations) {
      lines.push(`### ${inn.prTitle}`);
      lines.push("");
      lines.push(
        `**Impact:** ${inn.impact} | **Effort:** ${inn.effort} | **Category:** ${inn.category}`
      );
      lines.push(`**Branch:** \`${inn.branchName}\``);
      lines.push("");
      lines.push(inn.description.slice(0, 500));
      lines.push("");
      if (inn.steps.length > 0) {
        lines.push("**Steps:**");
        for (const step of inn.steps) {
          lines.push(`1. ${step}`);
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}
