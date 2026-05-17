/**
 * @module rag
 *
 * RAG-powered knowledge grounding — document loading, chunking,
 * embedding generation, and similarity search for context-aware prompts.
 */
export { KnowledgeBase } from "./knowledge-base.js";
export { buildRAGContext, injectContextIntoPrompt } from "./context-injection.js";
export {
  KnowledgeBaseManager,
  getKnowledgeBaseManager,
  resetKnowledgeBaseManager,
} from "./kb-manager.js";
export { loadDocument } from "./loaders.js";
export { chunkText } from "./chunking.js";
export { generateEmbedding, cosineSimilarity } from "./embeddings.js";
export {
  DocumentTypeSchema,
  DocumentChunkSchema,
  KnowledgeDocumentSchema,
  KnowledgeBaseConfigSchema,
  DEFAULT_CHUNKING_OPTIONS,
} from "./types.js";
export type {
  DocumentType,
  DocumentChunk,
  KnowledgeDocument,
  KnowledgeBaseConfig,
  SearchResult,
  ChunkingOptions,
  EmbeddingProvider,
} from "./types.js";

// Connectors
export {
  GitHubConnector,
  ConfluenceConnector,
  NotionConnector,
  LocalFileConnector,
  registerConnector,
  listConnectors,
  syncConnector,
  removeConnector,
  buildContextInjection,
  clearConnectors,
  ConnectorTypeSchema,
  ConnectorConfigSchema,
  ConnectorStatusSchema,
} from "./connectors.js";
export type {
  ConnectorType,
  ConnectorConfig,
  ConnectorStatus,
  KnowledgeConnector,
} from "./connectors.js";
