/**
 * @module simulation/stakeholder
 *
 * Stakeholder Reaction Simulation — simulates reactions from 6 default personas
 * (early adopter, enterprise buyer, investor, regulator, competitor, end user)
 * for each idea. Runs persona prompts in parallel and parses into structured format.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";

// ---- Schemas ----

/** A stakeholder persona definition. */
export const StakeholderPersonaSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(1000),
  priorities: z.array(z.string().max(200)).max(10),
  riskTolerance: z.enum(["low", "medium", "high"]),
});

/** A single stakeholder's reaction to an idea. */
export const StakeholderReactionSchema = z.object({
  personaId: z.string().max(100),
  personaName: z.string().max(200),
  enthusiasm: z.number().min(1).max(10),
  concerns: z.array(z.string().max(500)).max(10),
  opportunities: z.array(z.string().max(500)).max(10),
  likelyAction: z.string().max(500),
  quote: z.string().max(500).optional().describe("A representative quote from this persona"),
});

/** Full simulation result for a single idea across all personas. */
export const StakeholderSimulationSchema = z.object({
  ideaTitle: z.string().max(500),
  reactions: z.array(StakeholderReactionSchema).max(20),
  consensusScore: z.number().min(1).max(10).describe("Average enthusiasm across personas"),
  mostEnthusiastic: z.string().max(200),
  mostConcerned: z.string().max(200),
  keyDebates: z.array(z.string().max(500)).max(5),
});

// ---- Types ----

export type StakeholderPersona = z.infer<typeof StakeholderPersonaSchema>;
export type StakeholderReaction = z.infer<typeof StakeholderReactionSchema>;
export type StakeholderSimulation = z.infer<typeof StakeholderSimulationSchema>;

/** Conflict between two stakeholders on a specific idea. */
export const StakeholderConflictSchema = z.object({
  personaA: z.string().max(200),
  personaB: z.string().max(200),
  enthusiasmDelta: z.number().min(0).max(9),
  topic: z.string().max(500),
  resolution: z.string().max(500).optional(),
});

/** Conflict matrix across all stakeholders for a set of ideas. */
export const ConflictMatrixSchema = z.object({
  ideaTitle: z.string().max(500),
  conflicts: z.array(StakeholderConflictSchema).max(50),
  alignmentScore: z.number().min(0).max(1).describe("0 = total conflict, 1 = full alignment"),
  readinessScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Readiness percentage based on support vs opposition"),
  supportCount: z.number(),
  oppositionCount: z.number(),
  neutralCount: z.number(),
});

export type StakeholderConflict = z.infer<typeof StakeholderConflictSchema>;
export type ConflictMatrix = z.infer<typeof ConflictMatrixSchema>;

// ---- Default Personas ----

