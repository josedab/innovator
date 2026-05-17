/**
 * @module sprint
 *
 * Innovation Sprint Mode — guided multi-session innovation workflow:
 *   Day 1 (diverge): investigate broadly across all angles
 *   Day 2 (converge): score, filter, and rank ideas
 *   Day 3 (refine): develop top ideas into actionable plans
 *
 * Implements a state machine for phase progression with checkpoint
 * summaries and automatic progression suggestions.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import type { AngleResult, Investigation, Synthesis } from "../types.js";

// ---- Zod Schemas ----

/** Sprint phases in order. */
export const SPRINT_PHASES = ["diverge", "converge", "refine"] as const;
export const SprintPhaseSchema = z.enum(SPRINT_PHASES);
export type SprintPhase = z.infer<typeof SprintPhaseSchema>;

/** Sprint status values. */
export const SPRINT_STATUSES = ["not-started", "in-progress", "completed", "paused"] as const;
export const SprintStatusSchema = z.enum(SPRINT_STATUSES);
export type SprintStatus = z.infer<typeof SprintStatusSchema>;

/** Schema for a sprint checkpoint (end-of-phase summary). */
export const SprintCheckpointSchema = z.object({
  phase: SprintPhaseSchema,
  summary: z.string().max(5000),
  keyInsights: z.array(z.string().max(1000)).max(10),
  completedAt: z.string(),
  metrics: z.record(z.number()).optional(),
});

/** Schema for a sprint retrospective. */
export const SprintRetrospectiveSchema = z.object({
  overallSummary: z.string().max(5000),
  topIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        actionItems: z.array(z.string().max(500)).max(10),
      })
    )
    .max(10),
  lessonsLearned: z.array(z.string().max(1000)).max(10),
  nextSteps: z.array(z.string().max(1000)).max(10),
  generatedAt: z.string(),
});

