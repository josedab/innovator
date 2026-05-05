export const runtime = "nodejs";

import { generateCinematicScript } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { CACHE_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  session: z.object({
    subject: z.string().min(1).max(500),
    investigation: z.object({
      summary: z.string(),
      aspects: z.array(z.string()).optional(),
      state: z.string().optional(),
      challenges: z.array(z.string()).optional(),
      opportunities: z.array(z.string()).optional(),
    }).optional(),
    angleResults: z.array(z.object({
      angle: z.string(),
      ideas: z.array(z.object({
        title: z.string(),
        description: z.string(),
        impact: z.string().optional(),
        implementationHint: z.string().optional(),
      })),
      reasoning: z.string().optional(),
    })).optional(),
    synthesis: z.object({
      topIdeas: z.array(z.object({
        title: z.string(),
        description: z.string(),
        impact: z.string().optional(),
        implementationHint: z.string().optional(),
      })),
      themes: z.array(z.string()),
      recommendation: z.string(),
    }).optional(),
  }),
  model: z.string().max(100).optional(),
});

/**
 * Generate a cinematic script from session data.
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
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const script = await generateCinematicScript(
      parsed.data.session as Parameters<typeof generateCinematicScript>[0],
      { model: parsed.data.model }
    );

    logger.info("Cinematic script generated", {
      route: "/api/cinematics",
      requestId,
      scenes: script.scenes.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(script, {
      headers: { ...CACHE_HEADERS, ...API_RESPONSE_HEADERS },
    });
  } catch (err) {
    logger.error("Cinematics generation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/cinematics",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Cinematic script generation failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
