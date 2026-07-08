import { z } from "zod";

export const TeamMemberSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  role: z.string().max(200),
  capacity: z.number().min(0).max(1).describe("0–1 availability fraction"),
  strengths: z.array(z.string().max(100)).max(20),
  activeProjects: z.number().int().min(0).max(100),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const IdeaPipelineEntrySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(500),
  stage: z.enum(["discovery", "validation", "prototyping", "scaling", "launched", "retired"]),
  score: z.number().min(0).max(100),
  assignedTeam: z.array(z.string().max(100)).max(20),
  estimatedEffortWeeks: z.number().min(0).max(520),
  budgetAllocated: z.number().min(0),
  budgetSpent: z.number().min(0),
  startDate: z.string().optional(),
  targetLaunchDate: z.string().optional(),
});

export type IdeaPipelineEntry = z.infer<typeof IdeaPipelineEntrySchema>;

export const MarketContextSchema = z.object({
  industry: z.string().max(200),
  competitors: z
    .array(
      z.object({
        name: z.string().max(200),
        threat: z.enum(["low", "medium", "high"]),
        recentMoves: z.array(z.string().max(500)).max(10),
      })
    )
    .max(20),
  trends: z.array(z.string().max(500)).max(20),
  regulatoryFactors: z.array(z.string().max(500)).max(10),
  marketGrowthRate: z.number().min(-100).max(1000).optional(),
});

export type MarketContext = z.infer<typeof MarketContextSchema>;

export const BudgetConstraintsSchema = z.object({
  totalBudget: z.number().min(0),
  allocated: z.number().min(0),
  remaining: z.number().min(0),
  currency: z.string().max(10).default("USD"),
  quarterlyLimit: z.number().min(0).optional(),
});

export type BudgetConstraints = z.infer<typeof BudgetConstraintsSchema>;

export const TwinAngleEffectivenessSchema = z.object({
  angleId: z.string().max(100),
  successRate: z.number().min(0).max(1),
  avgIdeaQuality: z.number().min(0).max(100),
  usageCount: z.number().int().min(0),
  bestForStages: z.array(z.string().max(50)).max(10),
});

export type TwinAngleEffectiveness = z.infer<typeof TwinAngleEffectivenessSchema>;

export const EcosystemSnapshotSchema = z.object({
  id: z.string().min(1).max(100),
  organizationName: z.string().max(300),
  capturedAt: z.string(),
  team: z.array(TeamMemberSchema).max(200),
  pipeline: z.array(IdeaPipelineEntrySchema).max(500),
  marketContext: MarketContextSchema,
  budget: BudgetConstraintsSchema,
  angleEffectiveness: z.array(TwinAngleEffectivenessSchema).max(50),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type EcosystemSnapshot = z.infer<typeof EcosystemSnapshotSchema>;

export const StrategySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(300),
  description: z.string().max(2000),
  budgetAllocation: z.record(z.string().max(100), z.number().min(0)).optional(),
  teamReallocation: z
    .array(z.object({ memberId: z.string().max(100), toProject: z.string().max(100) }))
    .max(100)
    .optional(),
  anglePriorities: z.array(z.string().max(100)).max(20).optional(),
  newInitiatives: z.array(z.string().max(500)).max(20).optional(),
  retireInitiatives: z.array(z.string().max(100)).max(20).optional(),
  timeHorizonWeeks: z.number().int().min(1).max(260).default(52),
});

export type Strategy = z.infer<typeof StrategySchema>;