/** The 10 default stakeholder personas. */
export const DEFAULT_PERSONAS: StakeholderPersona[] = [
  {
    id: "early-adopter",
    name: "Early Adopter",
    description:
      "Tech-savvy individual who seeks cutting-edge solutions. Willing to tolerate rough edges for innovation advantage.",
    priorities: ["novelty", "competitive advantage", "speed to access", "community"],
    riskTolerance: "high",
  },
  {
    id: "enterprise-buyer",
    name: "Enterprise Buyer",
    description:
      "Corporate decision-maker evaluating solutions for large organizations. Focused on ROI, scalability, and vendor stability.",
    priorities: [
      "ROI",
      "scalability",
      "security",
      "compliance",
      "vendor reliability",
      "integration",
    ],
    riskTolerance: "low",
  },
  {
    id: "investor",
    name: "Investor",
    description:
      "VC or angel investor evaluating market opportunity. Looking for large TAM, defensibility, and team capability.",
    priorities: ["market size", "defensibility", "unit economics", "growth potential", "team"],
    riskTolerance: "medium",
  },
  {
    id: "regulator",
    name: "Regulator",
    description:
      "Government or industry regulator focused on consumer protection, safety, and compliance with existing frameworks.",
    priorities: ["consumer protection", "safety", "privacy", "fair competition", "transparency"],
    riskTolerance: "low",
  },
  {
    id: "competitor",
    name: "Competitor",
    description:
      "Incumbent player in the space evaluating threat level and potential response strategies.",
    priorities: [
      "market share defense",
      "differentiation",
      "cost to replicate",
      "customer retention",
    ],
    riskTolerance: "medium",
  },
  {
    id: "end-user",
    name: "End User",
    description:
      "The actual person who would use the product daily. Focused on usability, value, and solving real problems.",
    priorities: ["ease of use", "price", "reliability", "time saved", "learning curve"],
    riskTolerance: "medium",
  },
  {
    id: "cto",
    name: "CTO",
    description:
      "Chief Technology Officer responsible for technical strategy and architecture. Evaluates technical feasibility, scalability, and alignment with engineering roadmap.",
    priorities: [
      "technical feasibility",
      "scalability",
      "maintainability",
      "tech debt",
      "team capacity",
      "architecture fit",
    ],
    riskTolerance: "medium",
  },
  {
    id: "cfo",
    name: "CFO",
    description:
      "Chief Financial Officer focused on financial viability, cost control, and return on investment. Needs clear business cases with measurable outcomes.",
    priorities: [
      "cost efficiency",
      "ROI timeline",
      "revenue impact",
      "budget constraints",
      "financial risk",
    ],
    riskTolerance: "low",
  },
  {
    id: "product-manager",
    name: "Product Manager",
    description:
      "Product leader balancing user needs, business goals, and technical constraints. Prioritizes features by impact and effort.",
    priorities: [
      "user value",
      "market fit",
      "prioritization",
      "roadmap alignment",
      "metrics impact",
    ],
    riskTolerance: "medium",
  },
  {
    id: "data-privacy-officer",
    name: "Data Privacy Officer",
    description:
      "Privacy and data protection specialist ensuring compliance with GDPR, CCPA, and other regulations. Guards against data misuse.",
    priorities: [
      "data privacy",
      "GDPR compliance",
      "consent management",
      "data minimization",
      "breach risk",
    ],
    riskTolerance: "low",
  },
];

// ---- Core Functions ----

/**
 * Simulate a single persona's reaction to an idea.
 *
 * @param idea - The innovation idea to evaluate
 * @param persona - The stakeholder persona
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Stakeholder reaction
 */
