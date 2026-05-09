/**
 * @module effort-estimator
 *
 * Estimation of implementation effort for innovation ideas.
 * Produces person-weeks, required skills, tech stack recommendations,
 * and risk assessments. Leverages codebase context when available
 * for more accurate estimates grounded in the team's technical landscape.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { InnovationIdea } from "../types.js";

// ---- Phase & Enum Constants ----

export const PHASES = [
  "research",
  "design",
  "implementation",
  "testing",
  "deployment",
  "maintenance",
] as const;

export const SKILL_LEVELS = ["junior", "mid", "senior", "expert"] as const;

export const IMPORTANCE_LEVELS = ["required", "recommended", "nice-to-have"] as const;

export const AVAILABILITY_LEVELS = ["common", "moderate", "rare"] as const;

export const TECH_CATEGORIES = [
  "frontend",
  "backend",
  "database",
  "infrastructure",
  "ml",
  "other",
] as const;

export const MATURITY_LEVELS = ["experimental", "emerging", "stable", "mature"] as const;

export const PROBABILITY_LEVELS = ["low", "medium", "high"] as const;

export const IMPACT_LEVELS = ["low", "medium", "high"] as const;

export const COMPLEXITY_BIASES = ["conservative", "moderate", "aggressive"] as const;

// ---- Zod Schemas ----

/** Schema for a phase-level effort estimate. */
export const PhaseEstimateSchema = z.object({
  phase: z.enum(PHASES),
  personWeeks: z.number().min(0),
  description: z.string().max(2000),
  parallelizable: z.boolean(),
});

/** Schema for a required skill. */
export const SkillRequirementSchema = z.object({
  skill: z.string().max(200),
  level: z.enum(SKILL_LEVELS),
  importance: z.enum(IMPORTANCE_LEVELS),
  availability: z.enum(AVAILABILITY_LEVELS),
});

/** Schema for a technology recommendation. */
export const TechRecommendationSchema = z.object({
  category: z.enum(TECH_CATEGORIES),
  technology: z.string().max(200),
  rationale: z.string().max(1000),
  alternatives: z.array(z.string().max(200)).max(10),
  maturity: z.enum(MATURITY_LEVELS),
});

/** Schema for an implementation risk. */
export const ImplementationRiskSchema = z.object({
  description: z.string().max(1000),
  probability: z.enum(PROBABILITY_LEVELS),
  impact: z.enum(IMPACT_LEVELS),
  mitigation: z.string().max(1000),
});

/** Schema for a full effort estimate of a single idea. */
export const EffortEstimateSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaId: z.string().max(200),
  totalPersonWeeks: z.number().min(0),
  confidence: z.number().min(0).max(1),
  breakdown: z.array(PhaseEstimateSchema).max(20),
  requiredSkills: z.array(SkillRequirementSchema).max(30),
  techStack: z.array(TechRecommendationSchema).max(20),
  risks: z.array(ImplementationRiskSchema).max(20),
  assumptions: z.array(z.string().max(1000)).max(20),
});

/** Schema for estimator configuration. */
export const EstimatorConfigSchema = z.object({
  includeCodebaseContext: z.boolean().default(false),
  teamSize: z.number().int().min(1).max(200).default(3),
  existingStack: z.array(z.string().max(200)).max(50).default([]),
  complexityBias: z.enum(COMPLEXITY_BIASES).default("moderate"),
  includeMaintenanceCost: z.boolean().default(true),
});

/** Schema for codebase context used to improve estimates. */
export const CodebaseContextSchema = z.object({
  languages: z.array(z.string().max(100)).max(30),
  frameworks: z.array(z.string().max(100)).max(30),
  loc: z.number().int().min(0),
  testCoverage: z.number().min(0).max(100).optional(),
  existingPatterns: z.array(z.string().max(500)).max(30),
});

