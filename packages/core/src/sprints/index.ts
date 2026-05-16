/**
 * @module sprints
 *
 * Innovation Sprints Framework — templates for lightning/half-day/full-day
 * sprints, a sprint runner with phase transitions, and retrospective
 * analytics with sprint-over-sprint tracking.
 */

import { randomUUID } from "node:crypto";
import type {
  SprintTemplate,
  Sprint,
  SprintPhase,
  SprintRetrospective,
  SprintConfig,
} from "./types.js";
import {
  SprintTemplateSchema,
  SprintSchema,
  SprintPhaseSchema,
  SprintRetrospectiveSchema,
} from "./types.js";

export * from "./types.js";

// ---- Built-in Sprint Templates ----

function makePhase(
  id: string,
  type: SprintPhase["type"],
  name: string,
  durationMinutes: number,
  facilitationPrompt: string
): SprintPhase {
  return SprintPhaseSchema.parse({
    id,
    type,
    name,
    durationMinutes,
    facilitationPrompt,
    status: "pending",
  });
}

const TEMPLATES: SprintTemplate[] = [
  SprintTemplateSchema.parse({
    id: "lightning-2h",
    name: "Lightning Sprint (2 hours)",
    description: "Fast-paced innovation sprint for rapid idea generation and initial filtering.",
    totalMinutes: 120,
    format: "lightning",
    teamSize: { min: 2, max: 8 },
    phases: [
      makePhase(
        "l-investigate",
        "investigate",
        "Investigate",
        20,
        "Define the problem space. Each participant shares one key insight about the challenge. Use the investigation module to gather context."
      ),
      makePhase(
        "l-diverge",
        "diverge",
        "Diverge",
        30,
        "Generate as many ideas as possible. No criticism allowed. Build on each other's ideas. Aim for quantity over quality."
      ),
      makePhase("l-break", "break", "Break", 5, "Take a short break. Stretch and reset."),
      makePhase(
        "l-converge",
        "converge",
        "Converge",
        25,
        "Group similar ideas. Vote on the top 5 ideas. Each participant gets 3 votes."
      ),
      makePhase(
        "l-stress-test",
        "stress-test",
        "Stress Test",
        25,
        "Run the top ideas through the gauntlet. Identify fatal flaws and must-have pivots."
      ),
      makePhase(
        "l-prioritize",
        "prioritize",
        "Prioritize",
        15,
        "Score remaining ideas on impact vs effort. Select top 1-3 for further development."
      ),
    ],
  }),
  SprintTemplateSchema.parse({
    id: "half-day-4h",
    name: "Half-Day Sprint (4 hours)",
    description: "Balanced sprint with deeper investigation and thorough stress-testing.",
    totalMinutes: 240,
    format: "half-day",
    teamSize: { min: 3, max: 12 },
    phases: [
      makePhase(
        "h-investigate",
        "investigate",
        "Deep Investigation",
        40,
        "Conduct thorough investigation of the problem space. Map stakeholders, competitors, and market gaps. Use investigation module for LLM-assisted research."
      ),
      makePhase(
        "h-diverge",
        "diverge",
        "Diverge",
        45,
        "Individual brainstorm (10 min), then round-robin sharing. Use multiple innovation angles: SCAMPER, First Principles, Blue Ocean."
      ),
      makePhase("h-break1", "break", "Break", 15, "Coffee break. Let ideas percolate."),
      makePhase(
        "h-converge",
        "converge",
        "Converge & Refine",
        35,
        "Affinity mapping of ideas. Dot voting (5 votes each). Top ideas get refined with descriptions."
      ),
      makePhase(
        "h-stress-test",
        "stress-test",
        "Gauntlet",
        40,
        "Run top ideas through multi-angle gauntlet. Customer persona evaluation. Feasibility check."
      ),
      makePhase("h-break2", "break", "Break", 10, "Short break before final prioritization."),
      makePhase(
        "h-prioritize",
        "prioritize",
        "Prioritize & Plan",
        35,
        "Score on impact, feasibility, novelty. Create next-step action items for top 3 ideas."
      ),
      makePhase(
        "h-retro",
        "retrospective",
        "Retrospective",
        20,
        "What went well? What could improve? Rate the sprint 1-10. Capture learnings for next sprint."
      ),
    ],
  }),
  SprintTemplateSchema.parse({
    id: "full-day-8h",
    name: "Full-Day Sprint (8 hours)",
    description: "Comprehensive innovation sprint with prototyping and presentation phases.",
    totalMinutes: 480,
    format: "full-day",
    teamSize: { min: 4, max: 20 },
    phases: [
      makePhase(
        "f-investigate",
        "investigate",
        "Deep Investigation",
        60,
        "Map the entire problem landscape. Interview subject matter experts. Competitive analysis. Trend research."
      ),
      makePhase(
        "f-diverge",
        "diverge",
        "Massive Diverge",
        75,
        "Brainwriting (10 min), Crazy 8s (8 min), Round-robin sharing (30 min), Wild card angles (15 min). Target: 50+ raw ideas."
      ),
      makePhase("f-break1", "break", "Morning Break", 15, "Refresh and recharge."),
      makePhase(
        "f-converge1",
        "converge",
        "First Converge",
        45,
        "Affinity clustering. Silent voting (7 votes each). Select top 10 ideas for development."
      ),
      makePhase(
        "f-stress-test",
        "stress-test",
        "Gauntlet & Validation",
        60,
        "Full gauntlet run. Stakeholder persona evaluation. Regulatory pre-screen. Market validation check."
      ),
      makePhase(
        "f-lunch",
        "break",
        "Lunch Break",
        60,
        "Lunch break. Informal discussion encouraged."
      ),
      makePhase(
        "f-converge2",
        "converge",
        "Refine & Evolve",
        45,
        "Evolve top 5 ideas based on gauntlet feedback. Merge complementary ideas. Create pitch-ready descriptions."
      ),
      makePhase(
        "f-prioritize",
        "prioritize",
        "Prioritize & Action Plan",
        40,
        "Final scoring matrix. Resource estimation. 90-day action plan for top 3 ideas."
      ),
      makePhase("f-break2", "break", "Afternoon Break", 15, "Last break before presentations."),
      makePhase(
        "f-custom",
        "custom",
        "Pitch Presentations",
        45,
        "Each team presents their top idea in 5 minutes. Q&A. Final vote."
      ),
      makePhase(
        "f-retro",
        "retrospective",
        "Retrospective",
        20,
        "Sprint metrics review. What went well? What could improve? Plan next sprint date."
      ),
    ],
  }),
  SprintTemplateSchema.parse({
    id: "async-sprint",
    name: "Async Sprint (self-paced)",
    description: "Self-paced sprint for distributed teams, spread over 2-3 days.",
    totalMinutes: 180,
    format: "async",
    teamSize: { min: 2, max: 50 },
    phases: [
      makePhase(
        "a-investigate",
        "investigate",
        "Async Investigation",
        30,
        "Each participant independently investigates the problem space and posts key findings to the shared board."
      ),
      makePhase(
        "a-diverge",
        "diverge",
        "Async Ideation",
        45,
        "Submit ideas asynchronously. Build on others' ideas. No criticism phase — only 'Yes, and...' additions."
      ),
      makePhase(
        "a-converge",
        "converge",
        "Async Voting",
        30,
        "Review all ideas. Vote using the ranking system. Comment with constructive feedback."
      ),
      makePhase(
        "a-stress-test",
        "stress-test",
        "Async Review",
        45,
        "Assigned reviewers stress-test top ideas. Post critiques and improvement suggestions."
      ),
      makePhase(
        "a-prioritize",
        "prioritize",
        "Final Ranking",
        30,
        "Final vote on refined ideas. Create action items and assign owners."
      ),
    ],
  }),
];

