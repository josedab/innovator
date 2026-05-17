/**
 * @module history
 *
 * File-based persistence for innovation session history.
 * Stores sessions as individual JSON files in ~/.innovator/history/.
 * Supports CRUD, full-text search, and filtering.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionRecord, HistoryQuery, Investigation, AngleResult, Synthesis } from "../types.js";

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

function sessionPath(id: string): string {
  return join(HISTORY_DIR, `${id}.json`);
}

/** Save a new session from pipeline results. Returns the session ID. */
export function saveSession(params: {
  subject: string;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
  tags?: string[];
  notes?: string;
  presetId?: string;
}): string {
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

/** Get a session by ID. */
export function getSession(id: string): SessionRecord | undefined {
  try {
    const path = sessionPath(id);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as SessionRecord;
  } catch {
    return undefined;
  }
}

/** Update a session's tags or notes. */
export function updateSession(
  id: string,
  updates: { tags?: string[]; notes?: string }
): boolean {
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

/** List all sessions, most recent first. */
export function listSessions(): SessionRecord[] {
  ensureHistoryDir();
  const files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  const sessions: SessionRecord[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(HISTORY_DIR, file), "utf-8");
      sessions.push(JSON.parse(raw) as SessionRecord);
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
    sessions = sessions.filter((s) =>
      query.tags!.every((tag) => s.tags.includes(tag))
    );
  }

  if (query.fromDate) {
    sessions = sessions.filter((s) => s.createdAt >= query.fromDate!);
  }

  if (query.toDate) {
    sessions = sessions.filter((s) => s.createdAt <= query.toDate!);
  }

  if (query.angleId) {
    sessions = sessions.filter((s) =>
      s.angleResults.some((ar) => ar.angleId === query.angleId)
    );
  }

  const totalCount = sessions.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  return { sessions: sessions.slice(offset, offset + limit), totalCount };
}

/** Compare two sessions side by side. */
export function compareSessions(
  id1: string,
  id2: string
): {
  session1: SessionRecord;
  session2: SessionRecord;
  sharedThemes: string[];
  sharedAngles: string[];
  uniqueAngles1: string[];
  uniqueAngles2: string[];
} | undefined {
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