/** Schema for a roadmap item in the prioritized plan. */
export const RoadmapItemSchema = z.object({
  ideaTitle: z.string().max(500),
  phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  startWeek: z.number().int().min(0),
  endWeek: z.number().int().min(0),
  dependencies: z.array(z.string().max(500)).max(20),
});

/** Schema for batch estimation results. */
export const BatchEstimateResultSchema = z.object({
  ideas: z.array(EffortEstimateSchema).max(100),
  totalEffort: z.number().min(0),
  prioritizedRoadmap: z.array(RoadmapItemSchema).max(100),
});

// ---- Types ----

export type PhaseEstimate = z.infer<typeof PhaseEstimateSchema>;
export type SkillRequirement = z.infer<typeof SkillRequirementSchema>;
export type TechRecommendation = z.infer<typeof TechRecommendationSchema>;
export type ImplementationRisk = z.infer<typeof ImplementationRiskSchema>;
export type EffortEstimate = z.infer<typeof EffortEstimateSchema>;
export type EstimatorConfig = z.infer<typeof EstimatorConfigSchema>;
export type CodebaseContext = z.infer<typeof CodebaseContextSchema>;
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type BatchEstimateResult = z.infer<typeof BatchEstimateResultSchema>;

// ---- Helpers ----

function buildEstimationPrompt(idea: InnovationIdea, config: EstimatorConfig): string {
  const biasNote =
    config.complexityBias === "conservative"
      ? "Err on the higher end of estimates."
      : config.complexityBias === "aggressive"
        ? "Assume best-case scenarios with experienced developers."
        : "Provide balanced, realistic estimates.";

  const stackNote =
    config.existingStack.length > 0
      ? `\nThe team already uses: ${config.existingStack.join(", ")}.`
      : "";

  const maintenanceNote = config.includeMaintenanceCost
    ? "\nInclude a maintenance phase estimate for the first 6 months post-launch."
    : "";

  return `Estimate the implementation effort for the following innovation idea.
Team size: ${config.teamSize} developers.
${biasNote}${stackNote}${maintenanceNote}

## Idea
**Title:** ${idea.title}
**Description:** ${idea.description}
**Potential Impact:** ${idea.potentialImpact}
**Implementation Hint:** ${idea.implementationHint}

Respond in JSON:
{
  "totalPersonWeeks": <number>,
  "confidence": <0-1>,
  "breakdown": [
    { "phase": "research|design|implementation|testing|deployment|maintenance", "personWeeks": <number>, "description": "<what this phase involves>", "parallelizable": <boolean> }
  ],
  "requiredSkills": [
    { "skill": "<skill name>", "level": "junior|mid|senior|expert", "importance": "required|recommended|nice-to-have", "availability": "common|moderate|rare" }
  ],
  "techStack": [
    { "category": "frontend|backend|database|infrastructure|ml|other", "technology": "<name>", "rationale": "<why>", "alternatives": ["<alt1>"], "maturity": "experimental|emerging|stable|mature" }
  ],
  "risks": [
    { "description": "<risk>", "probability": "low|medium|high", "impact": "low|medium|high", "mitigation": "<how to mitigate>" }
  ],
  "assumptions": ["<assumption1>"]
}`;
}

function generateIdeaId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

// ---- Core Functions ----

/** Estimate effort for a single innovation idea using LLM analysis. */
export async function estimateEffort(
  idea: InnovationIdea,
  config?: Partial<EstimatorConfig>,
): Promise<EffortEstimate> {
  const resolvedConfig = EstimatorConfigSchema.parse(config ?? {});
  const prompt = buildEstimationPrompt(idea, resolvedConfig);

  const raw = await withRetry(() =>
    generateText({ prompt, serverMode: true }),
  );
  const parsed = JSON.parse(extractJson(raw));

  const estimate: EffortEstimate = {
    ideaTitle: idea.title,
    ideaId: generateIdeaId(idea.title),
    totalPersonWeeks: parsed.totalPersonWeeks ?? 0,
    confidence: parsed.confidence ?? 0.5,
    breakdown: parsed.breakdown ?? [],
    requiredSkills: parsed.requiredSkills ?? [],
    techStack: parsed.techStack ?? [],
    risks: parsed.risks ?? [],
    assumptions: parsed.assumptions ?? [],
  };

  return EffortEstimateSchema.parse(estimate);
}

