/**
 * @description Swarm intelligence — parallel multi-agent idea generation.
 */
export const runtime = "nodejs";

import {
  runSwarm,
  swarmToMarkdown,
  detectPersonalityConflicts,
  investigate,
  AgentPersonalitySchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  subject: z.string().min(1).max(5000),
  model: z.string().optional(),
  agentCount: z.number().int().min(2).max(10).optional(),
  personalities: z.array(AgentPersonalitySchema).min(2).max(10).optional(),
  maxIterations: z.number().int().min(1).max(10).optional(),
  convergenceThreshold: z.number().min(0).max(1).optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

/**
 * POST /api/swarm — Run a multi-agent innovation swarm.
 * Specialized agents (researcher, critic, synthesizer, etc.) debate and refine ideas.
 */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    const modelError = validateModel(parsed.model);
    if (modelError) return modelError;

    logger.info("Starting swarm", {
      subject: parsed.subject.slice(0, 100),
      agentCount: parsed.agentCount,
      route: "/api/swarm",
    });

    // Run investigation first for context
    const investigation = await investigate(parsed.subject, parsed.model, request.signal);

    // Execute multi-agent swarm
    const result = await runSwarm(parsed.subject, investigation, {
      agentCount: parsed.agentCount ?? 4,
      personalities: parsed.personalities ?? ["researcher", "critic", "synthesizer", "visionary"],
      maxIterations: parsed.maxIterations ?? 3,
      convergenceThreshold: parsed.convergenceThreshold ?? 0.7,
      model: parsed.model,
      signal: request.signal,
    });

    // Detect personality conflicts for analysis
    // Note: We need to access the blackboard for this, but since runSwarm returns only the result,
    // we include conflict analysis as empty for now
    const conflicts: ReturnType<typeof detectPersonalityConflicts> = [];

    if (parsed.format === "markdown") {
      const md = swarmToMarkdown(result);
      return new Response(md, {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    return Response.json(
      { result, conflicts },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/swarm" });
    return Response.json(
      { error: "Swarm execution failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
