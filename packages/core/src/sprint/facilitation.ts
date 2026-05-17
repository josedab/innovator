/**
 * @module sprint/facilitation
 *
 * Innovation Sprint Facilitation Engine — time-boxed sessions (1-4 hours)
 * with automated facilitation: timed phases, automatic prompting, voting
 * rounds, and sprint retrospective generation.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { LlmParseError, ValidationError } from "../errors.js";

// ---- Schemas ----

export const SprintTemplateIdSchema = z.enum([
  "design-sprint",
  "lightning-decision-jam",
  "rapid-ideation",
  "innovation-kata",
  "custom",
]);

export const SprintPhaseConfigSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000),
  durationMinutes: z.number().min(1).max(480),
  type: z.enum(["diverge", "converge", "vote", "refine", "present", "break"]),
  prompts: z.array(z.string().max(2000)).max(10),
  icon: z.string().max(10).optional(),
});

export const SprintParticipantSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  role: z.enum(["facilitator", "participant", "observer"]),
  joinedAt: z.string(),
  ideasSubmitted: z.number().default(0),
  votesUsed: z.number().default(0),
});

export const SprintTemplateSchema = z.object({
  id: SprintTemplateIdSchema,
  name: z.string().max(200),
  description: z.string().max(2000),
  totalDurationMinutes: z.number(),
  phases: z.array(SprintPhaseConfigSchema),
  maxParticipants: z.number().default(20),
  votesPerParticipant: z.number().default(3),
});

export const FacilitatedSprintSchema = z.object({
  id: z.string(),
  templateId: SprintTemplateIdSchema,
  subject: z.string().max(2000),
  status: z.enum(["waiting", "active", "paused", "completed"]),
  currentPhaseIndex: z.number(),
  participants: z.array(SprintParticipantSchema),
  phaseStartedAt: z.string().optional(),
  ideas: z
    .array(
      z.object({
        id: z.string(),
        content: z.string().max(5000),
        authorId: z.string(),
        phaseId: z.string(),
        votes: z.number().default(0),
        createdAt: z.string(),
      })
    )
    .max(500),
  phaseSummaries: z.array(
    z.object({
      phaseId: z.string(),
      summary: z.string().max(5000),
      keyOutcomes: z.array(z.string().max(1000)).max(10),
      generatedAt: z.string(),
    })
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

export const SprintReportSchema = z.object({
  sprintId: z.string(),
  templateName: z.string(),
  subject: z.string(),
  totalDurationMinutes: z.number(),
  participantCount: z.number(),
  totalIdeas: z.number(),
  topIdeas: z
    .array(
      z.object({
        content: z.string(),
        votes: z.number(),
        author: z.string(),
      })
    )
    .max(20),
  phaseSummaries: z.array(
    z.object({
      phase: z.string(),
      summary: z.string(),
      keyOutcomes: z.array(z.string()),
    })
  ),
  retrospective: z.object({
    whatWorked: z.array(z.string().max(1000)).max(10),
    whatToImprove: z.array(z.string().max(1000)).max(10),
    actionItems: z.array(z.string().max(1000)).max(10),
  }),
  generatedAt: z.string(),
});

// ---- Types ----

export type SprintTemplateId = z.infer<typeof SprintTemplateIdSchema>;
export type SprintTemplate = z.infer<typeof SprintTemplateSchema>;
export type FacilitatedSprint = z.infer<typeof FacilitatedSprintSchema>;
export type SprintParticipant = z.infer<typeof SprintParticipantSchema>;
export type SprintPhaseConfig = z.infer<typeof SprintPhaseConfigSchema>;
export type SprintReport = z.infer<typeof SprintReportSchema>;

// ---- Built-in Templates ----

export const SPRINT_TEMPLATES: SprintTemplate[] = [
  {
    id: "design-sprint",
    name: "Design Sprint",
    description:
      "Google Ventures-style design sprint compressed to 2-4 hours. Rapid problem framing, ideation, and concept selection.",
    totalDurationMinutes: 180,
    phases: [
      {
        id: "understand",
        name: "Understand",
        description: "Map the problem space and define the challenge",
        durationMinutes: 30,
        type: "diverge",
        prompts: [
          "What is the core problem we're trying to solve?",
          "Who are the key users affected?",
          "What constraints must we work within?",
        ],
        icon: "🗺️",
      },
      {
        id: "diverge",
        name: "Diverge",
        description: "Generate as many ideas as possible — quantity over quality",
        durationMinutes: 40,
        type: "diverge",
        prompts: [
          "Think wildly — no idea is too crazy",
          "How would a competitor solve this?",
          "What if we had unlimited resources?",
        ],
        icon: "💡",
      },
      {
        id: "converge",
        name: "Converge",
        description: "Vote and select the most promising ideas",
        durationMinutes: 20,
        type: "vote",
        prompts: [
          "Review all ideas silently",
          "Vote for your top 3 ideas",
          "Discuss the top-voted ideas",
        ],
        icon: "🎯",
      },
      {
        id: "prototype",
        name: "Prototype Concept",
        description: "Sketch a rough concept for the top idea",
        durationMinutes: 45,
        type: "refine",
        prompts: [
          "Define the key user flow",
          "What's the minimum viable version?",
          "What would a headline about this product say?",
        ],
        icon: "✏️",
      },
      {
        id: "critique",
        name: "Critique & Iterate",
        description: "Challenge the concept and refine",
        durationMinutes: 30,
        type: "converge",
        prompts: [
          "What could go wrong?",
          "What assumption are we most uncertain about?",
          "How would we test this in one week?",
        ],
        icon: "🔍",
      },
      {
        id: "break",
        name: "Break",
        description: "Short break before final presentation",
        durationMinutes: 5,
        type: "break",
        prompts: [],
        icon: "☕",
      },
      {
        id: "present",
        name: "Present & Decide",
        description: "Present the refined concept and decide next steps",
        durationMinutes: 10,
        type: "present",
        prompts: ["Summarize the solution in one sentence", "Define the first experiment to run"],
        icon: "🎤",
      },
    ],
    maxParticipants: 8,
    votesPerParticipant: 3,
  },
  {
    id: "lightning-decision-jam",
    name: "Lightning Decision Jam",
    description:
      "Fast, structured decision-making process (40 minutes). Identify problems, generate solutions, vote, and commit to action.",
    totalDurationMinutes: 60,
    phases: [
      {
        id: "problems",
        name: "List Problems",
        description: "Everyone writes problems on stickies (silent)",
        durationMinutes: 7,
        type: "diverge",
        prompts: [
          "What frustrates you most?",
          "Where do we waste time?",
          "What would users complain about?",
        ],
        icon: "⚡",
      },
      {
        id: "vote-problems",
        name: "Vote on Problems",
        description: "Dot-vote the most important problems",
        durationMinutes: 5,
        type: "vote",
        prompts: ["Vote for the problem that matters most"],
        icon: "🗳️",
      },
      {
        id: "reframe",
        name: "Reframe as HMW",
        description: "Turn top problem into 'How Might We...' question",
        durationMinutes: 5,
        type: "converge",
        prompts: ["How might we turn this problem into an opportunity?"],
        icon: "🔄",
      },
      {
        id: "solutions",
        name: "Generate Solutions",
        description: "Brainstorm solutions silently",
        durationMinutes: 10,
        type: "diverge",
        prompts: [
          "Write as many solutions as possible",
          "Think of solutions from other industries",
        ],
        icon: "💡",
      },
      {
        id: "vote-solutions",
        name: "Vote on Solutions",
        description: "Dot-vote the best solutions",
        durationMinutes: 5,
        type: "vote",
        prompts: ["Vote for the most impactful solution"],
        icon: "🗳️",
      },
      {
        id: "effort-impact",
        name: "Effort/Impact Map",
        description: "Place top solutions on effort vs impact matrix",
        durationMinutes: 10,
        type: "converge",
        prompts: ["Low effort + high impact = do first"],
        icon: "📊",
      },
      {
        id: "commit",
        name: "Commit to Actions",
        description: "Define action items with owners and deadlines",
        durationMinutes: 8,
        type: "refine",
        prompts: ["Who will own this?", "What's the first step?", "When will it be done?"],
        icon: "✅",
      },
    ],
    maxParticipants: 12,
    votesPerParticipant: 3,
  },
  {
    id: "rapid-ideation",
    name: "Rapid Ideation",
    description:
      "High-intensity 60-minute ideation session focused on volume. Multiple rounds with increasing constraints.",
    totalDurationMinutes: 60,
    phases: [
      {
        id: "warm-up",
        name: "Warm-Up",
        description: "Quick creative warm-up exercise",
        durationMinutes: 5,
        type: "diverge",
        prompts: ["Name 10 uses for a paperclip in 2 minutes"],
        icon: "🔥",
      },
      {
        id: "freeform",
        name: "Freeform Ideation",
        description: "Open brainstorm — anything goes",
        durationMinutes: 15,
        type: "diverge",
        prompts: ["No filters. Write every idea that comes to mind.", "Build on others' ideas"],
        icon: "🌊",
      },
      {
        id: "constrained",
        name: "Constrained Ideation",
        description: "Ideate with specific constraints applied",
        durationMinutes: 15,
        type: "diverge",
        prompts: [
          "What if you could only use existing technology?",
          "What if it had to work for 1 billion users?",
          "What if it had to be free?",
        ],
        icon: "🔒",
      },
      {
        id: "mashup",
        name: "Idea Mashup",
        description: "Combine ideas from previous rounds",
        durationMinutes: 10,
        type: "converge",
        prompts: ["Pick two ideas and combine them", "What's the best of both worlds?"],
        icon: "🔀",
      },
      {
        id: "select",
        name: "Select Top Ideas",
        description: "Vote and select final top ideas",
        durationMinutes: 10,
        type: "vote",
        prompts: ["Vote for the idea with most potential"],
        icon: "⭐",
      },
      {
        id: "next-steps",
        name: "Next Steps",
        description: "Define actions for top ideas",
        durationMinutes: 5,
        type: "refine",
        prompts: ["What's the one thing to do next for each top idea?"],
        icon: "🚀",
      },
    ],
    maxParticipants: 20,
    votesPerParticipant: 5,
  },
  {
    id: "innovation-kata",
    name: "Innovation Kata",
    description:
      "Toyota Kata-inspired structured innovation practice (90 minutes). Focus on learning through experimentation.",
    totalDurationMinutes: 90,
    phases: [
      {
        id: "direction",
        name: "Set Direction",
        description: "Define the challenge and target condition",
        durationMinutes: 15,
        type: "diverge",
        prompts: ["What is our target condition?", "Where are we now?", "What's the gap?"],
        icon: "🧭",
      },
      {
        id: "obstacles",
        name: "Identify Obstacles",
        description: "List obstacles preventing target condition",
        durationMinutes: 15,
        type: "diverge",
        prompts: ["What's stopping us?", "Which obstacle should we address first?"],
        icon: "🪨",
      },
      {
        id: "experiment",
        name: "Design Experiments",
        description: "Create experiments to overcome the top obstacle",
        durationMinutes: 25,
        type: "refine",
        prompts: [
          "What experiment can we run?",
          "What do we expect to happen?",
          "How will we know if it worked?",
        ],
        icon: "🧪",
      },
      {
        id: "review",
        name: "Peer Review",
        description: "Review and improve experiment designs",
        durationMinutes: 15,
        type: "converge",
        prompts: ["Is this experiment small enough?", "Are we measuring the right thing?"],
        icon: "👥",
      },
      {
        id: "commit",
        name: "Commit & Plan",
        description: "Commit to experiments and plan execution",
        durationMinutes: 10,
        type: "refine",
        prompts: ["When will we run this?", "When will we review results?"],
        icon: "📋",
      },
      {
        id: "reflect",
        name: "Reflect",
        description: "Share key learnings from the session",
        durationMinutes: 10,
        type: "present",
        prompts: ["What surprised you?", "What will you do differently?"],
        icon: "🪞",
      },
    ],
    maxParticipants: 10,
    votesPerParticipant: 3,
  },
];

// ---- In-Memory Store ----

const sprints = new Map<string, FacilitatedSprint>();

// ---- Core Functions ----

/** Get a sprint template by ID. */
export function getSprintTemplate(id: SprintTemplateId): SprintTemplate | undefined {
  return SPRINT_TEMPLATES.find((t) => t.id === id);
}

