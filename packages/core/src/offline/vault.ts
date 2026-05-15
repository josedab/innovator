/**
 * @module offline/vault
 *
 * Offline-First Innovation Vault — sync queue for deferred updates,
 * CRDT-based conflict-free merge for knowledge graph and session data,
 * local encryption at rest (AES-256-GCM), and secure export/import
 * for air-gapped transfer.
 */

import { z } from "zod";
import { createHash, randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";

// ---- Schemas ----

export const SyncOperationSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["create", "update", "delete"]),
  collection: z.string().max(100),
  documentId: z.string().max(200),
  data: z.record(z.unknown()).optional(),
  timestamp: z.string(),
  retryCount: z.number().int().min(0).default(0),
  status: z.enum(["queued", "syncing", "synced", "failed", "conflict"]),
  error: z.string().max(1000).optional(),
});

export const CRDTTimestampSchema = z.object({
  nodeId: z.string().max(100),
  counter: z.number().int().min(0),
  wallClock: z.string(),
});

export const CRDTEntrySchema = z.object({
  key: z.string().max(500),
  value: z.unknown(),
  timestamp: CRDTTimestampSchema,
  tombstone: z.boolean().default(false),
});

export const CRDTDocumentSchema = z.object({
  id: z.string().max(200),
  collection: z.string().max(100),
  entries: z.array(CRDTEntrySchema),
  version: z.number().int().min(0),
  lastModified: z.string(),
  nodeId: z.string().max(100),
});

export const ConflictResolutionSchema = z.object({
  documentId: z.string().max(200),
  field: z.string().max(500),
  localValue: z.unknown(),
  remoteValue: z.unknown(),
  resolvedValue: z.unknown(),
  resolution: z.enum(["local_wins", "remote_wins", "merged", "manual"]),
  resolvedAt: z.string(),
});

export const VaultExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  nodeId: z.string().max(100),
  documents: z.array(CRDTDocumentSchema),
  syncQueue: z.array(SyncOperationSchema),
  checksum: z.string().max(64),
  encrypted: z.boolean(),
});

export const EncryptionConfigSchema = z.object({
  algorithm: z.literal("aes-256-gcm"),
  keyDerivation: z.literal("scrypt"),
  saltLength: z.number().int().default(32),
  ivLength: z.number().int().default(16),
  tagLength: z.number().int().default(16),
});

export type SyncOperation = z.infer<typeof SyncOperationSchema>;
export type CRDTTimestamp = z.infer<typeof CRDTTimestampSchema>;
export type CRDTEntry = z.infer<typeof CRDTEntrySchema>;
export type CRDTDocument = z.infer<typeof CRDTDocumentSchema>;
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
export type VaultExport = z.infer<typeof VaultExportSchema>;
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;

// ---- Sync Queue ----

const syncQueue: SyncOperation[] = [];
let nodeId = `node-${randomBytes(4).toString("hex")}`;

/** Set the local node ID. */
export function setNodeId(id: string): void {
  nodeId = id;
}

/** Get the local node ID. */
export function getNodeId(): string {
  return nodeId;
}

