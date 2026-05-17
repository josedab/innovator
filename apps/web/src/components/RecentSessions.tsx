/**
 * @description Displays recent innovation sessions from localStorage with restore capability.
 */
"use client";

import { useState, useEffect } from "react";
import { loadRecentSessions, deleteSession, type SavedSession } from "@/lib/session-storage";

interface RecentSessionsProps {
  onRestore: (session: SavedSession) => void;
}

export function RecentSessions({ onRestore }: RecentSessionsProps) {
  const [sessions, setSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      setSessions(loadRecentSessions());
    });
  }, []);

  const handleDelete = (id: string) => {
    deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  if (sessions.length === 0) return null;

  return (
    <div className="mt-10 max-w-xl mx-auto">
      <h3 className="text-sm font-semibold text-neutral-500 mb-3">📂 Recent Sessions</h3>
      <div className="space-y-2">
        {sessions.slice(0, 5).map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-700 transition group"
          >
            <button onClick={() => onRestore(session)} className="flex-1 text-left">
              <p className="font-medium text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                {session.subject}
              </p>
              <p className="text-xs text-neutral-500">
                {session.angleCount} angles · {session.ideaCount} ideas
                {session.hasSynthesis ? " · synthesized" : ""}
                {" · "}
                {new Date(session.savedAt).toLocaleDateString()}
              </p>
            </button>
            <button
              onClick={() => handleDelete(session.id)}
              aria-label={`Delete session: ${session.subject}`}
              className="p-1 text-neutral-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
