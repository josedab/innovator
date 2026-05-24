import { investigate, generateForAngle, runAutoPipeline } from "@innovator/core";
import {
  analyzeCodebaseSync,
  deepAnalyze,
  generateInnovationPRs,
  innovationPRToMarkdown,
  analysisToMarkdown,
} from "@innovator/core";
import type { AngleId, PipelineProgress, CodebaseAnalysis, InnovationPR } from "@innovator/core";
import { InvestigateInputSchema, GenerateInputSchema, AutoPipelineInputSchema } from "./schemas.js";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { existsSync, realpathSync, statSync } from "node:fs";

const MAX_ANALYSIS_FILES = 1_000;

/**
 * Resolve a requested path and ensure its real location remains inside the configured root.
 */
function validatePath(rawPath: string, expectedType: "file" | "directory"): string {
  const resolved = resolve(rawPath);
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const configuredRoot = resolve(process.env.MCP_ALLOWED_ROOT ?? process.cwd());
  if (!existsSync(configuredRoot)) {
    throw new Error(`MCP_ALLOWED_ROOT does not exist: ${configuredRoot}`);
  }

  const allowedRoot = realpathSync(configuredRoot);
  const realPath = realpathSync(resolved);
  const relativePath = relative(allowedRoot, realPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("Path is outside MCP_ALLOWED_ROOT");
  }

  const stat = statSync(realPath);
  if (expectedType === "file" && !stat.isFile()) {
    throw new Error("Path must reference a file");
  }
  if (expectedType === "directory" && !stat.isDirectory()) {
    throw new Error("Path must reference a directory");
  }

  return realPath;
}

/**
 * Handle an MCP `investigate` tool call.
 *
 * Parses and validates the incoming arguments against {@link InvestigateInputSchema},
 * runs an investigation on the given subject, and returns the result as JSON.
 *
 * @param args - Raw tool call arguments (validated via Zod)
 * @returns JSON-stringified {@link Investigation} result
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleInvestigate(args: unknown): Promise<string> {
  const input = InvestigateInputSchema.parse(args);
  const result = await investigate(input.subject, input.model);
  return JSON.stringify(result, null, 2);
}

/**
 * Handle an MCP `generate` tool call.
 *
 * Parses and validates the incoming arguments against {@link GenerateInputSchema},
 * generates innovation ideas for a single angle, and returns the result as JSON.
 *
 * @param args - Raw tool call arguments (validated via Zod)
 * @returns JSON-stringified {@link AngleResult} with generated ideas
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleGenerate(args: unknown): Promise<string> {
  const input = GenerateInputSchema.parse(args);
  const result = await generateForAngle(
    input.subject,
    input.investigation,
    input.angleId as AngleId,
    input.model
  );
  return JSON.stringify(result, null, 2);
}

/**
 * Handle an MCP `auto-pipeline` tool call.
 *
 * Parses and validates the incoming arguments against {@link AutoPipelineInputSchema},
 * runs the full innovation pipeline (investigate → generate → synthesize), and returns
 * the final result along with a progress log.
 *
 * @param args - Raw tool call arguments (validated via Zod)
 * @returns JSON-stringified object containing `finalResult` ({@link PipelineProgress}) and `progressLog`
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleAutoPipeline(args: unknown): Promise<string> {
  const input = AutoPipelineInputSchema.parse(args);
  const progressUpdates: PipelineProgress[] = [];

  const result = await runAutoPipeline(
    input.subject,
    (progress) => {
      progressUpdates.push({ ...progress });
    },
    input.model,
    input.angles as AngleId[] | undefined
  );

  return JSON.stringify(
    {
      finalResult: result,
      progressLog: progressUpdates.map((p) => ({
        stage: p.stage,
        completedAngles: p.completedAngles,
        totalAngles: p.totalAngles,
      })),
    },
    null,
    2
  );
}

/**
 * Handle an MCP `innovate-from-code` tool call.
 * Analyzes a codebase directory and generates innovation ideas grounded in code context,
 * including architectural debt, feature gaps, and performance bottlenecks.
 *
 * @param args - Raw tool call arguments (`{ path: string, maxFiles?: number }`)
 * @returns JSON-stringified analysis containing summary, deep analysis, and innovation PRs
 * @throws {ZodError} If `args` fails schema validation
 * @throws {Error} If the path is invalid or inaccessible
 */
