import { z } from "zod";

/** Exploration strategy for the autonomous agent. */
export const ExplorationStrategySchema = z.enum(["breadth-first", "depth-first", "adaptive"]);
export type ExplorationStrategy = z.infer<typeof ExplorationStrategySchema>;

/** Status of an autonomous agent run. */
export const AgentStatusSchema = z.enum([
  "idle",
  "exploring",
  "branching",
  "synthesizing",
  "paused",
  "completed",
  "failed",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** A single investigation branch in the exploration tree. */
export const InvestigationBranchSchema = z.object({
  id: z.string().max(100),
  parentId: z.string().max(100).nullable(),
  subject: z.string().max(1000),
  depth: z.number().min(0).max(20),
  status: z.enum(["pending", "active", "completed", "pruned"]),
  summary: z.string().max(5000).optional(),
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
        potentialImpact: z.string().max(2000),
        implementationHint: z.string().max(2000),
        score: z.number().min(0).max(100).optional(),
      })
    )
    .max(50),
  subBranches: z.array(z.string().max(100)),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});
export type InvestigationBranch = z.infer<typeof InvestigationBranchSchema>;

/** Decision made by the agent at a branch point. */
export const AgentDecisionSchema = z.object({
  id: z.string().max(100),
  branchId: z.string().max(100),
  action: z.enum(["explore", "branch", "prune", "synthesize", "pause"]),
  reasoning: z.string().max(2000),
  newSubjects: z.array(z.string().max(1000)).max(10),
  timestamp: z.string(),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

/** Curated portfolio produced at the end of exploration. */
export const InnovationPortfolioSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  summary: z.string().max(5000),
  topIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
        sourceSubject: z.string().max(1000),
        sourceBranchId: z.string().max(100),
        score: z.number().min(0).max(100),
        feasibility: z.enum(["low", "medium", "high"]),
      })
    )
    .max(30),
  themes: z.array(z.string().max(500)).max(20),
  explorationMap: z.array(
    z.object({
      branchId: z.string().max(100),
      subject: z.string().max(1000),
      depth: z.number(),
      ideaCount: z.number(),
    })
  ),
  totalBranches: z.number(),
  totalIdeas: z.number(),
  durationMs: z.number(),
  createdAt: z.string(),
});
export type InnovationPortfolio = z.infer<typeof InnovationPortfolioSchema>;

/** Full state of an autonomous agent run. */
export const AutonomousRunSchema = z.object({
  id: z.string().max(100),
  rootSubject: z.string().max(1000),
  status: AgentStatusSchema,
  strategy: ExplorationStrategySchema,
  branches: z.array(InvestigationBranchSchema),
  decisions: z.array(AgentDecisionSchema),
  portfolio: InnovationPortfolioSchema.optional(),
  config: z.object({
    maxBranches: z.number().min(1).max(100),
    maxDepth: z.number().min(1).max(10),
    pruneThreshold: z.number().min(0).max(100),
    model: z.string().optional(),
  }),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});
export type AutonomousRun = z.infer<typeof AutonomousRunSchema>;

/** Progress updates emitted during autonomous exploration. */
export interface AutonomousProgress {
  runId: string;
  status: AgentStatus;
  activeBranch?: string;
  completedBranches: number;
  totalBranches: number;
  totalIdeas: number;
  currentDecision?: AgentDecision;
  error?: string;
}

/** Configuration for the autonomous innovation agent. */
export interface AutonomousAgentConfig {
  maxBranches?: number;
  maxDepth?: number;
  pruneThreshold?: number;
  strategy?: ExplorationStrategy;
  model?: string;
  signal?: AbortSignal;
}
