/**
 * @description DAG-based pipeline workflow definition and execution.
 */
export const runtime = "nodejs";

import {
  compilePipelineDAG,
  executePipelineDAG,
  dagToText,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CompileSchema = z.object({
  action: z.literal("compile"),
  description: z.string().min(1).max(5000),
  model: z.string().optional(),
});

const ExecuteSchema = z.object({
  action: z.literal("execute"),
  description: z.string().min(1).max(5000),
  model: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

const RequestSchema = z.discriminatedUnion("action", [CompileSchema, ExecuteSchema]);

/**
 * Natural language pipeline DAG endpoint.
 * Compile plain-English descriptions into pipeline DAGs and optionally execute them.
 */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    const modelError = validateModel(parsed.model);
    if (modelError) return modelError;

    switch (parsed.action) {
      case "compile": {
        logger.info(`Compiling DAG from: "${parsed.description.slice(0, 100)}..."`, { route: "/api/pipeline-dag" });
        const dag = await compilePipelineDAG(parsed.description, parsed.model, request.signal);
        return Response.json({
          dag,
          visualization: dagToText(dag),
        }, { headers: API_RESPONSE_HEADERS });
      }
      case "execute": {
        logger.info(`Executing pipeline from: "${parsed.description.slice(0, 100)}..."`, { route: "/api/pipeline-dag" });
        const dag = await compilePipelineDAG(parsed.description, parsed.model, request.signal);
        const result = await executePipelineDAG(dag, {
          signal: request.signal,
          dryRun: parsed.dryRun,
        });
        return Response.json({
          dag: result,
          visualization: dagToText(result),
        }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/pipeline-dag" });
    return Response.json(
      { error: "Pipeline compilation failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
