import type { RetryOptions } from "../copilot/retry.js";
import { generateStructured, type TextGenerator } from "../copilot/structured-generation.js";
import { AbortError, LlmParseError, ValidationError } from "../errors.js";
import { buildSynthesisPrompt } from "../prompts/investigation.js";
import { sanitizeLlmOutput, validateSubject } from "../prompts/sanitize.js";
import { runConcurrent, type BatchResult } from "../concurrency/index.js";
import { getEventBus } from "../events/emitter.js";
import type { EventType } from "../events/types.js";
import {
  ANGLE_IDS,
  MAX_CONCURRENCY,
  SynthesisSchema,
  computeCompletionPercent,
  type AngleId,
  type AngleResult,
  type Investigation,
  type PipelineProgress,
  type ModelRouting,
} from "../types.js";
import { investigate } from "./investigate.js";
import { generateForAngle } from "./generate.js";

/** Configuration options for the auto-mode pipeline. */
export interface PipelineOptions {
  /** LLM model override for all stages (unless modelRouting overrides individual stages). */
  model?: string;
  /** Subset of angle IDs to process (defaults to all 8 built-in angles). */
  angles?: AngleId[];
  /** AbortSignal to cancel the pipeline early. */
  signal?: AbortSignal;
  /** Per-stage model overrides (investigation, generation, synthesis). */
  modelRouting?: ModelRouting;
  /** Retry configuration for LLM calls within the pipeline. */
  retryOptions?: Pick<
    RetryOptions,
    "maxAttempts" | "initialDelayMs" | "backoffMultiplier" | "maxDelayMs"
  >;
  /** Maximum concurrent angle generation tasks (defaults to MAX_CONCURRENCY = 2). */
  concurrency?: number;
  /** Text-generation dependency for all pipeline stages (defaults to Copilot). */
  textGenerator?: TextGenerator;
}

/** Replace internal error details with a generic user-facing message to avoid leaking internals. */
function sanitizeErrorMessage(stage: string): string {
  return `${stage} encountered an internal error. Please try again.`;
}

/** Check if an error was caused by an AbortSignal. */
function isAbortError(err: unknown): boolean {
  if (err instanceof AbortError) return true;
  return err instanceof Error && /abort/i.test(err.message);
}

type TimedStage = "investigation" | "generation" | "synthesis";
type AbortCheckpoint = "investigation" | "generation" | "synthesis";

interface PipelineContext {
  subject: string;
  onProgress: (progress: PipelineProgress) => void;
  selectedAngles: AngleId[];
  signal?: AbortSignal;
  model?: string;
  modelRouting?: ModelRouting;
  concurrency: number;
  retryOptions: PipelineOptions["retryOptions"];
  textGenerator?: TextGenerator;
  pipelineStart: number;
  bus: ReturnType<typeof getEventBus>;
  progress: PipelineProgress;
  terminated: boolean;
}

type StageOutcome<T> = { ok: true; value: T } | { ok: false };

interface GenerationState {
  completedSet: Set<string>;
  perAngleDurations: Record<string, number>;
}

interface TerminationOptions {
  stoppedEarly?: boolean;
  beforeTerminate?: () => void;
  notifyProgress?: boolean;
}

const ABORT_MESSAGES: Record<AbortCheckpoint, string> = {
  investigation: "Pipeline was aborted before investigation",
  generation: "Pipeline was aborted before generation",
  synthesis: "Pipeline was aborted before synthesis",
};

function startTimer(): number {
  return Date.now();
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function recordStageDuration(context: PipelineContext, stage: TimedStage, startedAt: number): void {
  context.progress.durationMs![stage] = elapsedSince(startedAt);
}

function recordTotalDuration(context: PipelineContext): void {
  context.progress.durationMs!.total = elapsedSince(context.pipelineStart);
}

function createPipelineContext(
  subject: string,
  onProgress: (progress: PipelineProgress) => void,
  model?: string,
  angles?: AngleId[],
  signal?: AbortSignal,
  modelRouting?: ModelRouting,
  pipelineOptions?: PipelineOptions
): PipelineContext {
  const selectedAngles = pipelineOptions?.angles ?? angles ?? [...ANGLE_IDS];
  const effectiveSignal = pipelineOptions?.signal ?? signal;
  const effectiveModel = pipelineOptions?.model ?? model;
  const effectiveRouting = pipelineOptions?.modelRouting ?? modelRouting;
  const effectiveConcurrency = pipelineOptions?.concurrency ?? MAX_CONCURRENCY;
  const retryOptions = pipelineOptions?.retryOptions;
  const textGenerator = pipelineOptions?.textGenerator;

  const validation = validateSubject(subject);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }

  const pipelineStart = startTimer();
  const bus = getEventBus();
  const progress: PipelineProgress = {
    stage: "investigating",
    completedAngles: [],
    totalAngles: selectedAngles.length,
    angleResults: [],
    durationMs: {},
  };

  return {
    subject: validation.sanitized!,
    onProgress,
    selectedAngles,
    signal: effectiveSignal,
    model: effectiveModel,
    modelRouting: effectiveRouting,
    concurrency: effectiveConcurrency,
    retryOptions,
    textGenerator,
    pipelineStart,
    bus,
    progress,
    terminated: false,
  };
}

