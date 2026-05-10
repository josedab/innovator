"use client";

import { useState, useCallback } from "react";

interface DiffItem {
  title: string;
  description: string;
  similarityScore: number;
  category: "overlap" | "unique-to-a" | "unique-to-b" | "contradiction";
}

interface SessionDiffViewProps {
  sessionA: { sessionId: string; subject: string; ideas: Array<{ title: string; description: string }> };
  sessionB: { sessionId: string; subject: string; ideas: Array<{ title: string; description: string }> };
  onMerge?: (mergedIdeas: Array<{ title: string; description: string }>) => void;
}

const CATEGORY_COLORS: Record<DiffItem["category"], string> = {
  overlap: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
  "unique-to-a": "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50",
  "unique-to-b": "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50",
  contradiction: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
};

const CATEGORY_BADGE: Record<DiffItem["category"], string> = {
  overlap: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "unique-to-a": "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  "unique-to-b": "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  contradiction: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const CATEGORY_LABEL: Record<DiffItem["category"], string> = {
  overlap: "Overlap",
  "unique-to-a": "Unique to A",
  "unique-to-b": "Unique to B",
  contradiction: "Contradiction",
};

export default function SessionDiffView({ sessionA, sessionB, onMerge }: SessionDiffViewProps) {
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computed, setComputed] = useState(false);

  const computeDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diff-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "diff", sessionA, sessionB }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
      const data = await res.json();
      setDiffItems(data.items ?? []);
      setComputed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diff computation failed");
    } finally {
      setLoading(false);
    }
  }, [sessionA, sessionB]);

  const handleMerge = useCallback(async () => {
    if (!onMerge) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch("/api/diff-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", sessionA, sessionB, diffItems }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Merge failed (${res.status})`);
      const data = await res.json();
      onMerge(data.mergedIdeas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }, [sessionA, sessionB, diffItems, onMerge]);

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Computing semantic diff…</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button onClick={computeDiff} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition">Retry</button>
      </div>
    );
  }

  // Initial state
  if (!computed) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-2">Session Diff View</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Compare ideas between two sessions with semantic diff visualization.
        </p>

        {/* Session headers */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
            <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 mb-1">Session A</p>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{sessionA.subject}</p>
            <p className="text-xs text-neutral-500">{sessionA.ideas.length} idea{sessionA.ideas.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
            <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 mb-1">Session B</p>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{sessionB.subject}</p>
            <p className="text-xs text-neutral-500">{sessionB.ideas.length} idea{sessionB.ideas.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="text-center">
          <button onClick={computeDiff} className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 transition">
            Compute Diff
          </button>
        </div>
      </div>
    );
  }

  // Diff results
  const overlaps = diffItems.filter((d) => d.category === "overlap");
  const uniqueA = diffItems.filter((d) => d.category === "unique-to-a");
  const uniqueB = diffItems.filter((d) => d.category === "unique-to-b");
  const contradictions = diffItems.filter((d) => d.category === "contradiction");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Session Diff</h3>
        {onMerge && (
          <button
            onClick={handleMerge}
            disabled={merging}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            {merging ? "Merging…" : "Merge Ideas"}
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 text-xs">
        <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-300">
          {overlaps.length} overlaps
        </span>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {uniqueA.length} unique to A
        </span>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {uniqueB.length} unique to B
        </span>
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {contradictions.length} contradictions
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Session A column */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {sessionA.subject}
          </h4>
          {diffItems
            .filter((d) => d.category === "unique-to-a" || d.category === "overlap" || d.category === "contradiction")
            .map((item, i) => (
              <div key={i} className={`rounded-lg border p-3 space-y-1 ${CATEGORY_COLORS[item.category]}`}>
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{item.title}</h5>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[item.category]}`}>
                    {CATEGORY_LABEL[item.category]}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{item.description}</p>
                {item.category === "overlap" && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {Math.round(item.similarityScore * 100)}% similar
                  </span>
                )}
              </div>
            ))}
        </div>

        {/* Session B column */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {sessionB.subject}
          </h4>
          {diffItems
            .filter((d) => d.category === "unique-to-b" || d.category === "overlap" || d.category === "contradiction")
            .map((item, i) => (
              <div key={i} className={`rounded-lg border p-3 space-y-1 ${CATEGORY_COLORS[item.category]}`}>
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{item.title}</h5>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[item.category]}`}>
                    {CATEGORY_LABEL[item.category]}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{item.description}</p>
                {item.category === "overlap" && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {Math.round(item.similarityScore * 100)}% similar
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
