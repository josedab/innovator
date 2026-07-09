/**
 * @module novelty-oracle
 *
 * Prior Art & Novelty Oracle — assesses the novelty of innovation ideas
 * against patent databases, academic literature, and known innovation patterns.
 * Returns novelty scores, similar prior art references, and patent-filing recommendations.
 */

export {
  PriorArtSourceSchema,
  PriorArtEntrySchema,
  NoveltyAssessmentSchema,
  NoveltyReportSchema,
} from "./types.js";
export type {
  PriorArtSource,
  PriorArtEntry,
  NoveltyAssessment,
  NoveltyReport,
  PriorArtProvider,
} from "./types.js";

export {
  registerPriorArtProvider,
  addPriorArt,
  clearPriorArt,
  getPriorArtCount,
  assessNovelty,
  generateNoveltyReport,
  noveltyReportToMarkdown,
} from "./novelty-oracle.js";

/** External prior art search providers (USPTO, Semantic Scholar). */
export {
  USPTOProvider,
  SemanticScholarProvider,
  CompositeProvider,
  createDefaultProviders,
} from "./providers.js";

/** Pipeline enrichment — add novelty scores to synthesis results. */
export {
  enrichSynthesisWithNovelty,
  enrichAngleResultsWithNovelty,
} from "./pipeline-enrichment.js";
export type { NoveltyEnrichedIdea, NoveltyEnrichedSynthesis } from "./pipeline-enrichment.js";
