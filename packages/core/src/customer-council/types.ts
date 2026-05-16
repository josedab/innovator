/**
 * @module customer-council
 *
 * Synthetic Customer Council — generates a persistent panel of AI personas
 * representing target customer segments with demographics, psychographics,
 * and behavioral tendencies. Ships with 10 pre-built archetypes.
 */

import { z } from "zod";

// ---- Customer Persona ----

export const CustomerPersonaSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  /** Archetype label. */
  archetype: z.string().max(200),
  /** Age range. */
  ageRange: z.string().max(50),
  /** Income bracket. */
  incomeBracket: z.string().max(100),
  /** Occupation. */
  occupation: z.string().max(200),
  /** Psychographic traits. */
  traits: z.array(z.string().max(200)).max(20),
  /** Pain points. */
  painPoints: z.array(z.string().max(500)).max(20),
  /** Values and motivations. */
  values: z.array(z.string().max(200)).max(20),
  /** Technology comfort level. */
  techSavviness: z.enum(["low", "medium", "high", "expert"]),
  /** Price sensitivity (1 = very sensitive, 10 = price insensitive). */
  priceSensitivity: z.number().int().min(1).max(10),
  /** Risk tolerance (1 = risk averse, 10 = risk seeking). */
  riskTolerance: z.number().int().min(1).max(10),
  /** Brand loyalty (1 = switcher, 10 = die-hard loyal). */
  brandLoyalty: z.number().int().min(1).max(10),
  /** Custom context for evaluation prompts. */
  customContext: z.string().max(3000).optional(),
});

export type CustomerPersona = z.infer<typeof CustomerPersonaSchema>;

// ---- Council Evaluation ----

export const CouncilEvaluationSchema = z.object({
  personaId: z.string().max(100),
  personaName: z.string().max(200),
  ideaTitle: z.string().max(500),
  /** Overall enthusiasm score (0–100). */
  enthusiasmScore: z.number().min(0).max(100),
  /** Would they buy/adopt? */
  adoptionLikelihood: z.enum(["definitely-not", "unlikely", "maybe", "likely", "definitely"]),
  /** Willingness to pay (0–10 scale). */
  willingnessToPay: z.number().min(0).max(10),
  /** Natural language feedback as this persona. */
  feedback: z.string().max(5000),
  /** Key concerns from this persona's perspective. */
  concerns: z.array(z.string().max(500)).max(10),
  /** What excites them. */
  excitements: z.array(z.string().max(500)).max(10),
  /** Suggested improvements from their perspective. */
  suggestions: z.array(z.string().max(500)).max(10),
});

export type CouncilEvaluation = z.infer<typeof CouncilEvaluationSchema>;

// ---- Council Verdict ----

export const CouncilVerdictSchema = z.object({
  ideaTitle: z.string().max(500),
  /** Individual evaluations. */
  evaluations: z.array(CouncilEvaluationSchema),
  /** Aggregate enthusiasm (0–100). */
  averageEnthusiasm: z.number().min(0).max(100),
  /** Consensus level (0–1, 1 = unanimous). */
  consensusLevel: z.number().min(0).max(1),
  /** Overall verdict. */
  verdict: z.enum(["strong-pass", "pass", "mixed", "fail", "strong-fail"]),
  /** Key themes across all personas. */
  keyThemes: z.array(z.string().max(500)).max(20),
  /** Target segment recommendation. */
  bestFitSegments: z.array(z.string().max(200)).max(10),
  /** Summary narrative. */
  summary: z.string().max(5000),
});

export type CouncilVerdict = z.infer<typeof CouncilVerdictSchema>;

// ---- Calibration ----

export const CalibrationRecordSchema = z.object({
  ideaId: z.string().max(200),
  ideaTitle: z.string().max(500),
  /** Council's predicted enthusiasm. */
  predictedEnthusiasm: z.number().min(0).max(100),
  /** Actual market outcome (if known). */
  actualOutcome: z.enum(["success", "partial", "failure"]).optional(),
  /** Actual adoption rate (if measured). */
  actualAdoptionRate: z.number().min(0).max(1).optional(),
  /** Prediction accuracy (0–1). */
  accuracy: z.number().min(0).max(1).optional(),
  recordedAt: z.string(),
});

export type CalibrationRecord = z.infer<typeof CalibrationRecordSchema>;

// ---- Config ----

export interface CouncilConfig {
  /** Which personas to include. */
  personaIds?: string[];
  /** LLM model. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
}
