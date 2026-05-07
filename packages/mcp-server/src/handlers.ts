import { investigate, generateForAngle, runAutoPipeline } from "@innovator/core";
import type { AngleId, PipelineProgress } from "@innovator/core";
import { InvestigateInputSchema, GenerateInputSchema, AutoPipelineInputSchema } from "./schemas.js";

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
