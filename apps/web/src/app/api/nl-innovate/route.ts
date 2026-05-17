/**
 * @description Natural language innovation — free-form text to structured pipeline.
 */
export const runtime = "nodejs";

import { generateNLExecutionPlan, executeWithStreaming } from "@innovator/core";
import type { StreamEvent } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { SECURITY_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;

const RequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  model: z.string().optional(),
});

/**
 * Natural Language Innovation API — single-prompt orchestration with SSE streaming.
 * Accepts a natural language prompt, generates an execution plan, and streams results.
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
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        }
      );
    }

    const modelError = validateModel(parsed.data.model);
    if (modelError) return modelError;

    const { prompt, model } = parsed.data;
    const abortController = new AbortController();

    request.signal.addEventListener("abort", () => abortController.abort());

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let heartbeat: ReturnType<typeof setInterval> | undefined;

        function send(event: StreamEvent) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // Stream closed
          }
        }

        try {
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch {
              if (heartbeat) clearInterval(heartbeat);
            }
          }, HEARTBEAT_MS);

          // Generate execution plan
          const result = await generateNLExecutionPlan(prompt, model);
          send({ type: "plan_generated", plan: result.plan, timestamp: Date.now() });

          // Execute with streaming
          await executeWithStreaming(result.plan, send, {
            model,
            signal: abortController.signal,
          });
        } catch (err) {
          send({
            type: "step_failed",
            stepId: "error",
            error: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          logger.info("NL innovate completed", {
            requestId,
            durationMs: Date.now() - startTime,
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    logger.error("NL innovate failed", { requestId, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
