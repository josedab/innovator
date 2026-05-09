/**
 * @module health-score
 *
 * Innovation Health Score for codebases.
 * Computes a composite 0-100 score across 6 axes:
 * Architectural Flexibility, Dependency Freshness, Test Coverage,
 * Documentation Completeness, Community Activity, Innovation Velocity.
 */

export { computeHealthScore } from "./scorer.js";
export { HEALTH_AXES, HealthScoreInputSchema } from "./types.js";
export type { HealthAxis, AxisScore, HealthScore, HealthScoreInput } from "./types.js";
