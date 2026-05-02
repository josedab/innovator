import { z } from "zod";

/** Supported document types for RAG ingestion. */
export const DocumentTypeSchema = z.enum(["markdown", "pdf", "html", "text"]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/** Schema for a single document chunk with embedding. */
export const DocumentChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
  embedding: z.array(z.number()).optional(),
  chunkIndex: z.number(),
});

export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

/** Schema for a source document in the knowledge base. */
export const KnowledgeDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  type: DocumentTypeSchema,
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

/** Schema for a knowledge base containing documents and chunks. */
export const KnowledgeBaseConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type KnowledgeBaseConfig = z.infer<typeof KnowledgeBaseConfigSchema>;

/** A search result from the knowledge base with relevance score. */
export interface SearchResult {
  chunk: DocumentChunk;
  document: KnowledgeDocument;
  score: number;
}

/** Chunking strategy configuration. */
export interface ChunkingOptions {
  /** Maximum characters per chunk. */
  maxChunkSize: number;
  /** Overlap between consecutive chunks in characters. */
  overlap: number;
  /** Strategy for splitting content. */
  strategy: "paragraph" | "sentence" | "fixed";
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  maxChunkSize: 1000,
  overlap: 100,
  strategy: "paragraph",
};
