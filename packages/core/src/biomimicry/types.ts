import { z } from "zod";

// ---- Biological Functions ----

/** Validates the biological function category used to classify organism strategies. */
export const BiologicalFunctionSchema = z.enum([
  "energy-capture",
  "material-transport",
  "information-processing",
  "structural-resilience",
  "self-repair",
  "adaptation",
  "reproduction",
  "defense",
  "communication",
  "locomotion",
  "thermal-regulation",
  "water-management",
  "waste-processing",
  "symbiosis",
  "camouflage",
  "navigation",
]);

/** A biological function category (e.g. energy capture, self-repair, locomotion). */
export type BiologicalFunction = z.infer<typeof BiologicalFunctionSchema>;

// ---- Taxonomy Entry ----

/**
 * Validates a biomimicry taxonomy entry linking an organism's biological strategy
 * to its mechanism, technical analogy, and known real-world applications.
 * @see BiologicalFunctionSchema
 */
export const BiomimicryEntrySchema = z.object({
  id: z.string(),
  organism: z.string().max(200),
  biologicalStrategy: z.string().max(1000),
  function: BiologicalFunctionSchema,
  mechanism: z.string().max(2000),
  technicalAnalogy: z.string().max(2000),
  knownApplications: z.array(z.string().max(500)).max(10),
  transferabilityFactors: z.array(z.string().max(500)).max(10),
  tags: z.array(z.string().max(100)).max(20),
});

/** A catalogued organism strategy with its biological mechanism and technical analogy. */
export type BiomimicryEntry = z.infer<typeof BiomimicryEntrySchema>;

// ---- Transfer Result ----

/**
 * Validates the result of transferring a biological strategy to a technical application.
 * Scores transferability, feasibility, and novelty, and outlines an implementation path.
 */
export const BiomimicryTransferSchema = z.object({
  entryId: z.string(),
  organism: z.string().max(200),
  biologicalStrategy: z.string().max(1000),
  technicalApplication: z.string().max(3000),
  transferabilityScore: z.number().min(0).max(1),
  feasibilityScore: z.number().min(0).max(1),
  noveltyScore: z.number().min(0).max(1),
  implementationPath: z.string().max(3000),
  challenges: z.array(z.string().max(500)).max(10),
  potentialImpact: z.string().max(2000),
});

/** Scored result of applying a biological strategy to a technical problem domain. */
export type BiomimicryTransfer = z.infer<typeof BiomimicryTransferSchema>;

// ---- Biomimicry Innovation Result ----

/**
 * Validates the complete biomimicry analysis result for a given subject.
 * Aggregates matched taxonomy entries, transfer results, and a synthesis narrative.
 */
export const BiomimicryResultSchema = z.object({
  subject: z.string().max(2000),
  matchedEntries: z.array(BiomimicryEntrySchema).max(20),
  transfers: z.array(BiomimicryTransferSchema).max(20),
  synthesisNarrative: z.string().max(5000),
  topInspiration: z.string().max(2000),
});

/** Full biomimicry analysis with matched organisms, transfers, and synthesis narrative. */
export type BiomimicryResult = z.infer<typeof BiomimicryResultSchema>;

// ---- Config ----

/** Configuration options for biomimicry analysis. */
export interface BiomimicryConfig {
  functions?: BiologicalFunction[];
  maxTransfers?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: BiomimicryProgress) => void;
}

/** Progress report emitted during biomimicry matching, transfer, and synthesis. */
export interface BiomimicryProgress {
  stage: "matching" | "transferring" | "synthesizing" | "complete";
  completedTransfers: number;
  totalTransfers: number;
}
