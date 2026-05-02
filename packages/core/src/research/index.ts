/**
 * @module research
 *
 * AI agent deep research mode — multi-step LLM-driven research
 * that produces a grounded research brief before investigation.
 */
export { ResearchAgent, deepInvestigate } from "./agent.js";
export {
  ResearchDepthSchema,
  ResearchFindingSchema,
  ResearchStepSchema,
  ResearchBriefSchema,
  DEPTH_STEP_LIMITS,
} from "./types.js";
export type {
  ResearchDepth,
  ResearchFinding,
  ResearchStep,
  ResearchBrief,
  ResearchProgress,
  ResearchConfig,
} from "./types.js";
