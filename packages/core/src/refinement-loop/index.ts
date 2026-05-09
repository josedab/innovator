/**
 * @module refinement-loop
 *
 * Progressive idea refinement: Concept → Plan → Specification.
 * Multi-round iterative deepening with convergence detection.
 */

export {
  startRefinementSession,
  refineIdea,
  getRefinementSession,
  listRefinementSessions,
  deleteRefinementSession,
  getIdeaHistory,
} from "./engine.js";
export { StartRefinementSchema, RefineIdeaSchema } from "./types.js";
export type {
  RefinementTier,
  RefinementStatus,
  RefinableIdea,
  RefinementIteration,
  RefinementOutput,
  RefinementSession,
} from "./types.js";
