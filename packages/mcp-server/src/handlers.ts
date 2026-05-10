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
import { resolve, normalize } from "node:path";
import { existsSync } from "node:fs";

/**
 * Validate that a path is safe to access: resolves to an absolute path,
 * exists on disk, and contains no traversal sequences that escape the
 * resolved directory.
 */
function validatePath(rawPath: string): string {
  const resolved = resolve(rawPath);
  if (resolved !== normalize(resolved)) {
    throw new Error("Path contains invalid sequences");
  }
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  return resolved;
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
 * Analyzes a codebase and generates innovation ideas grounded in code context.
 */
export async function handleInnovateFromCode(args: unknown): Promise<string> {
  const input = z
    .object({
      path: z.string().min(1).describe("Path to the repository or directory to analyze"),
      maxFiles: z.number().optional().default(200),
    })
    .parse(args);

  const safePath = validatePath(input.path);
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
 * Analyzes a specific file and suggests innovations.
 */
export async function handleInnovateFile(args: unknown): Promise<string> {
  const input = z
    .object({
      path: z.string().min(1).describe("Path to the specific file to analyze"),
    })
    .parse(args);

  const safePath = validatePath(input.path);
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
 * Analyzes architecture and generates a full report with Innovation PRs.
 */
export async function handleInnovateArchitecture(args: unknown): Promise<string> {
  const input = z
    .object({
      path: z.string().min(1).describe("Path to the repository"),
    })
    .parse(args);

  const safePath = validatePath(input.path);
  const analysis = analyzeCodebaseSync(safePath, { maxFiles: 500 });
  const _deepResult = deepAnalyze(analysis as CodebaseAnalysis);
  const prs = generateInnovationPRs(analysis as CodebaseAnalysis);

  const report = analysisToMarkdown(analysis as CodebaseAnalysis);
  const prReports = prs.map((pr: InnovationPR) => innovationPRToMarkdown(pr)).join("\n\n---\n\n");

  return `${report}\n\n# Innovation PRs\n\n${prReports}`;
}

import { z } from "zod";
