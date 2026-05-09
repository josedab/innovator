/**
 * @module citations
 *
 * LLM output grounding and citation engine.
 * Attaches sources to sessions, extracts inline citations,
 * and provides verification status for each claim.
 */

export {
  getCitationContext,
  addSource,
  removeSource,
  extractCitations,
  verifyCitation,
  groundIdeas,
  resetCitationContext,
  listCitationSessions,
} from "./engine.js";
export { AddSourceSchema, VerifyCitationSchema } from "./types.js";
export type {
  CitationSource,
  Citation,
  CitationContext,
  CitationStatus,
  SourceType,
  GroundedIdea,
} from "./types.js";
