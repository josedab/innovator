/**
 * @module realtime/shared-state
 *
 * CRDT-inspired shared state management using Last-Writer-Wins (LWW) register semantics.
 * Manages shared documents with conflict detection, resolution, and operation history
 * for synchronization across participants.
 */

import { randomUUID } from "node:crypto";

// ---- Types ----

/** A key-value entry with LWW timestamp for conflict resolution. */
export interface LWWEntry {
  value: unknown;
  timestamp: number;
  userId: string;
}

/** A shared document with map-like content and version tracking. */
export interface SharedDocument {
  id: string;
  roomId: string;
  /** LWW register map: path → { value, timestamp, userId } */
  content: Map<string, LWWEntry>;
  version: number;
  lastModified: string;
}

/** A CRDT operation on a shared document. */
export interface CRDTOperation {
  id: string;
  type: "insert" | "delete" | "update";
  path: string;
  value: unknown;
  timestamp: number;
  userId: string;
  /** Logical clock per-user for causal ordering. */
  vectorClock: Record<string, number>;
}

/** A detected conflict between concurrent edits. */
export interface Conflict {
  path: string;
  localEntry: LWWEntry;
  remoteEntry: LWWEntry;
}

/** Strategy for resolving conflicts. */
export type ConflictResolutionStrategy = "lww" | "manual";

// ---- Shared State Manager ----

export class SharedStateManager {
  private documents = new Map<string, SharedDocument>();
  private operationLog = new Map<string, CRDTOperation[]>();
  private pendingConflicts = new Map<string, Conflict[]>();

  /** Create a new shared document for a room. */
  createDocument(roomId: string): SharedDocument {
    const doc: SharedDocument = {
      id: randomUUID(),
      roomId,
      content: new Map(),
      version: 0,
      lastModified: new Date().toISOString(),
    };
    this.documents.set(doc.id, doc);
    this.operationLog.set(doc.id, []);
    this.pendingConflicts.set(doc.id, []);
    return doc;
  }

  /**
   * Apply a CRDT operation to a document using LWW semantics.
   * Returns the merged document state.
   */
  applyOperation(docId: string, operation: CRDTOperation): SharedDocument | undefined {
    const doc = this.documents.get(docId);
    if (!doc) return undefined;

    const ops = this.operationLog.get(docId)!;
    const conflicts = this.pendingConflicts.get(docId)!;

    // Record operation
    ops.push(operation);

    switch (operation.type) {
      case "insert":
      case "update": {
        const existing = doc.content.get(operation.path);

        // Detect concurrent edit (different user, close timestamps)
        if (
          existing &&
          existing.userId !== operation.userId &&
          Math.abs(existing.timestamp - operation.timestamp) < 1000
        ) {
          conflicts.push({
            path: operation.path,
            localEntry: existing,
            remoteEntry: {
              value: operation.value,
              timestamp: operation.timestamp,
              userId: operation.userId,
            },
          });
        }

        // LWW: highest timestamp wins; tie-break by userId lexicographic order
        if (
          !existing ||
          operation.timestamp > existing.timestamp ||
          (operation.timestamp === existing.timestamp && operation.userId > existing.userId)
        ) {
          doc.content.set(operation.path, {
            value: operation.value,
            timestamp: operation.timestamp,
            userId: operation.userId,
          });
        }
        break;
      }
      case "delete": {
        doc.content.delete(operation.path);
        break;
      }
    }

    doc.version++;
    doc.lastModified = new Date().toISOString();
    return doc;
  }

  /** Get a document by ID. */
  getDocument(docId: string): SharedDocument | undefined {
    return this.documents.get(docId);
  }

  /** Get all operations since a given version for sync. */
  getOperationsSince(docId: string, version: number): CRDTOperation[] {
    const ops = this.operationLog.get(docId);
    if (!ops) return [];
    return ops.slice(version);
  }

  /** Detect pending conflicts for a document. */
  detectConflicts(docId: string): Conflict[] {
    return this.pendingConflicts.get(docId) ?? [];
  }

  /**
   * Resolve pending conflicts.
   * - `lww`: Already resolved by apply logic; clears pending list.
   * - `manual`: Returns conflicts for external resolution, then clears.
   */
  resolveConflicts(docId: string, strategy: ConflictResolutionStrategy): Conflict[] {
    const conflicts = this.pendingConflicts.get(docId) ?? [];
    if (conflicts.length === 0) return [];

    if (strategy === "lww") {
      // LWW already applied during applyOperation — just clear pending
      this.pendingConflicts.set(docId, []);
      return [];
    }

    // Manual: return conflicts for the caller to resolve, then clear
    const result = [...conflicts];
    this.pendingConflicts.set(docId, []);
    return result;
  }

  /** Delete a document (for testing/cleanup). */
  deleteDocument(docId: string): boolean {
    this.operationLog.delete(docId);
    this.pendingConflicts.delete(docId);
    return this.documents.delete(docId);
  }

  /** Clear all documents (for testing). */
  clear(): void {
    this.documents.clear();
    this.operationLog.clear();
    this.pendingConflicts.clear();
  }
}
