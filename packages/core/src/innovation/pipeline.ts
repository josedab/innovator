import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { AbortError, LlmParseError } from "../errors.js";
import { buildSynthesisPrompt } from "../prompts/investigation.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import { runConcurrent } from "../concurrency/index.js";
import { getEventBus } from "../events/emitter.js";
import {
  ANGLE_IDS,
  MAX_CONCURRENCY,
  SynthesisSchema,
  type AngleId,
  type AngleResult,
  type Investigation,
  type PipelineProgress,
  type ModelRouting,
} from "../types.js";
import { investigate } from "./investigate.js";
import { generateForAngle } from "./generate.js";

/** Replace internal error details with a generic user-facing message to avoid leaking internals. */
function sanitizeErrorMessage(stage: string): string {
  return `${stage} encountered an internal error. Please try again.`;
}

/** Check if an error was caused by an AbortSignal. */
function isAbortError(err: unknown): boolean {
  if (err instanceof AbortError) return true;
  return err instanceof Error && /abort/i.test(err.message);
}

/**
 * Run the full innovation pipeline: investigate → generate for all angles → synthesize.
 *
 * @param subject - The topic to innovate on
 * @param onProgress - Callback invoked on each stage transition with the current {@link PipelineProgress}
 * @param model - Optional LLM model override
 * @param angles - Optional subset of angle IDs to use (defaults to all 8 angles)
 * @param signal - Optional AbortSignal to cancel the pipeline early
 * @param modelRouting - Optional per-stage model overrides (investigation, generation, synthesis)
 * @returns The final {@link PipelineProgress} including all angle results and synthesis
 *
 * @example
 * ```ts
 * const result = await runAutoPipeline(
 *   "code review processes",
 *   (progress) => console.log(progress.stage),
 * );
 * console.log(result.synthesis?.recommendation);
 * ```
 */
