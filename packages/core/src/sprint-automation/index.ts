/**
 * @module sprint-automation
 *
 * Innovation Sprint Automation — time-boxed innovation sprints with
 * structured phases (diverge, converge, iterate, decide), pre-built
 * sprint templates, automated facilitator, time enforcement, voting
 * rounds, and retrospective reports.
 */

import { z } from "zod";
import { ValidationError } from "../errors.js";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Sprint phase types. */
export const SprintPhaseSchema = z.enum(["diverge", "converge", "iterate", "decide"]);
export type SprintPhase = z.infer<typeof SprintPhaseSchema>;

/** Sprint status. */
export const SprintStatusSchema = z.enum(["draft", "active", "paused", "completed", "cancelled"]);
export type SprintStatus = z.infer<typeof SprintStatusSchema>;

/** Phase configuration within a sprint template. */
export const PhaseConfigSchema = z.object({
  phase: SprintPhaseSchema,
  durationMinutes: z.number().int().min(1).max(10080),
  description: z.string().max(1000),
  activities: z.array(z.string().max(500)).max(20),
  autoAdvance: z.boolean().default(true),
  requiredParticipants: z.number().int().min(1).max(100).default(1),
});
export type PhaseConfig = z.infer<typeof PhaseConfigSchema>;

/** Sprint template definition. */
export const SprintTemplateSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(300),
  description: z.string().max(2000),
  totalDurationMinutes: z.number().int().min(1),
  phases: z.array(PhaseConfigSchema).min(1).max(10),
  tags: z.array(z.string().max(100)).max(10).optional(),
  recommendedTeamSize: z
    .object({
      min: z.number().int().min(1),
      max: z.number().int().min(1),
    })
    .optional(),
});
export type SprintTemplate = z.infer<typeof SprintTemplateSchema>;

/** Vote in a voting round. */
export const VoteSchema = z.object({
  participantId: z.string().max(200),
  ideaId: z.string().max(200),
  score: z.number().min(1).max(10),
  timestamp: z.string(),
});
export type Vote = z.infer<typeof VoteSchema>;

/** Voting round within a sprint. */
export const VotingRoundSchema = z.object({
  id: z.string(),
  phase: SprintPhaseSchema,
  ideaIds: z.array(z.string()).max(100),
  votes: z.array(VoteSchema).max(1000),
  status: z.enum(["open", "closed"]),
  openedAt: z.string(),
  closedAt: z.string().optional(),
});
export type VotingRound = z.infer<typeof VotingRoundSchema>;

/** Sprint participant. */
export const SprintParticipantSchema = z.object({
  id: z.string().max(200),
  displayName: z.string().max(200),
  role: z.enum(["facilitator", "participant", "observer"]),
  joinedAt: z.string(),
});
export type SprintParticipant = z.infer<typeof SprintParticipantSchema>;

/** Sprint idea submitted during the sprint. */
export const SprintIdeaSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(5000),
  submittedBy: z.string().max(200),
  phase: SprintPhaseSchema,
  voteScore: z.number().min(0).default(0),
  status: z.enum(["active", "shortlisted", "selected", "eliminated"]),
  submittedAt: z.string(),
});
export type SprintIdea = z.infer<typeof SprintIdeaSchema>;

/** Automated sprint instance. */
export const AutomatedSprintSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  subject: z.string().max(5000),
  status: SprintStatusSchema,
  currentPhase: SprintPhaseSchema,
  currentPhaseIndex: z.number().int().min(0),
  participants: z.array(SprintParticipantSchema).max(100),
  ideas: z.array(SprintIdeaSchema).max(500),
  votingRounds: z.array(VotingRoundSchema).max(20),
  phaseStartedAt: z.string(),
  phaseDeadline: z.string(),
  facilitatorMessages: z
    .array(
      z.object({
        phase: SprintPhaseSchema,
        message: z.string().max(2000),
        timestamp: z.string(),
      })
    )
    .max(100),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type AutomatedSprint = z.infer<typeof AutomatedSprintSchema>;

/** Sprint retrospective report. */
export const RetrospectiveReportSchema = z.object({
  sprintId: z.string(),
  generatedAt: z.string(),
  totalDurationMinutes: z.number(),
  participantCount: z.number().int(),
  totalIdeas: z.number().int(),
  selectedIdeas: z.array(SprintIdeaSchema),
  phaseMetrics: z.array(
    z.object({
      phase: SprintPhaseSchema,
      ideasGenerated: z.number().int(),
      ideasEliminated: z.number().int(),
      votingParticipation: z.number().min(0).max(1),
      durationMinutes: z.number(),
    })
  ),
  insights: z.array(z.string().max(1000)).max(20),
  recommendations: z.array(z.string().max(1000)).max(10),
});
export type RetrospectiveReport = z.infer<typeof RetrospectiveReportSchema>;

