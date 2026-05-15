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
  resumeAgentRun,
  AgentBudgetSchema,
} from "./manager.js";
export type { AgentBudget, ManagedAgentRun, AgentCheckpoint } from "./manager.js";

/** Multi-day innovation loops with research→ideate→test→pivot cycles and human gates. */
export {
  startInnovationLoop,
  approveGate,
  cancelInnovationLoop,
  getInnovationLoop,
  listInnovationLoops,
  removeInnovationLoop,
  clearInnovationLoops,
  innovationLoopToMarkdown,
  LoopPhaseSchema,
  LoopStatusSchema,
  HumanGateSchema,
  InnovationLoopConfigSchema,
  TestResultSchema,
  LoopIterationSchema,
  InnovationLoopSchema,
} from "./innovation-loop.js";
export type {
  LoopPhase,
  LoopStatus,
  HumanGate,
  InnovationLoopConfig,
  TestResult,
  LoopIteration,
  InnovationLoop,
  LoopProgress,
} from "./innovation-loop.js";
