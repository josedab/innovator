export const runtime = "nodejs";

import {
  parsePipelineRequest,
  resolvePhases,
  resolveAngles,
  runAutoPipeline,
  ANGLE_IDS,
} from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { SECURITY_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;

const RequestSchema = z.object({
  description: z.string().min(1).max(5000),
  model: z.string().optional(),
});

/**
 * Parse a natural language pipeline description and execute it via SSE.
 *
 * @route POST /api/pipeline
 * @param request - JSON body with `description` (string, 1–5000 chars) and optional `model` (string).
 * @returns SSE stream emitting:
 *   - `{ type: "config", config }` — parsed pipeline configuration
 *   - `PipelineProgress` events — stage updates, angle results, and synthesis
 *   - `: keepalive` comments every 15 seconds
 * @status 400 — invalid JSON, missing/invalid fields, or unparseable pipeline description
 * @status 500 — pipeline execution failure
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", { route: "/api/pipeline", requestId, status: 400, durationMs: Date.now() - startTime });
      return contentTypeError;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid request", { route: "/api/pipeline", requestId, durationMs: Date.now() - startTime, details: parsed.error.flatten() });
      return new Response(JSON.stringify({ error: "Invalid request. Provide a 'description' field." }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const { description, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    // Parse natural language into PipelineConfig
    let config;
    try {
      config = await parsePipelineRequest(description, model);
    } catch (err) {
      logger.error("Pipeline parse error", { error: err instanceof Error ? err.message : String(err), route: "/api/pipeline", requestId });
      return new Response(JSON.stringify({ error: "Failed to parse pipeline description." }), { status: 400, headers: API_RESPONSE_HEADERS });
    }

    const angles = resolveAngles(config);
    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });

    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          if (streamClosed) return;
          try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { streamClosed = true; }
        }, HEARTBEAT_MS);

        // Send the parsed config as the first event
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "config", config })}\n\n`));
        } catch { streamClosed = true; }

        const sendProgress = (progress: PipelineProgress) => {
          if (streamClosed) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)); } catch { streamClosed = true; }
        };

        try {
          await runAutoPipeline(config.subject, sendProgress, config.model ?? model, angles, abortController.signal);
          logger.info("Pipeline completed", { route: "/api/pipeline", requestId, durationMs: Date.now() - startTime });
        } catch (err) {
          logger.error("Pipeline error", { error: err instanceof Error ? err.message : String(err), route: "/api/pipeline", requestId });
          if (!streamClosed) {
            const errorProgress: PipelineProgress = {
              stage: "error",
              completedAngles: [],
              totalAngles: angles.length,
              angleResults: [],
              error: "Pipeline encountered an error. Please try again.",
            };
            sendProgress(errorProgress);
          }
        } finally {
          request.signal.removeEventListener("abort", onRequestAbort);
          clearInterval(heartbeat);
          if (!streamClosed) { try { controller.close(); } catch { /* already closed */ } }
          streamClosed = true;
        }
      },
      cancel() {
        streamClosed = true;
        abortController.abort();
        request.signal.removeEventListener("abort", onRequestAbort);
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", ...SECURITY_HEADERS },
    });
  } catch (err) {
    logger.error("Pipeline error", { error: err instanceof Error ? err.message : String(err), route: "/api/pipeline", requestId, durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: "Pipeline failed. Please try again." }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