/** Create a facilitated sprint from a template. */
export function createFacilitatedSprint(params: {
  templateId: SprintTemplateId;
  subject: string;
  facilitatorId: string;
  facilitatorName: string;
}): FacilitatedSprint {
  const template = SPRINT_TEMPLATES.find((t) => t.id === params.templateId);
  if (!template) {
    throw new ValidationError(`Unknown sprint template: ${params.templateId}`);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const sprint: FacilitatedSprint = {
    id,
    templateId: params.templateId,
    subject: params.subject,
    status: "waiting",
    currentPhaseIndex: 0,
    participants: [
      {
        id: params.facilitatorId,
        name: params.facilitatorName,
        role: "facilitator",
        joinedAt: now,
        ideasSubmitted: 0,
        votesUsed: 0,
      },
    ],
    ideas: [],
    phaseSummaries: [],
    createdAt: now,
    updatedAt: now,
  };

  sprints.set(id, sprint);
  return sprint;
}

/** Auto-advance to the next phase of a sprint. */
export function autoAdvancePhase(sprintId: string): FacilitatedSprint | undefined {
  const sprint = sprints.get(sprintId);
  if (!sprint) return undefined;

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId);
  if (!template) return undefined;

  if (sprint.status === "waiting") {
    sprint.status = "active";
    sprint.phaseStartedAt = new Date().toISOString();
  } else if (sprint.currentPhaseIndex < template.phases.length - 1) {
    sprint.currentPhaseIndex++;
    sprint.phaseStartedAt = new Date().toISOString();
  } else {
    sprint.status = "completed";
    sprint.completedAt = new Date().toISOString();
  }

  sprint.updatedAt = new Date().toISOString();
  sprints.set(sprintId, sprint);
  return sprint;
}

