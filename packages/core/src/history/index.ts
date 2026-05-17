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
import { ValidationError } from "../errors.js";

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
    throw new ValidationError("Session ID must be a non-empty string");
  }
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new ValidationError(
      "Session ID contains invalid characters (only alphanumeric and hyphens allowed)"
    );
  }
  if (id.length > 200) {
    throw new ValidationError("Session ID must not exceed 200 characters");
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
    throw new ValidationError("saveSession: subject must be a non-empty string");
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
        s.investigation?.currentState?.toLowerCase().includes(search) ||
        s.investigation?.keyAspects?.some(
          (a) =>
            a.title.toLowerCase().includes(search) || a.description.toLowerCase().includes(search)
        ) ||
        s.investigation?.challenges?.some((c) => c.toLowerCase().includes(search)) ||
        s.investigation?.opportunities?.some((o) => o.toLowerCase().includes(search)) ||
        s.notes?.toLowerCase().includes(search) ||
        s.synthesis?.recommendation?.toLowerCase().includes(search) ||
        s.synthesis?.themes?.some((t) => t.toLowerCase().includes(search)) ||
        s.angleResults.some((ar) =>
          ar.ideas.some(
            (idea) =>
              idea.title.toLowerCase().includes(search) ||
              idea.description.toLowerCase().includes(search)
          )
        ) ||
        s.tags.some((tag) => tag.toLowerCase().includes(search)) ||
        s.angleResults.some((ar) => ar.reasoning?.toLowerCase().includes(search))
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

/** Escape a value for CSV output (wrap in quotes if it contains commas, quotes, or newlines).
 *  Also guards against CSV formula injection by prefixing dangerous leading characters
 *  with a single quote so spreadsheets treat them as text, not formulas. */
function csvEscape(value: string): string {
  let safe = value;
  // Prevent CSV formula injection: prefix dangerous leading characters with a single quote
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe !== value) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
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

/** Escape HTML special characters to prevent XSS in exported HTML. */
function htmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Export a session record as a self-contained HTML document.
 * Includes inline CSS styling for immediate sharing and viewing in any browser.
 *
 * @param session - The session record to export
 * @returns A complete HTML document string with embedded styles
 */
export function exportSessionAsHtml(session: SessionRecord): string {
  const lines: string[] = [];

  lines.push("<!DOCTYPE html>");
  lines.push('<html lang="en">');
  lines.push("<head>");
  lines.push('<meta charset="UTF-8">');
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`<title>Innovation Session: ${htmlEscape(session.subject)}</title>`);
  lines.push("<style>");
  lines.push(`
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1a1a2e; background: #fafafa; line-height: 1.6; }
    h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 0.5rem; }
    h2 { color: #1e1b4b; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3rem; }
    h3 { color: #3730a3; }
    h4 { color: #4338ca; margin-bottom: 0.3rem; }
    .meta { color: #6b7280; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .meta span { margin-right: 1.5rem; }
    .tag { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; margin-right: 4px; }
    .idea { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
    .idea h4 { margin-top: 0; }
    .idea .detail { font-size: 0.9rem; color: #4b5563; margin: 0.3rem 0; }
    .idea .detail strong { color: #1f2937; }
    .top-idea { background: #f0fdf4; border-color: #86efac; }
    .feasibility { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .feasibility-high { background: #dcfce7; color: #166534; }
    .feasibility-medium { background: #fef9c3; color: #854d0e; }
    .feasibility-low { background: #fee2e2; color: #991b1b; }
    .theme { display: inline-block; background: #faf5ff; color: #7c3aed; padding: 3px 10px; border-radius: 4px; margin: 3px 4px 3px 0; font-size: 0.9rem; }
    .recommendation { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 1rem 1.2rem; border-radius: 0 8px 8px 0; }
    .section { margin-bottom: 1.5rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.3rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 0.8rem; text-align: center; }
  `);
  lines.push("</style>");
  lines.push("</head>");
  lines.push("<body>");

  // Header
  lines.push(`<h1>💡 ${htmlEscape(session.subject)}</h1>`);
  lines.push('<div class="meta">');
  lines.push(`<span><strong>ID:</strong> ${htmlEscape(session.id)}</span>`);
  lines.push(`<span><strong>Created:</strong> ${htmlEscape(session.createdAt)}</span>`);
  if (session.tags.length > 0) {
    lines.push(
      `<div style="margin-top: 0.3rem">${session.tags.map((t) => `<span class="tag">${htmlEscape(t)}</span>`).join("")}</div>`
    );
  }
  if (session.notes) {
    lines.push(
      `<div style="margin-top: 0.3rem"><strong>Notes:</strong> ${htmlEscape(session.notes)}</div>`
    );
  }
  lines.push("</div>");

  // Investigation
  if (session.investigation) {
    lines.push("<h2>🔍 Investigation</h2>");
    lines.push(`<p>${htmlEscape(session.investigation.summary)}</p>`);

    if (session.investigation.keyAspects.length > 0) {
      lines.push("<h3>Key Aspects</h3>");
      lines.push("<ul>");
      for (const a of session.investigation.keyAspects) {
        lines.push(
          `<li><strong>${htmlEscape(a.title)}</strong>: ${htmlEscape(a.description)}</li>`
        );
      }
      lines.push("</ul>");
    }

    lines.push(`<h3>Current State</h3><p>${htmlEscape(session.investigation.currentState)}</p>`);

    if (session.investigation.challenges.length > 0) {
      lines.push("<h3>Challenges</h3><ul>");
      for (const c of session.investigation.challenges) {
        lines.push(`<li>${htmlEscape(c)}</li>`);
      }
      lines.push("</ul>");
    }

    if (session.investigation.opportunities.length > 0) {
      lines.push("<h3>Opportunities</h3><ul>");
      for (const o of session.investigation.opportunities) {
        lines.push(`<li>${htmlEscape(o)}</li>`);
      }
      lines.push("</ul>");
    }
  }

  // Ideas by Angle
  if (session.angleResults.length > 0) {
    lines.push("<h2>💡 Ideas by Angle</h2>");
    for (const ar of session.angleResults) {
      lines.push(`<h3>${htmlEscape(ar.angleName)} <code>${htmlEscape(ar.angleId)}</code></h3>`);
      lines.push(`<p><em>${htmlEscape(ar.reasoning)}</em></p>`);
      for (const idea of ar.ideas) {
        lines.push('<div class="idea">');
        lines.push(`<h4>${htmlEscape(idea.title)}</h4>`);
        lines.push(`<p>${htmlEscape(idea.description)}</p>`);
        lines.push(
          `<p class="detail"><strong>Impact:</strong> ${htmlEscape(idea.potentialImpact)}</p>`
        );
        lines.push(
          `<p class="detail"><strong>How to start:</strong> ${htmlEscape(idea.implementationHint)}</p>`
        );
        lines.push("</div>");
      }
    }
  }

  // Synthesis
  if (session.synthesis) {
    lines.push("<h2>🎯 Synthesis</h2>");

    if (session.synthesis.topIdeas.length > 0) {
      lines.push("<h3>Top Ideas</h3>");
      for (const idea of session.synthesis.topIdeas) {
        const feasClass = `feasibility-${idea.feasibility}`;
        lines.push('<div class="idea top-idea">');
        lines.push(`<h4>${htmlEscape(idea.title)}</h4>`);
        lines.push(`<p>${htmlEscape(idea.description)}</p>`);
        lines.push(
          `<p class="detail"><strong>Source:</strong> ${htmlEscape(idea.sourceAngle)} · <span class="feasibility ${feasClass}">${htmlEscape(idea.feasibility)} feasibility</span></p>`
        );
        lines.push(
          `<p class="detail"><strong>Impact:</strong> ${htmlEscape(idea.potentialImpact)}</p>`
        );
        lines.push("</div>");
      }
    }

    if (session.synthesis.themes.length > 0) {
      lines.push("<h3>Themes</h3>");
      lines.push('<div class="section">');
      for (const theme of session.synthesis.themes) {
        lines.push(`<span class="theme">${htmlEscape(theme)}</span>`);
      }
      lines.push("</div>");
    }

    lines.push("<h3>Recommendation</h3>");
    lines.push(`<div class="recommendation">${htmlEscape(session.synthesis.recommendation)}</div>`);
  }

  lines.push(`<footer>Generated by Innovator · ${htmlEscape(session.updatedAt)}</footer>`);
  lines.push("</body>");
  lines.push("</html>");

  return lines.join("\n");
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
