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
  DEFAULT_PERSONAS,
  StakeholderPersonaSchema,
  StakeholderReactionSchema,
  StakeholderSimulationSchema,
} from "./stakeholder.js";
export type {
  StakeholderPersona,
  StakeholderReaction,
  StakeholderSimulation,
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
