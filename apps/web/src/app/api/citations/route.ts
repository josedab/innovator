/**
 * @description Source citation management for generated ideas.
 */
export const runtime = "nodejs";

import {
  getCitationContext,
  addSource,
  removeSource,
  verifyCitation,
  groundIdeas,
  resetCitationContext,
  AddSourceSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const AddSourceAction = z.object({
  action: z.literal("add-source"),
  sessionId: z.string().min(1).max(100),
  source: AddSourceSchema,
});

const RemoveSourceAction = z.object({
  action: z.literal("remove-source"),
  sessionId: z.string().min(1).max(100),
  sourceId: z.string().min(1),
});

const VerifyAction = z.object({
  action: z.literal("verify"),
  sessionId: z.string().min(1).max(100),
  citationId: z.string().min(1),
});

const GroundAction = z.object({
  action: z.literal("ground"),
  sessionId: z.string().min(1).max(100),
  ideas: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
      })
    )
    .min(1)
    .max(50),
});

const GetContextAction = z.object({
  action: z.literal("get-context"),
  sessionId: z.string().min(1).max(100),
});

const ResetAction = z.object({
  action: z.literal("reset"),
  sessionId: z.string().min(1).max(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  AddSourceAction,
  RemoveSourceAction,
  VerifyAction,
  GroundAction,
  GetContextAction,
  ResetAction,
]);

/** POST /api/citations — manage sources, citations, and verification. */
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
      case "add-source": {
        const source = addSource(parsed.data.sessionId, parsed.data.source);
        return Response.json({ source }, { headers: API_RESPONSE_HEADERS });
      }
      case "remove-source": {
        const removed = removeSource(parsed.data.sessionId, parsed.data.sourceId);
        return Response.json({ success: removed }, { headers: API_RESPONSE_HEADERS });
      }
      case "verify": {
        const citation = verifyCitation(parsed.data.sessionId, parsed.data.citationId);
        if (!citation) {
          return new Response(JSON.stringify({ error: "Citation not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ citation }, { headers: API_RESPONSE_HEADERS });
      }
      case "ground": {
        const grounded = groundIdeas(parsed.data.sessionId, parsed.data.ideas);
        return Response.json({ ideas: grounded }, { headers: API_RESPONSE_HEADERS });
      }
      case "get-context": {
        const context = getCitationContext(parsed.data.sessionId);
        return Response.json(context, { headers: API_RESPONSE_HEADERS });
      }
      case "reset": {
        resetCitationContext(parsed.data.sessionId);
        return Response.json({ success: true }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Citations error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/citations",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