// ---- Built-in Templates ----

export const SPRINT_TEMPLATES: SprintTemplate[] = [
  {
    id: "quick-sprint",
    name: "30-Minute Quick Sprint",
    description: "Fast-paced innovation sprint for rapid ideation and selection.",
    totalDurationMinutes: 30,
    phases: [
      {
        phase: "diverge",
        durationMinutes: 10,
        description: "Generate as many ideas as possible",
        activities: ["Brain dump", "Random association", "SCAMPER technique"],
        autoAdvance: true,
        requiredParticipants: 1,
      },
      {
        phase: "converge",
        durationMinutes: 8,
        description: "Score and filter ideas",
        activities: ["Dot voting", "Impact/effort matrix"],
        autoAdvance: true,
        requiredParticipants: 1,
      },
      {
        phase: "iterate",
        durationMinutes: 7,
        description: "Refine top ideas",
        activities: ["Combine ideas", "Address weaknesses"],
        autoAdvance: true,
        requiredParticipants: 1,
      },
      {
        phase: "decide",
        durationMinutes: 5,
        description: "Final vote and commitment",
        activities: ["Final voting round", "Action items"],
        autoAdvance: true,
        requiredParticipants: 1,
      },
    ],
    tags: ["quick", "individual", "ideation"],
    recommendedTeamSize: { min: 1, max: 5 },
  },
  {
    id: "deep-dive",
    name: "2-Hour Deep Dive",
    description: "Thorough innovation session with investigation and debate phases.",
    totalDurationMinutes: 120,
    phases: [
      {
        phase: "diverge",
        durationMinutes: 35,
        description: "Broad exploration and idea generation",
        activities: ["Background research", "Cross-domain inspiration", "Wild ideas"],
        autoAdvance: true,
        requiredParticipants: 2,
      },
      {
        phase: "converge",
        durationMinutes: 30,
        description: "Evaluate and prioritize",
        activities: ["Structured scoring", "Quadrant analysis", "Devil's advocate"],
        autoAdvance: true,
        requiredParticipants: 2,
      },
      {
        phase: "iterate",
        durationMinutes: 35,
        description: "Debate, combine, and evolve ideas",
        activities: ["Structured debate", "Idea fusion", "Stress testing"],
        autoAdvance: true,
        requiredParticipants: 2,
      },
      {
        phase: "decide",
        durationMinutes: 20,
        description: "Final selection and action planning",
        activities: ["Ranked voting", "Commitment ceremony", "Next steps"],
        autoAdvance: true,
        requiredParticipants: 2,
      },
    ],
    tags: ["thorough", "team", "debate"],
    recommendedTeamSize: { min: 3, max: 10 },
  },
  {
    id: "innovation-week",
    name: "5-Day Innovation Week",
    description: "Extended innovation sprint spread across a full work week.",
    totalDurationMinutes: 5 * 8 * 60,
    phases: [
      {
        phase: "diverge",
        durationMinutes: 2 * 8 * 60,
        description: "Days 1-2: Explore problem space and generate ideas",
        activities: [
          "Customer interviews",
          "Competitor analysis",
          "Brainstorming sessions",
          "Cross-team input",
        ],
        autoAdvance: false,
        requiredParticipants: 3,
      },
      {
        phase: "converge",
        durationMinutes: 8 * 60,
        description: "Day 3: Evaluate, score, and filter",
        activities: ["Multi-criteria scoring", "Expert panel review", "Feasibility assessment"],
        autoAdvance: false,
        requiredParticipants: 3,
      },
      {
        phase: "iterate",
        durationMinutes: 8 * 60,
        description: "Day 4: Prototype and iterate on top ideas",
        activities: ["Rapid prototyping", "User feedback", "Technical validation"],
        autoAdvance: false,
        requiredParticipants: 3,
      },
      {
        phase: "decide",
        durationMinutes: 8 * 60,
        description: "Day 5: Present, vote, and commit",
        activities: [
          "Final presentations",
          "Stakeholder voting",
          "Resource allocation",
          "Roadmap integration",
        ],
        autoAdvance: false,
        requiredParticipants: 3,
      },
    ],
    tags: ["extended", "organization", "comprehensive"],
    recommendedTeamSize: { min: 5, max: 30 },
  },
];

