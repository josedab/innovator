export {
  ingestSignal,
  ingestFromAdapter,
  getMeshState,
  resetMesh,
  detectPatternsLocal,
  detectPatternsLLM,
  analyzeAndSuggest,
  dismissSuggestion,
  getActiveSuggestions,
  contextMeshToMarkdown,
} from "./mesh.js";
export {
  ContextSourceTypeSchema,
  ContextSignalSchema,
  DetectedPatternSchema,
  ProactiveSuggestionSchema,
  ContextMeshStateSchema,
} from "./types.js";
export type {
  ContextSourceType,
  ContextSignal,
  DetectedPattern,
  ProactiveSuggestion,
  ContextMeshState,
  ContextAdapter,
  ContextMeshConfig,
  ContextMeshProgress,
} from "./types.js";