/** Returns all built-in sprint templates. */
export function getSprintTemplates(): SprintTemplate[] {
  return TEMPLATES;
}

// ---- Sprint Instance Management ----

const sprints = new Map<string, Sprint>();

/**
 * Create a new sprint instance from a template.
 */
export function createSprint(
  subject: string,
  participants: string[],
  config: SprintConfig = {}
): Sprint {
  const templateId = config.templateId ?? "lightning-2h";
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Sprint template ${templateId} not found`);

  // Clone phases and optionally override durations
  const phases = template.phases.map((p) => ({
    ...p,
    status: "pending" as const,
    durationMinutes: config.phaseDurations?.[p.id] ?? p.durationMinutes,
  }));

  const sprint: Sprint = SprintSchema.parse({
    id: randomUUID(),
    templateId,
    subject,
    status: "ready",
    phases,
    currentPhaseIndex: -1,
    participants,
    createdAt: new Date().toISOString(),
    ideas: [],
  });

  sprints.set(sprint.id, sprint);
  return sprint;
}

/**
 * Advance the sprint to the next phase.
 */
export function advanceSprintPhase(sprintId: string): Sprint {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);

  const now = new Date().toISOString();

  // Complete current phase
  if (sprint.currentPhaseIndex >= 0 && sprint.currentPhaseIndex < sprint.phases.length) {
    sprint.phases[sprint.currentPhaseIndex].status = "completed";
    sprint.phases[sprint.currentPhaseIndex].completedAt = now;
  }

  // Move to next phase
  sprint.currentPhaseIndex++;

  if (sprint.currentPhaseIndex >= sprint.phases.length) {
    sprint.status = "completed";
    sprint.completedAt = now;
  } else {
    sprint.status = "in-progress";
    if (sprint.currentPhaseIndex === 0) {
      sprint.startedAt = now;
    }
    sprint.phases[sprint.currentPhaseIndex].status = "active";
    sprint.phases[sprint.currentPhaseIndex].startedAt = now;
  }

  sprints.set(sprintId, sprint);
  return sprint;
}

/**
 * Mark a sprint as completed.
 */
export function completeSprint(sprintId: string): Sprint {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);

  const now = new Date().toISOString();

  // Complete any active phase
  for (const phase of sprint.phases) {
    if (phase.status === "active") {
      phase.status = "completed";
      phase.completedAt = now;
    } else if (phase.status === "pending") {
      phase.status = "skipped";
    }
  }

  sprint.status = "completed";
  sprint.completedAt = now;
  sprints.set(sprintId, sprint);
  return sprint;
}

/**
 * Generate a retrospective report for a completed sprint.
 */
export function getSprintRetrospective(sprintId: string): SprintRetrospective {
  const sprint = sprints.get(sprintId);
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);

  const totalIdeas = sprint.ideas.length;

  // Ideas per phase
  const ideasPerPhase: Record<string, number> = {};
  for (const idea of sprint.ideas) {
    ideasPerPhase[idea.phase] = (ideasPerPhase[idea.phase] ?? 0) + 1;
  }

  // Time utilization
  const template = TEMPLATES.find((t) => t.id === sprint.templateId);
  const plannedMinutes = template?.totalMinutes ?? 120;
  const completedPhases = sprint.phases.filter((p) => p.status === "completed");
  const actualMinutes = completedPhases.reduce((sum, p) => {
    if (p.startedAt && p.completedAt) {
      return sum + (new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime()) / 60000;
    }
    return sum + p.durationMinutes;
  }, 0);
  const timeUtilization = plannedMinutes > 0 ? actualMinutes / plannedMinutes : 1;

  // Phase completion rate
  const phaseCompletionRate =
    sprint.phases.length > 0 ? completedPhases.length / sprint.phases.length : 0;

  // Engagement score based on ideas, participants, and phases completed
  const engagementScore = Math.min(
    100,
    totalIdeas * 5 + sprint.participants.length * 10 + phaseCompletionRate * 30
  );

  const wentWell: string[] = [];
  const couldImprove: string[] = [];
  const actionItems: string[] = [];

  if (totalIdeas > 10) wentWell.push("Strong idea generation volume.");
  if (phaseCompletionRate === 1) wentWell.push("All phases completed as planned.");
  if (sprint.participants.length >= 3) wentWell.push("Good participation level.");

  if (totalIdeas < 5) couldImprove.push("Low idea count — consider adding more diverge time.");
  if (phaseCompletionRate < 0.8)
    couldImprove.push("Some phases were skipped — review time allocation.");
  if (timeUtilization > 1.2)
    couldImprove.push("Sprint ran over planned time — tighten phase boundaries.");

  if (totalIdeas > 0) actionItems.push("Review and score top ideas from this sprint.");
  actionItems.push("Schedule follow-up sprint to deepen top concepts.");

  return SprintRetrospectiveSchema.parse({
    sprintId,
    totalIdeas,
    ideasPerPhase,
    timeUtilization: Math.round(timeUtilization * 100) / 100,
    phaseCompletionRate: Math.round(phaseCompletionRate * 100) / 100,
    engagementScore: Math.round(engagementScore),
    wentWell,
    couldImprove,
    actionItems,
    generatedAt: new Date().toISOString(),
  });
}