/** Generate prompts for the current phase. */
export function generatePhasePrompts(sprintId: string): string[] {
  const sprint = sprints.get(sprintId);
  if (!sprint) return [];

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId);
  if (!template) return [];

  const phase = template.phases[sprint.currentPhaseIndex];
  if (!phase) return [];

  return phase.prompts;
}

/** Generate an AI summary for a completed phase. */
export async function generatePhaseSummary(
  sprintId: string,
  model?: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  const sprint = sprints.get(sprintId);
  if (!sprint) return undefined;

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId);
  if (!template) return undefined;

  const phase = template.phases[sprint.currentPhaseIndex];
  if (!phase) return undefined;

  const phaseIdeas = sprint.ideas
    .filter((i) => i.phaseId === phase.id)
    .map((i) => `- ${i.content} (votes: ${i.votes})`);

  const prompt = `You are facilitating an innovation sprint "${template.name}".
Current phase: "${phase.name}" - ${phase.description}

${wrapUserInput("SUBJECT", sprint.subject)}

Ideas generated in this phase:
${sanitizeLlmOutput(phaseIdeas.join("\n") || "No ideas submitted yet.")}

Summarize this phase's outcomes. Highlight key themes and transition to the next phase.

Return valid JSON only:
{
  "summary": "Phase summary...",
  "keyOutcomes": ["outcome 1", "outcome 2"]
}`;

  const parsed = await runSprintLlm(prompt, model, signal);
  const result = z
    .object({
      summary: z.string().max(5000),
      keyOutcomes: z.array(z.string().max(1000)).max(10),
    })
    .parse(parsed);

  sprint.phaseSummaries.push({
    phaseId: phase.id,
    summary: result.summary,
    keyOutcomes: result.keyOutcomes,
    generatedAt: new Date().toISOString(),
  });

  sprint.updatedAt = new Date().toISOString();
  sprints.set(sprintId, sprint);
  return result.summary;
}

