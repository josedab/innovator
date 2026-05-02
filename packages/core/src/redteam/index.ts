/**
 * @module redteam
 *
 * Adversarial Red Team Mode: a devil's advocate agent that systematically attacks
 * generated ideas to find fatal flaws, hidden assumptions, and edge cases.
 * Supports iterative defense/rebuttal rounds.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for a single attack finding. */
export const AttackFindingSchema = z.object({
  category: z.enum([
    "fatal-flaw",
    "hidden-assumption",
    "edge-case",
    "market-risk",
    "technical-risk",
    "ethical-concern",
    "scalability-issue",
    "dependency-risk",
  ]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string().max(500),
  description: z.string().max(2000),
  evidence: z.string().max(2000),
  mitigationSuggestion: z.string().max(2000),
});

/** Schema for a defense rebuttal. */
export const DefenseRebuttalSchema = z.object({
  findingTitle: z.string().max(500),
  rebuttal: z.string().max(2000),
  mitigationPlan: z.string().max(2000),
  residualRisk: z.enum(["eliminated", "reduced", "accepted", "unmitigable"]),
  confidence: z.number().min(0).max(1),
});

/** Schema for the full red team attack result. */
export const RedTeamAttackSchema = z.object({
  ideaTitle: z.string().max(500),
  overallVulnerability: z.enum(["critical", "high", "moderate", "low", "minimal"]),
  findings: z.array(AttackFindingSchema).max(20),
  hiddenAssumptions: z.array(z.string().max(1000)).max(10),
  stressTestResults: z
    .array(
      z.object({
        scenario: z.string().max(500),
        outcome: z.enum(["fails", "degrades", "survives", "thrives"]),
        explanation: z.string().max(1000),
      })
    )
    .max(10),
  survivalScore: z.number().min(0).max(10),
  recommendation: z.enum(["proceed", "proceed-with-caution", "pivot", "abandon"]),
});

/** Schema for the defense round result. */
export const DefenseRoundSchema = z.object({
  ideaTitle: z.string().max(500),
  rebuttals: z.array(DefenseRebuttalSchema).max(20),
  overallDefenseStrength: z.enum(["strong", "moderate", "weak"]),
  revisedSurvivalScore: z.number().min(0).max(10),
  recommendation: z.string().max(2000),
});

/** Schema for a complete red team session with attack/defense rounds. */
export const RedTeamSessionSchema = z.object({
  id: z.string().max(100),
  ideaTitle: z.string().max(500),
  rounds: z.array(
    z.object({
      roundNumber: z.number(),
      attack: RedTeamAttackSchema,
      defense: DefenseRoundSchema.optional(),
    })
  ),
  finalVerdict: z
    .enum(["validated", "conditionally-validated", "needs-pivot", "rejected"])
    .optional(),
  createdAt: z.string(),
});

// ---- Types ----

export type AttackFinding = z.infer<typeof AttackFindingSchema>;
export type DefenseRebuttal = z.infer<typeof DefenseRebuttalSchema>;
export type RedTeamAttack = z.infer<typeof RedTeamAttackSchema>;
export type DefenseRound = z.infer<typeof DefenseRoundSchema>;
export type RedTeamSession = z.infer<typeof RedTeamSessionSchema>;

// ---- In-memory store ----

const sessions: Map<string, RedTeamSession> = new Map();
let sessionCounter = 0;

// ---- Prompt builders ----

function buildAttackPrompt(
  idea: InnovationIdea,
  investigation?: Investigation,
  previousDefense?: DefenseRound
): string {
  const context = investigation
    ? `\nCONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}`
    : "";

  const previousRound = previousDefense
    ? `\nPREVIOUS DEFENSE ATTEMPTED:\n${sanitizeLlmOutput(JSON.stringify(previousDefense.rebuttals, null, 2))}\nFocus on areas where the defense was weak or new angles of attack.`
    : "";

  return `You are a ruthless devil's advocate and innovation red team expert. Your job is to systematically attack and stress-test the following idea to find every possible weakness.

${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}
${wrapUserInput("POTENTIAL_IMPACT", idea.potentialImpact)}
${wrapUserInput("IMPLEMENTATION_HINT", idea.implementationHint)}
${context}
${previousRound}

Attack this idea by:
1. Finding fatal flaws that could kill it
2. Exposing hidden assumptions the creator hasn't considered
3. Stress-testing edge cases (scale, adversarial users, market shifts, regulatory changes)
4. Identifying technical, market, ethical, and dependency risks

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "ideaTitle": "exact title",
  "overallVulnerability": "critical|high|moderate|low|minimal",
  "findings": [
    {
      "category": "fatal-flaw|hidden-assumption|edge-case|market-risk|technical-risk|ethical-concern|scalability-issue|dependency-risk",
      "severity": "critical|high|medium|low",
      "title": "Finding title",
      "description": "Detailed description",
      "evidence": "Supporting evidence or reasoning",
      "mitigationSuggestion": "How to address this"
    }
  ],
  "hiddenAssumptions": ["assumption 1", "assumption 2"],
  "stressTestResults": [
    { "scenario": "10x scale", "outcome": "fails|degrades|survives|thrives", "explanation": "..." }
  ],
  "survivalScore": 6.5,
  "recommendation": "proceed|proceed-with-caution|pivot|abandon"
}`;
}

function buildDefensePrompt(idea: InnovationIdea, attack: RedTeamAttack): string {
  return `You are an innovation defense attorney. Your job is to rebut the red team's attacks on the following idea with strong, evidence-based defenses.

${wrapUserInput("IDEA_TITLE", idea.title)}
${wrapUserInput("IDEA_DESCRIPTION", idea.description)}

RED TEAM FINDINGS:
"""
${sanitizeLlmOutput(JSON.stringify(attack.findings, null, 2))}
"""

HIDDEN ASSUMPTIONS IDENTIFIED:
"""
${sanitizeLlmOutput(attack.hiddenAssumptions.join("\n"))}
"""

For EACH finding, provide a defense rebuttal. Be honest — if a finding is valid and unmitigable, say so.

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "ideaTitle": "exact title",
  "rebuttals": [
    {
      "findingTitle": "exact finding title",
      "rebuttal": "Defense argument",
      "mitigationPlan": "Concrete plan to address",
      "residualRisk": "eliminated|reduced|accepted|unmitigable",
      "confidence": 0.8
    }
  ],
  "overallDefenseStrength": "strong|moderate|weak",
  "revisedSurvivalScore": 7.5,
  "recommendation": "Summary recommendation after defense"
}`;
}

// ---- Core functions ----

/**
 * Attack an idea with adversarial red team analysis.
 */
export async function attackIdea(
  idea: InnovationIdea,
  investigation?: Investigation,
  previousDefense?: DefenseRound,
  model?: string,
  signal?: AbortSignal
): Promise<RedTeamAttack> {
  const prompt = buildAttackPrompt(idea, investigation, previousDefense);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse red team response as JSON: ${jsonStr.slice(0, 200)}`);
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

  return RedTeamAttackSchema.parse(parsed);
}

/**
 * Defend an idea against red team findings.
 */
export async function defendIdea(
  idea: InnovationIdea,
  attack: RedTeamAttack,
  model?: string,
  signal?: AbortSignal
): Promise<DefenseRound> {
  const prompt = buildDefensePrompt(idea, attack);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse defense response as JSON: ${jsonStr.slice(0, 200)}`);
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

  return DefenseRoundSchema.parse(parsed);
}

