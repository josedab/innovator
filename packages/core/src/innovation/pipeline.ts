import { generateText, extractJson } from "../copilot/client.js";
import { buildSynthesisPrompt } from "../prompts/investigation.js";
import {
  ANGLE_IDS,
  SynthesisSchema,
  type AngleId,
  type AngleResult,
  type Investigation,
  type PipelineProgress,
  type Synthesis,
} from "../types.js";
import { investigate } from "./investigate.js";
import { generateForAngle } from "./generate.js";

const MAX_CONCURRENCY = 2;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: (T | undefined)[] = new Array(tasks.length);
  const errors: Error[] = [];
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < tasks.length; i++) {
    const index = i;
    const p = tasks[index]()
      .then((result) => {
        results[index] = result;
      })
      .catch((err) => {
        errors.push(err instanceof Error ? err : new Error(String(err)));
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

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} angle(s) failed: ${errors.map((e) => e.message).join("; ")}`
    );
  }

  return results as T[];
}

export async function runAutoPipeline(
  subject: string,
  onProgress: (progress: PipelineProgress) => void,
  model?: string,
  angles?: AngleId[]
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
  let investigation: Investigation;
  try {
    investigation = await investigate(subject, model);
    progress.investigation = investigation;
  } catch (err) {
    progress.stage = "error";
    progress.error = `Investigation failed: ${err instanceof Error ? err.message : String(err)}`;
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  // Step 2: Generate innovations for each angle
  progress.stage = "generating";
  safeProgress(progress);

  const tasks = selectedAngles.map(
    (angleId) => () =>
      generateForAngle(subject, investigation, angleId, model).then(
        (result) => {
          progress.angleResults.push(result);
          progress.completedAngles.push(angleId);
          progress.currentAngle = angleId;
          safeProgress(progress);
          return result;
        }
      )
  );

  try {
    const orderedResults = await runWithConcurrency(tasks, MAX_CONCURRENCY);
    // Replace with ordered results
    progress.angleResults = orderedResults;
  } catch (err) {
    progress.stage = "error";
    progress.error = `Generation failed: ${err instanceof Error ? err.message : String(err)}`;
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  // Step 3: Synthesize
  progress.stage = "synthesizing";
  safeProgress(progress);

  try {
    const angleResultsJson = JSON.stringify(progress.angleResults, null, 2);
    const synthesisPrompt = buildSynthesisPrompt(
      subject,
      investigation,
      angleResultsJson
    );
    const raw = await generateText({ prompt: synthesisPrompt, model, serverMode: true });

    const jsonStr = extractJson(raw);
    progress.synthesis = SynthesisSchema.parse(JSON.parse(jsonStr));
  } catch (err) {
    progress.stage = "error";
    progress.error = `Synthesis failed: ${err instanceof Error ? err.message : String(err)}`;
    terminated = true;
    safeProgress(progress);
    return progress;
  }

  progress.stage = "complete";
  terminated = true;
  safeProgress(progress);
  return progress;
}
