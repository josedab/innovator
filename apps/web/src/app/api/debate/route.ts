export const runtime = "nodejs";

import {
  debateIdeas,
  DEFAULT_PRO_PERSONA,
  DEFAULT_CON_PERSONA,
  type DebateResult,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IdeaSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  potentialImpact: z.string().min(1).max(2000),
  implementationHint: z.string().max(2000).optional().default(""),
});

const RequestSchema = z.object({
  ideas: z.array(IdeaSchema).min(1).max(20),
  investigation: z
    .object({
      summary: z.string().max(5000),
      keyAspects: z
        .array(z.object({ title: z.string().max(500), description: z.string().max(2000) }))
        .max(20),
      currentState: z.string().max(5000),
      challenges: z.array(z.string().max(2000)).max(20),
      opportunities: z.array(z.string().max(2000)).max(20),
    })
    .optional(),
  config: z
    .object({
      rounds: z.number().int().min(1).max(5).optional(),
      model: z.string().optional(),
    })
    .optional(),
  sessionId: z.string().max(200).optional(),
});

/**
 * Run structured pro/con debates on one or more innovation ideas.
 *
 * @param request - JSON body matching {@link RequestSchema}
 * @returns JSON array of {@link DebateResult} sorted by verdict confidence (200),
 *          or `{ error: string }` on validation failure (400) or server error (500).
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/debate",
        requestId,
        status: 415,
        durationMs: Date.now() - startTime,
      });
      return contentTypeError;
    }

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
      logger.warn("Invalid request", {
        route: "/api/debate",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { ideas, investigation, config, sessionId } = parsed.data;

    const modelError = validateModel(config?.model);
    if (modelError) {
      logger.warn("Invalid model", {
        route: "/api/debate",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return modelError;
    }

    logger.info("Debate started", {
      route: "/api/debate",
      requestId,
      sessionId,
      ideaCount: ideas.length,
      rounds: config?.rounds ?? 2,
    });

    const results: DebateResult[] = await debateIdeas(ideas, investigation, {
      rounds: config?.rounds,
      model: config?.model,
      signal: request.signal,
    });

    logger.info("Debate completed", {
      route: "/api/debate",
      requestId,
      sessionId,
      ideaCount: ideas.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(results, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.info("Debate cancelled", {
        route: "/api/debate",
        requestId,
        durationMs: Date.now() - startTime,
      });
      return new Response(JSON.stringify({ error: "Request cancelled" }), {
        status: 499,
        headers: API_RESPONSE_HEADERS,
      });
    }

    logger.error("Debate error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/debate",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Debate failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Return available debate configuration options and default personas.
 */
export async function GET() {
  return Response.json(
    {
      defaultPersonas: {
        pro: DEFAULT_PRO_PERSONA,
        con: DEFAULT_CON_PERSONA,
      },
      config: {
        rounds: { min: 1, max: 5, default: 2 },
        maxIdeas: 20,
      },
      verdictOutcomes: ["pro", "con", "nuanced"],
    },
    { headers: API_RESPONSE_HEADERS }
  );
}
