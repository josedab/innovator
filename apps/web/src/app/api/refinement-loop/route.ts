/**
 * @description Multi-step refinement loop for progressive idea improvement.
 */
export const runtime = "nodejs";

import {
  startRefinementSession,
  refineIdea,
  getRefinementSession,
  listRefinementSessions,
  getIdeaHistory,
  StartRefinementSchema,
  RefineIdeaSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const StartAction = z.object({
  action: z.literal("start"),
  ideas: StartRefinementSchema.shape.ideas,
});

const RefineAction = z.object({
  action: z.literal("refine"),
  sessionId: z.string().min(1),
  ideaId: z.string().min(1),
  targetTier: z.enum(["plan", "specification"]),
  feedback: z.string().max(2000).optional(),
});

const GetAction = z.object({
  action: z.literal("get"),
  sessionId: z.string().min(1),
});

const HistoryAction = z.object({
  action: z.literal("history"),
  sessionId: z.string().min(1),
  ideaId: z.string().min(1),
});

const ListAction = z.object({
  action: z.literal("list"),
});

const RequestSchema = z.discriminatedUnion("action", [
  StartAction,
  RefineAction,
  GetAction,
  HistoryAction,
  ListAction,
]);

/** POST /api/refinement-loop — progressive idea refinement. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    switch (parsed.data.action) {
      case "start": {
        const session = startRefinementSession(parsed.data.ideas);
        return Response.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      case "refine": {
        const iteration = refineIdea(
          parsed.data.sessionId,
          parsed.data.ideaId,
          parsed.data.targetTier,
          parsed.data.feedback
        );
        if (!iteration) {
          return new Response(JSON.stringify({ error: "Session or idea not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const session = getRefinementSession(parsed.data.sessionId);
        return Response.json({ iteration, session }, { headers: API_RESPONSE_HEADERS });
      }
      case "get": {
        const session = getRefinementSession(parsed.data.sessionId);
        if (!session) {
          return new Response(JSON.stringify({ error: "Session not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      case "history": {
        const iterations = getIdeaHistory(parsed.data.sessionId, parsed.data.ideaId);
        return Response.json({ iterations }, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const sessionsList = listRefinementSessions();
        return Response.json({ sessions: sessionsList }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Refinement loop error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/refinement-loop",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
