/**
 * @module history
 *
 * File-based persistence for innovation session history.
 * Stores sessions as individual JSON files in ~/.innovator/history/.
 * Supports CRUD, full-text search, and filtering.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  SessionRecord,
  HistoryQuery,
  Investigation,
  AngleResult,
  Synthesis,
} from "../types.js";

const HISTORY_DIR = join(homedir(), ".innovator", "history");

/** Write to a temp file then atomically rename to prevent corruption. */
function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

function ensureHistoryDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

/** Validate that a session ID is a safe filename (UUID format or alphanumeric with hyphens). */
function validateSessionId(id: string): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Session ID must be a non-empty string");
  }
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error(
      "Session ID contains invalid characters (only alphanumeric and hyphens allowed)"
    );
  }
  if (id.length > 200) {
    throw new Error("Session ID must not exceed 200 characters");
  }
}

function sessionPath(id: string): string {
  validateSessionId(id);
  return join(HISTORY_DIR, `${id}.json`);
}

/** Save a new session from pipeline results. Returns the session ID.
 * @throws If subject is empty or whitespace-only
 */
export function saveSession(params: {
  subject: string;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
  tags?: string[];
  notes?: string;
  presetId?: string;
}): string {
  if (!params.subject || !params.subject.trim()) {
    throw new Error("saveSession: subject must be a non-empty string");
  }
  ensureHistoryDir();
  const id = randomUUID();
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id,
    subject: params.subject,
    createdAt: now,
    updatedAt: now,
    investigation: params.investigation,
    angleResults: params.angleResults,
    synthesis: params.synthesis,
    tags: params.tags ?? [],
    notes: params.notes,
    presetId: params.presetId,
  };
  atomicWriteFileSync(sessionPath(id), JSON.stringify(session, null, 2));
  return id;
}

/** Minimal shape check for session records loaded from disk. */
function isValidSessionRecord(data: unknown): data is SessionRecord {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.subject === "string" &&
    typeof obj.createdAt === "string" &&
    typeof obj.updatedAt === "string" &&
    Array.isArray(obj.angleResults) &&
    Array.isArray(obj.tags)
  );
}

/** Get a session by ID. Returns undefined for missing or malformed files.
 * @throws If the ID contains invalid characters (security validation)
 */
