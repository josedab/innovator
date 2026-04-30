export const runtime = "nodejs";

import { runAutoPipeline, ANGLE_IDS } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { KNOWN_MODELS } from "@/lib/env";
import { validateJsonContentType } from "@/lib/validate-request";

const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Vary: "Accept-Encoding",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
} as const;

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CACHE_HEADERS },
      });
    }

    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn("Invalid request", {
        route: "/api/auto",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
      );
    }

    const { subject, model } = parsed.data;

    if (model && !(KNOWN_MODELS as readonly string[]).includes(model)) {
      return new Response(
        JSON.stringify({
          error: `Unknown model. Allowed models: ${KNOWN_MODELS.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } }
      );
    }

    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();

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
        }, 15_000);

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
      headers: { "Content-Type": "application/json", ...CACHE_HEADERS, ...SECURITY_HEADERS },
    });
  }
}
