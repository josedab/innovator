import { generateText, extractJson } from "../copilot/client.js";
import { buildSynthesisPrompt } from "../prompts/investigation.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import {
  ANGLE_IDS,
  MAX_CONCURRENCY,
  SynthesisSchema,
  type AngleId,
  type AngleResult,
  type Investigation,
  type PipelineProgress,
} from "../types.js";
import { investigate } from "./investigate.js";
import { generateForAngle } from "./generate.js";

/** Replace internal error details with a generic user-facing message. */
function sanitizeErrorMessage(stage: string): string {
  return `${stage} encountered an internal error. Please try again.`;
}

interface ConcurrencyResult<T> {
  results: (T | undefined)[];
  errors: { index: number; error: Error }[];
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  signal?: AbortSignal
): Promise<ConcurrencyResult<T>> {
  const results: (T | undefined)[] = new Array(tasks.length);
  const errors: { index: number; error: Error }[] = [];
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < tasks.length; i++) {
    if (signal?.aborted) break;

    const index = i;
    const p = tasks[index]()
      .then((result) => {
        results[index] = result;
      })
      .catch((err) => {
        errors.push({
          index,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    const wrapped = p.then(() => {
      executing.delete(wrapped);
    });
    executing.add(wrapped);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  // Wait for all in-flight tasks to settle
  await Promise.all(executing);

  return { results, errors };
}

/**
 * Run the full innovation pipeline: investigate → generate for all angles → synthesize.
 *
 * @param subject - The topic to innovate on
 * @param onProgress - Callback invoked on each stage transition with the current {@link PipelineProgress}
 * @param model - Optional LLM model override
 * @param angles - Optional subset of angle IDs to use (defaults to all 8 angles)
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
  signal?: AbortSignal
): Promise<PipelineProgress> {
  const selectedAngles = angles ?? [...ANGLE_IDS];
  let terminated = false;

  const progress: PipelineProgress = {
    stage: "investigating",
    completedAngles: [],
    totalAngles: selectedAngles.length,
    angleResults: [],
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

  // Step 1: Investigate
  if (signal?.aborted) {
    progress.stage = "error";
    progress.error = "Request was aborted";
    terminated = true;
    return progress;
  }

  let investigation: Investigation;
  try {
    investigation = await investigate(subject, model, signal);
    progress.investigation = investigation;
  } catch (err) {
    progress.stage = "error";
    progress.error = sanitizeErrorMessage("Investigation");
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  // Step 2: Generate innovations for each angle
  progress.stage = "generating";
  safeProgress(progress);

  if (signal?.aborted) {
    progress.stage = "error";
    progress.error = "Request was aborted";
    terminated = true;
    return progress;
  }

  const tasks = selectedAngles.map(
    (angleId) => () =>
      generateForAngle(subject, investigation, angleId, model, signal).then((result) => {
        progress.angleResults.push(result);
        progress.completedAngles.push(angleId);
        progress.currentAngle = angleId;
        safeProgress(progress);
        return result;
      })
  );

  try {
    const { results: orderedResults, errors: angleErrors } = await runWithConcurrency(
      tasks,
      MAX_CONCURRENCY,
      signal
    );
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
      terminated = true;
      safeProgress(progress);
      return progress;
    }
  } catch (err) {
    progress.stage = "error";
    progress.error = sanitizeErrorMessage("Generation");
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  // Step 3: Synthesize
  progress.stage = "synthesizing";
  safeProgress(progress);

  if (signal?.aborted) {
    progress.stage = "error";
    progress.error = "Request was aborted";
    terminated = true;
    return progress;
  }

  try {
    const angleResultsJson = sanitizeLlmOutput(JSON.stringify(progress.angleResults, null, 2));
    const synthesisPrompt = buildSynthesisPrompt(subject, investigation, angleResultsJson);
    const raw = await generateText({ prompt: synthesisPrompt, model, serverMode: true, signal });

    const jsonStr = extractJson(raw);
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonStr);
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${jsonStr.slice(0, 200)}`);
    }
    progress.synthesis = SynthesisSchema.parse(parsedJson);
  } catch (err) {
    progress.stage = "error";
    progress.error = sanitizeErrorMessage("Synthesis");
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  progress.stage = "complete";
  terminated = true;
  safeProgress(progress);
  return progress;
}