// ---- In-Memory Store ----

const sprints = new Map<string, AutomatedSprint>();
const retrospectives = new Map<string, RetrospectiveReport>();

// ---- Sprint Lifecycle ----

/** Get available sprint templates. */
export function getSprintTemplates(): SprintTemplate[] {
  return [...SPRINT_TEMPLATES];
}

/** Get a sprint template by ID. */
export function getSprintTemplate(templateId: string): SprintTemplate | undefined {
  return SPRINT_TEMPLATES.find((t) => t.id === templateId);
}

/** Create a new automated sprint from a template. */
export function createAutomatedSprint(
  templateId: string,
  subject: string,
  facilitatorId: string,
  facilitatorName: string
): AutomatedSprint {
  const template = SPRINT_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new ValidationError(`Sprint template "${templateId}" not found`);
  if (!subject.trim()) throw new ValidationError("Sprint subject is required");

  const now = new Date().toISOString();
  const firstPhase = template.phases[0];
  const deadline = new Date(Date.now() + firstPhase.durationMinutes * 60_000).toISOString();

  const sprint: AutomatedSprint = {
    id: randomUUID(),
    templateId,
    subject,
    status: "draft",
    currentPhase: firstPhase.phase,
    currentPhaseIndex: 0,
    participants: [
      {
        id: facilitatorId,
        displayName: facilitatorName,
        role: "facilitator",
        joinedAt: now,
      },
    ],
    ideas: [],
    votingRounds: [],
    phaseStartedAt: now,
    phaseDeadline: deadline,
    facilitatorMessages: [],
    startedAt: now,
  };

  sprints.set(sprint.id, sprint);
  return sprint;
}

/** Start an automated sprint (transition from draft to active). */
export function startAutomatedSprint(sprintId: string): AutomatedSprint {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);
  if (sprint.status !== "draft")
    throw new ValidationError("Sprint must be in draft status to start");

  const now = new Date();
  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId)!;
  const firstPhase = template.phases[0];

  sprint.status = "active";
  sprint.phaseStartedAt = now.toISOString();
  sprint.phaseDeadline = new Date(
    now.getTime() + firstPhase.durationMinutes * 60_000
  ).toISOString();
  sprint.facilitatorMessages.push({
    phase: sprint.currentPhase,
    message: `🚀 Sprint started! Phase: ${sprint.currentPhase.toUpperCase()} — ${firstPhase.description}. You have ${firstPhase.durationMinutes} minutes.`,
    timestamp: now.toISOString(),
  });

  return sprint;
}

/** Join a sprint as a participant. */
export function joinAutomatedSprint(
  sprintId: string,
  participantId: string,
  displayName: string
): AutomatedSprint {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);
  if (sprint.participants.some((p) => p.id === participantId)) {
    throw new ValidationError("Participant already joined this sprint");
  }

  sprint.participants.push({
    id: participantId,
    displayName,
    role: "participant",
    joinedAt: new Date().toISOString(),
  });

  return sprint;
}

/** Submit an idea during a sprint. */
export function submitSprintIdea(
  sprintId: string,
  participantId: string,
  title: string,
  description: string
): SprintIdea {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);
  if (sprint.status !== "active") throw new ValidationError("Sprint is not active");
  if (!sprint.participants.some((p) => p.id === participantId)) {
    throw new ValidationError("Participant must join the sprint first");
  }

  const idea: SprintIdea = {
    id: randomUUID(),
    title,
    description,
    submittedBy: participantId,
    phase: sprint.currentPhase,
    voteScore: 0,
    status: "active",
    submittedAt: new Date().toISOString(),
  };

  sprint.ideas.push(idea);
  return idea;
}

/** Open a voting round in the current phase. */
export function openVotingRound(sprintId: string, ideaIds?: string[]): VotingRound {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);
  if (sprint.status !== "active") throw new ValidationError("Sprint is not active");

  const activeIdeaIds =
    ideaIds ??
    sprint.ideas
      .filter((i) => i.status === "active" || i.status === "shortlisted")
      .map((i) => i.id);

  const round: VotingRound = {
    id: randomUUID(),
    phase: sprint.currentPhase,
    ideaIds: activeIdeaIds,
    votes: [],
    status: "open",
    openedAt: new Date().toISOString(),
  };

  sprint.votingRounds.push(round);
  sprint.facilitatorMessages.push({
    phase: sprint.currentPhase,
    message: `🗳️ Voting round opened! ${activeIdeaIds.length} ideas to vote on.`,
    timestamp: new Date().toISOString(),
  });

  return round;
}