/** Batch estimate effort for multiple ideas with cross-idea dependency detection. */
export async function estimateEffortBatch(
  ideas: InnovationIdea[],
  config?: Partial<EstimatorConfig>,
): Promise<BatchEstimateResult> {
  const resolvedConfig = EstimatorConfigSchema.parse(config ?? {});
  const estimates: EffortEstimate[] = [];

  for (const idea of ideas) {
    const estimate = await estimateEffort(idea, resolvedConfig);
    estimates.push(estimate);
  }

  const roadmap = await buildRoadmap(estimates, resolvedConfig.teamSize);
  const totalEffort = estimates.reduce((sum, e) => sum + e.totalPersonWeeks, 0);

  return BatchEstimateResultSchema.parse({
    ideas: estimates,
    totalEffort,
    prioritizedRoadmap: roadmap,
  });
}

/** Generate a prioritized roadmap from effort estimates. */
export async function buildRoadmap(
  estimates: EffortEstimate[],
  teamSize?: number,
): Promise<RoadmapItem[]> {
  const size = teamSize ?? 3;

  const summaries = estimates
    .map(
      (e) =>
        `- "${e.ideaTitle}": ${e.totalPersonWeeks} person-weeks, confidence ${e.confidence}`,
    )
    .join("\n");

  const prompt = `Given these effort estimates and a team of ${size} developers, create a prioritized implementation roadmap.
Assign each idea to a phase (1 = immediate, 2 = next quarter, 3 = future).
Determine start and end weeks, and note any dependencies between ideas.

## Estimates
${summaries}

Respond in JSON:
{
  "roadmap": [
    { "ideaTitle": "<title>", "phase": 1|2|3, "startWeek": <number>, "endWeek": <number>, "dependencies": ["<other idea title>"] }
  ]
}`;

  const raw = await withRetry(() =>
    generateText({ prompt, serverMode: true }),
  );
  const parsed = JSON.parse(extractJson(raw));

  const items: RoadmapItem[] = (parsed.roadmap ?? []).map(
    (item: Record<string, unknown>) =>
      RoadmapItemSchema.parse({
        ideaTitle: String(item.ideaTitle ?? ""),
        phase: item.phase ?? 1,
        startWeek: item.startWeek ?? 0,
        endWeek: item.endWeek ?? 0,
        dependencies: Array.isArray(item.dependencies)
          ? item.dependencies.map(String)
          : [],
      }),
  );

  return items;
}

/** Estimate effort with additional codebase context for improved accuracy. */
export async function estimateWithCodebaseContext(
  idea: InnovationIdea,
  codebaseContext: CodebaseContext,
  config?: Partial<EstimatorConfig>,
): Promise<EffortEstimate> {
  const resolvedConfig = EstimatorConfigSchema.parse({
    ...config,
    includeCodebaseContext: true,
  });

  const contextBlock = `
## Codebase Context
- **Languages:** ${codebaseContext.languages.join(", ")}
- **Frameworks:** ${codebaseContext.frameworks.join(", ")}
- **Lines of code:** ${codebaseContext.loc.toLocaleString()}
- **Test coverage:** ${codebaseContext.testCoverage != null ? `${codebaseContext.testCoverage}%` : "unknown"}
- **Existing patterns:** ${codebaseContext.existingPatterns.join(", ")}
`;

  const basePrompt = buildEstimationPrompt(idea, resolvedConfig);
  const prompt = basePrompt + contextBlock;

  const raw = await withRetry(() =>
    generateText({ prompt, serverMode: true }),
  );
  const parsed = JSON.parse(extractJson(raw));

  const estimate: EffortEstimate = {
    ideaTitle: idea.title,
    ideaId: generateIdeaId(idea.title),
    totalPersonWeeks: parsed.totalPersonWeeks ?? 0,
    confidence: parsed.confidence ?? 0.5,
    breakdown: parsed.breakdown ?? [],
    requiredSkills: parsed.requiredSkills ?? [],
    techStack: parsed.techStack ?? [],
    risks: parsed.risks ?? [],
    assumptions: parsed.assumptions ?? [],
  };

  return EffortEstimateSchema.parse(estimate);
}

