/**
 * @module gauntlet
 *
 * Adversarial Idea Gauntlet — stress-tests innovation ideas by running them
 * through a panel of specialized adversary agents. Each adversary attacks the
 * idea from a different angle (market, regulatory, technical, economic,
 * assumptions). Produces a Survivability Index and optionally strengthens
 * the idea by addressing top attacks.
 */

import { z } from "zod";

// ---- Adversary Persona ----

export const AdversaryRoleSchema = z.enum([
  "competitor",
  "regulator",
  "skeptic",
  "economist",
  "engineer",
]);

export type AdversaryRole = z.infer<typeof AdversaryRoleSchema>;

export const ADVERSARY_DESCRIPTIONS: Record<AdversaryRole, string> = {
  competitor:
    "Simulates a savvy market rival. Looks for ways a competitor could pre-empt, clone, or undercut the idea.",
  regulator:
    "Acts as a regulatory compliance officer. Identifies legal, privacy, safety, and ethical risks.",
  skeptic: "A devil's advocate who challenges every core assumption and looks for logical gaps.",
  economist: "Stress-tests unit economics, cost structure, pricing, and market sizing.",
  engineer: "Evaluates technical feasibility, scalability bottlenecks, and implementation risks.",
};

export const ADVERSARY_ATTACK_CATEGORIES: Record<AdversaryRole, string[]> = {
  competitor: [
    "market-preemption",
    "differentiation-weakness",
    "speed-to-market",
    "pricing-undercut",
  ],
  regulator: ["compliance-gap", "privacy-risk", "safety-concern", "ethical-issue", "ip-conflict"],
  skeptic: [
    "flawed-assumption",
    "logical-gap",
    "confirmation-bias",
    "survivorship-bias",
    "missing-evidence",
  ],
  economist: ["unit-economics", "market-size", "cost-structure", "pricing-model", "funding-risk"],
  engineer: [
    "scalability-bottleneck",
    "technical-debt",
    "integration-complexity",
    "performance-risk",
    "security-vulnerability",
  ],
};

// ---- Attack Schema ----

export const AttackSchema = z.object({
  adversaryRole: AdversaryRoleSchema,
  category: z.string().max(200),
  severity: z.number().min(1).max(10),
  title: z.string().max(500),
  reasoning: z.string().max(2000),
  evidence: z.string().max(2000),
  suggestedCounter: z.string().max(2000),
});

export type Attack = z.infer<typeof AttackSchema>;

// ---- Gauntlet Result ----

export const GauntletTranscriptEntrySchema = z.object({
  adversaryRole: AdversaryRoleSchema,
  attacks: z.array(AttackSchema).max(5),
  timestamp: z.string(),
});

export type GauntletTranscriptEntry = z.infer<typeof GauntletTranscriptEntrySchema>;

export const GauntletResultSchema = z.object({
  id: z.string(),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  attacks: z.array(AttackSchema),
  survivabilityIndex: z.number().min(0).max(100),
  transcript: z.array(GauntletTranscriptEntrySchema),
  strengthenedIdea: z
    .object({
      title: z.string().max(500),
      description: z.string().max(5000),
      addressedAttacks: z.array(z.string().max(500)),
      revisedSurvivabilityIndex: z.number().min(0).max(100),
    })
    .optional(),
  createdAt: z.string(),
  model: z.string().max(100).optional(),
});

export type GauntletResult = z.infer<typeof GauntletResultSchema>;

// ---- Config ----

export interface GauntletConfig {
  /** Adversary roles to include (default: all 5). */
  adversaries?: AdversaryRole[];
  /** Whether to generate a strengthened version after the gauntlet. */
  strengthen?: boolean;
  /** LLM model to use. */
  model?: string;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Optional custom adversary personas (extend beyond built-in 5). */
  customAdversaries?: Array<{
    role: string;
    description: string;
    attackCategories: string[];
  }>;
}

// ---- Progress ----

export interface GauntletProgress {
  stage: "attacking" | "scoring" | "strengthening" | "complete";
  currentAdversary?: string;
  completedAdversaries: string[];
  totalAdversaries: number;
  attacks: Attack[];
  survivabilityIndex?: number;
  result?: GauntletResult;
}