function getStageModel(context: PipelineContext, stage: keyof ModelRouting): string | undefined {
  return context.modelRouting?.[stage] ?? context.model;
}

function emitProgress(context: PipelineContext): void {
  if (context.terminated) return;
  try {
    context.progress.completionPercent = computeCompletionPercent(context.progress);
    context.onProgress({ ...context.progress });
  } catch {
    // Client may have disconnected — ignore
  }
}

function emitPipelineEvent(
  context: PipelineContext,
  type: EventType,
  payload: Record<string, unknown>
): void {
  context.bus.emit(type, payload).catch(() => {});
}

function announcePipelineStart(context: PipelineContext): void {
  emitProgress(context);
  emitPipelineEvent(context, "pipeline.started", {
    subject: context.subject,
    angles: context.selectedAngles,
  });
}

function enterGenerationStage(context: PipelineContext): void {
  context.progress.stage = "generating";
  emitProgress(context);
}

function enterSynthesisStage(context: PipelineContext): void {
  context.progress.stage = "synthesizing";
  emitProgress(context);
  emitPipelineEvent(context, "synthesis.started", {
    subject: context.subject,
    angleCount: context.progress.angleResults.length,
  });
}

function terminateWithError(
  context: PipelineContext,
  message: string,
  options: TerminationOptions = {}
): PipelineProgress {
  context.progress.stage = "error";
  if (options.stoppedEarly) {
    context.progress.stoppedEarly = true;
  }
  context.progress.error = message;
  options.beforeTerminate?.();
  context.terminated = true;
  if (options.notifyProgress !== false) {
    emitProgress(context);
  }
  return context.progress;
}

function abortAtCheckpoint(context: PipelineContext, checkpoint: AbortCheckpoint): boolean {
  if (!context.signal?.aborted) return false;
  terminateWithError(context, ABORT_MESSAGES[checkpoint], {
    stoppedEarly: true,
    beforeTerminate: () => recordTotalDuration(context),
    notifyProgress: false,
  });
  return true;
}

function callInvestigation(context: PipelineContext): Promise<Investigation> {
  const investigationModel = getStageModel(context, "investigation");
  return context.textGenerator
    ? investigate(context.subject, investigationModel, context.signal, context.textGenerator)
    : investigate(context.subject, investigationModel, context.signal);
}

async function runInvestigationStage(
  context: PipelineContext
): Promise<StageOutcome<Investigation>> {
  const investigationStart = startTimer();
  try {
    const investigation = await callInvestigation(context);
    context.progress.investigation = investigation;
    recordStageDuration(context, "investigation", investigationStart);
    return { ok: true, value: investigation };
  } catch (error) {
    recordStageDuration(context, "investigation", investigationStart);
    recordTotalDuration(context);
    const aborted = isAbortError(error);
    terminateWithError(
      context,
      aborted ? "Pipeline was aborted during investigation" : sanitizeErrorMessage("Investigation"),
      { stoppedEarly: aborted }
    );
    return { ok: false };
  }
}

function callAngleGeneration(
  context: PipelineContext,
  investigation: Investigation,
  angleId: AngleId,
  generationModel: string | undefined
): Promise<AngleResult> {
  return context.textGenerator
    ? generateForAngle(
        context.subject,
        investigation,
        angleId,
        generationModel,
        context.signal,
        context.textGenerator
      )
    : generateForAngle(context.subject, investigation, angleId, generationModel, context.signal);
}

function recordAngleCompletion(
  context: PipelineContext,
  state: GenerationState,
  angleId: AngleId,
  angleStart: number
): void {
  state.perAngleDurations[angleId] = elapsedSince(angleStart);
  state.completedSet.add(angleId);
  context.progress.currentAngle = angleId;
  context.progress.completedAngles = [...state.completedSet];
  context.progress.durationMs!.perAngle = { ...state.perAngleDurations };
  emitProgress(context);
}

function createAngleTask(
  context: PipelineContext,
  investigation: Investigation,
  state: GenerationState,
  angleId: AngleId
): () => Promise<AngleResult> {
  return () => {
    const angleStart = startTimer();
    const generationModel = getStageModel(context, "generation");
    return callAngleGeneration(context, investigation, angleId, generationModel).then((result) => {
      recordAngleCompletion(context, state, angleId, angleStart);
      return result;
    });
  };
}

function createAngleTasks(
  context: PipelineContext,
  investigation: Investigation,
  state: GenerationState
): Array<() => Promise<AngleResult>> {
  return context.selectedAngles.map((angleId) =>
    createAngleTask(context, investigation, state, angleId)
  );
}

