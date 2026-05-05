import { z } from "zod";

/** Differential privacy noise mechanism. */
export const NoiseMechanismSchema = z.enum(["laplace", "gaussian"]);
export type NoiseMechanism = z.infer<typeof NoiseMechanismSchema>;

/** A privacy-preserving idea representation with noise applied. */
export const PrivateIdeaSchema = z.object({
  id: z.string().max(100),
  fingerprintHash: z.string().max(128),
  category: z.string().max(200),
  abstractDescription: z.string().max(2000),
  impactBucket: z.enum(["low", "medium", "high", "transformative"]),
  feasibilityBucket: z.enum(["low", "medium", "high"]),
  domainTags: z.array(z.string().max(100)).max(10),
  noisyScore: z.number().min(0).max(100),
  epsilon: z.number().min(0.01).max(10),
  orgId: z.string().max(100),
  createdAt: z.string(),
});
export type PrivateIdea = z.infer<typeof PrivateIdeaSchema>;

/** A cross-org match between complementary ideas. */
export const CrossOrgMatchSchema = z.object({
  id: z.string().max(100),
  ideaAHash: z.string().max(128),
  ideaBHash: z.string().max(128),
  orgAId: z.string().max(100),
  orgBId: z.string().max(100),
  matchScore: z.number().min(0).max(100),
  complementaryAreas: z.array(z.string().max(500)).max(10),
  matchType: z.enum(["similar", "complementary", "adjacent"]),
  createdAt: z.string(),
});
export type CrossOrgMatch = z.infer<typeof CrossOrgMatchSchema>;

/** Privacy budget tracking per organization. */
export const PrivacyBudgetSchema = z.object({
  orgId: z.string().max(100),
  totalEpsilon: z.number().min(0),
  usedEpsilon: z.number().min(0),
  remainingEpsilon: z.number().min(0),
  queryCount: z.number().min(0),
  resetAt: z.string(),
});
export type PrivacyBudget = z.infer<typeof PrivacyBudgetSchema>;

/** Result of a cross-org matching operation. */
export const MatchingResultSchema = z.object({
  matches: z.array(CrossOrgMatchSchema),
  totalCandidates: z.number(),
  privacyGuarantee: z.string().max(500),
  epsilonUsed: z.number().min(0),
  createdAt: z.string(),
});
export type MatchingResult = z.infer<typeof MatchingResultSchema>;

/** Configuration for cross-org innovation. */
export interface CrossOrgConfig {
  epsilon?: number;
  delta?: number;
  noiseMechanism?: NoiseMechanism;
  minMatchScore?: number;
  maxResults?: number;
}
