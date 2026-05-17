/**
 * Progressive idea refinement engine.
 * Enables iterative deepening from Concept → Plan → Specification.
 */
import { randomUUID } from "node:crypto";
import type {
  RefinementSession,
  RefinableIdea,
  RefinementIteration,
  RefinementOutput,
  RefinementTier,
} from "./types.js";

const sessions = new Map<string, RefinementSession>();

/** Start a new refinement session with selected ideas. */
export function startRefinementSession(
  ideas: Array<{ id: string; title: string; description: string }>
): RefinementSession {
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  const refinableIdeas: RefinableIdea[] = ideas.map((idea) => ({
    ...idea,
    selected: true,
    currentTier: "concept" as const,
  }));

  const session: RefinementSession = {
    id: sessionId,
    ideas: refinableIdeas,
    iterations: [],
    convergenceScore: 0,
    suggestStop: false,
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(sessionId, session);
  return session;
}

/** Refine an idea to the next tier. */
export function refineIdea(
  sessionId: string,
  ideaId: string,
  targetTier: "plan" | "specification",
  feedback?: string
): RefinementIteration | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const idea = session.ideas.find((i) => i.id === ideaId);
  if (!idea) return null;

  // Validate tier progression
  if (targetTier === "specification" && idea.currentTier === "concept") {
    // Must go through plan first — auto-generate plan
    const planIteration = generateRefinement(session, idea, "plan", feedback);
    session.iterations.push(planIteration);
    idea.currentTier = "plan";
  }

  const iteration = generateRefinement(session, idea, targetTier, feedback);
  session.iterations.push(iteration);
  idea.currentTier = targetTier;

  // Compute convergence after each refinement
  updateConvergence(session);
  session.updatedAt = new Date().toISOString();

  return iteration;
}

/** Get a refinement session. */
export function getRefinementSession(sessionId: string): RefinementSession | null {
  return sessions.get(sessionId) ?? null;
}