/** Extract codebase context by analyzing the project directory. */
export async function analyzeCodebaseContext(
  rootDir?: string,
): Promise<CodebaseContext> {
  const dir = rootDir ?? process.cwd();
  const { execSync } = await import("node:child_process");

  let loc = 0;
  try {
    const wcOutput = execSync(
      `find "${dir}" -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \\) -not -path "*/node_modules/*" -not -path "*/.git/*" | xargs wc -l 2>/dev/null | tail -1`,
      { encoding: "utf-8" },
    ).trim();
    const match = wcOutput.match(/(\d+)/);
    if (match) loc = parseInt(match[1], 10);
  } catch {
    // Silently default to 0
  }

  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const existingPatterns: string[] = [];

  // Detect languages by file extension
  try {
    const files = execSync(
      `find "${dir}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -500`,
      { encoding: "utf-8" },
    );
    if (files.includes(".ts") || files.includes(".tsx")) languages.add("TypeScript");
    if (files.includes(".js") || files.includes(".jsx")) languages.add("JavaScript");
    if (files.includes(".py")) languages.add("Python");
    if (files.includes(".go")) languages.add("Go");
    if (files.includes(".rs")) languages.add("Rust");
    if (files.includes(".java")) languages.add("Java");
  } catch {
    // Silently ignore
  }

  // Detect frameworks from package.json
  try {
    const { readFileSync } = await import("node:fs");
    const pkgJson = JSON.parse(
      readFileSync(`${dir}/package.json`, "utf-8"),
    );
    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };
    if (allDeps["react"]) frameworks.add("React");
    if (allDeps["next"]) frameworks.add("Next.js");
    if (allDeps["vue"]) frameworks.add("Vue");
    if (allDeps["express"]) frameworks.add("Express");
    if (allDeps["fastify"]) frameworks.add("Fastify");
    if (allDeps["zod"]) existingPatterns.push("Zod schema validation");
    if (allDeps["vitest"] || allDeps["jest"]) existingPatterns.push("Unit testing");
    if (allDeps["typescript"]) existingPatterns.push("TypeScript strict mode");
  } catch {
    // No package.json or parse error
  }

  // Detect test coverage from coverage summary
  let testCoverage: number | undefined;
  try {
    const { readFileSync } = await import("node:fs");
    const coverageSummary = JSON.parse(
      readFileSync(`${dir}/coverage/coverage-summary.json`, "utf-8"),
    );
    testCoverage = coverageSummary?.total?.lines?.pct;
  } catch {
    // No coverage data available
  }

  return CodebaseContextSchema.parse({
    languages: Array.from(languages),
    frameworks: Array.from(frameworks),
    loc,
    testCoverage,
    existingPatterns,
  });
}

