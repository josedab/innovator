import { generateText, extractJson } from "../copilot/client.js";
import { buildSynthesisPrompt } from "../prompts/investigation.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import { wrapUserInput, sanitizeUserInput } from "../prompts/sanitize.js";
import {
  SynthesisSchema,
  type AngleId,
  type AngleResult,
  type Investigation,
  type PipelineProgress,
  type Synthesis,
} from "../types.js";
import { investigate } from "./investigate.js";
import { runAutoPipeline } from "./pipeline.js";

/** Progress snapshot for comparative analysis across multiple subjects. */
export interface ComparativeProgress {
  /** Which subject is currently being processed (1-based index). */
  currentSubjectIndex: number;
  /** Total number of subjects. */
  totalSubjects: number;
  /** Current subject being processed. */
  currentSubject: string;
  /** Per-subject pipeline progress. */
  subjectProgress: Map<string, PipelineProgress>;
  /** Comparative synthesis (set once all subjects are done). */
  comparativeSynthesis?: ComparativeSynthesis;
  /** Overall stage. */
  stage: "processing" | "synthesizing" | "complete" | "error";
  error?: string;
}

/** Result of cross-subject comparative synthesis. */
export interface ComparativeSynthesis {
  synergies: Array<{ subjects: string[]; description: string; potentialImpact: string }>;
  tradeoffs: Array<{ subjects: string[]; description: string }>;
  combinedOpportunities: Array<{ title: string; description: string; relatedSubjects: string[] }>;
  recommendation: string;
}

/**
 * Build an LLM prompt for cross-subject comparative synthesis.
 *
 * Takes investigation results from multiple subjects and constructs a prompt
 * that asks the LLM to identify synergies, trade-offs, combined opportunities,
 * and a strategic recommendation across all subjects.
 *
 * @param subjects - Array of subject names being compared (2–5 items)
 * @param results - Per-subject investigation results with optional synthesis data
 * @returns A formatted prompt string ready to send to the LLM, requesting
 *          a JSON response conforming to {@link ComparativeSynthesis}
 */
export function buildComparativeSynthesisPrompt(
  subjects: string[],
  results: Array<{ subject: string; investigation: Investigation; synthesis?: Synthesis }>
): string {
  const subjectSections = results
    .map(
      (r) =>
        `SUBJECT: ${sanitizeUserInput(r.subject)}
Investigation Summary: ${sanitizeUserInput(r.investigation.summary)}
Challenges: ${r.investigation.challenges.map((c) => sanitizeUserInput(c)).join("; ")}
Opportunities: ${r.investigation.opportunities.map((o) => sanitizeUserInput(o)).join("; ")}
${r.synthesis ? `Top Ideas: ${r.synthesis.topIdeas.map((i) => sanitizeUserInput(i.title)).join(", ")}` : ""}`
    )
    .join("\n\n---\n\n");

  return `You are a strategic innovation synthesizer performing cross-subject comparative analysis.

Analyze the following ${subjects.length} subjects side by side:
${subjects.map((s, i) => `${i + 1}. ${sanitizeUserInput(s)}`).join("\n")}

SUBJECT DETAILS:
"""
${sanitizeLlmOutput(subjectSections)}
"""

Compare these subjects and identify connections. You MUST respond with valid JSON only.

Respond with this exact JSON structure:
{
  "synergies": [
    { "subjects": ["Subject A", "Subject B"], "description": "How they complement each other", "potentialImpact": "Impact description" }
  ],
  "tradeoffs": [
    { "subjects": ["Subject A", "Subject B"], "description": "Trade-off or tension between them" }
  ],
  "combinedOpportunities": [
    { "title": "Combined opportunity", "description": "Full description", "relatedSubjects": ["Subject A", "Subject B"] }
  ],
  "recommendation": "Overall strategic recommendation for pursuing these subjects together"
}

Identify 3-5 synergies, 2-4 trade-offs, 3-5 combined opportunities, and provide an actionable recommendation.`;
}

/**
 * Run comparative analysis pipeline across 2-5 subjects.
 */
export async function runComparativePipeline(
  subjects: string[],
  onProgress: (progress: ComparativeProgress) => void,
  model?: string,
  signal?: AbortSignal
): Promise<ComparativeProgress> {
  if (subjects.length < 2 || subjects.length > 5) {
    throw new Error("Comparative analysis requires 2-5 subjects");
  }

  const subjectProgress = new Map<string, PipelineProgress>();
  const subjectResults: Array<{
    subject: string;
    investigation: Investigation;
    synthesis?: Synthesis;
    angleResults: AngleResult[];
  }> = [];

  const progress: ComparativeProgress = {
    currentSubjectIndex: 0,
    totalSubjects: subjects.length,
    currentSubject: subjects[0],
    subjectProgress,
    stage: "processing",
  };

  // Process each subject sequentially
  for (let i = 0; i < subjects.length; i++) {
    if (signal?.aborted) {
      progress.stage = "error";
      progress.error = "Request was aborted";
      return progress;
    }

    progress.currentSubjectIndex = i + 1;
    progress.currentSubject = subjects[i];
    onProgress({ ...progress });

    const result = await runAutoPipeline(
      subjects[i],
      (p) => {
        subjectProgress.set(subjects[i], { ...p });
        onProgress({ ...progress });
      },
      model,
      undefined,
      signal
    );

    if (result.stage === "error") {
      progress.stage = "error";
      progress.error = `Failed on subject: ${subjects[i]}`;
      onProgress({ ...progress });
      return progress;
    }

    subjectResults.push({
      subject: subjects[i],
      investigation: result.investigation!,
      synthesis: result.synthesis,
      angleResults: result.angleResults,
    });
  }

  // Comparative synthesis
  progress.stage = "synthesizing";
  onProgress({ ...progress });

  try {
    const prompt = buildComparativeSynthesisPrompt(subjects, subjectResults);

    const raw = await generateText({
      prompt,
      model,
      serverMode: true,
      signal,
    });

    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as ComparativeSynthesis;
    progress.comparativeSynthesis = parsed;
  } catch (err) {
    progress.stage = "error";
    progress.error = "Comparative synthesis failed. Please try again.";
    onProgress({ ...progress });
    return progress;
  }

  progress.stage = "complete";
  onProgress({ ...progress });
  return progress;
}

