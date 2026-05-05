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
