/**
 * @module combinatorial
 *
 * Morphological analysis engine that combines ideas across innovation angles
 * to discover emergent innovations at intersections.
 */
export {
  runCombinatorialSynthesis,
  combinatorialToMarkdown,
  generateAnglePairs,
  buildMorphologicalMatrix,
  CombinatorialIdeaSchema,
  PairwiseResultSchema,
  CombinatorialResultSchema,
} from "./engine.js";
export type {
  CombinatorialConfig,
  CombinatorialProgress,
  CombinatorialResult,
  CombinatorialIdea,
  PairwiseResult,
  AnglePair,
  MorphologicalCell,
} from "./types.js";