export function getSession(id: string): SessionRecord | undefined {
  // Validate ID outside try/catch so security errors propagate
  validateSessionId(id);
  try {
    const path = sessionPath(id);
    if (!existsSync(path)) return undefined;
    const data: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (!isValidSessionRecord(data)) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/** Update a session's tags or notes. */
export function updateSession(id: string, updates: { tags?: string[]; notes?: string }): boolean {
  const session = getSession(id);
  if (!session) return false;
  if (updates.tags !== undefined) session.tags = updates.tags;
  if (updates.notes !== undefined) session.notes = updates.notes;
  session.updatedAt = new Date().toISOString();
  atomicWriteFileSync(sessionPath(id), JSON.stringify(session, null, 2));
  return true;
}

/** Delete a session by ID. */
export function deleteSession(id: string): boolean {
  const path = sessionPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/** List all sessions, most recent first. Silently skips corrupt or malformed files. */
export function listSessions(): SessionRecord[] {
  ensureHistoryDir();
  const files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  const sessions: SessionRecord[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(HISTORY_DIR, file), "utf-8");
      const data: unknown = JSON.parse(raw);
      if (isValidSessionRecord(data)) {
        sessions.push(data);
      }
    } catch {
      // Skip corrupt files
    }
  }
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Search and filter sessions based on query parameters. */
export function querySessions(query: HistoryQuery): SessionRecord[] {
  const { sessions } = querySessionsPaginated(query);
  return sessions;
}

/** Paginated query result with total count for building pagination UIs. */
export interface PaginatedSessionResult {
  /** Sessions matching the query, sliced by offset/limit. */
  sessions: SessionRecord[];
  /** Total number of sessions matching the filter (before pagination). */
  totalCount: number;
}

/** Search and filter sessions with pagination metadata. */
export function querySessionsPaginated(query: HistoryQuery): PaginatedSessionResult {
  let sessions = listSessions();

  if (query.search) {
    const search = query.search.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.subject.toLowerCase().includes(search) ||
        s.investigation?.summary?.toLowerCase().includes(search) ||
        s.notes?.toLowerCase().includes(search) ||
        s.angleResults.some((ar) =>
          ar.ideas.some(
            (idea) =>
              idea.title.toLowerCase().includes(search) ||
              idea.description.toLowerCase().includes(search)
          )
        )
    );
  }

  if (query.tags && query.tags.length > 0) {
    sessions = sessions.filter((s) => query.tags!.every((tag) => s.tags.includes(tag)));
  }

  if (query.fromDate) {
    sessions = sessions.filter((s) => s.createdAt >= query.fromDate!);
  }

  if (query.toDate) {
    sessions = sessions.filter((s) => s.createdAt <= query.toDate!);
  }

  if (query.angleId) {
    sessions = sessions.filter((s) => s.angleResults.some((ar) => ar.angleId === query.angleId));
  }

  const totalCount = sessions.length;
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = Math.max(0, Math.floor(query.limit ?? 50));
  return { sessions: sessions.slice(offset, offset + limit), totalCount };
}

/** Compare two sessions side by side. */
export function compareSessions(
  id1: string,
  id2: string
):
  | {
      session1: SessionRecord;
      session2: SessionRecord;
      sharedThemes: string[];
      sharedAngles: string[];
      uniqueAngles1: string[];
      uniqueAngles2: string[];
    }
  | undefined {
  const s1 = getSession(id1);
  const s2 = getSession(id2);
  if (!s1 || !s2) return undefined;

  // Find shared themes from synthesis
  const themes1 = new Set(s1.synthesis?.themes ?? []);
  const themes2 = s2.synthesis?.themes ?? [];
  const sharedThemes = themes2.filter((t) => themes1.has(t));

  // Compare angle coverage
  const angles1 = new Set(s1.angleResults.map((ar) => ar.angleId));
  const angles2 = new Set(s2.angleResults.map((ar) => ar.angleId));
  const sharedAngles = [...angles1].filter((a) => angles2.has(a));
  const uniqueAngles1 = [...angles1].filter((a) => !angles2.has(a));
  const uniqueAngles2 = [...angles2].filter((a) => !angles1.has(a));

  return { session1: s1, session2: s2, sharedThemes, sharedAngles, uniqueAngles1, uniqueAngles2 };
}

/** Aggregate statistics across all stored sessions. */
export interface SessionStats {
  /** Total number of sessions. */
  totalSessions: number;
  /** Frequency count for each tag across all sessions. */
  tagFrequency: Record<string, number>;
  /** Frequency count for each angle used across all sessions. */
  angleFrequency: Record<string, number>;
  /** Total number of ideas generated across all sessions. */
  totalIdeas: number;
  /** ISO 8601 timestamp of the earliest session, or undefined if no sessions exist. */
  earliestSession?: string;
  /** ISO 8601 timestamp of the most recent session, or undefined if no sessions exist. */
  latestSession?: string;
}

/** Compute aggregate statistics across all stored sessions. */
export function getSessionStats(): SessionStats {
  const sessions = listSessions();
  const tagFrequency: Record<string, number> = {};
  const angleFrequency: Record<string, number> = {};
  let totalIdeas = 0;

  for (const session of sessions) {
    for (const tag of session.tags) {
      tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1;
    }
    for (const ar of session.angleResults) {
      angleFrequency[ar.angleId] = (angleFrequency[ar.angleId] ?? 0) + 1;
      totalIdeas += ar.ideas.length;
    }
  }

  return {
    totalSessions: sessions.length,
    tagFrequency,
    angleFrequency,
    totalIdeas,
    earliestSession: sessions.length > 0 ? sessions[sessions.length - 1].createdAt : undefined,
    latestSession: sessions.length > 0 ? sessions[0].createdAt : undefined,
  };
}

// ---- Session Export Helpers ----

/** Escape a value for CSV output (wrap in quotes if it contains commas, quotes, or newlines). */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export a session record as a Markdown document.
 *
 * @param session - The session record to export
 * @returns A Markdown-formatted string with all session data
 */
export function exportSessionAsMarkdown(session: SessionRecord): string {
  const lines: string[] = [];
  lines.push(`# Innovation Session: ${session.subject}`);
  lines.push("");
  lines.push(`- **ID**: ${session.id}`);
  lines.push(`- **Created**: ${session.createdAt}`);
  lines.push(`- **Updated**: ${session.updatedAt}`);
  if (session.tags.length > 0) {
    lines.push(`- **Tags**: ${session.tags.join(", ")}`);
  }
  if (session.notes) {
    lines.push(`- **Notes**: ${session.notes}`);
  }
  lines.push("");

  if (session.investigation) {
    lines.push("## Investigation");
    lines.push("");
    lines.push(`**Summary:** ${session.investigation.summary}`);
    lines.push("");
    lines.push("### Key Aspects");
    for (const aspect of session.investigation.keyAspects) {
      lines.push(`- **${aspect.title}**: ${aspect.description}`);
    }
    lines.push("");
    lines.push(`**Current State:** ${session.investigation.currentState}`);
    lines.push("");
    lines.push("### Challenges");
    for (const c of session.investigation.challenges) {
      lines.push(`- ${c}`);
    }
    lines.push("");
    lines.push("### Opportunities");
    for (const o of session.investigation.opportunities) {
      lines.push(`- ${o}`);
    }
    lines.push("");
  }

  if (session.angleResults.length > 0) {
    lines.push("## Ideas by Angle");
    lines.push("");
    for (const ar of session.angleResults) {
      lines.push(`### ${ar.angleName} (\`${ar.angleId}\`)`);
      lines.push("");
      lines.push(`*${ar.reasoning}*`);
      lines.push("");
      for (const idea of ar.ideas) {
        lines.push(`#### ${idea.title}`);
        lines.push("");
        lines.push(idea.description);
        lines.push("");
        lines.push(`- **Impact**: ${idea.potentialImpact}`);
        lines.push(`- **How to start**: ${idea.implementationHint}`);
        lines.push("");
      }
    }
  }

  if (session.synthesis) {
    lines.push("## Synthesis");
    lines.push("");
    lines.push("### Top Ideas");
    for (const idea of session.synthesis.topIdeas) {
      lines.push(`- **${idea.title}** (${idea.feasibility} feasibility) — ${idea.potentialImpact}`);
    }
    lines.push("");
    lines.push("### Themes");
    for (const theme of session.synthesis.themes) {
      lines.push(`- ${theme}`);
    }
    lines.push("");
    lines.push("### Recommendation");
    lines.push(session.synthesis.recommendation);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export a session record as a formatted JSON string.
 *
 * @param session - The session record to export
 * @returns A pretty-printed JSON string of the full session
 */
export function exportSessionAsJson(session: SessionRecord): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Duplicate an existing session, creating a new copy with a fresh ID and timestamps.
 * Useful for re-analysis workflows where you want to iterate on a previous session.
 *
 * @param id - The ID of the session to duplicate
 * @returns The new session ID, or undefined if the source session was not found
 */
export function duplicateSession(id: string): string | undefined {
  const source = getSession(id);
  if (!source) return undefined;
  return saveSession({
    subject: source.subject,
    investigation: source.investigation,
    angleResults: source.angleResults,
    synthesis: source.synthesis,
    tags: [...source.tags],
    notes: source.notes,
    presetId: source.presetId,
  });
}

/**
 * Delete all sessions from history. Useful for development and testing cleanup.
 *
 * @returns The number of sessions deleted
 */
export function clearHistory(): number {
  ensureHistoryDir();
  const files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      unlinkSync(join(HISTORY_DIR, file));
    } catch {
      // Skip files that can't be deleted
    }
  }
  return files.length;
}

/**
 * Export a session's ideas as CSV rows for spreadsheet import.
 *
 * @param session - The session record to export
 * @returns A CSV string with headers: Subject, Angle, Idea Title, Description, Impact, Implementation Hint
 */
export function exportSessionAsCsv(session: SessionRecord): string {
  const header = "Subject,Angle,Idea Title,Description,Impact,Implementation Hint";
  const rows: string[] = [header];

  for (const ar of session.angleResults) {
    for (const idea of ar.ideas) {
      rows.push(
        [
          csvEscape(session.subject),
          csvEscape(ar.angleName),
          csvEscape(idea.title),
          csvEscape(idea.description),
          csvEscape(idea.potentialImpact),
          csvEscape(idea.implementationHint),
        ].join(",")
      );
    }
  }

  return rows.join("\n");
}
