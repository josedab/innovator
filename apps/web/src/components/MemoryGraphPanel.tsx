/**
 * @description Knowledge memory graph visualization showing session history and concept relationships.
 */
"use client";

import { useState, useCallback } from "react";

interface MemoryNode {
  id: string;
  type: "idea" | "investigation" | "synthesis" | "angle-result" | "theme";
  title: string;
  content: string;
  sessionId: string;
  createdAt: string;
}

interface MemorySearchResult {
  node: MemoryNode;
  score: number;
}

interface MemoryGraphPanelProps {
  onInsightSelect?: (node: MemoryNode) => void;
}

const TYPE_COLORS: Record<MemoryNode["type"], string> = {
  idea: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  investigation: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  synthesis: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "angle-result": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  theme: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const TYPE_BORDER: Record<MemoryNode["type"], string> = {
  idea: "border-blue-200 dark:border-blue-800",
  investigation: "border-green-200 dark:border-green-800",
  synthesis: "border-purple-200 dark:border-purple-800",
  "angle-result": "border-indigo-200 dark:border-indigo-800",
  theme: "border-yellow-200 dark:border-yellow-800",
};

export default function MemoryGraphPanel({ onInsightSelect }: MemoryGraphPanelProps) {
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useState(0.3);
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch("/api/memory-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), threshold }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, threshold]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-3">
          🧠 Memory Graph
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Search past ideas, investigations, and themes from your innovation memory.
        </p>

        {/* Search input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search memory graph…"
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          />
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Threshold slider */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">Threshold:</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-8 text-right">
            {threshold.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-4 p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Searching memory graph…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error}</p>
          <button
            onClick={search}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {!loading && !error && searched && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              No matching nodes found. Try lowering the threshold or adjusting your query.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.node.id}
                onClick={() => onInsightSelect?.(r.node)}
                className="w-full text-left rounded-xl border bg-white p-4 space-y-2 hover:shadow-md transition dark:bg-neutral-900"
                style={{ borderColor: undefined }}
              >
                <div className={`rounded-xl border ${TYPE_BORDER[r.node.type]} p-4 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[r.node.type]}`}
                      >
                        {r.node.type}
                      </span>
                      <h4 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                        {r.node.title}
                      </h4>
                    </div>
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {Math.round(r.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                    {r.node.content}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Session: {r.node.sessionId.slice(0, 8)}… ·{" "}
                    {new Date(r.node.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
