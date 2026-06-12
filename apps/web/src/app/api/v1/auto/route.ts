/**
 * @description V1 API — full auto-mode pipeline with SSE streaming.
 */
export const runtime = "nodejs";

import { runAutoPipeline } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  jsonBodyErrorResponse,
  readJsonBody,
  validateJsonContentType,
  validateModel,
} from "@/lib/validate-request";
import { API_RESPONSE_HEADERS, SECURITY_HEADERS } from "@/lib/api-headers";
import { validateApiKey } from "@/lib/api-auth";
import { addRateLimitHeaders, checkRateLimit, scopedRateLimitKey } from "@/lib/rate-limit";

const RequestSchema = z
  .object({
    subject: z.string().min(1).max(500),
    model: z.string().optional(),
    stream: z.boolean().optional().default(true),
  })
  .strict();

/** POST /api/v1/auto — run full pipeline. Supports streaming (SSE) and non-streaming. */
export async function POST(request: Request) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: API_RESPONSE_HEADERS,
    });
  }

  const rateLimit = checkRateLimit(scopedRateLimitKey("v1:auto", auth.keyId ?? "anonymous"), {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: addRateLimitHeaders(
        API_RESPONSE_HEADERS as unknown as Record<string, string>,
        rateLimit
      ),
    });
  }

  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return jsonBodyErrorResponse(error);
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, model, stream } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    // Non-streaming mode: run pipeline and return final result
    if (!stream) {
      const result = await runAutoPipeline(subject, () => {}, model, undefined, request.signal);
      logger.info("API v1 auto completed (non-streaming)", {
        route: "/api/v1/auto",
        durationMs: Date.now() - startTime,
      });
      return new Response(JSON.stringify({ data: result }), {
        headers: addRateLimitHeaders(
          API_RESPONSE_HEADERS as unknown as Record<string, string>,
          rateLimit
        ),
      });
    }

    // Streaming mode (SSE)
    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();
    request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

    const readableStream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            streamClosed = true;
          }
        }, 15_000);

        try {
          await runAutoPipeline(
            subject,
            (progress: PipelineProgress) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
              } catch {
                streamClosed = true;
              }
            },
            model,
            undefined,
            abortController.signal
          );
        } catch {
          if (!streamClosed) {
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ stage: "error", error: "Pipeline failed" })}\n\n`
                )
              );
            } catch {
              /* stream closed */
            }
          }
        } finally {
          clearInterval(heartbeat);
          if (!streamClosed) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
          streamClosed = true;
        }
      },
      cancel() {
        streamClosed = true;
        abortController.abort();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    logger.error("API v1 auto error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/v1/auto",
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Auto mode failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
