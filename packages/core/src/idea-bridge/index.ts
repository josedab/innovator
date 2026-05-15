/**
 * @module idea-bridge
 *
 * End-to-end pipeline: Idea → PRD → Tech Spec → Implementation Plan
 * → GitHub Issues → Feature Branches. Integrates with Jira/Linear/Notion.
 */
export {
  generatePRD,
  generateTechSpec,
  generateImplementationPlan,
  runBridgePipeline,
  bridgePipelineToMarkdown,
} from "./idea-bridge.js";
export type { BridgeProgress } from "./idea-bridge.js";

export {
  BridgeStageSchema,
  UserStorySchema,
  PRDSchema,
  TechSpecSchema,
  ImplementationTaskSchema,
  ImplementationPlanSchema,
  IssueProviderSchema,
  CreatedIssueSchema,
  BridgePipelineSchema,
} from "./types.js";
export type {
  BridgeStage,
  UserStory,
  PRD,
  TechSpec,
  ImplementationTask,
  ImplementationPlan,
  IssueProvider,
  CreatedIssue,
  BridgePipeline,
  BridgeConfig,
} from "./types.js";
