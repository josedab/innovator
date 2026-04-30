export const runtime = "nodejs";

import { runAutoPipeline, ANGLE_IDS } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { SECURITY_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;
const MAX_SUBJECT_LENGTH = 500;

const RequestSchema = z.object({
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) {
      logger.warn("Request rejected", {
        route: "/api/auto",
        requestId,
        status: 400,
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
        route: "/api/auto",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        }
      );
    }

    const { subject, model } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) {
      logger.warn("Invalid model", {
        route: "/api/auto",
        requestId,
        status: 400,
        durationMs: Date.now() - startTime,
      });
      return modelError;
    }

    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
    const pipelineStartTime = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        // Send periodic keepalive comments to prevent proxy/CDN timeout
        const heartbeat = setInterval(() => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            streamClosed = true;
          }
        }, HEARTBEAT_MS);

        const sendProgress = (progress: PipelineProgress) => {
          if (streamClosed) return;
          try {
            const data = `data: ${JSON.stringify(progress)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            // Stream may have been closed by client disconnect
            streamClosed = true;
          }
        };

        try {
          await runAutoPipeline(subject, sendProgress, model, undefined, abortController.signal);
          logger.info("Auto pipeline completed", {
            route: "/api/auto",
            requestId,
            durationMs: Date.now() - pipelineStartTime,
          });
        } catch (err) {
          logger.error("Auto pipeline error", {
            error: err instanceof Error ? err.message : String(err),
            stack:
              process.env.NODE_ENV !== "production"
                ? err instanceof Error
                  ? err.stack
                  : undefined
                : undefined,
            subject: subject.length > 30 ? subject.slice(0, 30) + "..." : subject,
            route: "/api/auto",
            requestId,
          });
          if (!streamClosed) {
            const errorProgress: PipelineProgress = {
          request.signal.removeEventListener("abort", onRequestAbort);
              stage: "error",
              completedAngles: [],
              totalAngles: ANGLE_IDS.length,
              angleResults: [],
              error: "Pipeline encountered an error. Please try again.",
            };
            sendProgress(errorProgress);
          }
        } finally {
          clearInterval(heartbeat);
          if (!streamClosed) {
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
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
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    logger.error("Auto mode error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/auto",
      requestId,
    });
    return new Response(JSON.stringify({ error: "Auto mode failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