export async function handleInnovateFromCode(args: unknown): Promise<string> {
  const input = z
    .object({
      path: z.string().min(1).describe("Path to the repository or directory to analyze"),
      maxFiles: z.number().int().min(1).max(MAX_ANALYSIS_FILES).optional().default(200),
    })
    .parse(args);

  const safePath = validatePath(input.path, "directory");
  const analysis = analyzeCodebaseSync(safePath, { maxFiles: input.maxFiles });
  const deepResult = deepAnalyze(analysis as CodebaseAnalysis);
  const prs = generateInnovationPRs(analysis as CodebaseAnalysis);

  return JSON.stringify(
    {
      summary: {
        files: analysis.fileCount,
        lines: analysis.totalLines,
        languages: analysis.languages,
        patterns: analysis.patterns.length,
        subjects: analysis.subjects.length,
      },
      architecturalDebt: deepResult.architecturalDebt,
      featureGaps: deepResult.featureGaps,
      performanceBottlenecks: deepResult.performanceBottlenecks,
      innovationOpportunities: deepResult.innovationOpportunities,
      innovationPRs: prs.slice(0, 10).map((pr: InnovationPR) => ({
        title: pr.title,
        category: pr.category,
        priority: pr.priority,
        effort: pr.estimatedEffort,
      })),
    },
    null,
    2
  );
}

/**
 * Handle an MCP `innovate-file` tool call.
 * Analyzes a specific file's complexity, patterns, and relevant subjects.
 *
 * @param args - Raw tool call arguments (`{ path: string }`)
 * @returns JSON-stringified file analysis with complexity hotspot, patterns, and subjects
 * @throws {ZodError} If `args` fails schema validation
 * @throws {Error} If the path is invalid or inaccessible
 */
export async function handleInnovateFile(args: unknown): Promise<string> {
  const input = z
    .object({
      path: z.string().min(1).describe("Path to the specific file to analyze"),
    })
    .parse(args);

  const safePath = validatePath(input.path, "file");
  const { dirname } = await import("node:path");
  const rootPath = dirname(safePath);
  const analysis = analyzeCodebaseSync(rootPath, { maxFiles: 50 });

  const fileHotspot = analysis.complexityHotspots.find((h: { path: string }) =>
    safePath.endsWith(h.path)
  );

  const relevantPatterns = analysis.patterns.filter((p: { locations: string[] }) =>
    p.locations.some((l: string) => input.path.endsWith(l))
  );

  return JSON.stringify(
    {
      file: input.path,
      complexity: fileHotspot ?? null,
      patterns: relevantPatterns,
      subjects: analysis.subjects.filter((s: { relevantPatterns: string[] }) =>
        s.relevantPatterns.some((p: string) => input.path.includes(p))
      ),
    },
    null,
    2
  );
}

/**
 * Handle an MCP `innovate-architecture` tool call.
 * Performs deep architectural analysis and generates Innovation PRs as a Markdown report.
 *
 * @param args - Raw tool call arguments (`{ path: string }`)
 * @returns Markdown report combining architecture analysis and Innovation PRs
 * @throws {ZodError} If `args` fails schema validation
 * @throws {Error} If the path is invalid or inaccessible
 */
export async function handleInnovateArchitecture(args: unknown): Promise<string> {
  const input = z
    .object({
      path: z.string().min(1).describe("Path to the repository"),
    })
    .parse(args);

  const safePath = validatePath(input.path, "directory");
  const analysis = analyzeCodebaseSync(safePath, { maxFiles: 500 });
  const _deepResult = deepAnalyze(analysis as CodebaseAnalysis);
  const prs = generateInnovationPRs(analysis as CodebaseAnalysis);

  const report = analysisToMarkdown(analysis as CodebaseAnalysis);
  const prReports = prs.map((pr: InnovationPR) => innovationPRToMarkdown(pr)).join("\n\n---\n\n");

  return `${report}\n\n# Innovation PRs\n\n${prReports}`;
}