/** List all refinement sessions. */
export function listRefinementSessions(): RefinementSession[] {
  return Array.from(sessions.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Delete a refinement session. */
export function deleteRefinementSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/** Get the iteration history for a specific idea. */
export function getIdeaHistory(sessionId: string, ideaId: string): RefinementIteration[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return session.iterations.filter((i) => i.ideaId === ideaId);
}

// --- Internal ---

function generateRefinement(
  session: RefinementSession,
  idea: RefinableIdea,
  tier: RefinementTier,
  feedback?: string
): RefinementIteration {
  const previousIterations = session.iterations.filter((i) => i.ideaId === idea.id);
  const lastOutput =
    previousIterations.length > 0
      ? previousIterations[previousIterations.length - 1].output
      : undefined;

  const output = generateTierOutput(idea, tier, lastOutput?.content ?? idea.description, feedback);

  const qualityDelta = computeStructuralQuality(output, lastOutput);

  return {
    id: randomUUID(),
    tier,
    ideaId: idea.id,
    input: feedback ?? idea.description,
    feedback,
    output,
    createdAt: new Date().toISOString(),
    qualityDelta: Math.round(qualityDelta * 100) / 100,
  };
}

/**
 * Compute a quality delta (0–1) based on structural completeness rather
 * than raw text length. Checks whether the output gained implementation
 * steps, acceptance criteria, risks, dependencies, etc.
 */
function computeStructuralQuality(output: RefinementOutput, previous?: RefinementOutput): number {
  // Score presence of structured fields (each worth up to 1 point)
  const fields: Array<keyof RefinementOutput> = [
    "implementationSteps",
    "techStack",
    "timeline",
    "teamSize",
    "acceptanceCriteria",
    "risks",
    "dependencies",
    "milestones",
  ];

  let currentScore = 0;
  let previousScore = 0;

  for (const field of fields) {
    const cur = output[field];
    const prev = previous?.[field];

    if (Array.isArray(cur) && cur.length > 0) currentScore++;
    else if (typeof cur === "string" && cur.length > 0) currentScore++;

    if (Array.isArray(prev) && prev.length > 0) previousScore++;
    else if (typeof prev === "string" && prev.length > 0) previousScore++;
  }

  // Content depth: reward substantive content length (diminishing returns)
  const contentLen = output.content.length;
  const contentScore = Math.min(1, contentLen / 500);
  currentScore += contentScore;

  const maxScore = fields.length + 1; // fields + content
  const normalizedCurrent = currentScore / maxScore;
  const normalizedPrevious = previous ? previousScore / maxScore : 0;

  // Delta: how much quality was added in this iteration
  return previous
    ? Math.max(0, Math.min(1, normalizedCurrent - normalizedPrevious))
    : normalizedCurrent;
}

function generateTierOutput(
  idea: RefinableIdea,
  tier: RefinementTier,
  previousContent: string,
  feedback?: string
): RefinementOutput {
  const feedbackContext = feedback ? `\nUser feedback: ${feedback}` : "";

  switch (tier) {
    case "plan": {
      return {
        tier: "plan",
        content:
          `Implementation Plan for "${idea.title}"\n\n` +
          `Based on: ${previousContent.slice(0, 200)}...${feedbackContext}\n\n` +
          `This idea can be implemented in a structured, phased approach ` +
          `targeting measurable outcomes at each stage.`,
        implementationSteps: [
          "1. Research and validate core assumptions",
          "2. Design architecture and data model",
          "3. Build minimum viable implementation",
          "4. Test with target users and gather feedback",
          "5. Iterate based on feedback and metrics",
        ],
        techStack: ["To be determined based on requirements"],
        timeline: "4-8 weeks estimated",
        teamSize: "2-3 engineers",
      };
    }
    case "specification": {
      return {
        tier: "specification",
        content:
          `PRD Specification: "${idea.title}"\n\n` +
          `Based on: ${previousContent.slice(0, 200)}...${feedbackContext}\n\n` +
          `This specification provides implementation-ready details ` +
          `with acceptance criteria and risk assessment.`,
        implementationSteps: [
          "1. Define API contracts and data schemas",
          "2. Implement core business logic",
          "3. Build UI components and integration layer",
          "4. Write comprehensive test suite",
          "5. Performance testing and optimization",
          "6. Security review and audit",
          "7. Documentation and deployment runbook",
        ],
        acceptanceCriteria: [
          `Core functionality works as described in "${idea.title}"`,
          "All edge cases handled with appropriate error messages",
          "Performance meets defined SLAs",
          "Security review completed with no critical findings",
          "Documentation covers setup, usage, and troubleshooting",
        ],
        risks: [
          "Technical complexity may require additional research",
          "User adoption depends on effective onboarding",
          "Integration dependencies may introduce delays",
        ],
        dependencies: ["Core platform infrastructure", "Authentication system"],
        milestones: [
          { name: "Foundation", description: "Core architecture and data model complete" },
          { name: "MVP", description: "Minimum viable feature ready for testing" },
          { name: "Beta", description: "Feature-complete with test coverage" },
          { name: "GA", description: "Production-ready with documentation" },
        ],
        techStack: ["Determined by architecture review"],
        timeline: "6-12 weeks estimated",
        teamSize: "3-5 engineers",
      };
    }
    default: {
      return {
        tier: "concept",
        content: idea.description,
      };
    }
  }
}

function updateConvergence(session: RefinementSession): void {
  if (session.iterations.length === 0) {
    session.convergenceScore = 0;
    session.suggestStop = false;
    return;
  }

  // Look at recent quality deltas
  const recentIterations = session.iterations.slice(-5);
  const avgDelta =
    recentIterations.reduce((sum, i) => sum + (i.qualityDelta ?? 0), 0) / recentIterations.length;

  // Convergence: higher means less marginal gain
  session.convergenceScore = Math.max(0, Math.min(1, 1 - avgDelta));

  // All ideas at specification tier or low marginal gains
  const allAtSpec = session.ideas.every((i) => i.currentTier === "specification");
  session.suggestStop =
    allAtSpec || (session.convergenceScore > 0.8 && session.iterations.length >= 3);
}