/** Generate the full sprint report with retrospective. */
export async function generateSprintReport(
  sprintId: string,
  model?: string,
  signal?: AbortSignal
): Promise<SprintReport | undefined> {
  const sprint = sprints.get(sprintId);
  if (!sprint) return undefined;

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId);
  if (!template) return undefined;

  const topIdeas = [...sprint.ideas].sort((a, b) => b.votes - a.votes).slice(0, 20);

  const prompt = `Generate a sprint retrospective for "${template.name}" on "${sprint.subject}".

Participants: ${sprint.participants.length}
Total ideas: ${sprint.ideas.length}
Top ideas: ${sanitizeLlmOutput(topIdeas.map((i) => `${i.content} (${i.votes} votes)`).join("; "))}

Phase summaries:
${sanitizeLlmOutput(sprint.phaseSummaries.map((s) => `${s.phaseId}: ${s.summary}`).join("\n"))}

Return valid JSON only:
{
  "whatWorked": ["..."],
  "whatToImprove": ["..."],
  "actionItems": ["..."]
}`;

  const parsed = await runSprintLlm(prompt, model, signal);
  const retro = z
    .object({
      whatWorked: z.array(z.string().max(1000)).max(10),
      whatToImprove: z.array(z.string().max(1000)).max(10),
      actionItems: z.array(z.string().max(1000)).max(10),
    })
    .parse(parsed);

  const report: SprintReport = {
    sprintId: sprint.id,
    templateName: template.name,
    subject: sprint.subject,
    totalDurationMinutes: template.totalDurationMinutes,
    participantCount: sprint.participants.length,
    totalIdeas: sprint.ideas.length,
    topIdeas: topIdeas.map((i) => ({
      content: i.content,
      votes: i.votes,
      author: sprint.participants.find((p) => p.id === i.authorId)?.name ?? "Unknown",
    })),
    phaseSummaries: sprint.phaseSummaries.map((s) => ({
      phase: s.phaseId,
      summary: s.summary,
      keyOutcomes: s.keyOutcomes,
    })),
    retrospective: retro,
    generatedAt: new Date().toISOString(),
  };

  return report;
}

// ---- Helpers ----

async function runSprintLlm(
  prompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<unknown> {
  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new LlmParseError(
          `Failed to parse sprint response as JSON: ${jsonStr.slice(0, 200)}`,
          jsonStr.slice(0, 200)
        );
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );
}
