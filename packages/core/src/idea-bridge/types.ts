/**
 * @module idea-bridge/types
 *
 * Types for the Idea-to-Implementation Bridge — end-to-end pipeline from
 * idea → PRD → tech spec → implementation plan → issues/branches.
 */

import { z } from "zod";

// ---- Pipeline Stages ----

export const BridgeStageSchema = z.enum([
  "idea",
  "prd",
  "tech-spec",
  "implementation-plan",
  "issues-created",
  "branches-created",
  "completed",
]);
export type BridgeStage = z.infer<typeof BridgeStageSchema>;

// ---- User Story ----

export const UserStorySchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(2000),
  persona: z.string().max(200),
  acceptanceCriteria: z.array(z.string().max(500)).max(10),
  priority: z.enum(["must-have", "should-have", "could-have", "wont-have"]),
  estimatedPoints: z.number().int().min(1).max(21).optional(),
});
export type UserStory = z.infer<typeof UserStorySchema>;

// ---- PRD ----

export const PRDSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  summary: z.string().max(5000),
  problemStatement: z.string().max(5000),
  proposedSolution: z.string().max(5000),
  goals: z.array(z.string().max(500)).max(10),
  nonGoals: z.array(z.string().max(500)).max(10),
  userStories: z.array(UserStorySchema).max(20),
  successMetrics: z.array(z.string().max(500)).max(10),
  risks: z
    .array(
      z.object({
        description: z.string().max(500),
        severity: z.enum(["low", "medium", "high", "critical"]),
        mitigation: z.string().max(500),
      })
    )
    .max(10),
  timeline: z.string().max(2000).optional(),
  createdAt: z.string(),
});
export type PRD = z.infer<typeof PRDSchema>;

// ---- Tech Spec ----

export const TechSpecSchema = z.object({
  id: z.string().max(100),
  prdId: z.string().max(100),
  title: z.string().max(500),
  architecture: z.string().max(10000),
  apiDesign: z
    .array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().max(500),
        description: z.string().max(1000),
        requestSchema: z.string().max(2000).optional(),
        responseSchema: z.string().max(2000).optional(),
      })
    )
    .max(30),
  dataModels: z
    .array(
      z.object({
        name: z.string().max(200),
        fields: z.array(z.string().max(500)).max(30),
        description: z.string().max(1000),
      })
    )
    .max(20),
  techStack: z.array(z.string().max(200)).max(20),
  dependencies: z.array(z.string().max(200)).max(30),
  securityConsiderations: z.array(z.string().max(500)).max(10),
  scalabilityNotes: z.string().max(2000).optional(),
  createdAt: z.string(),
});
export type TechSpec = z.infer<typeof TechSpecSchema>;

// ---- Implementation Plan ----

export const ImplementationTaskSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(2000),
  type: z.enum(["feature", "bug", "chore", "spike", "test"]),
  storyId: z.string().max(100).optional(),
  estimatedHours: z.number().min(0.5).max(80),
  dependencies: z.array(z.string().max(100)).max(10),
  assignee: z.string().max(200).optional(),
  labels: z.array(z.string().max(100)).max(10),
  milestone: z.string().max(200).optional(),
  scaffoldFiles: z.array(z.string().max(500)).max(20).optional(),
});
export type ImplementationTask = z.infer<typeof ImplementationTaskSchema>;

export const ImplementationPlanSchema = z.object({
  id: z.string().max(100),
  techSpecId: z.string().max(100),
  title: z.string().max(500),
  tasks: z.array(ImplementationTaskSchema).max(50),
  totalEstimatedHours: z.number().min(0),
  phases: z
    .array(
      z.object({
        name: z.string().max(200),
        taskIds: z.array(z.string().max(100)).max(20),
        description: z.string().max(1000),
      })
    )
    .max(10),
  dependencyGraph: z
    .array(
      z.object({
        from: z.string().max(100),
        to: z.string().max(100),
      })
    )
    .max(100),
  createdAt: z.string(),
});
export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;

// ---- Issue Tracking Integration ----

export const IssueProviderSchema = z.enum(["github", "jira", "linear", "notion"]);
export type IssueProvider = z.infer<typeof IssueProviderSchema>;

export const CreatedIssueSchema = z.object({
  id: z.string().max(200),
  taskId: z.string().max(100),
  provider: IssueProviderSchema,
  externalId: z.string().max(200),
  externalUrl: z.string().max(2000),
  title: z.string().max(500),
  labels: z.array(z.string().max(100)).max(10),
  milestone: z.string().max(200).optional(),
  assignee: z.string().max(200).optional(),
  createdAt: z.string(),
});
export type CreatedIssue = z.infer<typeof CreatedIssueSchema>;

// ---- Bridge Pipeline State ----

export const BridgePipelineSchema = z.object({
  id: z.string().max(100),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  sourceSessionId: z.string().max(200).optional(),
  stage: BridgeStageSchema,
  prd: PRDSchema.optional(),
  techSpec: TechSpecSchema.optional(),
  implementationPlan: ImplementationPlanSchema.optional(),
  createdIssues: z.array(CreatedIssueSchema).max(50),
  createdBranches: z.array(z.string().max(500)).max(20),
  issueProvider: IssueProviderSchema.optional(),
  error: z.string().max(2000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BridgePipeline = z.infer<typeof BridgePipelineSchema>;

// ---- Config ----

export interface BridgeConfig {
  issueProvider?: IssueProvider;
  issueProviderConfig?: Record<string, unknown>;
  repoOwner?: string;
  repoName?: string;
  defaultLabels?: string[];
  defaultMilestone?: string;
  model?: string;
  signal?: AbortSignal;
}
