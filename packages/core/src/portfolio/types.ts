import { z } from "zod";

/** Lifecycle stages for an innovation idea. */
export const IdeaLifecycleStageSchema = z.enum([
  "ideation",
  "evaluation",
  "prototyping",
  "shipped",
  "abandoned",
]);

export type IdeaLifecycleStage = z.infer<typeof IdeaLifecycleStageSchema>;

/** A status transition record. */
export const StatusTransitionSchema = z.object({
  from: IdeaLifecycleStageSchema,
  to: IdeaLifecycleStageSchema,
  timestamp: z.string(),
  reason: z.string().optional(),
  userId: z.string().optional(),
});

export type StatusTransition = z.infer<typeof StatusTransitionSchema>;

/** A portfolio item tracking an idea through its lifecycle. */
export const PortfolioItemSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  sourceAngle: z.string(),
  stage: IdeaLifecycleStageSchema,
  transitions: z.array(StatusTransitionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  outcome: z.string().optional(),
  impactScore: z.number().min(0).max(10).optional(),
  tags: z.array(z.string()),
  assignee: z.string().optional(),
});

export type PortfolioItem = z.infer<typeof PortfolioItemSchema>;

/** Aggregated portfolio metrics. */
export interface PortfolioMetrics {
  totalIdeas: number;
  byStage: Record<IdeaLifecycleStage, number>;
  byAngle: Record<string, number>;
  conversionRates: {
    ideationToEvaluation: number;
    evaluationToPrototyping: number;
    prototypingToShipped: number;
    overallShipRate: number;
  };
  avgTimeInStageMs: Record<IdeaLifecycleStage, number>;
  velocityPerWeek: number;
}

/** Portfolio insight generated from metrics. */
export interface PortfolioInsight {
  type: "strength" | "opportunity" | "warning";
  title: string;
  description: string;
}
