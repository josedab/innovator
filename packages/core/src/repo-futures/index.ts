export {
  CapabilityNodeSchema,
  CapabilityGraphSchema,
  CodeDeltaSchema,
  InnovationOpportunitySchema,
} from "./types.js";
export type { CapabilityNode, CapabilityGraph, CodeDelta, InnovationOpportunity } from "./types.js";

export {
  buildCapabilityGraph,
  detectDelta,
  generateOpportunities,
  suppressNoise,
  rankOpportunities,
} from "./repo-futures.js";