/** Format an effort estimate as a readable markdown report. */
export function formatEstimateMarkdown(estimate: EffortEstimate): string {
  const lines: string[] = [];

  lines.push(`# Effort Estimate: ${estimate.ideaTitle}`);
  lines.push("");
  lines.push(`**Total Effort:** ${estimate.totalPersonWeeks} person-weeks`);
  lines.push(`**Confidence:** ${(estimate.confidence * 100).toFixed(0)}%`);
  lines.push("");

  // Phase breakdown
  lines.push("## Phase Breakdown");
  lines.push("");
  lines.push("| Phase | Person-Weeks | Parallelizable | Description |");
  lines.push("|-------|-------------|----------------|-------------|");
  for (const phase of estimate.breakdown) {
    lines.push(
      `| ${phase.phase} | ${phase.personWeeks} | ${phase.parallelizable ? "✓" : "✗"} | ${phase.description} |`,
    );
  }
  lines.push("");

  // Required skills
  if (estimate.requiredSkills.length > 0) {
    lines.push("## Required Skills");
    lines.push("");
    lines.push("| Skill | Level | Importance | Availability |");
    lines.push("|-------|-------|------------|--------------|");
    for (const skill of estimate.requiredSkills) {
      lines.push(
        `| ${skill.skill} | ${skill.level} | ${skill.importance} | ${skill.availability} |`,
      );
    }
    lines.push("");
  }

  // Tech stack
  if (estimate.techStack.length > 0) {
    lines.push("## Recommended Tech Stack");
    lines.push("");
    for (const tech of estimate.techStack) {
      lines.push(
        `- **${tech.technology}** (${tech.category}, ${tech.maturity}): ${tech.rationale}`,
      );
      if (tech.alternatives.length > 0) {
        lines.push(`  - Alternatives: ${tech.alternatives.join(", ")}`);
      }
    }
    lines.push("");
  }

  // Risks
  if (estimate.risks.length > 0) {
    lines.push("## Risks");
    lines.push("");
    for (const risk of estimate.risks) {
      lines.push(
        `- **[${risk.probability}/${risk.impact}]** ${risk.description}`,
      );
      lines.push(`  - Mitigation: ${risk.mitigation}`);
    }
    lines.push("");
  }

  // Assumptions
  if (estimate.assumptions.length > 0) {
    lines.push("## Assumptions");
    lines.push("");
    for (const assumption of estimate.assumptions) {
      lines.push(`- ${assumption}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Format a roadmap as a markdown table with timeline visualization. */
export function formatRoadmapMarkdown(roadmap: RoadmapItem[]): string {
  const lines: string[] = [];

  lines.push("# Implementation Roadmap");
  lines.push("");
  lines.push("| Idea | Phase | Start Week | End Week | Dependencies |");
  lines.push("|------|-------|-----------|----------|--------------|");

  const sorted = [...roadmap].sort(
    (a, b) => a.phase - b.phase || a.startWeek - b.startWeek,
  );

  for (const item of sorted) {
    const deps =
      item.dependencies.length > 0 ? item.dependencies.join(", ") : "—";
    lines.push(
      `| ${item.ideaTitle} | Phase ${item.phase} | ${item.startWeek} | ${item.endWeek} | ${deps} |`,
    );
  }

  lines.push("");

  // Gantt-like timeline
  if (sorted.length > 0) {
    const maxWeek = Math.max(...sorted.map((i) => i.endWeek), 1);
    lines.push("## Timeline");
    lines.push("");
    lines.push(
      `\`\`\``,
    );
    for (const item of sorted) {
      const title = item.ideaTitle.slice(0, 25).padEnd(25);
      const bar = Array.from({ length: maxWeek + 1 }, (_, w) =>
        w >= item.startWeek && w <= item.endWeek ? "█" : "·",
      ).join("");
      lines.push(`${title} |${bar}|`);
    }
    lines.push(
      `${"".padEnd(25)} |${Array.from({ length: maxWeek + 1 }, (_, w) => (w % 5 === 0 ? String(w).charAt(0) : " ")).join("")}|`,
    );
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/** Compare multiple estimates by effort-to-impact ratio. */
export function compareEstimates(
  estimates: EffortEstimate[],
): Array<{
  ideaTitle: string;
  totalPersonWeeks: number;
  confidence: number;
  riskCount: number;
  requiredSkillsCount: number;
  score: number;
}> {
  return estimates
    .map((e) => {
      const riskPenalty =
        e.risks.filter((r) => r.impact === "high").length * 0.1;
      const score = Math.max(
        0,
        e.confidence / Math.max(e.totalPersonWeeks, 0.1) - riskPenalty,
      );
      return {
        ideaTitle: e.ideaTitle,
        totalPersonWeeks: e.totalPersonWeeks,
        confidence: e.confidence,
        riskCount: e.risks.length,
        requiredSkillsCount: e.requiredSkills.length,
        score: parseFloat(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Calibrate an estimate by recording actual vs estimated data. Returns adjustment factor. */
export function calibrateEstimate(
  estimate: EffortEstimate,
  actualWeeks: number,
): { adjustmentFactor: number; calibratedEstimate: EffortEstimate } {
  const adjustmentFactor =
    estimate.totalPersonWeeks > 0
      ? actualWeeks / estimate.totalPersonWeeks
      : 1;

  const calibratedBreakdown = estimate.breakdown.map((phase) => ({
    ...phase,
    personWeeks: parseFloat((phase.personWeeks * adjustmentFactor).toFixed(2)),
  }));

  const calibratedEstimate: EffortEstimate = {
    ...estimate,
    totalPersonWeeks: actualWeeks,
    breakdown: calibratedBreakdown,
    assumptions: [
      ...estimate.assumptions,
      `Calibrated: original estimate was ${estimate.totalPersonWeeks} person-weeks, actual was ${actualWeeks} (factor: ${adjustmentFactor.toFixed(2)})`,
    ],
  };

  return { adjustmentFactor, calibratedEstimate };
}

/** Aggregate statistics across multiple effort estimates. */
export function getEffortDistribution(estimates: EffortEstimate[]): {
  count: number;
  totalPersonWeeks: number;
  avgPersonWeeks: number;
  medianPersonWeeks: number;
  minPersonWeeks: number;
  maxPersonWeeks: number;
  avgConfidence: number;
  phaseDistribution: Record<string, number>;
  topSkills: Array<{ skill: string; count: number }>;
} {
  if (estimates.length === 0) {
    return {
      count: 0,
      totalPersonWeeks: 0,
      avgPersonWeeks: 0,
      medianPersonWeeks: 0,
      minPersonWeeks: 0,
      maxPersonWeeks: 0,
      avgConfidence: 0,
      phaseDistribution: {},
      topSkills: [],
    };
  }

  const weeks = estimates.map((e) => e.totalPersonWeeks).sort((a, b) => a - b);
  const total = weeks.reduce((s, w) => s + w, 0);
  const mid = Math.floor(weeks.length / 2);

  // Phase distribution
  const phaseDistribution: Record<string, number> = {};
  for (const e of estimates) {
    for (const phase of e.breakdown) {
      phaseDistribution[phase.phase] =
        (phaseDistribution[phase.phase] ?? 0) + phase.personWeeks;
    }
  }

  // Skill frequency
  const skillCounts = new Map<string, number>();
  for (const e of estimates) {
    for (const s of e.requiredSkills) {
      skillCounts.set(s.skill, (skillCounts.get(s.skill) ?? 0) + 1);
    }
  }
  const topSkills = Array.from(skillCounts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    count: estimates.length,
    totalPersonWeeks: total,
    avgPersonWeeks: parseFloat((total / estimates.length).toFixed(2)),
    medianPersonWeeks:
      weeks.length % 2 === 0
        ? (weeks[mid - 1] + weeks[mid]) / 2
        : weeks[mid],
    minPersonWeeks: weeks[0],
    maxPersonWeeks: weeks[weeks.length - 1],
    avgConfidence: parseFloat(
      (
        estimates.reduce((s, e) => s + e.confidence, 0) / estimates.length
      ).toFixed(4),
    ),
    phaseDistribution,
    topSkills,
  };
}