export async function simulatePersonaReaction(
  idea: InnovationIdea,
  persona: StakeholderPersona,
  model?: string,
  signal?: AbortSignal
): Promise<StakeholderReaction> {
  const prompt = `You are roleplaying as a ${persona.name}.

PERSONA: ${persona.description}
PRIORITIES: ${persona.priorities.join(", ")}
RISK TOLERANCE: ${persona.riskTolerance}

${wrapUserInput("IDEA", `${idea.title}\n${idea.description}\nPotential Impact: ${idea.potentialImpact}`)}

React to this idea from your persona's perspective:
- enthusiasm (1-10): How excited are you about this idea?
- concerns: What worries you? (up to 5)
- opportunities: What excites you? (up to 5)
- likelyAction: What would you actually do? (e.g., "Adopt immediately", "Wait and see", "Lobby against")
- quote: A brief quote capturing your reaction

Return valid JSON only:
{
  "personaId": "${persona.id}",
  "personaName": "${persona.name}",
  "enthusiasm": 7,
  "concerns": ["..."],
  "opportunities": ["..."],
  "likelyAction": "...",
  "quote": "..."
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse stakeholder reaction: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") || err.message.includes("No JSON object found")),
    }
  );

  return StakeholderReactionSchema.parse(parsed);
}

/**
 * Run full stakeholder simulation for an idea across all personas.
 * Runs persona simulations in parallel for efficiency.
 *
 * @param idea - The innovation idea to evaluate
 * @param personas - Personas to simulate (defaults to DEFAULT_PERSONAS)
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Full stakeholder simulation result
 */
export async function simulateStakeholders(
  idea: InnovationIdea,
  personas?: StakeholderPersona[],
  model?: string,
  signal?: AbortSignal
): Promise<StakeholderSimulation> {
  const selectedPersonas = personas ?? DEFAULT_PERSONAS;

  // Run simulations in parallel (bounded by natural LLM rate limits)
  const reactionPromises = selectedPersonas.map((persona) =>
    simulatePersonaReaction(idea, persona, model, signal).catch(
      (): StakeholderReaction => ({
        personaId: persona.id,
        personaName: persona.name,
        enthusiasm: 5,
        concerns: ["Simulation unavailable"],
        opportunities: [],
        likelyAction: "Unable to assess",
      })
    )
  );

  const reactions = await Promise.all(reactionPromises);

  const avgEnthusiasm = reactions.reduce((sum, r) => sum + r.enthusiasm, 0) / reactions.length;

  const sorted = [...reactions].sort((a, b) => b.enthusiasm - a.enthusiasm);
  const mostEnthusiastic = sorted[0]?.personaName ?? "N/A";
  const mostConcerned = sorted[sorted.length - 1]?.personaName ?? "N/A";

  // Identify key debates from contrasting reactions
  const keyDebates: string[] = [];
  for (let i = 0; i < reactions.length; i++) {
    for (let j = i + 1; j < reactions.length; j++) {
      const diff = Math.abs(reactions[i].enthusiasm - reactions[j].enthusiasm);
      if (diff >= 4) {
        keyDebates.push(
          `${reactions[i].personaName} (${reactions[i].enthusiasm}/10) vs ${reactions[j].personaName} (${reactions[j].enthusiasm}/10)`
        );
      }
    }
  }

  return {
    ideaTitle: idea.title,
    reactions,
    consensusScore: Math.round(avgEnthusiasm * 10) / 10,
    mostEnthusiastic,
    mostConcerned,
    keyDebates: keyDebates.slice(0, 5),
  };
}

/**
 * Simulate stakeholder reactions for multiple ideas.
 *
 * @param ideas - Array of ideas to evaluate
 * @param personas - Personas to simulate (defaults to DEFAULT_PERSONAS)
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal
 * @returns Array of stakeholder simulations
 */
export async function simulateStakeholdersBatch(
  ideas: InnovationIdea[],
  personas?: StakeholderPersona[],
  model?: string,
  signal?: AbortSignal
): Promise<StakeholderSimulation[]> {
  const results: StakeholderSimulation[] = [];
  for (const idea of ideas) {
    if (signal?.aborted) break;
    const simulation = await simulateStakeholders(idea, personas, model, signal);
    results.push(simulation);
  }
  return results;
}

/**
 * Build a conflict matrix from a stakeholder simulation result.
 * Identifies conflicts (enthusiasm delta >= 3), computes alignment and readiness scores.
 */
export function buildConflictMatrix(simulation: StakeholderSimulation): ConflictMatrix {
  const { reactions, ideaTitle } = simulation;
  const conflicts: StakeholderConflict[] = [];

  for (let i = 0; i < reactions.length; i++) {
    for (let j = i + 1; j < reactions.length; j++) {
      const delta = Math.abs(reactions[i].enthusiasm - reactions[j].enthusiasm);
      if (delta >= 3) {
        const higher =
          reactions[i].enthusiasm > reactions[j].enthusiasm ? reactions[i] : reactions[j];
        const lower =
          reactions[i].enthusiasm > reactions[j].enthusiasm ? reactions[j] : reactions[i];
        conflicts.push({
          personaA: higher.personaName,
          personaB: lower.personaName,
          enthusiasmDelta: delta,
          topic: `${higher.personaName} sees opportunity while ${lower.personaName} has concerns: ${lower.concerns[0] ?? "general skepticism"}`,
        });
      }
    }
  }

  const supportThreshold = 7;
  const oppositionThreshold = 4;
  const supportCount = reactions.filter((r) => r.enthusiasm >= supportThreshold).length;
  const oppositionCount = reactions.filter((r) => r.enthusiasm <= oppositionThreshold).length;
  const neutralCount = reactions.length - supportCount - oppositionCount;

  const maxDelta =
    reactions.length > 1
      ? Math.max(...reactions.map((r) => r.enthusiasm)) -
        Math.min(...reactions.map((r) => r.enthusiasm))
      : 0;
  const alignmentScore = Math.round((1 - maxDelta / 9) * 100) / 100;

  const readinessScore = Math.round(
    ((supportCount * 2 + neutralCount) / (reactions.length * 2)) * 100
  );

  return ConflictMatrixSchema.parse({
    ideaTitle,
    conflicts: conflicts.slice(0, 50),
    alignmentScore,
    readinessScore: Math.min(readinessScore, 100),
    supportCount,
    oppositionCount,
    neutralCount,
  });
}

/**
 * Compute readiness scores for multiple simulations, returning them sorted by readiness.
 */
export function computeReadinessScores(simulations: StakeholderSimulation[]): ConflictMatrix[] {
  return simulations.map(buildConflictMatrix).sort((a, b) => b.readinessScore - a.readinessScore);
}