/** Schema for a complete innovation sprint. */
export const SprintSchema = z.object({
  id: z.string(),
  subject: z.string().max(500),
  currentPhase: SprintPhaseSchema,
  status: SprintStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  investigation: z.unknown().optional(),
  angleResults: z.array(z.unknown()).optional(),
  synthesis: z.unknown().optional(),
  selectedIdeas: z.array(z.string().max(500)).optional(),
  refinedPlans: z.array(z.unknown()).optional(),
  checkpoints: z.array(SprintCheckpointSchema),
  retrospective: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SprintCheckpoint = z.infer<typeof SprintCheckpointSchema>;
export type SprintRetrospective = z.infer<typeof SprintRetrospectiveSchema>;
export type Sprint = z.infer<typeof SprintSchema>;

/** Phase metadata for display. */
export interface SprintPhaseDefinition {
  id: SprintPhase;
  name: string;
  description: string;
  icon: string;
  dayLabel: string;
  activities: string[];
}

/** All sprint phase definitions. */
export const SPRINT_PHASE_DEFINITIONS: SprintPhaseDefinition[] = [
  {
    id: "diverge",
    name: "Diverge",
    description: "Investigate broadly and generate ideas across all innovation angles",
    icon: "🌊",
    dayLabel: "Day 1",
    activities: [
      "Deep investigation of the subject",
      "Generate ideas from all 8 innovation angles",
      "Capture raw ideas without filtering",
      "Identify unexpected connections",
    ],
  },
  {
    id: "converge",
    name: "Converge",
    description: "Score, filter, and rank ideas to identify the most promising ones",
    icon: "🎯",
    dayLabel: "Day 2",
    activities: [
      "Score all ideas across feasibility, impact, and novelty",
      "Rank and prioritize ideas",
      "Synthesize results into themes",
      "Select top 3-5 ideas for refinement",
    ],
  },
  {
    id: "refine",
    name: "Refine",
    description: "Develop top ideas into detailed, actionable implementation plans",
    icon: "💎",
    dayLabel: "Day 3",
    activities: [
      "Create detailed implementation plans",
      "Identify dependencies and risks",
      "Define success metrics and milestones",
      "Generate retrospective and next steps",
    ],
  },
];

// ---- Sprint Store ----

const sprints: Map<string, Sprint> = new Map();

function generateSprintId(): string {
  return `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Sprint Lifecycle ----

/**
 * Create a new innovation sprint.
 *
 * @param subject - The topic to innovate on
 * @returns The created Sprint
 */
export function createSprint(subject: string): Sprint {
  const id = generateSprintId();
  const now = new Date().toISOString();
  const sprint: Sprint = {
    id,
    subject,
    currentPhase: "diverge",
    status: "not-started",
    createdAt: now,
    updatedAt: now,
    checkpoints: [],
  };
  sprints.set(id, sprint);
  return sprint;
}

/** Get a sprint by ID. */
export function getSprint(id: string): Sprint | undefined {
  return sprints.get(id);
}

/** List all sprints. */
export function listSprints(): Sprint[] {
  return Array.from(sprints.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Delete a sprint. */
export function deleteSprint(id: string): boolean {
  return sprints.delete(id);
}

/** Clear all sprints. */
export function clearSprints(): void {
  sprints.clear();
}

/**
 * Start or resume a sprint.
 */
export function startSprint(id: string): Sprint | undefined {
  const sprint = sprints.get(id);
  if (!sprint) return undefined;
  sprint.status = "in-progress";
  sprint.updatedAt = new Date().toISOString();
  return sprint;
}

/**
 * Pause a sprint.
 */
export function pauseSprint(id: string): Sprint | undefined {
  const sprint = sprints.get(id);
  if (!sprint) return undefined;
  sprint.status = "paused";
  sprint.updatedAt = new Date().toISOString();
  return sprint;
}

// ---- Phase Progression ----

/** Valid phase transitions. */
const PHASE_TRANSITIONS: Record<SprintPhase, SprintPhase | null> = {
  diverge: "converge",
  converge: "refine",
  refine: null,
};

/**
 * Check if the current phase can be advanced.
 */
export function canAdvancePhase(sprint: Sprint): { canAdvance: boolean; reason?: string } {
  if (sprint.status !== "in-progress") {
    return { canAdvance: false, reason: "Sprint is not in progress" };
  }

  const nextPhase = PHASE_TRANSITIONS[sprint.currentPhase];
  if (!nextPhase) {
    return { canAdvance: false, reason: "Sprint is in the final phase" };
  }

  // Check phase-specific requirements
  switch (sprint.currentPhase) {
    case "diverge":
      if (
        !sprint.investigation ||
        !sprint.angleResults ||
        (sprint.angleResults as unknown[]).length === 0
      ) {
        return {
          canAdvance: false,
          reason: "Complete investigation and angle generation before converging",
        };
      }
      return { canAdvance: true };
    case "converge":
      if (!sprint.synthesis || !sprint.selectedIdeas || sprint.selectedIdeas.length === 0) {
        return {
          canAdvance: false,
          reason: "Score, synthesize, and select top ideas before refining",
        };
      }
      return { canAdvance: true };
    default:
      return { canAdvance: true };
  }
}

/**
 * Advance to the next sprint phase, generating a checkpoint summary.
 *
 * @param id - Sprint ID
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Updated Sprint or undefined if not found
 */
export async function advancePhase(
  id: string,
  model?: string,
  signal?: AbortSignal
): Promise<Sprint | undefined> {
  const sprint = sprints.get(id);
  if (!sprint) return undefined;

  const { canAdvance, reason } = canAdvancePhase(sprint);
  if (!canAdvance) {
    throw new Error(reason ?? "Cannot advance phase");
  }

  // Generate checkpoint for current phase
  const checkpoint = await generateCheckpoint(sprint, model, signal);
  sprint.checkpoints.push(checkpoint);

  // Advance to next phase
  const nextPhase = PHASE_TRANSITIONS[sprint.currentPhase];
  if (nextPhase) {
    sprint.currentPhase = nextPhase;
  }

  sprint.updatedAt = new Date().toISOString();
  return sprint;
}

/**
 * Update sprint data for the current phase.
 */
export function updateSprintData(
  id: string,
  data: {
    investigation?: Investigation;
    angleResults?: AngleResult[];
    synthesis?: Synthesis;
    selectedIdeas?: string[];
    refinedPlans?: unknown[];
  }
): Sprint | undefined {
  const sprint = sprints.get(id);
  if (!sprint) return undefined;

  if (data.investigation) sprint.investigation = data.investigation;
  if (data.angleResults) sprint.angleResults = data.angleResults;
  if (data.synthesis) sprint.synthesis = data.synthesis;
  if (data.selectedIdeas) sprint.selectedIdeas = data.selectedIdeas;
  if (data.refinedPlans) sprint.refinedPlans = data.refinedPlans;
  sprint.updatedAt = new Date().toISOString();

  return sprint;
}

// ---- Phase-Specific Prompts ----

/**
 * Get the phase-specific prompt for the current sprint phase.
 */
export function getPhasePrompt(sprint: Sprint): string {
  switch (sprint.currentPhase) {
    case "diverge":
      return buildDivergePrompt(sprint.subject);
    case "converge":
      return buildConvergePrompt(sprint);
    case "refine":
      return buildRefinePrompt(sprint);
  }
}

function buildDivergePrompt(subject: string): string {
  return `You are facilitating Day 1 of an innovation sprint: DIVERGE phase.

${wrapUserInput("SUBJECT", subject)}

The goal is to explore broadly and generate as many diverse ideas as possible.
- Cast a wide net across different innovation angles
- Embrace unconventional and boundary-pushing ideas
- Don't filter or judge ideas yet — that comes in the converge phase
- Look for unexpected connections and analogies from other domains

Investigate the subject thoroughly and prepare for multi-angle idea generation.`;
}

function buildConvergePrompt(sprint: Sprint): string {
  const angleCount = Array.isArray(sprint.angleResults) ? sprint.angleResults.length : 0;
  return `You are facilitating Day 2 of an innovation sprint: CONVERGE phase.

${wrapUserInput("SUBJECT", sprint.subject)}

We completed the diverge phase with ${angleCount} angles explored.
Now the goal is to evaluate, prioritize, and select the most promising ideas.
- Score each idea on feasibility, impact, and novelty
- Identify common themes across angles
- Select the top 3-5 ideas that offer the best combination of impact and feasibility
- Be ruthless in filtering — only the best ideas move forward`;
}

function buildRefinePrompt(sprint: Sprint): string {
  const selectedCount = sprint.selectedIdeas?.length ?? 0;
  return `You are facilitating Day 3 of an innovation sprint: REFINE phase.

${wrapUserInput("SUBJECT", sprint.subject)}

We have ${selectedCount} top ideas selected from the converge phase.
Now the goal is to develop these into actionable implementation plans.
- Create detailed implementation roadmaps for each selected idea
- Identify key dependencies, risks, and milestones
- Define success metrics and KPIs
- Outline first 30-60-90 day action plan
- Prepare for stakeholder presentation`;
}

// ---- Checkpoint & Retrospective Generation ----

async function generateCheckpoint(
  sprint: Sprint,
  model?: string,
  signal?: AbortSignal
): Promise<SprintCheckpoint> {
  const phase = sprint.currentPhase;
  const context = buildPhaseContext(sprint);

  const prompt = `You are an innovation sprint facilitator generating an end-of-phase checkpoint.

PHASE: ${phase.toUpperCase()} (${SPRINT_PHASE_DEFINITIONS.find((p) => p.id === phase)?.dayLabel ?? ""})
${wrapUserInput("SUBJECT", sprint.subject)}

PHASE RESULTS:
${context}

Generate a checkpoint summary for this phase. You MUST respond with valid JSON only:
{
  "summary": "2-3 sentence summary of what was accomplished",
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
  "metrics": { "ideasGenerated": 0, "anglesExplored": 0 }
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      summary: string;
      keyInsights: string[];
      metrics?: Record<string, number>;
    };

    return {
      phase,
      summary: parsed.summary,
      keyInsights: parsed.keyInsights?.slice(0, 10) ?? [],
      completedAt: new Date().toISOString(),
      metrics: parsed.metrics,
    };
  } catch {
    return {
      phase,
      summary: `Completed ${phase} phase for "${sprint.subject}".`,
      keyInsights: [],
      completedAt: new Date().toISOString(),
    };
  }
}

function buildPhaseContext(sprint: Sprint): string {
  switch (sprint.currentPhase) {
    case "diverge": {
      const results = sprint.angleResults as AngleResult[] | undefined;
      const ideaCount = results?.reduce((sum, ar) => sum + ar.ideas.length, 0) ?? 0;
      return `Investigation completed. ${results?.length ?? 0} angles explored. ${ideaCount} ideas generated.`;
    }
    case "converge":
      return `Synthesis completed. ${sprint.selectedIdeas?.length ?? 0} ideas selected for refinement.`;
    case "refine":
      return `${sprint.refinedPlans?.length ?? 0} implementation plans created.`;
  }
}

/**
 * Generate a sprint retrospective after completing all phases.
 *
 * @param id - Sprint ID
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns SprintRetrospective
 */
export async function generateRetrospective(
  id: string,
  model?: string,
  signal?: AbortSignal
): Promise<SprintRetrospective | undefined> {
  const sprint = sprints.get(id);
  if (!sprint) return undefined;

  const checkpointSummaries = sprint.checkpoints.map((c) => `${c.phase}: ${c.summary}`).join("\n");

  const prompt = `You are an innovation sprint facilitator generating a retrospective.

${wrapUserInput("SUBJECT", sprint.subject)}

SPRINT CHECKPOINTS:
${checkpointSummaries}

Selected Ideas: ${sprint.selectedIdeas?.join(", ") ?? "None"}

Generate a sprint retrospective. You MUST respond with valid JSON only:
{
  "overallSummary": "Summary of the entire sprint",
  "topIdeas": [
    { "title": "Idea title", "description": "Brief description", "actionItems": ["Action 1", "Action 2"] }
  ],
  "lessonsLearned": ["Lesson 1", "Lesson 2"],
  "nextSteps": ["Next step 1", "Next step 2"]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as SprintRetrospective;

    const retro: SprintRetrospective = {
      overallSummary: parsed.overallSummary ?? "",
      topIdeas: parsed.topIdeas ?? [],
      lessonsLearned: parsed.lessonsLearned ?? [],
      nextSteps: parsed.nextSteps ?? [],
      generatedAt: new Date().toISOString(),
    };

    sprint.retrospective = retro;
    sprint.status = "completed";
    sprint.updatedAt = new Date().toISOString();

    return retro;
  } catch {
    return {
      overallSummary: `Sprint for "${sprint.subject}" completed with ${sprint.checkpoints.length} phases.`,
      topIdeas: [],
      lessonsLearned: [],
      nextSteps: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Get progression suggestions for the current phase.
 */
export function getProgressionSuggestions(sprint: Sprint): string[] {
  switch (sprint.currentPhase) {
    case "diverge":
      if (!sprint.investigation) {
        return [
          "Run investigation on the subject first",
          "Consider adding market signals for grounding",
        ];
      }
      if (!sprint.angleResults || (sprint.angleResults as unknown[]).length === 0) {
        return [
          "Generate ideas across all 8 innovation angles",
          "Try custom angles for domain-specific insights",
        ];
      }
      return ["Review generated ideas", "Ready to advance to Converge phase"];
    case "converge":
      if (!sprint.synthesis) {
        return ["Score and rank all generated ideas", "Synthesize results to identify themes"];
      }
      if (!sprint.selectedIdeas || sprint.selectedIdeas.length === 0) {
        return ["Select top 3-5 ideas for refinement"];
      }
      return ["Review selected ideas", "Ready to advance to Refine phase"];
    case "refine":
      if (!sprint.refinedPlans || (sprint.refinedPlans as unknown[]).length === 0) {
        return ["Create implementation plans for selected ideas", "Define success metrics"];
      }
      return ["Review implementation plans", "Generate retrospective to complete sprint"];
  }
}
