/**
 * @module rbac/audit-trail
 *
 * Enhanced immutable audit trail with structured event logging,
 * search/filter capabilities, export for compliance, tamper detection,
 * and real-time audit event streaming.
 */

import { randomUUID, createHash } from "node:crypto";

// ---- Types ----

export type AuditCategory =
  | "auth"
  | "session"
  | "idea"
  | "investigation"
  | "collaboration"
  | "admin"
  | "export"
  | "api"
  | "compliance"
  | "system";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEntry {
  id: string;
  timestamp: string;
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  actor: {
    userId: string;
    displayName: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  resource: {
    type: string;
    id: string;
    name?: string;
  };
  context: {
    workspaceId?: string;
    tenantId?: string;
    sessionId?: string;
    requestId?: string;
  };
  details?: Record<string, unknown>;
  /** Hash of the previous entry for tamper detection. */
  previousHash?: string;
  /** Hash of this entry (computed at insert). */
  entryHash: string;
}

export interface AuditQuery {
  category?: AuditCategory;
  severity?: AuditSeverity;
  userId?: string;
  workspaceId?: string;
  tenantId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditExport {
  exportId: string;
  format: "json" | "csv";
  generatedAt: string;
  entryCount: number;
  query: AuditQuery;
  data: string;
  checksum: string;
}

export interface AuditStats {
  totalEntries: number;
  entriesByCategory: Record<string, number>;
  entriesBySeverity: Record<string, number>;
  recentCritical: AuditEntry[];
  chainIntegrity: { valid: boolean; brokenAt?: string };
}

// ---- Store ----

const auditEntries: AuditEntry[] = [];
const auditListeners = new Set<(entry: AuditEntry) => void>();

// ---- Hash Chain ----

function computeEntryHash(entry: Omit<AuditEntry, "entryHash">): string {
  const data = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    category: entry.category,
    action: entry.action,
    actor: entry.actor.userId,
    resource: `${entry.resource.type}:${entry.resource.id}`,
    previousHash: entry.previousHash,
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

// ---- Core Functions ----

/**
 * Record an audit event with tamper-proof hash chaining.
 */
export function recordAuditEvent(input: {
  category: AuditCategory;
  severity?: AuditSeverity;
  action: string;
  actor: AuditEntry["actor"];
  resource: AuditEntry["resource"];
  context?: AuditEntry["context"];
  details?: Record<string, unknown>;
}): AuditEntry {
  const previousEntry = auditEntries[auditEntries.length - 1];
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  const partialEntry = {
    id,
    timestamp,
    category: input.category,
    severity: input.severity ?? "info",
    action: input.action,
    actor: input.actor,
    resource: input.resource,
    context: input.context ?? {},
    details: input.details,
    previousHash: previousEntry?.entryHash,
  };

  const entry: AuditEntry = {
    ...partialEntry,
    entryHash: computeEntryHash(partialEntry),
  };

  auditEntries.push(entry);

  // Notify listeners
  for (const listener of auditListeners) {
    try {
      listener(entry);
    } catch {
      /* ignore */
    }
  }

  // Keep max 10000 entries in memory
  if (auditEntries.length > 10000) {
    auditEntries.splice(0, auditEntries.length - 10000);
  }

  return entry;
}

/**
 * Query audit entries with flexible filtering.
 */
export function queryAuditTrail(query: AuditQuery = {}): AuditEntry[] {
  let results = [...auditEntries];

  if (query.category) results = results.filter((e) => e.category === query.category);
  if (query.severity) results = results.filter((e) => e.severity === query.severity);
  if (query.userId) results = results.filter((e) => e.actor.userId === query.userId);
  if (query.workspaceId)
    results = results.filter((e) => e.context.workspaceId === query.workspaceId);
  if (query.tenantId) results = results.filter((e) => e.context.tenantId === query.tenantId);
  if (query.action) results = results.filter((e) => e.action.includes(query.action!));
  if (query.resourceType) results = results.filter((e) => e.resource.type === query.resourceType);
  if (query.resourceId) results = results.filter((e) => e.resource.id === query.resourceId);
  if (query.fromDate) results = results.filter((e) => e.timestamp >= query.fromDate!);
  if (query.toDate) results = results.filter((e) => e.timestamp <= query.toDate!);

  // Sort newest first
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const offset = query.offset ?? 0;
  const limit = query.limit ?? 100;
  return results.slice(offset, offset + limit);
}

/**
 * Verify the hash chain integrity of the audit trail.
 */
export function verifyAuditChainIntegrity(): { valid: boolean; brokenAt?: string } {
  for (let i = 1; i < auditEntries.length; i++) {
    const entry = auditEntries[i];
    const previousEntry = auditEntries[i - 1];

    if (entry.previousHash !== previousEntry.entryHash) {
      return { valid: false, brokenAt: entry.id };
    }

    // Verify entry's own hash
    const { entryHash, ...rest } = entry;
    const computed = computeEntryHash(rest);
    if (computed !== entryHash) {
      return { valid: false, brokenAt: entry.id };
    }
  }

  return { valid: true };
}

/**
 * Export audit trail for compliance reporting.
 */
export function exportAuditTrail(
  query: AuditQuery = {},
  format: "json" | "csv" = "json"
): AuditExport {
  const entries = queryAuditTrail({ ...query, limit: query.limit ?? 10000 });

  let data: string;
  if (format === "csv") {
    const headers = "id,timestamp,category,severity,action,userId,resourceType,resourceId\n";
    const rows = entries
      .map(
        (e) =>
          `${e.id},${e.timestamp},${e.category},${e.severity},"${e.action}",${e.actor.userId},${e.resource.type},${e.resource.id}`
      )
      .join("\n");
    data = headers + rows;
  } else {
    data = JSON.stringify(entries, null, 2);
  }

  const checksum = createHash("sha256").update(data).digest("hex");

  return {
    exportId: randomUUID(),
    format,
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    query,
    data,
    checksum,
  };
}

/**
 * Get audit trail statistics.
 */
export function getAuditStats(): AuditStats {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const entry of auditEntries) {
    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;
  }

  const critical = auditEntries
    .filter((e) => e.severity === "critical")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return {
    totalEntries: auditEntries.length,
    entriesByCategory: byCategory,
    entriesBySeverity: bySeverity,
    recentCritical: critical,
    chainIntegrity: verifyAuditChainIntegrity(),
  };
}

/**
 * Subscribe to real-time audit events.
 */
export function onAuditEvent(listener: (entry: AuditEntry) => void): () => void {
  auditListeners.add(listener);
  return () => auditListeners.delete(listener);
}

// ---- Convenience Logging Functions ----

export function auditAuth(
  action: string,
  actor: AuditEntry["actor"],
  details?: Record<string, unknown>
): AuditEntry {
  return recordAuditEvent({
    category: "auth",
    severity: action.includes("fail") ? "warning" : "info",
    action,
    actor,
    resource: { type: "auth", id: actor.userId },
    details,
  });
}

export function auditAdmin(
  action: string,
  actor: AuditEntry["actor"],
  resource: AuditEntry["resource"],
  details?: Record<string, unknown>
): AuditEntry {
  return recordAuditEvent({
    category: "admin",
    severity: "warning",
    action,
    actor,
    resource,
    details,
  });
}

export function auditDataAccess(
  action: string,
  actor: AuditEntry["actor"],
  resource: AuditEntry["resource"],
  context?: AuditEntry["context"]
): AuditEntry {
  return recordAuditEvent({
    category: "session",
    action,
    actor,
    resource,
    context,
  });
}

// ---- Cleanup ----

export function clearAuditTrail(): void {
  auditEntries.length = 0;
  auditListeners.clear();
}