function generateOpId(): string {
  return `op-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

/**
 * Queue an operation for later sync when connectivity returns.
 */
export function queueSyncOperation(
  type: SyncOperation["type"],
  collection: string,
  documentId: string,
  data?: Record<string, unknown>
): SyncOperation {
  const op: SyncOperation = {
    id: generateOpId(),
    type,
    collection,
    documentId,
    data,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: "queued",
  };

  syncQueue.push(op);
  return op;
}

/** Get all queued (unsent) operations. */
export function getQueuedOperations(): SyncOperation[] {
  return syncQueue.filter((op) => op.status === "queued");
}

/** Get the full sync queue. */
export function getSyncQueue(): SyncOperation[] {
  return [...syncQueue];
}

/** Mark operations as synced. */
export function markSynced(operationIds: string[]): number {
  let count = 0;
  for (const op of syncQueue) {
    if (operationIds.includes(op.id)) {
      op.status = "synced";
      count++;
    }
  }
  return count;
}

/** Mark an operation as failed. */
export function markFailed(operationId: string, error: string): boolean {
  const op = syncQueue.find((o) => o.id === operationId);
  if (!op) return false;
  op.status = "failed";
  op.error = error;
  op.retryCount++;
  return true;
}

/** Retry failed operations (re-queue them). */
export function retryFailedOperations(maxRetries: number = 3): number {
  let count = 0;
  for (const op of syncQueue) {
    if (op.status === "failed" && op.retryCount < maxRetries) {
      op.status = "queued";
      count++;
    }
  }
  return count;
}

/** Clear synced operations from the queue. */
export function purgeSyncedOperations(): number {
  const before = syncQueue.length;
  const remaining = syncQueue.filter((op) => op.status !== "synced");
  syncQueue.length = 0;
  syncQueue.push(...remaining);
  return before - remaining.length;
}

// ---- CRDT Merge (Last-Writer-Wins Register) ----

const crdtStore = new Map<string, CRDTDocument>();
let logicalClock = 0;

function crdtTimestamp(): CRDTTimestamp {
  logicalClock++;
  return {
    nodeId,
    counter: logicalClock,
    wallClock: new Date().toISOString(),
  };
}

/**
 * Compare two CRDT timestamps. Returns positive if a > b, negative if a < b.
 * Uses logical counter first, then wall clock, then node ID for determinism.
 */
export function compareTimestamps(a: CRDTTimestamp, b: CRDTTimestamp): number {
  if (a.counter !== b.counter) return a.counter - b.counter;
  const clockDiff = a.wallClock.localeCompare(b.wallClock);
  if (clockDiff !== 0) return clockDiff;
  return a.nodeId.localeCompare(b.nodeId);
}

/**
 * Set a value in a CRDT document. Creates the document if it doesn't exist.
 */
export function crdtSet(
  collection: string,
  documentId: string,
  key: string,
  value: unknown
): CRDTDocument {
  const docKey = `${collection}:${documentId}`;
  let doc = crdtStore.get(docKey);

  if (!doc) {
    doc = {
      id: documentId,
      collection,
      entries: [],
      version: 0,
      lastModified: new Date().toISOString(),
      nodeId,
    };
    crdtStore.set(docKey, doc);
  }

  const ts = crdtTimestamp();
  const existingIdx = doc.entries.findIndex((e) => e.key === key && !e.tombstone);

  if (existingIdx >= 0) {
    doc.entries[existingIdx] = { key, value, timestamp: ts, tombstone: false };
  } else {
    doc.entries.push({ key, value, timestamp: ts, tombstone: false });
  }

  doc.version++;
  doc.lastModified = ts.wallClock;

  // Also queue for sync
  queueSyncOperation("update", collection, documentId, { key, value });

  return doc;
}

/**
 * Delete a value from a CRDT document using a tombstone.
 */
export function crdtDelete(collection: string, documentId: string, key: string): boolean {
  const docKey = `${collection}:${documentId}`;
  const doc = crdtStore.get(docKey);
  if (!doc) return false;

  const entry = doc.entries.find((e) => e.key === key && !e.tombstone);
  if (!entry) return false;

  entry.tombstone = true;
  entry.timestamp = crdtTimestamp();
  doc.version++;
  doc.lastModified = new Date().toISOString();

  queueSyncOperation("delete", collection, documentId, { key });
  return true;
}

/**
 * Get a value from a CRDT document.
 */
export function crdtGet(collection: string, documentId: string, key: string): unknown | undefined {
  const docKey = `${collection}:${documentId}`;
  const doc = crdtStore.get(docKey);
  if (!doc) return undefined;

  const entry = doc.entries.find((e) => e.key === key && !e.tombstone);
  return entry?.value;
}

/**
 * Merge a remote CRDT document with the local copy.
 * Uses Last-Writer-Wins semantics based on CRDT timestamps.
 * Returns conflict resolutions for any divergent values.
 */
export function crdtMerge(remoteDoc: CRDTDocument): {
  merged: CRDTDocument;
  conflicts: ConflictResolution[];
} {
  const docKey = `${remoteDoc.collection}:${remoteDoc.id}`;
  let localDoc = crdtStore.get(docKey);
  const conflicts: ConflictResolution[] = [];

  if (!localDoc) {
    // No local copy — accept remote entirely
    crdtStore.set(docKey, { ...remoteDoc });
    return { merged: remoteDoc, conflicts: [] };
  }

  // Merge entries using LWW
  for (const remoteEntry of remoteDoc.entries) {
    const localEntry = localDoc.entries.find((e) => e.key === remoteEntry.key);

    if (!localEntry) {
      // New entry from remote — accept
      localDoc.entries.push({ ...remoteEntry });
      continue;
    }

    const cmp = compareTimestamps(remoteEntry.timestamp, localEntry.timestamp);

    if (cmp > 0) {
      // Remote is newer — accept remote
      if (JSON.stringify(localEntry.value) !== JSON.stringify(remoteEntry.value)) {
        conflicts.push({
          documentId: remoteDoc.id,
          field: remoteEntry.key,
          localValue: localEntry.value,
          remoteValue: remoteEntry.value,
          resolvedValue: remoteEntry.value,
          resolution: "remote_wins",
          resolvedAt: new Date().toISOString(),
        });
      }
      localEntry.value = remoteEntry.value;
      localEntry.timestamp = remoteEntry.timestamp;
      localEntry.tombstone = remoteEntry.tombstone;
    } else if (cmp < 0) {
      // Local is newer — keep local
      if (JSON.stringify(localEntry.value) !== JSON.stringify(remoteEntry.value)) {
        conflicts.push({
          documentId: remoteDoc.id,
          field: remoteEntry.key,
          localValue: localEntry.value,
          remoteValue: remoteEntry.value,
          resolvedValue: localEntry.value,
          resolution: "local_wins",
          resolvedAt: new Date().toISOString(),
        });
      }
    }
    // Equal timestamps — no change needed (same node, same counter)
  }

  localDoc.version = Math.max(localDoc.version, remoteDoc.version) + 1;
  localDoc.lastModified = new Date().toISOString();

  return { merged: localDoc, conflicts };
}

/** Get a CRDT document. */
export function getCRDTDocument(collection: string, documentId: string): CRDTDocument | undefined {
  return crdtStore.get(`${collection}:${documentId}`);
}

/** List all CRDT documents in a collection. */
export function listCRDTDocuments(collection: string): CRDTDocument[] {
  const docs: CRDTDocument[] = [];
  for (const [key, doc] of crdtStore) {
    if (key.startsWith(`${collection}:`)) docs.push(doc);
  }
  return docs;
}

// ---- Local Encryption (AES-256-GCM) ----

const ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: "aes-256-gcm",
  keyDerivation: "scrypt",
  saltLength: 32,
  ivLength: 16,
  tagLength: 16,
};

/**
 * Derive an encryption key from a passphrase using scrypt.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32) as Buffer;
}

/**
 * Encrypt data using AES-256-GCM.
 */
export function encryptData(
  data: string,
  passphrase: string
): { encrypted: string; salt: string; iv: string; tag: string } {
  const salt = randomBytes(ENCRYPTION_CONFIG.saltLength);
  const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);
  const key = deriveKey(passphrase, salt);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypt AES-256-GCM encrypted data.
 */
export function decryptData(
  encrypted: string,
  passphrase: string,
  salt: string,
  iv: string,
  tag: string
): string {
  const key = deriveKey(passphrase, Buffer.from(salt, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ---- Secure Export/Import ----

/**
 * Export the entire vault (all CRDT documents + sync queue) for
 * air-gapped transfer. Optionally encrypts with a passphrase.
 */
export function exportVault(
  passphrase?: string
): VaultExport | { encryptedPayload: true; data: string; salt: string; iv: string; tag: string } {
  const documents = Array.from(crdtStore.values());
  const queue = [...syncQueue];

  const exportData: VaultExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    nodeId,
    documents,
    syncQueue: queue,
    checksum: computeChecksum(documents),
    encrypted: !!passphrase,
  };

  if (passphrase) {
    const json = JSON.stringify(exportData);
    const result = encryptData(json, passphrase);
    return {
      encryptedPayload: true,
      data: result.encrypted,
      salt: result.salt,
      iv: result.iv,
      tag: result.tag,
    };
  }

  return exportData;
}

/**
 * Import a vault export, merging with existing local data.
 * Returns conflict resolutions for any merged documents.
 */
export function importVault(
  data: VaultExport | string,
  passphrase?: string
): { imported: number; conflicts: ConflictResolution[] } {
  let exportData: VaultExport;

  if (typeof data === "string") {
    // Encrypted import — would need salt/iv/tag passed separately
    throw new Error("For encrypted imports, decrypt first using decryptData()");
  }

  exportData = VaultExportSchema.parse(data);

  // Verify checksum
  const expectedChecksum = computeChecksum(exportData.documents);
  if (expectedChecksum !== exportData.checksum) {
    throw new Error("Vault export checksum mismatch — data may be corrupted");
  }

  const allConflicts: ConflictResolution[] = [];
  let imported = 0;

  // Merge each document
  for (const doc of exportData.documents) {
    const { conflicts } = crdtMerge(doc);
    allConflicts.push(...conflicts);
    imported++;
  }

  // Merge sync queue (avoid duplicates)
  const existingIds = new Set(syncQueue.map((op) => op.id));
  for (const op of exportData.syncQueue) {
    if (!existingIds.has(op.id) && op.status === "queued") {
      syncQueue.push(op);
    }
  }

  return { imported, conflicts: allConflicts };
}

function computeChecksum(documents: CRDTDocument[]): string {
  const content = JSON.stringify(
    documents.map((d) => ({ id: d.id, version: d.version, entryCount: d.entries.length }))
  );
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// ---- Clear State (Testing) ----

/** Clear all vault state (for testing). */
export function clearVaultState(): void {
  syncQueue.length = 0;
  crdtStore.clear();
  logicalClock = 0;
}
