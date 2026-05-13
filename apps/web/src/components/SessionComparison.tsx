/**
 * @description Side-by-side comparison view for contrasting results across innovation sessions.
 */
"use client";

import { useState, useCallback } from "react";

interface SessionSummary {
  id: string;
  subject: string;
  createdAt: string;
  angleCount: number;
  ideaCount: number;
  themes: string[];
}

interface IdeaOverlap {
  idea1: { sessionId: string; title: string; description: string };
  idea2: { sessionId: string; title: string; description: string };
  similarity: number;
}

interface ComparisonResult {
  sessions: SessionSummary[];
  sharedThemes: string[];
  uniqueThemes: Record<string, string[]>;
  ideaOverlaps: IdeaOverlap[];
  angleComparison: Record<string, string[]>;
  scoreDelta: Array<{ sessionId: string; subject: string; avgFeasibility: string; ideaCount: number }>;
  timeline: Array<{ sessionId: string; subject: string; createdAt: string }>;
}

interface SessionComparisonProps {
  sessionIds: string[];
  onClose?: () => void;
}

const FEAS_COLORS: Record<string, string> = {
  high: "text-green-600 dark:text-green-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
};

/** Side-by-side comparison of 2-5 innovation sessions. */
export function SessionComparison({ sessionIds, onClose }: SessionComparisonProps) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "overlaps" | "angles" | "timeline">("overview");

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Comparison failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }, [sessionIds]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
        <p className="text-sm text-neutral-500">Comparing {sessionIds.length} sessions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button onClick={runComparison} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition">Retry</button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold mb-2">Session Comparison Matrix</h3>
        <p className="text-sm text-neutral-500 mb-4">Compare {sessionIds.length} sessions side-by-side</p>
        <button onClick={runComparison} className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 transition">Compare Sessions</button>
      </div>
    );
  }

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "overlaps" as const, label: `Overlaps (${result.ideaOverlaps.length})` },
    { id: "angles" as const, label: "Angles" },
    { id: "timeline" as const, label: "Timeline" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Session Comparison</h3>
        {onClose && <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 transition">✕</button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {result.sessions.map((s) => (
              <div key={s.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
                <h4 className="font-medium text-neutral-800 dark:text-neutral-200 truncate">{s.subject}</h4>
                <div className="mt-2 space-y-1 text-xs text-neutral-500">
                  <p>{s.angleCount} angles · {s.ideaCount} ideas</p>
                  <p>{new Date(s.createdAt).toLocaleDateString()}</p>
                </div>
                {s.themes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.themes.slice(0, 4).map((t) => (
                      <span key={t} className={`rounded px-1.5 py-0.5 text-xs ${
                        result.sharedThemes.includes(t)
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {result.sharedThemes.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <h4 className="text-xs font-semibold uppercase text-green-700 dark:text-green-400 mb-2">Shared Themes</h4>
              <div className="flex flex-wrap gap-2">
                {result.sharedThemes.map((t) => (
                  <span key={t} className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Score delta table */}
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
            <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Score Summary</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500">
                  <th className="text-left py-1">Subject</th>
                  <th className="text-center py-1">Ideas</th>
                  <th className="text-center py-1">Feasibility</th>
                </tr>
              </thead>
              <tbody>
                {result.scoreDelta.map((s) => (
                  <tr key={s.sessionId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1.5 text-neutral-800 dark:text-neutral-200 truncate max-w-[200px]">{s.subject}</td>
                    <td className="py-1.5 text-center">{s.ideaCount}</td>
                    <td className={`py-1.5 text-center font-medium ${FEAS_COLORS[s.avgFeasibility] ?? ""}`}>{s.avgFeasibility}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overlaps */}
      {tab === "overlaps" && (
        <div className="space-y-3">
          {result.ideaOverlaps.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">No significant idea overlaps found.</p>
          ) : (
            result.ideaOverlaps.map((o, i) => (
              <div key={i} className="rounded-lg border border-indigo-200 p-4 dark:border-indigo-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{Math.round(o.similarity * 100)}% similar</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{o.idea1.title}</p>
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{o.idea1.description}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{o.idea2.title}</p>
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{o.idea2.description}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Angles */}
      {tab === "angles" && (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500">
                <th className="text-left py-1">Angle</th>
                {result.sessions.map((s) => (
                  <th key={s.id} className="text-center py-1 truncate max-w-[120px]">{s.subject}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.angleComparison).map(([angle, sids]) => (
                <tr key={angle} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5 font-medium text-neutral-700 dark:text-neutral-300">{angle}</td>
                  {result.sessions.map((s) => (
                    <td key={s.id} className="py-1.5 text-center">
                      {sids.includes(s.id) ? "✅" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline */}
      {tab === "timeline" && (
        <div className="space-y-3">
          {result.timeline.map((t, i) => (
            <div key={t.sessionId} className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <div className="h-3 w-3 rounded-full bg-indigo-600" />
                {i < result.timeline.length - 1 && <div className="h-8 w-0.5 bg-neutral-200 dark:bg-neutral-700" />}
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{t.subject}</p>
                <p className="text-xs text-neutral-500">{new Date(t.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
