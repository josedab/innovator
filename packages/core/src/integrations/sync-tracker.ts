/**
 * @module integrations/sync-tracker
 *
 * Tracks bidirectional synchronization relationships and events
 * between Innovator ideas and external integration records.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

export const SyncRecordSchema = z.object({
  id: z.string().max(200),
  ideaId: z.string().max(200),
  integration: z.enum(["jira", "linear", "notion", "github"]),
  externalId: z.string().max(200),
  externalUrl: z.string().max(2000).optional(),
  direction: z.enum(["export", "import", "bidirectional"]),
  lastSyncedAt: z.string(),
  localStatus: z.string().max(100),
  externalStatus: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

export const SyncEventSchema = z.object({
  id: z.string().max(200),
  syncRecordId: z.string().max(200),
  eventType: z.enum(["created", "updated", "status-changed", "closed", "reopened"]),
  oldValue: z.string().max(500).optional(),
  newValue: z.string().max(500).optional(),
  timestamp: z.string(),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

export type CreateSyncRecordInput = Omit<SyncRecord, "id" | "lastSyncedAt"> & {
  id?: string;
  lastSyncedAt?: string;
};

const syncRecords = new Map<string, SyncRecord>();
const syncEvents = new Map<string, SyncEvent[]>();

/** Create and store a sync relationship record. */
export function createSyncRecord(input: CreateSyncRecordInput): SyncRecord {
  const record = SyncRecordSchema.parse({
    ...input,
    id: input.id ?? randomUUID(),
    lastSyncedAt: input.lastSyncedAt ?? new Date().toISOString(),
  });
  syncRecords.set(record.id, record);
  return cloneRecord(record);
}

/** Get a sync record by ID. */
export function getSyncRecord(id: string): SyncRecord | undefined {
  const record = syncRecords.get(id);
  return record ? cloneRecord(record) : undefined;
}

/** Find a sync record by integration and external ID. */
export function getSyncRecordByExternalId(
  integration: SyncRecord["integration"],
  externalId: string
): SyncRecord | undefined {
  for (const record of syncRecords.values()) {
    if (record.integration === integration && record.externalId === externalId) {
      return cloneRecord(record);
    }
  }
  return undefined;
}

/** List sync records, optionally filtered by idea ID. */
export function listSyncRecords(ideaId?: string): SyncRecord[] {
  return Array.from(syncRecords.values())
    .filter((record) => !ideaId || record.ideaId === ideaId)
    .map(cloneRecord);
}

/** Update external sync status and refresh last-sync metadata. */
export function updateSyncStatus(id: string, externalStatus: string): SyncRecord | undefined {
  const existing = syncRecords.get(id);
  if (!existing) return undefined;

  const previousStatus = existing.externalStatus;
  const updated = SyncRecordSchema.parse({
    ...existing,
    externalStatus: externalStatus.trim().slice(0, 100),
    lastSyncedAt: new Date().toISOString(),
  });

  syncRecords.set(id, updated);
  if (previousStatus !== updated.externalStatus) {
    recordSyncEvent(id, "status-changed", previousStatus, updated.externalStatus);
  }

  return cloneRecord(updated);
}

/** Record a synchronization event in the event log. */
export function recordSyncEvent(
  syncRecordId: string,
  eventType: SyncEvent["eventType"],
  oldValue?: string,
  newValue?: string
): SyncEvent {
  const event = SyncEventSchema.parse({
    id: randomUUID(),
    syncRecordId,
    eventType,
    oldValue: oldValue?.slice(0, 500),
    newValue: newValue?.slice(0, 500),
    timestamp: new Date().toISOString(),
  });

  const existing = syncEvents.get(syncRecordId) ?? [];
  existing.push(event);
  syncEvents.set(syncRecordId, existing);
  return { ...event };
}

/** Get sync-history events for a specific record. */
export function getSyncEvents(syncRecordId: string): SyncEvent[] {
  return (syncEvents.get(syncRecordId) ?? []).map((event) => ({ ...event }));
}

/** Clear all sync records and event history (for testing). */
export function clearSyncData(): void {
  syncRecords.clear();
  syncEvents.clear();
}

function cloneRecord(record: SyncRecord): SyncRecord {
  return {
    ...record,
    ...(record.metadata ? { metadata: { ...record.metadata } } : {}),
  };
}
