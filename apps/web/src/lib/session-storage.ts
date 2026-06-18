/**
 * @description Hooks for persisting and restoring innovation session state to localStorage.
 */

import type { AngleResult, Synthesis } from "@innovator/core/types";

const RECENT_SESSIONS_KEY = "innovator-recent-sessions";
const MAX_RECENT = 10;

export interface SavedSession {
  id: string;
  subject: string;
  ideaCount: number;
  angleCount: number;
  hasSynthesis: boolean;
  savedAt: string;
  angleResults: AngleResult[];
  synthesis: Synthesis | null;
}

export function saveSession(
  subject: string,
  angleResults: AngleResult[],
  synthesis: Synthesis | null
): SavedSession | null {
  try {
    const session: SavedSession = {
      id: `session-${Date.now()}`,
      subject,
      ideaCount: angleResults.reduce((sum, ar) => sum + ar.ideas.length, 0),
      angleCount: angleResults.length,
      hasSynthesis: !!synthesis,
      savedAt: new Date().toISOString(),
      angleResults,
      synthesis,
    };

    const existing = loadRecentSessions();
    const updated = [session, ...existing.filter((s) => s.subject !== subject)].slice(
      0,
      MAX_RECENT
    );
    const serialized = JSON.stringify(updated);

    // Guard against localStorage quota (~5MB) — drop oldest sessions if too large
    if (serialized.length > 4_000_000) {
      const trimmed = updated.slice(0, Math.max(1, Math.floor(MAX_RECENT / 2)));
      localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(RECENT_SESSIONS_KEY, serialized);
    }
    return session;
  } catch {
    // Quota exceeded or localStorage unavailable — evict oldest and retry once
    try {
      const existing = loadRecentSessions();
      if (existing.length > 1) {
        localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(existing.slice(0, 3)));
      }
    } catch {
      // Storage completely unavailable
    }
    return null;
  }
}

export function loadRecentSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function deleteSession(id: string): void {
  try {
    const existing = loadRecentSessions();
    const updated = existing.filter((s) => s.id !== id);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export function clearAllSessions(): void {
  try {
    localStorage.removeItem(RECENT_SESSIONS_KEY);
  } catch {
    // Ignore storage errors
  }
}