import { z } from "zod";

// ---- New Feature Handlers ----

import {
  generateNLExecutionPlan,
  retrieveRelatedMemories,
  generateOrgDNA,
  orgDNAToMarkdown,
  generateStakeholderAssessment,
  assessmentToMarkdown,
} from "@innovator/core";

// ---- Autonomous Agent & Swarm Imports ----

import {
  runAutonomousAgent,
  autonomousRunToMarkdown,
  runSwarm,
  swarmToMarkdown,
  listNodes,
  createFederationNode,
  getNetworkDashboard,
} from "@innovator/core";
import type { AutonomousProgress, SwarmConfig } from "@innovator/core";

/** Lazily create or retrieve a default federation node for MCP server use. */
let defaultNodeId: string | undefined;
/** @returns The ID of the default federation node, creating one if none exists. */
function getOrCreateDefaultNodeId(): string {
  if (defaultNodeId) return defaultNodeId;
  const existing = listNodes();
  if (existing.length > 0) {
    defaultNodeId = existing[0].id;
    return defaultNodeId;
  }
  const node = createFederationNode({
    name: "mcp-server",
    description: "Default MCP server federation node",
    isPublic: false,
  });
  defaultNodeId = node.id;
  return defaultNodeId;
}

/**
 * Handle an MCP `nl-innovate` tool call.
 * Parses a natural-language prompt into a structured execution plan.
 *
 * @param args - Raw tool call arguments (`{ prompt: string, model?: string }`)
 * @returns JSON-stringified execution plan derived from the natural-language prompt
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleNLInnovate(args: unknown): Promise<string> {
  const input = z
    .object({
      prompt: z.string().min(1).max(5000),
      model: z.string().optional(),
    })
    .parse(args);
  const result = await generateNLExecutionPlan(input.prompt, input.model);
  return JSON.stringify(result, null, 2);
}

/**
 * Handle an MCP `memory-search` tool call.
 * Queries the innovation memory graph for related past ideas and returns scored results.
 *
 * @param args - Raw tool call arguments (`{ query: string, threshold?: number, limit?: number }`)
 * @returns JSON-stringified array of memory nodes with similarity scores
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleMemorySearch(args: unknown): Promise<string> {
  const input = z
    .object({
      query: z.string().min(1).max(2000),
      threshold: z.number().min(0).max(1).optional(),
      limit: z.number().min(1).max(50).optional(),
    })
    .parse(args);
  const { nodes, scores } = retrieveRelatedMemories(input.query, {
    threshold: input.threshold,
    limit: input.limit,
  });
  const results = nodes.map((n) => ({ ...n, score: scores.get(n.id) ?? 0 }));
  return JSON.stringify(results, null, 2);
}

/**
 * Handle an MCP `org-dna` tool call.
 * Generates an organizational innovation DNA report in JSON or Markdown format.
 *
 * @param args - Raw tool call arguments (`{ format?: "json" | "markdown" }`)
 * @returns JSON-stringified org DNA report or Markdown-formatted string
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleOrgDNA(args: unknown): Promise<string> {
  const input = z.object({ format: z.enum(["json", "markdown"]).optional() }).parse(args);
  const report = generateOrgDNA();
  if (input.format === "markdown") return orgDNAToMarkdown(report);
  return JSON.stringify(report, null, 2);
}

/**
 * Handle an MCP `persona-eval` tool call.
 * Evaluates an idea through multiple stakeholder personas and returns a Markdown assessment.
 *
 * @param args - Raw tool call arguments (`{ idea: string, personaIds: string[], model?: string }`)
 * @returns Markdown-formatted stakeholder assessment
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handlePersonaEval(args: unknown): Promise<string> {
  const input = z
    .object({
      idea: z.string().min(1).max(5000),
      personaIds: z.array(z.string()).min(1).max(12),
      model: z.string().optional(),
    })
    .parse(args);
  const assessment = await generateStakeholderAssessment(input.idea, input.personaIds, {
    model: input.model,
  });
  return assessmentToMarkdown(assessment);
}

// ---- Innovation Mesh: Autonomous Agent Handler ----

/**
 * Handle an MCP `autonomous-innovate` tool call.
 * Deploys a persistent autonomous agent that performs deep multi-branch exploration
 * of an innovation subject, returning a portfolio of ideas with decisions and progress.
 *
 * @param args - Raw tool call arguments (`{ subject, maxBranches?, maxDepth?, strategy?, model? }`)
 * @returns JSON-stringified autonomous run result with summary, branches, portfolio, and decisions
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleAutonomousInnovate(args: unknown): Promise<string> {
  const input = z
    .object({
      subject: z.string().min(1).max(500),
      maxBranches: z.number().min(1).max(50).optional(),
      maxDepth: z.number().min(1).max(10).optional(),
      strategy: z.enum(["breadth-first", "depth-first", "adaptive"]).optional(),
      model: z.string().optional(),
    })
    .parse(args);

  const progressUpdates: AutonomousProgress[] = [];
  const run = await runAutonomousAgent(
    input.subject,
    (progress) => {
      progressUpdates.push({ ...progress });
    },
    {
      maxBranches: input.maxBranches ?? 10,
      maxDepth: input.maxDepth ?? 3,
      strategy: input.strategy ?? "adaptive",
      model: input.model,
    }
  );

  return JSON.stringify(
    {
      summary: autonomousRunToMarkdown(run),
      run: {
        id: run.id,
        status: run.status,
        rootSubject: run.rootSubject,
        strategy: run.strategy,
        branchCount: run.branches.length,
        totalIdeas: run.branches.reduce((s, b) => s + b.ideas.length, 0),
        completedBranches: run.branches.filter((b) => b.status === "completed").length,
        prunedBranches: run.branches.filter((b) => b.status === "pruned").length,
        decisions: run.decisions.map((d) => ({
          action: d.action,
          reasoning: d.reasoning,
        })),
        portfolio: run.portfolio
          ? {
              title: run.portfolio.title,
              summary: run.portfolio.summary,
              topIdeas: run.portfolio.topIdeas,
              themes: run.portfolio.themes,
              totalBranches: run.portfolio.totalBranches,
              totalIdeas: run.portfolio.totalIdeas,
              durationMs: run.portfolio.durationMs,
            }
          : null,
      },
    },
    null,
    2
  );
}

// ---- Innovation Mesh: Swarm Intelligence Handler ----

/**
 * Handle an MCP `swarm-innovate` tool call.
 * Launches a multi-agent swarm for collaborative ideation, returning converged ideas,
 * dominant themes, and emergent insights.
 *
 * @param args - Raw tool call arguments (`{ subject, agentCount?, maxIterations?, model? }`)
 * @returns JSON-stringified swarm result with convergence score, ideas, and agent contributions
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleSwarmInnovate(args: unknown): Promise<string> {
  const input = z
    .object({
      subject: z.string().min(1).max(500),
      agentCount: z.number().min(2).max(8).optional(),
      maxIterations: z.number().min(1).max(10).optional(),
      model: z.string().optional(),
    })
    .parse(args);

  const config: SwarmConfig = {
    agentCount: input.agentCount,
    maxIterations: input.maxIterations,
    model: input.model,
  };

  const result = await runSwarm(input.subject, undefined, config);

  return JSON.stringify(
    {
      summary: swarmToMarkdown(result),
      result: {
        convergenceScore: result.convergenceScore,
        totalIterations: result.totalIterations,
        ideas: result.ideas,
        dominantThemes: result.dominantThemes,
        emergentInsights: result.emergentInsights,
        agentContributions: result.agentContributions,
      },
    },
    null,
    2
  );
}

// ---- Innovation Mesh: Network Insights Handler ----

/**
 * Handle an MCP `network-insights` tool call.
 * Returns innovation patterns from the federated network, optionally filtered
 * by domain hint and/or angle ID.
 *
 * @param args - Raw tool call arguments (`{ domainHint?: string, angleId?: string }`)
 * @returns JSON-stringified network dashboard with health, trending angles, and relevant patterns
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleNetworkInsights(args: unknown): Promise<string> {
  const input = z
    .object({
      domainHint: z.string().min(1).max(200).optional(),
      angleId: z.string().optional(),
    })
    .parse(args);

  const dashboard = getNetworkDashboard(getOrCreateDefaultNodeId());
  let patterns = dashboard.topPatterns;

  if (input.domainHint) {
    const hint = input.domainHint.toLowerCase();
    patterns = patterns.filter(
      (p) =>
        p.anonymizedDomain.toLowerCase().includes(hint) ||
        p.description.toLowerCase().includes(hint)
    );
  }

  if (input.angleId) {
    patterns = patterns.filter((p) => p.angleIds.includes(input.angleId!));
  }

  return JSON.stringify(
    {
      networkHealth: dashboard.networkHealth,
      totalNodes: dashboard.totalNodes,
      totalPatterns: dashboard.totalPatterns,
      trendingAngles: dashboard.trendingAngles,
      relevantPatterns: patterns.slice(0, 20),
      insight:
        patterns.length > 0
          ? `Found ${patterns.length} relevant innovation patterns${input.domainHint ? ` for "${input.domainHint}"` : ""}.`
          : "No matching patterns found. The network may need more contributions in this domain.",
    },
    null,
    2
  );
}

// ---- Innovation Mesh: Novelty Check Handler ----

/**
 * Handle an MCP `novelty-check` tool call.
 * Assesses the novelty of ideas against known patterns and prior art in the
 * federated network, returning per-idea novelty scores and recommendations.
 *
 * @param args - Raw tool call arguments (`{ ideas: Array<{title, description}>, domain?: string }`)
 * @returns JSON-stringified novelty assessment with scores, similar patterns, and summary
 * @throws {ZodError} If `args` fails schema validation
 */
