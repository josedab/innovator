/**
 * @description SSE stream for playground pipeline execution with real-time progress.
 */
export const runtime = "nodejs";

import { runAutoPipeline, ANGLE_IDS, updatePlaygroundSession } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core/innovation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { SECURITY_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;
const MAX_SUBJECT_LENGTH = 500;

const QuerySchema = z.object({
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH),
  sessionId: z.string().max(100).optional(),
  userId: z.string().max(200).optional(),
});

/**
 * Stream playground pipeline progress via Server-Sent Events.
 *
 * @param request - Query params: `subject`, `sessionId?`, `userId?`
 * @returns An SSE stream (`text/event-stream`) of {@link PipelineProgress} events.
 */
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      subject: searchParams.get("subject") ?? "",
      sessionId: searchParams.get("sessionId") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
    });

    if (!parsed.success) {
      logger.warn("Invalid stream request", {
        route: "/api/playground/stream",
        requestId,
        durationMs: Date.now() - startTime,
        details: parsed.error.flatten(),
      });
      return new Response(
        JSON.stringify({ error: "Invalid request. Provide a subject query parameter." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subject, sessionId } = parsed.data;

    if (sessionId) {
      updatePlaygroundSession(sessionId, { status: "running" });
    }

    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
    const pipelineStartTime = Date.now();

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

        const sendProgress = (progress: PipelineProgress) => {
          if (streamClosed) return;
          try {
            const data = `data: ${JSON.stringify(progress)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            streamClosed = true;
          }
        };

        try {
          await runAutoPipeline(
            subject,
            sendProgress,
            undefined,
            undefined,
            abortController.signal
          );
          logger.info("Playground pipeline completed", {
            route: "/api/playground/stream",
            requestId,
            durationMs: Date.now() - pipelineStartTime,
          });

          if (sessionId) {
            updatePlaygroundSession(sessionId, {
              status: "completed",
              completedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          logger.error("Playground pipeline error", {
            error: err instanceof Error ? err.message : String(err),
            stack:
              process.env.NODE_ENV !== "production"
                ? err instanceof Error
                  ? err.stack
                  : undefined
                : undefined,
            subject: subject.length > 30 ? subject.slice(0, 30) + "..." : subject,
            route: "/api/playground/stream",
            requestId,
          });

          if (sessionId) {
            updatePlaygroundSession(sessionId, { status: "failed" });
          }

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
    logger.error("Playground stream error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/playground/stream",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Stream failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
