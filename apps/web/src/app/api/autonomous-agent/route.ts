/**
 * @description Autonomous AI agent for self-directed innovation exploration.
 */
export const runtime = "nodejs";

import { runAutonomousAgent } from "@innovator/core";
import type { AutonomousProgress } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { SECURITY_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
  maxBranches: z.number().min(1).max(50).optional(),
  maxDepth: z.number().min(1).max(10).optional(),
  strategy: z.enum(["breadth-first", "depth-first", "adaptive"]).optional(),
});

/**
 * Run the autonomous innovation agent via Server-Sent Events.
 *
 * Self-directs exploration, branches investigations, and delivers portfolios.
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
        JSON.stringify({ error: "Invalid request. Please check your input and try again." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, model, maxBranches, maxDepth, strategy } = parsed.data;
    const modelError = validateModel(model);
    if (modelError) return modelError;

    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });

    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            streamClosed = true;
          }
        }, HEARTBEAT_MS);

        const sendProgress = (progress: AutonomousProgress) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
          } catch {
            streamClosed = true;
          }
        };

        try {
          const result = await runAutonomousAgent(subject, sendProgress, {
            maxBranches,
            maxDepth,
            strategy,
            model,
            signal: abortController.signal,
          });

          if (!streamClosed) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "complete", result })}\n\n`)
            );
          }

          logger.info("Autonomous agent completed", {
            route: "/api/autonomous-agent",
            requestId,
            durationMs: Date.now() - startTime,
            branches: result.branches.length,
          });
        } catch (err) {
          logger.error("Autonomous agent error", {
            error: err instanceof Error ? err.message : String(err),
            route: "/api/autonomous-agent",
            requestId,
          });
          if (!streamClosed) {
            sendProgress({
              runId: "",
              status: "failed",
              completedBranches: 0,
              totalBranches: 0,
              totalIdeas: 0,
              error: "Agent encountered an error. Please try again.",
            });
          }
        } finally {
          request.signal.removeEventListener("abort", onRequestAbort);
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
    logger.error("Autonomous agent route error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/autonomous-agent",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Autonomous agent failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