/** Cast a vote in a voting round. */
export function castVote(
  sprintId: string,
  roundId: string,
  participantId: string,
  ideaId: string,
  score: number
): void {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);

  const round = sprint.votingRounds.find((r) => r.id === roundId);
  if (!round) throw new ValidationError(`Voting round ${roundId} not found`);
  if (round.status !== "open") throw new ValidationError("Voting round is closed");
  if (!round.ideaIds.includes(ideaId)) throw new ValidationError("Idea not in this voting round");

  if (round.votes.some((v) => v.participantId === participantId && v.ideaId === ideaId)) {
    throw new ValidationError("Already voted for this idea in this round");
  }

  round.votes.push({ participantId, ideaId, score, timestamp: new Date().toISOString() });

  // Update idea vote score
  const idea = sprint.ideas.find((i) => i.id === ideaId);
  if (idea) {
    const ideaVotes = round.votes.filter((v) => v.ideaId === ideaId);
    idea.voteScore = ideaVotes.reduce((sum, v) => sum + v.score, 0) / ideaVotes.length;
  }
}

/** Close a voting round and update idea statuses. */
export function closeVotingRound(sprintId: string, roundId: string, topN?: number): VotingRound {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);

  const round = sprint.votingRounds.find((r) => r.id === roundId);
  if (!round) throw new ValidationError(`Voting round ${roundId} not found`);

  round.status = "closed";
  round.closedAt = new Date().toISOString();

  // Rank ideas by vote score
  const ranked = round.ideaIds
    .map((id) => sprint.ideas.find((i) => i.id === id)!)
    .filter(Boolean)
    .sort((a, b) => b.voteScore - a.voteScore);

  const cutoff = topN ?? Math.max(3, Math.ceil(ranked.length / 2));
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].status = i < cutoff ? "shortlisted" : "eliminated";
  }

  return round;
}

/** Advance to the next sprint phase. */
export function advanceSprintPhase(sprintId: string): AutomatedSprint {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);
  if (sprint.status !== "active") throw new ValidationError("Sprint is not active");

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId)!;
  const nextIndex = sprint.currentPhaseIndex + 1;

  if (nextIndex >= template.phases.length) {
    sprint.status = "completed";
    sprint.completedAt = new Date().toISOString();

    // Mark shortlisted ideas as selected in final phase
    sprint.ideas
      .filter((i) => i.status === "shortlisted")
      .forEach((i) => {
        i.status = "selected";
      });

    sprint.facilitatorMessages.push({
      phase: sprint.currentPhase,
      message: `🎉 Sprint completed! ${sprint.ideas.filter((i) => i.status === "selected").length} ideas selected.`,
      timestamp: new Date().toISOString(),
    });

    return sprint;
  }

  const nextPhase = template.phases[nextIndex];
  const now = new Date();

  sprint.currentPhaseIndex = nextIndex;
  sprint.currentPhase = nextPhase.phase;
  sprint.phaseStartedAt = now.toISOString();
  sprint.phaseDeadline = new Date(now.getTime() + nextPhase.durationMinutes * 60_000).toISOString();
  sprint.facilitatorMessages.push({
    phase: nextPhase.phase,
    message: `➡️ Moving to ${nextPhase.phase.toUpperCase()} phase — ${nextPhase.description}. Time: ${nextPhase.durationMinutes} minutes.`,
    timestamp: now.toISOString(),
  });

  return sprint;
}

/** Check if the current phase has exceeded its time limit. */
export function isPhaseExpired(sprintId: string): boolean {
  const sprint = sprints.get(sprintId);
  if (!sprint) return false;
  return new Date() > new Date(sprint.phaseDeadline);
}

/** Get sprint by ID. */
export function getAutomatedSprint(sprintId: string): AutomatedSprint | undefined {
  return sprints.get(sprintId);
}

