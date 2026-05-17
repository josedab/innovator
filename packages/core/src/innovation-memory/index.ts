/**
 * @module innovation-memory
 *
 * Cross-session memory graph that tracks angle effectiveness, detects
 * recurring patterns, surfaces serendipitous connections, and delivers
 * context-aware recommendations and mid-session nudges.
 */
export {
  loadMemoryGraph,
  ingestConcepts,
  trackEvent,
  loadEvents,
  computeDomainProfile,
  generatePreSessionRecommendations,
  generateMidSessionNudges,
  findRelatedConcepts,
  getMemoryStats,
} from "./innovation-memory.js";

export {
  MemoryNodeTypeSchema,
  MemoryNodeSchema,
  MemoryEdgeTypeSchema,
  MemoryEdgeSchema,
  MemoryGraphSchema,
  RecommendationTypeSchema,
  MemoryRecommendationSchema,
  InnovationEventTypeSchema,
  InnovationEventSchema,
  DomainProfileSchema,
} from "./types.js";

export type {
  MemoryNodeType,
  MemoryNode,
  MemoryEdgeType,
  MemoryEdge,
  MemoryGraph,
  RecommendationType,
  MemoryRecommendation,
  InnovationEventType,
  InnovationEvent,
  DomainProfile,
} from "./types.js";

export {
  findSerendipitousConnections,
  generateWeeklyDigest,
  buildInnovationProfile,
  digestToMarkdown,
  profileToMarkdown,
  SerendipitousConnectionSchema,
  WeeklyDigestSchema,
  InnovationProfileSchema,
} from "./serendipity.js";
export type {
  SerendipitousConnection,
  WeeklyDigest,
  InnovationProfile,
} from "./serendipity.js";

export {
  computeAngleWeights,
  selectTopAngles,
  autoWeightAngles,
  AngleWeightSchema,
  WeightingContextSchema,
} from "./angle-weighting.js";
export type { AngleWeight, WeightingContext } from "./angle-weighting.js";
