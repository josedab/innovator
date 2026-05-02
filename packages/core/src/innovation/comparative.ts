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
 * Build a prompt for comparative synthesis across multiple subjects.
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
