import { z } from "zod";

// ---- Biological Functions ----

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

export type BiologicalFunction = z.infer<typeof BiologicalFunctionSchema>;

// ---- Taxonomy Entry ----

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

export type BiomimicryEntry = z.infer<typeof BiomimicryEntrySchema>;

// ---- Transfer Result ----

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

export type BiomimicryTransfer = z.infer<typeof BiomimicryTransferSchema>;

// ---- Biomimicry Innovation Result ----

export const BiomimicryResultSchema = z.object({
  subject: z.string().max(2000),
  matchedEntries: z.array(BiomimicryEntrySchema).max(20),
  transfers: z.array(BiomimicryTransferSchema).max(20),
  synthesisNarrative: z.string().max(5000),
  topInspiration: z.string().max(2000),
});

export type BiomimicryResult = z.infer<typeof BiomimicryResultSchema>;

// ---- Config ----

export interface BiomimicryConfig {
  functions?: BiologicalFunction[];
  maxTransfers?: number;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: BiomimicryProgress) => void;
}

export interface BiomimicryProgress {
  stage: "matching" | "transferring" | "synthesizing" | "complete";
  completedTransfers: number;
  totalTransfers: number;
}
