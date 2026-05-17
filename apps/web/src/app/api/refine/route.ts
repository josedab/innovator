/**
 * @description Iterative idea refinement with LLM feedback.
 */
export const runtime = "nodejs";

import {
  createConversation,
  getConversation,
  refineConversation,
  createExplorationTree,
  getExplorationTree,
  drillDown,
  getExplorationPath,
  getNodeBranches,
  InvestigationSchema,
  AngleResultSchema,
  SynthesisSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const StartConversationSchema = z.object({
  action: z.literal("start"),
  subject: z.string().min(1).max(500),
  investigation: InvestigationSchema.optional(),
  angleResults: z.array(AngleResultSchema).optional().default([]),
  synthesis: SynthesisSchema.optional(),
});

const RefineSchema = z.object({
  action: z.literal("refine"),
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(5000),
  selectedIdeas: z.array(z.string().max(500)).max(20).optional(),
  model: z.string().optional(),
});

const CreateTreeSchema = z.object({
  action: z.literal("create-tree"),
  sessionId: z.string().uuid(),
});

const DrillDownSchema = z.object({
  action: z.literal("drill-down"),
  sessionId: z.string().uuid(),
  parentNodeId: z.string().min(1).max(100),
  query: z.string().min(1).max(2000),
  model: z.string().optional(),
});

const GetTreeSchema = z.object({
  action: z.literal("get-tree"),
  sessionId: z.string().uuid(),
});

const GetPathSchema = z.object({
  action: z.literal("get-path"),
  sessionId: z.string().uuid(),
  nodeId: z.string().min(1).max(100),
});

const GetBranchesSchema = z.object({
  action: z.literal("get-branches"),
  sessionId: z.string().uuid(),
  nodeId: z.string().min(1).max(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  StartConversationSchema,
  RefineSchema,
  CreateTreeSchema,
  DrillDownSchema,
  GetTreeSchema,
  GetPathSchema,
  GetBranchesSchema,
]);

/**
 * Conversation refinement endpoint.
 *
 * - `action: "start"` — create a new conversation session from pipeline results
 * - `action: "refine"` — send a follow-up message in an existing session
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid refine request", {
        route: "/api/refine",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;

    if (data.action === "start") {
      const ctx = createConversation({
        subject: data.subject,
        investigation: data.investigation,
        angleResults: data.angleResults,
        synthesis: data.synthesis,
      });

      logger.info("Conversation started", {
        route: "/api/refine",
        requestId,
        sessionId: ctx.sessionId,
        durationMs: Date.now() - startTime,
      });

      return Response.json(
        { sessionId: ctx.sessionId, subject: ctx.subject },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    if (data.action === "refine") {
      const ctx = getConversation(data.sessionId);
      if (!ctx) {
        return new Response(JSON.stringify({ error: "Conversation session not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }

      const modelError = validateModel(data.model);
      if (modelError) return modelError;

      const response = await refineConversation(
        data.sessionId,
        data.message,
        data.selectedIdeas,
        data.model,
        request.signal
      );

      logger.info("Refinement completed", {
        route: "/api/refine",
        requestId,
        sessionId: data.sessionId,
        durationMs: Date.now() - startTime,
      });

      return Response.json(response, { headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "create-tree") {
      const tree = createExplorationTree(data.sessionId);
      if (!tree) {
        return new Response(JSON.stringify({ error: "Conversation session not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      return Response.json({ tree }, { headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "drill-down") {
      const modelError = validateModel(data.model);
      if (modelError) return modelError;

      const node = await drillDown(
        data.sessionId,
        data.parentNodeId,
        data.query,
        data.model,
        request.signal
      );
      return Response.json({ node }, { headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "get-tree") {
      const tree = getExplorationTree(data.sessionId);
      if (!tree) {
        return new Response(JSON.stringify({ error: "Exploration tree not found" }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      return Response.json({ tree }, { headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "get-path") {
      const path = getExplorationPath(data.sessionId, data.nodeId);
      return Response.json({ path }, { headers: API_RESPONSE_HEADERS });
    }

    if (data.action === "get-branches") {
      const branches = getNodeBranches(data.sessionId, data.nodeId);
      return Response.json({ branches }, { headers: API_RESPONSE_HEADERS });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: API_RESPONSE_HEADERS,
    });
  } catch (err) {
    logger.error("Refine error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/refine",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Refinement failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
