"use client";

import { useState, useEffect, useCallback } from "react";

interface SearchResult {
  document: {
    id: string;
    type: string;
    title: string;
    content: string;
    sessionId?: string;
    angleId?: string;
    score?: number;
    tags?: string[];
    createdAt: string;
  };
  relevanceScore: number;
  matchType: string;
  highlights: string[];
}

interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  facetCounts: {
    types: Record<string, number>;
    angles: Record<string, number>;
    tags: Record<string, number>;
  };
  query: string;
  durationMs: number;
}

const TYPE_ICONS: Record<string, string> = {
  investigation: "🔍",
  idea: "💡",
  synthesis: "🔗",
  session: "📋",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchSuggestions = useCallback(async (prefix: string) => {
    if (prefix.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch("/api/idea-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", prefix }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      // Suggestion fetch failed
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => fetchSuggestions(query), 300);
    return () => clearTimeout(debounce);
  }, [query, fetchSuggestions]);

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;
    setLoading(true);
    setShowSuggestions(false);
    try {
      const res = await fetch("/api/idea-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          query: q,
          limit: 20,
          facets: {
            type: selectedTypes.length > 0 ? selectedTypes : undefined,
            angleId: selectedAngles.length > 0 ? selectedAngles : undefined,
          },
        }),
      });
      const data = await res.json();
      setResults(data);
    } catch {
      // Search failed
    } finally {
      setLoading(false);
    }
  };

  const toggleFacet = (type: "type" | "angle", value: string) => {
    if (type === "type") {
      setSelectedTypes((prev) =>
        prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
      );
    } else {
      setSelectedAngles((prev) =>
        prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">🔍 Innovation Search</h1>
      <p className="text-neutral-500 mb-6">
        Search across all past innovation sessions, ideas, and investigations.
      </p>

      {/* Search Bar */}
      <div className="relative mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Search ideas, investigations, sessions..."
              className="w-full px-4 py-3 border rounded-lg text-lg dark:bg-neutral-800 dark:border-neutral-600"
            />
            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(suggestion);
                      setShowSuggestions(false);
                      handleSearch(suggestion);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-sm first:rounded-t-lg last:rounded-b-lg"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Facets Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="text-xs text-neutral-500 mb-2">
              {results.totalResults} results in {results.durationMs}ms
            </div>

            {/* Type Facets */}
            {Object.keys(results.facetCounts.types).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Type</h4>
                {Object.entries(results.facetCounts.types).map(([type, count]) => (
                  <button
                    key={type}
                    onClick={() => {
                      toggleFacet("type", type);
                      setTimeout(() => handleSearch(), 100);
                    }}
                    className={`flex justify-between w-full px-2 py-1 text-sm rounded mb-1 ${
                      selectedTypes.includes(type)
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span>
                      {TYPE_ICONS[type] ?? "📄"} {type}
                    </span>
                    <span className="text-neutral-400">{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Angle Facets */}
            {Object.keys(results.facetCounts.angles).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Angle</h4>
                {Object.entries(results.facetCounts.angles).map(([angle, count]) => (
                  <button
                    key={angle}
                    onClick={() => {
                      toggleFacet("angle", angle);
                      setTimeout(() => handleSearch(), 100);
                    }}
                    className={`flex justify-between w-full px-2 py-1 text-sm rounded mb-1 ${
                      selectedAngles.includes(angle)
                        ? "bg-blue-100 dark:bg-blue-900/30"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span>{angle}</span>
                    <span className="text-neutral-400">{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Tag Facets */}
            {Object.keys(results.facetCounts.tags).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(results.facetCounts.tags).map(([tag, count]) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-full"
                    >
                      {tag} ({count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results List */}
          <div className="lg:col-span-3 space-y-4">
            {results.results.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                <p className="text-4xl mb-4">🔍</p>
                <p>No results found for &ldquo;{results.query}&rdquo;</p>
                <p className="text-sm mt-1">Try different keywords or broaden your filters.</p>
              </div>
            ) : (
              results.results.map((result) => (
                <div
                  key={result.document.id}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{TYPE_ICONS[result.document.type] ?? "📄"}</span>
                        <h3 className="font-medium text-sm">{result.document.title}</h3>
                        <span className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-full">
                          {result.matchType}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
                        {result.document.content.slice(0, 200)}...
                      </p>

                      {/* Highlights */}
                      {result.highlights.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {result.highlights.map((h, i) => (
                            <p
                              key={i}
                              className="text-xs text-neutral-500 italic bg-yellow-50 dark:bg-yellow-950/20 px-2 py-1 rounded"
                            >
                              {h}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-neutral-400">
                        {result.document.angleId && (
                          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded">
                            {result.document.angleId}
                          </span>
                        )}
                        {result.document.score !== undefined && (
                          <span>Score: {result.document.score}</span>
                        )}
                        <span>{new Date(result.document.createdAt).toLocaleDateString()}</span>
                        {result.document.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="px-1 bg-neutral-100 dark:bg-neutral-800 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-blue-600">
                        {Math.round(result.relevanceScore * 100)}%
                      </div>
                      <p className="text-xs text-neutral-400">relevance</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && (
        <div className="text-center py-16 text-neutral-500">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-lg">Search your innovation knowledge base</p>
          <p className="text-sm mt-2">
            Find ideas, investigations, and insights across all past sessions.
          </p>
        </div>
      )}
    </div>
  );
}
