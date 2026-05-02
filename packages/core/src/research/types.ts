import { z } from "zod";

/** Depth level for research. */
export const ResearchDepthSchema = z.enum(["shallow", "moderate", "deep"]);
export type ResearchDepth = z.infer<typeof ResearchDepthSchema>;

/** A single research finding from a tool-use step. */
export const ResearchFindingSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceType: z.enum(["web", "academic", "competitor", "internal"]),
  title: z.string(),
  content: z.string(),
  relevanceScore: z.number().min(0).max(1),
  timestamp: z.string(),
});

export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

/** A step in the research agent's execution log. */
export const ResearchStepSchema = z.object({
  id: z.string(),
  action: z.enum(["search", "read", "extract", "decide", "synthesize"]),
  input: z.string(),
  output: z.string(),
  timestamp: z.string(),
  durationMs: z.number(),
});

export type ResearchStep = z.infer<typeof ResearchStepSchema>;

/** Complete research brief produced by the agent. */
export const ResearchBriefSchema = z.object({
  subject: z.string(),
  depth: ResearchDepthSchema,
  summary: z.string(),
  keyFindings: z.array(z.string()),
  competitorInsights: z.array(z.string()),
  academicReferences: z.array(z.string()),
  trendSignals: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendations: z.array(z.string()),
  findings: z.array(ResearchFindingSchema),
  steps: z.array(ResearchStepSchema),
  totalDurationMs: z.number(),
  createdAt: z.string(),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

/** Progress updates emitted during research. */
export interface ResearchProgress {
  stage: "planning" | "researching" | "synthesizing" | "complete" | "error";
  currentStep?: string;
  completedSteps: number;
  totalSteps: number;
  findings: ResearchFinding[];
  error?: string;
}

/** Configuration for the research agent. */
export interface ResearchConfig {
  depth: ResearchDepth;
  maxSteps: number;
  model?: string;
  signal?: AbortSignal;
}

export const DEPTH_STEP_LIMITS: Record<ResearchDepth, number> = {
  shallow: 3,
  moderate: 6,
  deep: 10,
};
