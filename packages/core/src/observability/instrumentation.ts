/**
 * @module observability/instrumentation
 *
 * Pipeline instrumentation utilities.
 * Wraps pipeline stages with automatic span creation, metric recording,
 * and structured logging. Integrates with the existing telemetry module.
 */

import { startSpan, endSpan, addSpanEvent } from "../telemetry/index.js";
import { logger } from "./logger.js";
import { recordPipelineExecution, recordLLMLatency } from "./metrics.js";
import type { PipelineStageName, InstrumentedStage } from "./types.js";

const activeStages = new Map<string, InstrumentedStage>();
const MAX_ACTIVE_STAGES = 1_000;
const STALE_STAGE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Begin instrumenting a pipeline stage.
 * Creates a telemetry span and logs the stage start.
 */
export function beginStage(
  stage: PipelineStageName,
  attributes?: Record<string, string | number | boolean>,
  traceId?: string,
  parentSpanId?: string
): { stageId: string; span: ReturnType<typeof startSpan> } {
  const span = startSpan(`pipeline.${stage}`, { stage, ...attributes }, parentSpanId, traceId);

  const instrumented: InstrumentedStage = {
    stage,
    startTime: new Date().toISOString(),
    tokenUsage: { input: 0, output: 0 },
    model: attributes?.["model"] as string | undefined,
    metadata: {},
  };

  activeStages.set(span.spanId, instrumented);

  // Evict stale stages that were never ended (prevents unbounded growth)
  if (activeStages.size > MAX_ACTIVE_STAGES) {
    const now = Date.now();
    for (const [id, s] of activeStages) {
      if (now - new Date(s.startTime).getTime() > STALE_STAGE_TTL_MS) {
        activeStages.delete(id);
      }
    }
  }

  logger.info(`Pipeline stage started: ${stage}`, {
    stage,
    traceId: span.traceId,
    spanId: span.spanId,
    ...attributes,
  });

  return { stageId: span.spanId, span };
}

/**
 * End a pipeline stage and record metrics.
 */
export function endStage(
  stageId: string,
  result: {
    success?: boolean;
    tokenUsage?: { input: number; output: number };
    model?: string;
    error?: string;
    ideaCount?: number;
    costUsd?: number;
  } = {}
): InstrumentedStage | undefined {
  const instrumented = activeStages.get(stageId);
  if (!instrumented) return undefined;

  instrumented.endTime = new Date().toISOString();
  instrumented.durationMs =
    new Date(instrumented.endTime).getTime() - new Date(instrumented.startTime).getTime();

  if (result.tokenUsage) {
    instrumented.tokenUsage = result.tokenUsage;
  }
  if (result.model) {
    instrumented.model = result.model;
  }
  if (result.error) {
    instrumented.error = result.error;
  }

  const success = result.success !== false;

  // Record telemetry span
  endSpan(stageId, success ? "ok" : "error", {
    "token.input": result.tokenUsage?.input ?? 0,
    "token.output": result.tokenUsage?.output ?? 0,
    duration_ms: instrumented.durationMs,
  });

  // Record Prometheus metrics
  recordPipelineExecution(
    instrumented.stage,
    instrumented.durationMs,
    instrumented.model ?? "unknown",
    success,
    (result.tokenUsage?.input ?? 0) + (result.tokenUsage?.output ?? 0),
    result.costUsd ?? 0
  );

  if (instrumented.model && instrumented.durationMs) {
    recordLLMLatency("auto", instrumented.model, instrumented.durationMs);
  }

  // Structured log
  const logFn = success ? logger.info : logger.error;
  logFn(`Pipeline stage ${success ? "completed" : "failed"}: ${instrumented.stage}`, {
    stage: instrumented.stage,
    durationMs: instrumented.durationMs,
    tokenInput: result.tokenUsage?.input ?? 0,
    tokenOutput: result.tokenUsage?.output ?? 0,
    model: instrumented.model ?? "unknown",
    success,
  });

  activeStages.delete(stageId);
  return instrumented;
}

/** Add an event to an active stage's span. */
export function addStageEvent(
  stageId: string,
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  addSpanEvent(stageId, name, attributes);
}

/** Get currently active stages. */
export function getActiveStages(): InstrumentedStage[] {
  return Array.from(activeStages.values());
}

/** Clear active stages (for testing). */
export function clearActiveStages(): void {
  activeStages.clear();
}
