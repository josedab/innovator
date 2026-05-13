/**
 * @module autonomous-agent
 *
 * Long-running agentic innovation loop that self-directs exploration,
 * branches investigations, and delivers curated innovation portfolios.
 */
export { runAutonomousAgent, autonomousRunToMarkdown } from "./agent.js";
export {
  ExplorationStrategySchema,
  AgentStatusSchema,
  InvestigationBranchSchema,
  AgentDecisionSchema,
  InnovationPortfolioSchema,
  AutonomousRunSchema,
} from "./types.js";
export type {
  ExplorationStrategy,
  AgentStatus,
  InvestigationBranch,
  AgentDecision,
  InnovationPortfolio,
  AutonomousRun,
  AutonomousProgress,
  AutonomousAgentConfig,
} from "./types.js";

/** Agent lifecycle manager — persistence, budget tracking, mid-run injection. */
export {
  startAgentRun,
  stopAgentRun,
  getAgentRun,
  listAgentRuns,
  injectTopics,
  getLatestCheckpoint,
  exportRunPortfolio,
  removeAgentRun,
  clearAgentRuns,
  AgentBudgetSchema,
} from "./manager.js";
export type { AgentBudget, ManagedAgentRun, AgentCheckpoint } from "./manager.js";
