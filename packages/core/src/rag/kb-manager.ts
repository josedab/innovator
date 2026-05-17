import { randomUUID } from "node:crypto";

import { cosineSimilarity } from "./embeddings.js";
import { KnowledgeBase } from "./knowledge-base.js";
import type { DocumentChunk, KnowledgeBaseConfig, KnowledgeDocument } from "./types.js";
import { ValidationError } from "../errors.js";

type InternalKnowledgeBaseState = {
  documents: Map<string, KnowledgeDocument>;
  chunks: Map<string, DocumentChunk[]>;
};

function getInternalKnowledgeBaseState(base: KnowledgeBase): InternalKnowledgeBaseState {
  return base as unknown as InternalKnowledgeBaseState;
}

export class KnowledgeBaseManager {
  private bases: Map<string, KnowledgeBase> = new Map();

  createBase(name: string, description?: string): KnowledgeBase {
    const base = new KnowledgeBase(randomUUID(), name, description);
    this.bases.set(base.config.id, base);
    return base;
  }

  getBase(id: string): KnowledgeBase | undefined {
    return this.bases.get(id);
  }

  listBases(): KnowledgeBaseConfig[] {
    return Array.from(this.bases.values())
      .map((base) => base.config)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  deleteBase(id: string): boolean {
    return this.bases.delete(id);
  }

  deduplicateChunks(baseId: string, threshold: number = 1): number {
    const base = this.requireBase(baseId);
    const internal = getInternalKnowledgeBaseState(base);
    const retained: DocumentChunk[] = [];
    let removed = 0;

    for (const [documentId, chunks] of internal.chunks.entries()) {
      const uniqueChunks: DocumentChunk[] = [];
      for (const chunk of chunks) {
        const duplicate = retained.some((existing) => {
          if (existing.content === chunk.content) return true;
          if (threshold >= 1 || !existing.embedding || !chunk.embedding) return false;
          return cosineSimilarity(existing.embedding, chunk.embedding) >= threshold;
        });

        if (duplicate) {
          removed++;
          continue;
        }

        uniqueChunks.push(chunk);
        retained.push(chunk);
      }
      internal.chunks.set(documentId, uniqueChunks);
    }

    if (removed > 0) {
      base.config.updatedAt = new Date().toISOString();
    }

    return removed;
  }

  pruneExpiredDocuments(baseId: string, ttlMs: number): number {
    const base = this.requireBase(baseId);
    const now = Date.now();
    let removed = 0;

    for (const document of base.listDocuments()) {
      const expiresAt = document.metadata?.expiresAt;
      const expiresAtMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
      const updatedAtMs = Date.parse(document.updatedAt || document.createdAt);
      const isExpiredByMetadata = Number.isFinite(expiresAtMs) && expiresAtMs <= now;
      const isExpiredByTtl =
        Number.isFinite(updatedAtMs) && ttlMs >= 0 && now - updatedAtMs > ttlMs;

      if (isExpiredByMetadata || isExpiredByTtl) {
        base.removeDocument(document.id);
        removed++;
      }
    }

    if (removed > 0) {
      base.config.updatedAt = new Date().toISOString();
    }

    return removed;
  }

  getStats(baseId: string): { documents: number; chunks: number; avgChunkSize: number } {
    const base = this.requireBase(baseId);
    const internal = getInternalKnowledgeBaseState(base);
    const chunkList = Array.from(internal.chunks.values()).flat();
    const totalChunkLength = chunkList.reduce((sum, chunk) => sum + chunk.content.length, 0);

    return {
      documents: base.documentCount,
      chunks: base.chunkCount,
      avgChunkSize: chunkList.length > 0 ? Math.round(totalChunkLength / chunkList.length) : 0,
    };
  }

  clearAll(): void {
    this.bases.clear();
  }

  private requireBase(id: string): KnowledgeBase {
    const base = this.bases.get(id);
    if (!base) {
      throw new ValidationError(`Knowledge base not found: ${id}`);
    }
    return base;
  }
}

let knowledgeBaseManager = new KnowledgeBaseManager();

export function getKnowledgeBaseManager(): KnowledgeBaseManager {
  return knowledgeBaseManager;
}

export function resetKnowledgeBaseManager(): void {
  knowledgeBaseManager = new KnowledgeBaseManager();
}
