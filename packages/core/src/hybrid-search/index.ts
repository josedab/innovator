/**
 * @module hybrid-search
 *
 * Hybrid search engine combining BM25 keyword search with semantic similarity.
 * Provides faceted filtering, relevance ranking, and typeahead suggestions.
 */

export {
  indexSearchDocument,
  removeSearchDocument,
  hybridSearch,
  getSearchSuggestions,
  getSearchIndexStats,
  clearSearchIndex,
} from "./engine.js";
export { IdeaSearchSchema, IndexDocumentSchema } from "./types.js";
export type {
  SearchableDocument,
  SearchFacets,
  IdeaSearchResult,
  SearchResponse,
} from "./types.js";