/**
 * Run a full red team session with multiple attack/defense rounds.
 */
export async function runRedTeamSession(
  idea: InnovationIdea,
  investigation?: Investigation,
  options?: {
    rounds?: number;
    model?: string;
    signal?: AbortSignal;
    onRoundComplete?: (round: number, attack: RedTeamAttack, defense?: DefenseRound) => void;
  }
): Promise<RedTeamSession> {
  const maxRounds = Math.min(options?.rounds ?? 2, 5);
  const sessionId = `redteam-${++sessionCounter}-${Date.now()}`;

  const session: RedTeamSession = {
    id: sessionId,
    ideaTitle: idea.title,
    rounds: [],
    createdAt: new Date().toISOString(),
  };

  let previousDefense: DefenseRound | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    if (options?.signal?.aborted) break;

    const attack = await attackIdea(
      idea,
      investigation,
      previousDefense,
      options?.model,
      options?.signal
    );

    let defense: DefenseRound | undefined;
    if (round < maxRounds) {
      defense = await defendIdea(idea, attack, options?.model, options?.signal);
      previousDefense = defense;
    }

    session.rounds.push({ roundNumber: round, attack, defense });
    options?.onRoundComplete?.(round, attack, defense);
  }

  // Determine final verdict based on last attack
  const lastAttack = session.rounds[session.rounds.length - 1]?.attack;
  if (lastAttack) {
    if (lastAttack.survivalScore >= 7) session.finalVerdict = "validated";
    else if (lastAttack.survivalScore >= 5) session.finalVerdict = "conditionally-validated";
    else if (lastAttack.survivalScore >= 3) session.finalVerdict = "needs-pivot";
    else session.finalVerdict = "rejected";
  }

  sessions.set(sessionId, session);
  return session;
}

/**
 * Get a red team session by ID.
 */
export function getRedTeamSession(id: string): RedTeamSession | undefined {
  return sessions.get(id);
}

/**
 * List all red team sessions.
 */
export function listRedTeamSessions(): RedTeamSession[] {
  return Array.from(sessions.values());
}

/**
 * Clear all red team sessions.
 */
export function clearRedTeamSessions(): void {
  sessions.clear();
  sessionCounter = 0;
}

/**
 * Count critical/high findings from an attack.
 */
export function countSevereFindings(attack: RedTeamAttack): number {
  return attack.findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
}

/**
 * Summarize defense effectiveness as a percentage of mitigated findings.
 */
export function defenseEffectiveness(defense: DefenseRound): number {
  if (defense.rebuttals.length === 0) return 0;
  const mitigated = defense.rebuttals.filter(
    (r) => r.residualRisk === "eliminated" || r.residualRisk === "reduced"
  ).length;
  return mitigated / defense.rebuttals.length;
}
