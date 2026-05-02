/**
 * @module history
 *
 * File-based persistence for innovation session history.
 * Stores sessions as individual JSON files in ~/.innovator/history/.
 * Supports CRUD, full-text search, and filtering.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionRecord, HistoryQuery, Investigation, AngleResult, Synthesis } from "../types.js";

const HISTORY_DIR = join(homedir(), ".innovator", "history");

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
  writeFileSync(sessionPath(id), JSON.stringify(session, null, 2), "utf-8");
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
  writeFileSync(sessionPath(id), JSON.stringify(session, null, 2), "utf-8");
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

  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  return sessions.slice(offset, offset + limit);
}

/** Compare two sessions side by side. */
export function compareSessions(
  id1: string,
  id2: string
): { session1: SessionRecord; session2: SessionRecord; sharedThemes: string[] } | undefined {
  const s1 = getSession(id1);
  const s2 = getSession(id2);
  if (!s1 || !s2) return undefined;

  // Find shared themes from synthesis
  const themes1 = new Set(s1.synthesis?.themes ?? []);
  const themes2 = s2.synthesis?.themes ?? [];
  const sharedThemes = themes2.filter((t) => themes1.has(t));

  return { session1: s1, session2: s2, sharedThemes };
}