/** List all sprints. */
export function listAutomatedSprints(filters?: { status?: SprintStatus }): AutomatedSprint[] {
  let results = [...sprints.values()];
  if (filters?.status) results = results.filter((s) => s.status === filters.status);
  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// ---- LLM-Powered Facilitator ----

/** Generate a facilitator message for the current phase. */
export async function generateFacilitatorMessage(
  sprintId: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<string> {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId)!;
  const phaseConfig = template.phases[sprint.currentPhaseIndex];
  const ideaCount = sprint.ideas.filter((i) => i.phase === sprint.currentPhase).length;

  const prompt = `You are an innovation sprint facilitator. Generate a motivational and actionable message.

${wrapUserInput("SUBJECT", sprint.subject)}
PHASE: ${sprint.currentPhase.toUpperCase()}
DESCRIPTION: ${phaseConfig.description}
ACTIVITIES: ${phaseConfig.activities.join(", ")}
TIME REMAINING: ${Math.max(0, Math.round((new Date(sprint.phaseDeadline).getTime() - Date.now()) / 60000))} minutes
IDEAS SO FAR: ${ideaCount}
PARTICIPANTS: ${sprint.participants.length}

Write a brief (2-3 sentences) facilitator message that:
1. Encourages participation
2. Suggests a specific activity
3. Creates urgency if time is running low`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  sprint.facilitatorMessages.push({
    phase: sprint.currentPhase,
    message: raw,
    timestamp: new Date().toISOString(),
  });

  return raw;
}

// ---- Retrospective Report ----

/** Generate a retrospective report for a completed sprint. */
export async function generateRetrospective(
  sprintId: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<RetrospectiveReport> {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new ValidationError(`Sprint ${sprintId} not found`);

  const template = SPRINT_TEMPLATES.find((t) => t.id === sprint.templateId)!;
  const selectedIdeas = sprint.ideas.filter(
    (i) => i.status === "selected" || i.status === "shortlisted"
  );

  const phaseMetrics = template.phases.map((pc) => {
    const phaseIdeas = sprint.ideas.filter((i) => i.phase === pc.phase);
    const phaseRounds = sprint.votingRounds.filter((r) => r.phase === pc.phase);
    const totalVoters = new Set(phaseRounds.flatMap((r) => r.votes.map((v) => v.participantId)))
      .size;

    return {
      phase: pc.phase,
      ideasGenerated: phaseIdeas.length,
      ideasEliminated: phaseIdeas.filter((i) => i.status === "eliminated").length,
      votingParticipation:
        sprint.participants.length > 0 ? totalVoters / sprint.participants.length : 0,
      durationMinutes: pc.durationMinutes,
    };
  });

  // Use LLM for insights
  let insights: string[] = [];
  let recommendations: string[] = [];

  try {
    const prompt = `You are an innovation sprint retrospective facilitator.

${wrapUserInput("SUBJECT", sprint.subject)}
TOTAL IDEAS: ${sprint.ideas.length}
SELECTED IDEAS: ${selectedIdeas.length}
PARTICIPANTS: ${sprint.participants.length}
PHASES: ${phaseMetrics.map((p) => `${p.phase}: ${p.ideasGenerated} ideas, ${p.ideasEliminated} eliminated`).join("; ")}

Provide JSON with:
1. "insights": 3-5 key observations about the sprint
2. "recommendations": 3-5 actionable improvements for next time`;

    const raw = await withRetry(() =>
      generateText({
        prompt: sanitizeLlmOutput(prompt),
        model: options?.model,
        signal: options?.signal,
      })
    );

    const parsed = (() => {
      try {
        return JSON.parse(extractJson(raw)) as { insights: string[]; recommendations: string[] };
      } catch {
        return undefined;
      }
    })();
    if (parsed) {
      insights = parsed.insights?.slice(0, 20) ?? [];
      recommendations = parsed.recommendations?.slice(0, 10) ?? [];
    }
  } catch {
    insights = ["Sprint completed successfully"];
    recommendations = ["Consider longer diverge phases for more ideas"];
  }

  const totalDuration = sprint.completedAt
    ? (new Date(sprint.completedAt).getTime() - new Date(sprint.startedAt).getTime()) / 60_000
    : template.totalDurationMinutes;

  const report: RetrospectiveReport = {
    sprintId,
    generatedAt: new Date().toISOString(),
    totalDurationMinutes: Math.round(totalDuration),
    participantCount: sprint.participants.length,
    totalIdeas: sprint.ideas.length,
    selectedIdeas,
    phaseMetrics,
    insights,
    recommendations,
  };

  retrospectives.set(sprintId, report);
  return report;
}

/** Get a retrospective report. */
export function getRetrospective(sprintId: string): RetrospectiveReport | undefined {
  return retrospectives.get(sprintId);
}

// ---- Store Management ----

/** Clear all sprint automation data (for testing). */
export function clearSprintAutomationData(): void {
  sprints.clear();
  retrospectives.clear();
}