// ---- Multi-Subject Parallel Investigation ----

/** Result of a parallel multi-subject investigation without full pipeline. */
export interface ParallelInvestigationResult {
  subjects: string[];
  investigations: Array<{
    subject: string;
    investigation: Investigation;
    status: "completed" | "failed";
    error?: string;
  }>;
  crossSubjectSynthesis?: ComparativeSynthesis;
  competitiveMap?: CompetitiveMap;
  stage: "completed" | "partial" | "failed";
}

/** Competitive positioning map across subjects. */
export interface CompetitiveMap {
  subjects: Array<{
    subject: string;
    strengths: string[];
    weaknesses: string[];
    uniqueAngles: string[];
  }>;
  overlapAreas: string[];
  differentiators: Array<{ subject: string; differentiator: string }>;
  recommendation: string;
}

/**
 * Run parallel investigations across multiple subjects and produce
 * cross-subject comparative synthesis with competitive mapping.
 */
export async function runParallelInvestigation(
  subjects: string[],
  options?: {
    model?: string;
    signal?: AbortSignal;
    includeCompetitiveMap?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<ParallelInvestigationResult> {
  if (subjects.length < 2 || subjects.length > 10) {
    throw new Error("Parallel investigation requires 2-10 subjects");
  }

  const investigations: ParallelInvestigationResult["investigations"] = [];

  // Investigate all subjects (sequentially to avoid rate limits)
  for (let i = 0; i < subjects.length; i++) {
    if (options?.signal?.aborted) break;
    options?.onProgress?.(i, subjects.length);

    try {
      const inv = await investigate(subjects[i], options?.model, options?.signal);
      investigations.push({ subject: subjects[i], investigation: inv, status: "completed" });
    } catch (err) {
      investigations.push({
        subject: subjects[i],
        investigation: {
          summary: "",
          keyAspects: [],
          currentState: "",
          challenges: [],
          opportunities: [],
        },
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const completed = investigations.filter((i) => i.status === "completed");
  if (completed.length < 2) {
    return { subjects, investigations, stage: "failed" };
  }

  // Cross-subject synthesis
  let crossSubjectSynthesis: ComparativeSynthesis | undefined;
  try {
    const prompt = buildComparativeSynthesisPrompt(
      completed.map((c) => c.subject),
      completed
    );
    const raw = await generateText({
      prompt,
      model: options?.model,
      serverMode: true,
      signal: options?.signal,
    });
    const jsonStr = extractJson(raw);
    crossSubjectSynthesis = JSON.parse(jsonStr) as ComparativeSynthesis;
  } catch {
    // Continue without synthesis
  }

  // Competitive map
  let competitiveMap: CompetitiveMap | undefined;
  if (options?.includeCompetitiveMap && completed.length >= 2) {
    try {
      competitiveMap = await buildCompetitiveMap(completed, options?.model, options?.signal);
    } catch {
      // Continue without competitive map
    }
  }

  options?.onProgress?.(subjects.length, subjects.length);

  return {
    subjects,
    investigations,
    crossSubjectSynthesis,
    competitiveMap,
    stage: completed.length === subjects.length ? "completed" : "partial",
  };
}

/**
 * Build a cross-subject competitive analysis map from parallel investigation results.
 *
 * Sends investigation summaries, opportunities, and challenges to an LLM to produce
 * a structured competitive positioning map with strengths, weaknesses, overlap areas,
 * differentiators, and a strategic recommendation.
 *
 * @param results - Array of subject–investigation pairs from parallel investigations
 * @param model - Optional LLM model ID override
 * @param signal - Optional AbortSignal to cancel the request early
 * @returns A {@link CompetitiveMap} with per-subject analysis and cross-subject insights
 */
async function buildCompetitiveMap(
  results: Array<{ subject: string; investigation: Investigation }>,
  model?: string,
  signal?: AbortSignal
): Promise<CompetitiveMap> {
  const prompt = `You are a competitive intelligence analyst. Compare the following subjects side by side and create a competitive positioning map.

${results
  .map(
    (r) => `SUBJECT: ${sanitizeUserInput(r.subject)}
Summary: ${sanitizeUserInput(r.investigation.summary)}
Opportunities: ${r.investigation.opportunities.map((o) => sanitizeUserInput(o)).join("; ")}
Challenges: ${r.investigation.challenges.map((c) => sanitizeUserInput(c)).join("; ")}
`
  )
  .join("\n---\n")}

You MUST respond with valid JSON only:
{
  "subjects": [
    { "subject": "Subject name", "strengths": ["strength1"], "weaknesses": ["weakness1"], "uniqueAngles": ["unique angle"] }
  ],
  "overlapAreas": ["Area where subjects overlap"],
  "differentiators": [{ "subject": "Subject name", "differentiator": "What makes it unique" }],
  "recommendation": "Strategic recommendation for pursuing or prioritizing these subjects"
}`;

  const raw = await generateText({ prompt, model, serverMode: true, signal });
  const jsonStr = extractJson(raw);
  return JSON.parse(jsonStr) as CompetitiveMap;
}
