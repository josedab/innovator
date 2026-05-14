/**
 * @description Visual workflow builder API — validate, execute, and browse templates.
 */
export const runtime = "nodejs";

import {
  validateDAG,
  executeDAG,
  DAGWorkflowSchema,
  listBuiltinDSLs,
  getBuiltinDSL,
  dslToDAG,
  getWorkflowTemplates,
  getWorkflowTemplate,
  serializeDAGState,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS, SECURITY_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;

// ---- Request Schemas (discriminated union) ----

const ValidateSchema = z.object({
  action: z.literal("validate"),
  workflow: z.unknown(),
});

const ExecuteSchema = z.object({
  action: z.literal("execute"),
  subject: z.string().min(1).max(2000),
  workflowId: z.string().max(100).optional(),
  dslTemplateId: z.string().max(100).optional(),
  workflow: z.unknown().optional(),
  dryRun: z.boolean().default(false),
});

const TemplatesSchema = z.object({
  action: z.literal("templates"),
});

const GetTemplateSchema = z.object({
  action: z.literal("get_template"),
  id: z.string().max(100),
});

const RequestSchema = z.discriminatedUnion("action", [
  ValidateSchema,
  ExecuteSchema,
  TemplatesSchema,
  GetTemplateSchema,
]);

/**
 * Workflow builder endpoint.
 * Validates workflows, streams execution progress via SSE,
 * and provides built-in template browsing.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();

  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      // ---- Validate ----
      case "validate": {
        logger.info("Validating workflow", { route: "/api/workflow-builder", requestId });
        const dag = DAGWorkflowSchema.parse(parsed.workflow);
        const validation = validateDAG(dag);
        return Response.json(validation, { headers: API_RESPONSE_HEADERS });
      }

      // ---- Templates list ----
      case "templates": {
        const dagTemplates = getWorkflowTemplates().map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          tags: t.tags,
        }));
        const dslTemplates = listBuiltinDSLs();
        return Response.json(
          { templates: dagTemplates, dslTemplates, total: dagTemplates.length + dslTemplates.length },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      // ---- Get single template ----
      case "get_template": {
        // Try DAG template first, then DSL template
        const dagTemplate = getWorkflowTemplate(parsed.id);
        if (dagTemplate) {
          return Response.json(dagTemplate, { headers: API_RESPONSE_HEADERS });
        }
        const dslTemplate = getBuiltinDSL(parsed.id);
        if (dslTemplate) {
          const dag = dslToDAG(dslTemplate);
          const validation = validateDAG(dag);
          return Response.json(
            { id: parsed.id, ...dslTemplate, workflow: dag, validation },
            { headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json(
          { error: "Template not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }

      // ---- Execute (SSE streaming) ----
      case "execute": {
        // Resolve the workflow to execute
        let dag;
        if (parsed.dslTemplateId) {
          const dsl = getBuiltinDSL(parsed.dslTemplateId);
          if (!dsl) {
            return Response.json(
              { error: "DSL template not found" },
              { status: 404, headers: API_RESPONSE_HEADERS }
            );
          }
          dag = dslToDAG(dsl);
        } else if (parsed.workflowId) {
          const template = getWorkflowTemplate(parsed.workflowId);
          if (!template) {
            return Response.json(
              { error: "Workflow template not found" },
              { status: 404, headers: API_RESPONSE_HEADERS }
            );
          }
          dag = template.workflow;
        } else if (parsed.workflow) {
          dag = DAGWorkflowSchema.parse(parsed.workflow);
        } else {
          return Response.json(
            { error: "Provide workflowId, dslTemplateId, or workflow object" },
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }

        // Validate before execution
        const validation = validateDAG(dag);
        if (!validation.valid) {
          return Response.json(
            { error: "Invalid workflow", details: validation.errors },
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }

        logger.info(`Executing workflow: "${dag.name}"`, {
          route: "/api/workflow-builder",
          requestId,
          subject: parsed.subject.slice(0, 100),
          dryRun: parsed.dryRun,
        });

        // Stream execution progress via SSE
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

            const sendEvent = (event: Record<string, unknown>) => {
              if (streamClosed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } catch {
                streamClosed = true;
              }
            };

            try {
              sendEvent({
                type: "start",
                workflow: dag.name,
                subject: parsed.subject,
                totalSteps: dag.nodes.length,
              });

              const result = await executeDAG(dag, {
                context: { subject: parsed.subject },
                signal: abortController.signal,
                onProgress: (state, nodeResult) => {
                  sendEvent({
                    type: "progress",
                    step: nodeResult.nodeId,
                    status: nodeResult.status,
                    duration: nodeResult.duration,
                    output: nodeResult.output,
                    error: nodeResult.error,
                    currentNodes: state.currentNodes,
                  });
                },
              });

              sendEvent({
                type: "complete",
                status: result.status,
                summary: serializeDAGState(result),
              });

              logger.info("Workflow execution completed", {
                route: "/api/workflow-builder",
                requestId,
                status: result.status,
                durationMs: Date.now() - startTime,
              });
            } catch (err) {
              logger.error("Workflow execution error", {
                error: err instanceof Error ? err.message : String(err),
                route: "/api/workflow-builder",
                requestId,
              });
              sendEvent({
                type: "error",
                error: err instanceof Error ? err.message : "Execution failed",
              });
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
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", {
      route: "/api/workflow-builder",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return Response.json(
      { error: "Workflow builder request failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