export async function handleNoveltyCheck(args: unknown): Promise<string> {
  const input = z
    .object({
      ideas: z
        .array(
          z.object({
            title: z.string().max(500),
            description: z.string().max(5000),
          })
        )
        .min(1)
        .max(20),
      domain: z.string().max(200).optional(),
    })
    .parse(args);

  // Compute novelty scores using existing scoring + federation patterns
  const dashboard = getNetworkDashboard(getOrCreateDefaultNodeId());
  const existingPatterns = dashboard.topPatterns;

  const results = input.ideas.map((idea) => {
    // Simple keyword-based similarity against known patterns
    const ideaWords = new Set(
      `${idea.title} ${idea.description}`
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
    );

    let maxSimilarity = 0;
    const similarPatterns: Array<{ title: string; similarity: number }> = [];

    for (const pattern of existingPatterns) {
      const patternWords = new Set(
        `${pattern.title} ${pattern.description}`
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3)
      );
      const intersection = [...ideaWords].filter((w) => patternWords.has(w));
      const union = new Set([...ideaWords, ...patternWords]);
      const similarity = union.size > 0 ? intersection.length / union.size : 0;

      if (similarity > 0.1) {
        similarPatterns.push({
          title: pattern.title,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    const noveltyScore = Math.round((1 - maxSimilarity) * 100);

    return {
      title: idea.title,
      noveltyScore,
      assessment:
        noveltyScore >= 80
          ? "highly-novel"
          : noveltyScore >= 50
            ? "partially-novel"
            : "similar-prior-art-exists",
      similarPatterns: similarPatterns.sort((a, b) => b.similarity - a.similarity).slice(0, 5),
      recommendation:
        noveltyScore >= 80
          ? "Strong candidate for further development. No closely matching prior art found."
          : noveltyScore >= 50
            ? "Some overlap with existing patterns. Consider differentiating further."
            : "Similar approaches exist. Review prior art before investing heavily.",
    };
  });

  return JSON.stringify(
    {
      domain: input.domain ?? "general",
      checkedAgainst: existingPatterns.length,
      results,
      summary: `Checked ${results.length} ideas. ${results.filter((r) => r.noveltyScore >= 80).length} highly novel, ${results.filter((r) => r.noveltyScore >= 50 && r.noveltyScore < 80).length} partially novel, ${results.filter((r) => r.noveltyScore < 50).length} with similar prior art.`,
    },
    null,
    2
  );
}
