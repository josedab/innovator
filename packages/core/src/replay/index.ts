/**
 * @module replay
 *
 * Prompt replay & A/B testing — records exact prompts, model, and parameters
 * for every pipeline run. Enables replaying runs with modified variables and
 * comparing outputs side-by-side with semantic similarity scoring.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { AngleResult, Investigation, Synthesis, AngleId } from "../types.js";

// ---- Zod Schemas ----

/** Schema for a single prompt invocation record. */
export const PromptRecordSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  model: z.string().optional(),
  stage: z.enum(["investigation", "generation", "synthesis"]),
  angleId: z.string().optional(),
  timestamp: z.string(),
  durationMs: z.number().optional(),
});

/** Schema for a complete pipeline run record. */
export const RunRecordSchema = z.object({
  id: z.string(),
  subject: z.string(),
  model: z.string().optional(),
  angles: z.array(z.string()),
  prompts: z.array(PromptRecordSchema),
  investigation: z.unknown().optional(),
  angleResults: z.array(z.unknown()).optional(),
  synthesis: z.unknown().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Schema for a comparison between two runs. */
export const RunComparisonSchema = z.object({
  runA: z.string(),
  runB: z.string(),
  overrides: z.record(z.unknown()),
  similarityScore: z.number().min(0).max(1),
  ideaOverlap: z.number().min(0).max(1),
  newIdeas: z.array(z.string()),
  removedIdeas: z.array(z.string()),
  analysis: z.string(),
  comparedAt: z.string(),
});

export type PromptRecord = z.infer<typeof PromptRecordSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type RunComparison = z.infer<typeof RunComparisonSchema>;

/** Overrides that can be applied when replaying a run. */
export interface ReplayOverrides {
  model?: string;
  subject?: string;
  angles?: AngleId[];
  promptModifier?: (prompt: string, stage: string) => string;
  metadata?: Record<string, unknown>;
}

// ---- In-memory store ----

const runRecords: Map<string, RunRecord> = new Map();
let recordingEnabled = true;

/** Enable or disable recording of pipeline runs. */
export function setRecordingEnabled(enabled: boolean): void {
  recordingEnabled = enabled;
}

/** Check if recording is currently enabled. */
export function isRecordingEnabled(): boolean {
  return recordingEnabled;
}

/** Generate a unique run ID. */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique prompt record ID. */
function generatePromptId(): string {
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Recording Functions ----

/**
 * Start recording a new pipeline run.
 *
 * @param subject - The innovation subject
 * @param model - The model being used
 * @param angles - The angles being run
 * @returns The run record ID
 */
export function startRunRecord(
  subject: string,
  model?: string,
  angles: string[] = []
): string {
  if (!recordingEnabled) return "";

  const id = generateRunId();
  const record: RunRecord = {
    id,
    subject,
    model,
    angles,
    prompts: [],
    createdAt: new Date().toISOString(),
  };
  runRecords.set(id, record);
  return id;
}

/**
 * Record a prompt invocation within a run.
 *
 * @param runId - The run record ID
 * @param prompt - The full prompt text
 * @param stage - The pipeline stage
 * @param model - The model used
 * @param angleId - Optional angle ID for generation stage
 * @param durationMs - Optional duration in milliseconds
 */
export function recordPrompt(
  runId: string,
  prompt: string,
  stage: PromptRecord["stage"],
  model?: string,
  angleId?: string,
  durationMs?: number
): void {
  if (!recordingEnabled || !runId) return;

  const record = runRecords.get(runId);
  if (!record) return;

  record.prompts.push({
    id: generatePromptId(),
    prompt,
    model,
    stage,
    angleId,
    timestamp: new Date().toISOString(),
    durationMs,
  });
}

/**
 * Complete a run record with final results.
 *
 * @param runId - The run record ID
 * @param results - The final pipeline results
 */
export function completeRunRecord(
  runId: string,
  results: {
    investigation?: Investigation;
    angleResults?: AngleResult[];
    synthesis?: Synthesis;
  }
): void {
  if (!recordingEnabled || !runId) return;

  const record = runRecords.get(runId);
  if (!record) return;

  record.investigation = results.investigation;
  record.angleResults = results.angleResults;
  record.synthesis = results.synthesis;
  record.completedAt = new Date().toISOString();
}

// ---- Retrieval Functions ----

/** Get a run record by ID. */
export function getRunRecord(runId: string): RunRecord | undefined {
  return runRecords.get(runId);
}

/** List all run records, optionally filtered by subject. */
export function listRunRecords(subject?: string): RunRecord[] {
  const records = Array.from(runRecords.values());
  if (subject) {
    return records.filter((r) =>
      r.subject.toLowerCase().includes(subject.toLowerCase())
    );
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Delete a run record by ID. */
export function deleteRunRecord(runId: string): boolean {
  return runRecords.delete(runId);
}

/** Clear all run records. */
export function clearRunRecords(): void {
  runRecords.clear();
}

// ---- Replay Functions ----

/**
 * Replay a recorded run with optional overrides.
 * Returns the prompts that would be sent (with modifications applied)
 * without executing them. Use this for preview/dry-run.
 *
 * @param runId - The run record ID to replay
 * @param overrides - Modifications to apply
 * @returns Modified prompts that would be sent
 */
export function previewReplay(
  runId: string,
  overrides: ReplayOverrides = {}
): { prompts: PromptRecord[]; model?: string; subject: string } | undefined {
  const record = runRecords.get(runId);
  if (!record) return undefined;

  const subject = overrides.subject ?? record.subject;
  const model = overrides.model ?? record.model;

  const modifiedPrompts = record.prompts.map((p) => {
    let prompt = p.prompt;

    // Apply subject override by replacing in prompt text
    if (overrides.subject && record.subject) {
      prompt = prompt.replaceAll(record.subject, overrides.subject);
    }

    // Apply custom prompt modifier
    if (overrides.promptModifier) {
      prompt = overrides.promptModifier(prompt, p.stage);
    }

    return {
      ...p,
      id: generatePromptId(),
      prompt,
      model: model ?? p.model,
      timestamp: new Date().toISOString(),
    };
  });

  // Filter by angle overrides if specified
  const filteredPrompts = overrides.angles
    ? modifiedPrompts.filter(
        (p) => p.stage !== "generation" || (p.angleId && overrides.angles!.includes(p.angleId as AngleId))
      )
    : modifiedPrompts;

  return { prompts: filteredPrompts, model, subject };
}

/**
 * Replay a recorded run by executing prompts with overrides.
 *
 * @param runId - The run record ID to replay
 * @param overrides - Modifications to apply
 * @param signal - Optional AbortSignal for cancellation
 * @returns A new RunRecord with the replayed results
 */
export async function replayRun(
  runId: string,
  overrides: ReplayOverrides = {},
  signal?: AbortSignal
): Promise<RunRecord | undefined> {
  const preview = previewReplay(runId, overrides);
  if (!preview) return undefined;

  const newRunId = startRunRecord(
    preview.subject,
    preview.model,
    overrides.angles ?? runRecords.get(runId)?.angles ?? []
  );

  const newRecord = runRecords.get(newRunId);
  if (!newRecord) return undefined;

  newRecord.metadata = {
    replayOf: runId,
    overrides: {
      model: overrides.model,
      subject: overrides.subject,
      angles: overrides.angles,
      hasPromptModifier: !!overrides.promptModifier,
    },
  };

  // Execute each prompt and collect results
  for (const promptRec of preview.prompts) {
    if (signal?.aborted) break;

    const start = Date.now();
    try {
      await generateText({
        prompt: promptRec.prompt,
        model: promptRec.model,
        serverMode: true,
        signal,
      });
      recordPrompt(
        newRunId,
        promptRec.prompt,
        promptRec.stage,
        promptRec.model,
        promptRec.angleId,
        Date.now() - start
      );
    } catch {
      recordPrompt(newRunId, promptRec.prompt, promptRec.stage, promptRec.model, promptRec.angleId);
    }
  }

  newRecord.completedAt = new Date().toISOString();
  return newRecord;
}

// ---- Comparison Functions ----

/**
 * Compare two run records using LLM-powered semantic analysis.
 *
 * @param runIdA - First run record ID
 * @param runIdB - Second run record ID
 * @param model - Optional model for comparison analysis
 * @param signal - Optional AbortSignal for cancellation
 * @returns A RunComparison with similarity scoring and analysis
 */
export async function compareRuns(
  runIdA: string,
  runIdB: string,
  model?: string,
  signal?: AbortSignal
): Promise<RunComparison | undefined> {
  const runA = runRecords.get(runIdA);
  const runB = runRecords.get(runIdB);
  if (!runA || !runB) return undefined;

  const ideasA = extractIdeaTitles(runA);
  const ideasB = extractIdeaTitles(runB);

  // Compute simple Jaccard similarity for idea overlap
  const setA = new Set(ideasA.map((t) => t.toLowerCase()));
  const setB = new Set(ideasB.map((t) => t.toLowerCase()));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  const ideaOverlap = union.size > 0 ? intersection.size / union.size : 0;

  const newIdeas = ideasB.filter((t) => !setA.has(t.toLowerCase()));
  const removedIdeas = ideasA.filter((t) => !setB.has(t.toLowerCase()));

  // LLM-powered semantic similarity analysis
  const prompt = `You are an innovation analysis expert. Compare these two sets of innovation ideas and assess their semantic similarity.

RUN A IDEAS (${runA.subject}):
${ideasA.map((t, i) => `${i + 1}. ${t}`).join("\n")}

RUN B IDEAS (${runB.subject}):
${ideasB.map((t, i) => `${i + 1}. ${t}`).join("\n")}

You MUST respond with valid JSON only:
{
  "similarityScore": <0.0-1.0, semantic similarity between the two sets>,
  "analysis": "Brief analysis of key differences and similarities"
}`;

  let similarityScore = ideaOverlap;
  let analysis = `Jaccard overlap: ${(ideaOverlap * 100).toFixed(1)}%. ${newIdeas.length} new ideas, ${removedIdeas.length} removed.`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { similarityScore: number; analysis: string };
    similarityScore = Math.max(0, Math.min(1, parsed.similarityScore));
    analysis = parsed.analysis;
  } catch {
    // Fall back to Jaccard similarity
  }

  // Determine overrides that were applied
  const overrides: Record<string, unknown> = {};
  if (runA.model !== runB.model) overrides.model = { from: runA.model, to: runB.model };
  if (runA.subject !== runB.subject) overrides.subject = { from: runA.subject, to: runB.subject };

  return {
    runA: runIdA,
    runB: runIdB,
    overrides,
    similarityScore,
    ideaOverlap,
    newIdeas,
    removedIdeas,
    analysis,
    comparedAt: new Date().toISOString(),
  };
}

function extractIdeaTitles(record: RunRecord): string[] {
  if (!Array.isArray(record.angleResults)) return [];
  return record.angleResults.flatMap((ar) => {
    const result = ar as AngleResult;
    return result.ideas?.map((i) => i.title) ?? [];
  });
}

/**
 * Export a comparison as a formatted markdown report.
 */
export function comparisonToMarkdown(comparison: RunComparison): string {
  const lines: string[] = [
    "# Run Comparison Report",
    "",
    `**Run A:** ${comparison.runA}`,
    `**Run B:** ${comparison.runB}`,
    `**Compared:** ${comparison.comparedAt}`,
    "",
    "## Metrics",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Semantic Similarity | ${(comparison.similarityScore * 100).toFixed(1)}% |`,
    `| Idea Overlap (Jaccard) | ${(comparison.ideaOverlap * 100).toFixed(1)}% |`,
    `| New Ideas in B | ${comparison.newIdeas.length} |`,
    `| Removed from A | ${comparison.removedIdeas.length} |`,
    "",
  ];

  if (Object.keys(comparison.overrides).length > 0) {
    lines.push("## Overrides Applied", "");
    for (const [key, value] of Object.entries(comparison.overrides)) {
      lines.push(`- **${key}**: ${JSON.stringify(value)}`);
    }
    lines.push("");
  }

  if (comparison.newIdeas.length > 0) {
    lines.push("## New Ideas in Run B", "");
    for (const idea of comparison.newIdeas) {
      lines.push(`- ${idea}`);
    }
    lines.push("");
  }

  if (comparison.removedIdeas.length > 0) {
    lines.push("## Ideas Only in Run A", "");
    for (const idea of comparison.removedIdeas) {
      lines.push(`- ${idea}`);
    }
    lines.push("");
  }

  lines.push("## Analysis", "", comparison.analysis, "");

  return lines.join("\n");
}