function applyGenerationBatch(
  context: PipelineContext,
  state: GenerationState,
  generationStart: number,
  batch: BatchResult<AngleResult>
): boolean {
  recordStageDuration(context, "generation", generationStart);
  context.progress.durationMs!.perAngle = { ...state.perAngleDurations };
  context.progress.angleResults = batch.results.filter(
    (result): result is AngleResult => result !== undefined
  );
  if (batch.errors.length > 0) {
    context.progress.failedAngles = batch.errors.map((error) => ({
      angleId: context.selectedAngles[error.index],
      error: sanitizeErrorMessage(`Angle "${context.selectedAngles[error.index]}"`),
    }));
  }
  if (context.progress.angleResults.length > 0) {
    return true;
  }
  terminateWithError(context, sanitizeErrorMessage("Generation"), {
    beforeTerminate: () => recordTotalDuration(context),
  });
  return false;
}

async function runGenerationStage(
  context: PipelineContext,
  investigation: Investigation
): Promise<boolean> {
  const generationStart = startTimer();
  const state: GenerationState = {
    completedSet: new Set<string>(),
    perAngleDurations: {},
  };
  const tasks = createAngleTasks(context, investigation, state);

  try {
    const batch = await runConcurrent(tasks, context.concurrency, context.signal);
    return applyGenerationBatch(context, state, generationStart, batch);
  } catch {
    terminateWithError(context, sanitizeErrorMessage("Generation"), {
      beforeTerminate: () => {
        recordStageDuration(context, "generation", generationStart);
        recordTotalDuration(context);
      },
    });
    return false;
  }
}

function generateSynthesis(
  context: PipelineContext,
  investigation: Investigation
): Promise<NonNullable<PipelineProgress["synthesis"]>> {
  const angleResultsJson = sanitizeLlmOutput(
    JSON.stringify(context.progress.angleResults, null, 2)
  );
  const synthesisPrompt = buildSynthesisPrompt(context.subject, investigation, angleResultsJson);

  return generateStructured(
    {
      generateOptions: {
        prompt: synthesisPrompt,
        model: getStageModel(context, "synthesis"),
        serverMode: true,
        signal: context.signal,
      },
      retryOptions: {
        signal: context.signal,
        ...context.retryOptions,
      },
      schema: SynthesisSchema,
      sanitizeBeforeExtract: false,
      createParseError: (jsonStr) =>
        new LlmParseError("Failed to parse LLM response as JSON", jsonStr.slice(0, 200)),
    },
    context.textGenerator
  );
}

async function runSynthesisStage(
  context: PipelineContext,
  investigation: Investigation
): Promise<boolean> {
  const synthesisStart = startTimer();
  try {
    context.progress.synthesis = await generateSynthesis(context, investigation);
    recordStageDuration(context, "synthesis", synthesisStart);
    emitPipelineEvent(context, "synthesis.completed", {
      subject: context.subject,
      durationMs: context.progress.durationMs!.synthesis,
    });
    return true;
  } catch (error) {
    recordStageDuration(context, "synthesis", synthesisStart);
    recordTotalDuration(context);
    emitPipelineEvent(context, "synthesis.failed", {
      subject: context.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    const aborted = isAbortError(error);
    terminateWithError(
      context,
      aborted ? "Pipeline was aborted during synthesis" : sanitizeErrorMessage("Synthesis"),
      { stoppedEarly: aborted }
    );
    return false;
  }
}

function completePipeline(context: PipelineContext): PipelineProgress {
  context.progress.stage = "complete";
  recordTotalDuration(context);
  context.terminated = true;
  emitPipelineEvent(context, "pipeline.completed", {
    subject: context.subject,
    durationMs: context.progress.durationMs!.total,
    angleCount: context.progress.angleResults.length,
  });
  emitProgress(context);
  return context.progress;
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
 * @param pipelineOptions - Optional {@link PipelineOptions} for retry and concurrency configuration
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
  modelRouting?: ModelRouting,
  pipelineOptions?: PipelineOptions
): Promise<PipelineProgress> {
  const context = createPipelineContext(
    subject,
    onProgress,
    model,
    angles,
    signal,
    modelRouting,
    pipelineOptions
  );

  announcePipelineStart(context);
  if (abortAtCheckpoint(context, "investigation")) return context.progress;

  const investigation = await runInvestigationStage(context);
  if (!investigation.ok) return context.progress;

  enterGenerationStage(context);
  if (abortAtCheckpoint(context, "generation")) return context.progress;
  if (!(await runGenerationStage(context, investigation.value))) return context.progress;

  enterSynthesisStage(context);
  if (abortAtCheckpoint(context, "synthesis")) return context.progress;
  if (!(await runSynthesisStage(context, investigation.value))) return context.progress;

  return completePipeline(context);
}
