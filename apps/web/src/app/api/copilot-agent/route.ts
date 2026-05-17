/**
 * @description Innovation Copilot Agent — autonomous multi-step agent
 * that monitors repos, feeds, and team activity to discover opportunities.
 */
export const runtime = "nodejs";

import {
  runCopilotAgentCycle,
  respondToProposal,
  loadCopilotAgentRun,
  listCopilotAgentRuns,
} from "@innovator/core";
import type { CopilotAgentProgress } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { SECURITY_HEADERS, API_RESPONSE_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;

const RunCycleSchema = z.object({
  action: z.literal("run-cycle"),
  sources: z
    .array(
      z.object({
        id: z.string().max(200),
        type: z.enum(["repository", "rss-feed", "team-activity", "market-signal"]),
        name: z.string().max(200),
        url: z.string().max(2000).optional(),
        enabled: z.boolean().default(true),
      })
    )
    .min(1)
    .max(50),
  topics: z.array(z.string().max(200)).min(1).max(20),
  model: z.string().optional(),
  existingRunId: z.string().optional(),
  relevanceThreshold: z.number().min(0).max(1).optional(),
});

const RespondSchema = z.object({
  action: z.literal("respond"),
  runId: z.string().max(200),
  proposalId: z.string().max(200),
  response: z.enum(["accepted", "dismissed", "deferred"]),
  feedback: z.string().max(5000).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [RunCycleSchema, RespondSchema]);

/** Run the copilot agent cycle or respond to a proposal. */
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
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        }),
        {
          status: 400,
          headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    const data = parsed.data;

    // Handle feedback response (non-streaming)
    if (data.action === "respond") {
      const run = loadCopilotAgentRun(data.runId);
      if (!run) {
        return new Response(JSON.stringify({ error: `Run ${data.runId} not found` }), {
          status: 404,
          headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
        });
      }

      const updated = respondToProposal(run, data.proposalId, data.response, data.feedback);

      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Handle cycle run (streaming via SSE)
    const modelError = validateModel(data.model);
    if (modelError) return modelError;

    const abortController = new AbortController();
    request.signal.addEventListener("abort", () => abortController.abort());

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, HEARTBEAT_MS);

        try {
          const result = await runCopilotAgentCycle(
            {
              sources: data.sources,
              topics: data.topics,
              model: data.model,
              relevanceThreshold: data.relevanceThreshold,
              signal: abortController.signal,
            },
            data.existingRunId,
            (progress: CopilotAgentProgress) => {
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progress })}\n\n`)
                );
              } catch {
                /* client disconnected */
              }
            }
          );

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "result", run: result })}\n\n`)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Copilot agent cycle failed", { error: message, requestId });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`)
          );
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        ...API_RESPONSE_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Copilot agent request failed", { error: message, requestId });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  }
}

/** List agent runs or get a specific run. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");

    if (runId) {
      const run = loadCopilotAgentRun(runId);
      if (!run) {
        return new Response(JSON.stringify({ error: `Run ${runId} not found` }), {
          status: 404,
          headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(run), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    const runs = listCopilotAgentRuns();
    return new Response(JSON.stringify({ runs }), {
      status: 200,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  }
}
