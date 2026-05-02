import type {
  KnowledgeDocument,
  KnowledgeBaseConfig,
  DocumentChunk,
  SearchResult,
  ChunkingOptions,
  DocumentType,
} from "./types.js";
import { DEFAULT_CHUNKING_OPTIONS } from "./types.js";
import { loadDocument } from "./loaders.js";
import { chunkText } from "./chunking.js";
import { generateEmbedding, cosineSimilarity } from "./embeddings.js";

/**
 * In-memory knowledge base with document management and similarity search.
 */
export class KnowledgeBase {
  readonly config: KnowledgeBaseConfig;
  private documents: Map<string, KnowledgeDocument> = new Map();
  private chunks: Map<string, DocumentChunk[]> = new Map();
  private chunkingOptions: ChunkingOptions;

  constructor(id: string, name: string, description?: string, chunkingOptions?: ChunkingOptions) {
    const now = new Date().toISOString();
    this.config = {
      id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    };
    this.chunkingOptions = chunkingOptions ?? DEFAULT_CHUNKING_OPTIONS;
  }

  /** Add a document to the knowledge base. */
  addDocument(
    id: string,
    title: string,
    source: string,
    type: DocumentType,
    rawContent: string,
    metadata?: Record<string, unknown>
  ): KnowledgeDocument {
    const content = loadDocument(rawContent, type);
    const now = new Date().toISOString();

    const doc: KnowledgeDocument = {
      id,
      title,
      source,
      type,
      content,
      createdAt: now,
      updatedAt: now,
      metadata,
    };

    this.documents.set(id, doc);

    const docChunks = chunkText(content, id, this.chunkingOptions);
    for (const chunk of docChunks) {
      chunk.embedding = generateEmbedding(chunk.content);
    }
    this.chunks.set(id, docChunks);

    return doc;
  }

  /** Remove a document and its chunks. */
  removeDocument(id: string): boolean {
    this.chunks.delete(id);
    return this.documents.delete(id);
  }

  /** Get a document by ID. */
  getDocument(id: string): KnowledgeDocument | undefined {
    return this.documents.get(id);
  }

  /** List all documents. */
  listDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values());
  }

  /** Search for chunks most relevant to the given query. */
  search(query: string, topK: number = 5, minScore: number = 0.1): SearchResult[] {
    const queryEmbedding = generateEmbedding(query);
    const results: SearchResult[] = [];

    for (const [docId, docChunks] of this.chunks) {
      const doc = this.documents.get(docId);
      if (!doc) continue;

      for (const chunk of docChunks) {
        if (!chunk.embedding) continue;
        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (score >= minScore) {
          results.push({ chunk, document: doc, score });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** Get context documents formatted for prompt injection. */
  getContextForQuery(query: string, topK: number = 3): string {
    const results = this.search(query, topK);
    if (results.length === 0) return "";

    const sections = results.map(
      (r, i) => `[Source ${i + 1}: ${r.document.title}]\n${r.chunk.content}`
    );

    return `KNOWLEDGE BASE CONTEXT:\n${sections.join("\n\n")}`;
  }

  /** Get total number of documents. */
  get documentCount(): number {
    return this.documents.size;
  }

  /** Get total number of chunks across all documents. */
  get chunkCount(): number {
    let total = 0;
    for (const chunks of this.chunks.values()) {
      total += chunks.length;
    }
    return total;
  }
}
