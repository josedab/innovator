/**
 * @description Embeddable widget endpoint for third-party integration (CORS-enabled).
 */
export const runtime = "nodejs";

import { runAutoPipeline, ANGLE_IDS } from "@innovator/core";
import type { PipelineProgress, AngleId } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS, SECURITY_HEADERS } from "@/lib/api-headers";

const EMBED_API_KEY_ENV = "INNOVATOR_EMBED_API_KEY";
const MAX_SUBJECT_LENGTH = 500;

const RequestSchema = z.object({
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH),
  angles: z.array(z.enum(ANGLE_IDS)).min(1).max(4).optional(),
  model: z.string().optional(),
});

// CORS headers for embeddable widget
function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = (process.env.INNOVATOR_EMBED_ORIGINS ?? "*").split(",").map((o) => o.trim());
  const isAllowed = allowedOrigins.includes("*") || (origin && allowedOrigins.includes(origin));

  return {
    "Access-Control-Allow-Origin": isAllowed ? (origin ?? "*") : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Embed-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function validateEmbedKey(request: Request): boolean {
  const requiredKey = process.env[EMBED_API_KEY_ENV];
  if (!requiredKey) return true; // No key configured = open access
  const providedKey = request.headers.get("x-embed-key");
  return providedKey === requiredKey;
}

/** Handle CORS preflight. */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

/**
 * Embeddable widget endpoint — runs a lightweight pipeline and returns results.
 * Supports CORS for cross-origin embedding.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    if (!validateEmbedKey(request)) {
      return new Response(JSON.stringify({ error: "Invalid embed API key" }), {
        status: 401,
        headers: { ...API_RESPONSE_HEADERS, ...cors },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...API_RESPONSE_HEADERS, ...cors },
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...API_RESPONSE_HEADERS, ...cors } }
      );
    }

    const { subject, angles, model } = parsed.data;
    const selectedAngles = angles ?? (["scamper", "first-principles"] as AngleId[]);

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });

    try {
      let finalResult: PipelineProgress | null = null;

      await runAutoPipeline(
        subject,
        (progress) => {
          finalResult = progress;
        },
        model,
        selectedAngles,
        abortController.signal
      );

      if (!finalResult || (finalResult as PipelineProgress).stage === "error") {
        return new Response(
          JSON.stringify({ error: "Pipeline failed" }),
          { status: 500, headers: { ...API_RESPONSE_HEADERS, ...cors } }
        );
      }

      const result = finalResult as PipelineProgress;

      logger.info("Embed pipeline completed", {
        route: "/api/embed",
        requestId,
        durationMs: Date.now() - startTime,
      });

      return Response.json(
        {
          subject,
          investigation: result.investigation,
          angleResults: result.angleResults,
          synthesis: result.synthesis,
        },
        { headers: { ...API_RESPONSE_HEADERS, ...cors } }
      );
    } finally {
      request.signal.removeEventListener("abort", onAbort);
    }
  } catch (err) {
    logger.error("Embed error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/embed",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Widget request failed" }),
      { status: 500, headers: { ...API_RESPONSE_HEADERS, ...cors } }
    );
  }
}
