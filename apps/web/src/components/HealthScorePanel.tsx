/**
 * @description Multi-axis health score radar chart for evaluating idea viability across dimensions.
 */
"use client";

import { useState } from "react";

interface AxisScore {
  axis: string;
  score: number;
  label: string;
  details: string;
  suggestions: string[];
}

interface HealthScore {
  overall: number;
  axes: AxisScore[];
  summary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  improvementIdeas: string[];
  analyzedAt: string;
}

const AXIS_COLORS: Record<string, string> = {
  "architectural-flexibility": "#3b82f6",
  "dependency-freshness": "#10b981",
  "test-coverage": "#8b5cf6",
  "documentation-completeness": "#f59e0b",
  "community-activity": "#ec4899",
  "innovation-velocity": "#06b6d4",
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

export default function HealthScorePanel() {
  const [result, setResult] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [fileCount, setFileCount] = useState("100");
  const [testFileCount, setTestFileCount] = useState("20");
  const [docFileCount, setDocFileCount] = useState("5");

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            repoUrl: repoInput || undefined,
            fileCount: parseInt(fileCount) || 0,
            testFileCount: parseInt(testFileCount) || 0,
            docFileCount: parseInt(docFileCount) || 0,
            commitCount: 150,
            contributorCount: 3,
            openIssues: 12,
            lastCommitDate: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      // Analysis failed
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">🏥 Innovation Health Score</h1>
      <p className="text-neutral-500 mb-6">
        Analyze any codebase across 6 dimensions to get a composite health score.
      </p>

      {/* Input Form */}
      <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium mb-1 block">Repository URL</label>
            <input
              type="url"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Source Files</label>
            <input
              type="number"
              value={fileCount}
              onChange={(e) => setFileCount(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Test Files</label>
            <input
              type="number"
              value={testFileCount}
              onChange={(e) => setTestFileCount(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Doc Files</label>
            <input
              type="number"
              value={docFileCount}
              onChange={(e) => setDocFileCount(e.target.value)}
              className="w-full px-3 py-2 border rounded dark:bg-neutral-800 dark:border-neutral-600 text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? "Analyzing..." : "🔍 Analyze Health"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Overall Score */}
          <div className="text-center p-8 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className={`text-6xl font-bold ${getScoreColor(result.overall)}`}>
              {result.overall}
            </div>
            <p className="text-lg text-neutral-500 mt-2">/ 100</p>
            <p className="text-sm mt-3">{result.summary}</p>
          </div>

          {/* Radar Chart (CSS-based) */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">📊 Health Radar</h3>
            <div className="space-y-3">
              {result.axes.map((axis) => (
                <div key={axis.axis}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{axis.label}</span>
                    <span className={`text-sm font-bold ${getScoreColor(axis.score)}`}>
                      {axis.score}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${axis.score}%`,
                        backgroundColor: AXIS_COLORS[axis.axis] ?? "#6b7280",
                      }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">{axis.details}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
              <h3 className="font-semibold mb-2 text-green-800 dark:text-green-200">
                💪 Strengths
              </h3>
              <ul className="space-y-1">
                {result.topStrengths.map((s, i) => (
                  <li key={i} className="text-sm text-green-700 dark:text-green-300">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
              <h3 className="font-semibold mb-2 text-red-800 dark:text-red-200">⚠️ Weaknesses</h3>
              <ul className="space-y-1">
                {result.topWeaknesses.map((w, i) => (
                  <li key={i} className="text-sm text-red-700 dark:text-red-300">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Improvement Ideas */}
          {result.improvementIdeas.length > 0 && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
              <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">
                💡 Improvement Ideas
              </h3>
              <ul className="space-y-1">
                {result.improvementIdeas.map((idea, i) => (
                  <li key={i} className="text-sm text-blue-700 dark:text-blue-300">
                    • {idea}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-Axis Suggestions */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-3">🎯 Detailed Suggestions</h3>
            <div className="space-y-4">
              {result.axes
                .filter((a) => a.suggestions.length > 0)
                .map((axis) => (
                  <div key={axis.axis}>
                    <h4 className="text-sm font-medium mb-1">{axis.label}</h4>
                    <ul className="space-y-1">
                      {axis.suggestions.map((s, i) => (
                        <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">
                          → {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
