/**
 * @module simulation
 *
 * Simulation module combining Stakeholder Reaction Simulation and
 * Micro-Simulation & Scenario Modeling.
 */

// Stakeholder Simulation
export {
  simulatePersonaReaction,
  simulateStakeholders,
  simulateStakeholdersBatch,
  buildConflictMatrix,
  computeReadinessScores,
  DEFAULT_PERSONAS,
  StakeholderPersonaSchema,
  StakeholderReactionSchema,
  StakeholderSimulationSchema,
  StakeholderConflictSchema,
  ConflictMatrixSchema,
} from "./stakeholder.js";
export type {
  StakeholderPersona,
  StakeholderReaction,
  StakeholderSimulation,
  StakeholderConflict,
  ConflictMatrix,
} from "./stakeholder.js";

// Scenario Modeling
export {
  modelScenarios,
  modelScenariosBatch,
  scenarioToMarkdown,
  compareScenarioModels,
  ScenarioTypeSchema,
  AdoptionDataPointSchema,
  ScenarioProjectionSchema,
  SensitivityFactorSchema,
  ScenarioModelSchema,
} from "./scenario.js";
export type {
  ScenarioType,
  AdoptionDataPoint,
  ScenarioProjection,
  SensitivityFactor,
  ScenarioModel,
} from "./scenario.js";

// Monte Carlo Simulation
export {
  bassDiffusion,
  runMonteCarloSimulation,
  runSensitivityAnalysis,
  compareMonteCarloScenarios,
  generateProbabilityFan,
  generateTornadoData,
  monteCarloToMarkdown,
  MonteCarloParamsSchema,
  MonteCarloResultSchema,
  TornadoEntrySchema,
  ScenarioComparisonSchema,
} from "./monte-carlo.js";
export type {
  BassDiffusionPoint,
  MonteCarloParams,
  PercentileSet,
  MonteCarloResult,
  TornadoEntry,
  ScenarioComparison,
  SensitivityRanking,
  FanChartPoint,
  TornadoChartData,
} from "./monte-carlo.js";

// Portfolio Simulation
export {
  sampleDistribution,
  runPortfolioSimulation,
  portfolioSimToMarkdown,
  DistributionTypeSchema,
  DistributionSchema,
  PortfolioIdeaSchema,
  PortfolioSimConfigSchema,
  IdeaAllocationSchema,
  FrontierPointSchema,
  PortfolioSimResultSchema,
} from "./portfolio-simulation.js";
export type {
  DistributionType,
  Distribution,
  PortfolioIdea,
  PortfolioSimConfig,
  IdeaAllocation,
  FrontierPoint,
  PortfolioSimResult,
} from "./portfolio-simulation.js";