export async function runAutoPipeline(
  subject: string,
  onProgress: (progress: PipelineProgress) => void,
  model?: string,
  angles?: AngleId[],
  signal?: AbortSignal,
  modelRouting?: ModelRouting
): Promise<PipelineProgress> {
  const selectedAngles = angles ?? [...ANGLE_IDS];
  let terminated = false;
  const pipelineStart = Date.now();
  const bus = getEventBus();

  const progress: PipelineProgress = {
    stage: "investigating",
    completedAngles: [],
    totalAngles: selectedAngles.length,
    angleResults: [],
    durationMs: {},
  };

  const safeProgress = (p: PipelineProgress) => {
    if (terminated) return;
    try {
      onProgress({ ...p });
    } catch {
      // Client may have disconnected — ignore
    }
  };

  safeProgress(progress);
  bus.emit("pipeline.started", { subject, angles: selectedAngles }).catch(() => {});

  // Step 1: Investigate
  if (signal?.aborted) {
    progress.stage = "error";
    progress.stoppedEarly = true;
    progress.error = "Pipeline was aborted before investigation";
    progress.durationMs!.total = Date.now() - pipelineStart;
    terminated = true;
    return progress;
  }

  let investigation: Investigation;
  const investigationStart = Date.now();
  bus.emit("investigation.started", { subject }).catch(() => {});
  try {
    investigation = await investigate(subject, modelRouting?.investigation ?? model, signal);
    progress.investigation = investigation;
    progress.durationMs!.investigation = Date.now() - investigationStart;
    bus
      .emit("investigation.completed", { subject, durationMs: progress.durationMs!.investigation })
      .catch(() => {});
  } catch (err) {
    progress.durationMs!.investigation = Date.now() - investigationStart;
    progress.durationMs!.total = Date.now() - pipelineStart;
    bus
      .emit("investigation.failed", {
        subject,
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => {});
    if (isAbortError(err)) {
      progress.stage = "error";
      progress.stoppedEarly = true;
      progress.error = "Pipeline was aborted during investigation";
    } else {
      progress.stage = "error";
      progress.error = sanitizeErrorMessage("Investigation");
    }
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  // Step 2: Generate innovations for each angle
  progress.stage = "generating";
  safeProgress(progress);

  if (signal?.aborted) {
    progress.stage = "error";
    progress.stoppedEarly = true;
    progress.error = "Pipeline was aborted before generation";
    progress.durationMs!.total = Date.now() - pipelineStart;
    terminated = true;
    return progress;
  }

  const generationStart = Date.now();

  // Track completed angles for progress reporting; each task closure captures
  // its own angleId so concurrent .then() callbacks don't race on shared state.
  const completedSet = new Set<string>();

  const tasks = selectedAngles.map(
    (angleId) => () =>
      generateForAngle(
        subject,
        investigation,
        angleId,
        modelRouting?.generation ?? model,
        signal
      ).then((result) => {
        completedSet.add(angleId);
        progress.currentAngle = angleId;
        progress.completedAngles = [...completedSet];
        safeProgress(progress);
        return result;
      })
  );

  try {
    const { results: orderedResults, errors: angleErrors } = await runConcurrent(
      tasks,
      MAX_CONCURRENCY,
      signal
    );
    progress.durationMs!.generation = Date.now() - generationStart;
    // Keep successfully generated results
    progress.angleResults = orderedResults.filter((r): r is AngleResult => r !== undefined);
    if (angleErrors.length > 0) {
      progress.failedAngles = angleErrors.map((e) => ({
        angleId: selectedAngles[e.index],
        error: sanitizeErrorMessage(`Angle "${selectedAngles[e.index]}"`),
      }));
    }
    // If all angles failed, treat as error
    if (progress.angleResults.length === 0) {
      progress.stage = "error";
      progress.error = sanitizeErrorMessage("Generation");
      progress.durationMs!.total = Date.now() - pipelineStart;
      terminated = true;
      safeProgress(progress);
      return progress;
    }
  } catch {
    progress.stage = "error";
    progress.error = sanitizeErrorMessage("Generation");
    progress.durationMs!.generation = Date.now() - generationStart;
    progress.durationMs!.total = Date.now() - pipelineStart;
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  // Step 3: Synthesize
  progress.stage = "synthesizing";
  safeProgress(progress);
  bus
    .emit("synthesis.started", { subject, angleCount: progress.angleResults.length })
    .catch(() => {});

  if (signal?.aborted) {
    progress.stage = "error";
    progress.stoppedEarly = true;
    progress.error = "Pipeline was aborted before synthesis";
    progress.durationMs!.total = Date.now() - pipelineStart;
    terminated = true;
    return progress;
  }

  const synthesisStart = Date.now();
  try {
    const angleResultsJson = sanitizeLlmOutput(JSON.stringify(progress.angleResults, null, 2));
    const synthesisPrompt = buildSynthesisPrompt(subject, investigation, angleResultsJson);

    const parsedJson = await withRetry(
      async () => {
        const raw = await generateText({
          prompt: synthesisPrompt,
          model: modelRouting?.synthesis ?? model,
          serverMode: true,
          signal,
        });

        const jsonStr = extractJson(raw);
        try {
          return JSON.parse(jsonStr);
        } catch {
          throw new LlmParseError("Failed to parse LLM response as JSON", jsonStr.slice(0, 200));
        }
      },
      {
        signal,
        isRetryable: (err) =>
          err instanceof Error &&
          (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
      }
    );

    progress.synthesis = SynthesisSchema.parse(parsedJson);
    progress.durationMs!.synthesis = Date.now() - synthesisStart;
    bus
      .emit("synthesis.completed", { subject, durationMs: progress.durationMs!.synthesis })
      .catch(() => {});
  } catch (err) {
    progress.durationMs!.synthesis = Date.now() - synthesisStart;
    progress.durationMs!.total = Date.now() - pipelineStart;
    bus
      .emit("synthesis.failed", {
        subject,
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => {});
    if (isAbortError(err)) {
      progress.stage = "error";
      progress.stoppedEarly = true;
      progress.error = "Pipeline was aborted during synthesis";
    } else {
      progress.stage = "error";
      progress.error = sanitizeErrorMessage("Synthesis");
    }
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  progress.stage = "complete";
  progress.durationMs!.total = Date.now() - pipelineStart;
  terminated = true;
  bus
    .emit("pipeline.completed", {
      subject,
      durationMs: progress.durationMs!.total,
      angleCount: progress.angleResults.length,
    })
    .catch(() => {});
  safeProgress(progress);
  return progress;
}
