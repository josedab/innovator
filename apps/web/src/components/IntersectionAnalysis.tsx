"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface IntersectionOpportunity {
  title: string;
  description: string;
  subjects: string[];
  sourceIdeas: string[];
  confidence: number;
}

interface ThematicOverlap {
  idea1: { subject: string; title: string };
  idea2: { subject: string; title: string };
  similarity: number;
}

interface IntersectionResult {
  subjectResults: Array<{
    subject: string;
    investigationSummary: string;
    ideaCount: number;
  }>;
  overlaps: ThematicOverlap[];
  opportunities: IntersectionOpportunity[];
}

interface IntersectionAnalysisProps {
  onClose?: () => void;
}

const SUBJECT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b"];

/** Multi-subject intersection analysis with Venn-style visualization. */
export function IntersectionAnalysis({ onClose }: IntersectionAnalysisProps) {
  const [subjects, setSubjects] = useState<string[]>(["", ""]);
  const [result, setResult] = useState<IntersectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [filter, setFilter] = useState<string>("all");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const addSubject = useCallback(() => {
    if (subjects.length < 3) setSubjects((prev) => [...prev, ""]);
  }, [subjects.length]);

  const removeSubject = useCallback((idx: number) => {
    if (subjects.length > 2) setSubjects((prev) => prev.filter((_, i) => i !== idx));
  }, [subjects.length]);

  const updateSubject = useCallback((idx: number, value: string) => {
    setSubjects((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }, []);

  const runAnalysis = useCallback(async () => {
    const valid = subjects.filter((s) => s.trim());
    if (valid.length < 2) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress("Starting analysis...");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/intersection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects: valid }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Request failed");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.stage === "investigating") setProgress(`Investigating ${event.subjects?.length ?? 0} subjects...`);
            else if (event.stage === "investigated") setProgress(`✓ Investigated: ${event.subject}`);
            else if (event.stage === "generating") setProgress(`Generating ideas: ${event.subject ?? ""}${event.angle ? ` (${event.angle})` : ""}`);
            else if (event.stage === "analyzing_overlaps") setProgress("Finding thematic overlaps...");
            else if (event.stage === "overlaps_found") setProgress(`Found ${event.count} overlaps`);
            else if (event.stage === "generating_intersections") setProgress("Generating intersection opportunities...");
            else if (event.stage === "complete") setResult(event);
            else if (event.stage === "error") throw new Error(event.error);
          } catch (e) {
            if (e instanceof Error && e.message !== "Request cancelled") {
              // Skip parse errors for non-data lines
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message || "Analysis failed");
      }
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [subjects]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  // Build filter options
  const filterOptions: Array<{ value: string; label: string }> = [{ value: "all", label: "All intersections" }];
  if (result) {
    const subs = result.subjectResults.map((s) => s.subject);
    for (let i = 0; i < subs.length; i++) {
      for (let j = i + 1; j < subs.length; j++) {
        filterOptions.push({ value: `${subs[i]}∩${subs[j]}`, label: `${subs[i]} ∩ ${subs[j]}` });
      }
    }
    if (subs.length === 3) {
      filterOptions.push({ value: "triple", label: `${subs[0]} ∩ ${subs[1]} ∩ ${subs[2]}` });
    }
  }

  // Input form
  if (!result && !loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Multi-Subject Intersection Analysis</h3>
          {onClose && <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 transition">✕</button>}
        </div>
        <p className="text-sm text-neutral-500">Enter 2-3 subjects to find innovation opportunities at their intersection.</p>

        <div className="space-y-3">
          {subjects.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[i] }} />
              <input
                type="text"
                value={s}
                onChange={(e) => updateSubject(i, e.target.value)}
                placeholder={`Subject ${i + 1}`}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
              />
              {subjects.length > 2 && (
                <button onClick={() => removeSubject(i)} className="text-neutral-400 hover:text-red-500 transition">✕</button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {subjects.length < 3 && (
            <button onClick={addSubject} className="rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-500 hover:border-neutral-400 transition">+ Add subject</button>
          )}
          <button
            onClick={runAnalysis}
            disabled={subjects.filter((s) => s.trim()).length < 2}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            🔬 Analyze Intersections
          </button>
        </div>

        <p className="text-xs text-neutral-400">
          ⚠️ Note: This runs 2-3× the normal LLM cost since each subject is investigated separately.
        </p>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{progress}</p>
        <button onClick={cancel} className="text-xs text-neutral-500 hover:text-neutral-700 underline">Cancel</button>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button onClick={runAnalysis} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition">Retry</button>
      </div>
    );
  }

  if (!result) return null;

  // Filter opportunities
  const filteredOpps = filter === "all"
    ? result.opportunities
    : filter === "triple"
      ? result.opportunities.filter((o) => o.subjects.length === 3)
      : result.opportunities.filter((o) => {
          const [a, b] = filter.split("∩");
          return o.subjects.includes(a) && o.subjects.includes(b) && o.subjects.length === 2;
        });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Intersection Results</h3>
        {onClose && <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 transition">✕</button>}
      </div>

      {/* Subject cards */}
      <div className="grid gap-3 md:grid-cols-3">
        {result.subjectResults.map((sr, i) => (
          <div key={sr.subject} className="rounded-lg border p-4" style={{ borderColor: SUBJECT_COLORS[i] + "40" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[i] }} />
              <h4 className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">{sr.subject}</h4>
            </div>
            <p className="text-xs text-neutral-500 line-clamp-2">{sr.investigationSummary}</p>
            <p className="text-xs text-neutral-400 mt-1">{sr.ideaCount} ideas generated</p>
          </div>
        ))}
      </div>

      {/* Venn diagram placeholder (simplified) */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          {result.subjectResults.map((sr, i) => (
            <span key={sr.subject} className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: SUBJECT_COLORS[i] }}>
              {sr.subject}
            </span>
          ))}
        </div>
        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{result.overlaps.length}</p>
        <p className="text-xs text-neutral-500">thematic overlaps found</p>
        <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{result.opportunities.length}</p>
        <p className="text-xs text-neutral-500">intersection opportunities</p>
      </div>

      {/* Filter */}
      {filterOptions.length > 1 && (
        <div className="flex gap-2">
          {filterOptions.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f.value
                  ? "bg-indigo-600 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Opportunities */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Intersection Opportunities</h4>
        {filteredOpps.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-4">No opportunities for this filter.</p>
        ) : (
          filteredOpps.map((opp, i) => (
            <div key={i} className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium text-neutral-800 dark:text-neutral-200">{opp.title}</h5>
                <span className="text-xs text-green-600 dark:text-green-400">{Math.round(opp.confidence * 100)}% confidence</span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{opp.description}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {opp.subjects.map((s) => (
                  <span key={s} className="rounded bg-white px-2 py-0.5 text-xs border border-green-200 dark:bg-neutral-900 dark:border-green-800">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Top overlaps */}
      {result.overlaps.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Top Thematic Overlaps</h4>
          {result.overlaps.slice(0, 8).map((o, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex-1">
                <span className="text-xs text-neutral-500">{o.idea1.subject}:</span>{" "}
                <span className="text-sm text-neutral-800 dark:text-neutral-200">{o.idea1.title}</span>
              </div>
              <span className="text-xs text-indigo-600 px-2">↔ {Math.round(o.similarity * 100)}%</span>
              <div className="flex-1 text-right">
                <span className="text-xs text-neutral-500">{o.idea2.subject}:</span>{" "}
                <span className="text-sm text-neutral-800 dark:text-neutral-200">{o.idea2.title}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
