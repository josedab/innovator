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

/** Convergence detection and cost estimation for autonomous innovation cycles. */
export {
  checkConvergence,
  convergenceToMarkdown,
  calculateNoveltyRatio,
  estimateTopicExhaustion,
  analyzeScoreTrend,
  estimateCallCost,
  buildCostEstimate,
  ConvergenceMetricsSchema,
  ConvergenceConfigSchema,
  CostEstimateSchema,
} from "./convergence.js";
export type { ConvergenceMetrics, ConvergenceConfig, CostEstimate } from "./convergence.js";

/** Investigation planning — rule-based decomposition of objectives into executable steps. */
export {
  decomposeObjective,
  selectAnglesForStep,
  createInvestigationPlan,
  getNextStep,
  completeStep,
  planToMarkdown,
  InvestigationStepSchema,
  InvestigationPlanSchema,
} from "./planning.js";
export type { InvestigationStep, InvestigationPlan } from "./planning.js";

/** Strategy report generation — synthesize autonomous runs into recommendations. */
export {
  generateStrategyDocument,
  assessConfidence,
  strategyDocToMarkdown,
  strategyDocToExecutiveBrief,
  ConfidenceAssessmentSchema,
  StrategyDocumentSchema,
} from "./strategy-report.js";
export type { ConfidenceAssessment, StrategyDocument } from "./strategy-report.js";

/** Agentic orchestration — objective management, execution plans, branching, and strategy outputs. */
export {
  createObjective,
  decomposeObjective as decomposeOrchestrationObjective,
  executeStep as executeOrchestrationStep,
  advancePlan,
  branchExploration,
  getPlan as getOrchestrationPlan,
  generateStrategyOutput,
  getStrategyOutput,
  getBudgetStatus,
  clearOrchestratorData,
  ObjectiveSchema,
  ExecutionStepSchema,
  OrchestrationPlanSchema,
  StrategyOutputSchema,
} from "./orchestrator.js";
export type {
  Objective,
  ExecutionStep,
  OrchestrationPlan,
  StrategyOutput,
} from "./orchestrator.js";
