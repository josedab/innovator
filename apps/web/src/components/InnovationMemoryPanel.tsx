/**
 * @description Innovation Memory Panel — angle effectiveness heatmap, user bias indicators, and recent insights.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface AngleEffectiveness {
  angleId: string;
  domain: string;
  averageQuality: number;
  sampleCount: number;
}

interface BiasEntry {
  angleId: string;
  count: number;
  percentage: number;
}

interface Recommendation {
  suggestedAngles: Array<{ angleId: string; reason: string; score: number }>;
  pastInsights: Array<{ content: string; domain: string; qualityScore: number }>;
  avoidAngles: Array<{ angleId: string; reason: string }>;
}

type ViewTab = "recommendations" | "effectiveness" | "bias";

export default function InnovationMemoryPanel() {
  const [tab, setTab] = useState<ViewTab>("recommendations");
  const [effectiveness, setEffectiveness] = useState<AngleEffectiveness[]>([]);
  const [bias, setBias] = useState<BiasEntry[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("general");
  const [userId] = useState("default-user");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [effectivenessRes, biasRes, recRes] = await Promise.all([
        fetch("/api/innovation-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "effectiveness", domain }),
        })
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/innovation-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "bias", userId }),
        })
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/innovation-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "recommendations", domain, userId }),
        })
          .then((r) => r.json())
          .catch(() => null),
      ]);

      if (effectivenessRes?.effectiveness) setEffectiveness(effectivenessRes.effectiveness);
      if (biasRes?.bias) setBias(biasRes.bias);
      if (recRes?.recommendations) setRecommendations(recRes.recommendations);
    } catch {
      // Data fetch failures are non-critical
    } finally {
      setLoading(false);
    }
  }, [domain, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const TABS: { id: ViewTab; label: string; icon: string }[] = [
    { id: "recommendations", label: "Recommendations", icon: "💡" },
    { id: "effectiveness", label: "Effectiveness", icon: "🎯" },
    { id: "bias", label: "Bias Analysis", icon: "⚖️" },
  ];

  /** Map quality score (0-10) to a Tailwind-compatible rgba color. */
  function qualityColor(score: number): string {
    const intensity = Math.min(1, score / 10);
    if (score >= 7) return `rgba(34, 197, 94, ${0.3 + intensity * 0.7})`;
    if (score >= 4) return `rgba(234, 179, 8, ${0.3 + intensity * 0.7})`;
    return `rgba(239, 68, 68, ${0.3 + intensity * 0.7})`;
  }

  return (
    <div className="bg-gray-950 text-white min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">🧠 Innovation Memory</h1>
        <p className="text-gray-400 mb-6">
          Track angle effectiveness, detect bias, and get smart recommendations
        </p>

        {/* Domain filter */}
        <div className="mb-6">
          <label className="text-sm text-gray-500 mr-2">Domain:</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={fetchData}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            placeholder="e.g. fintech, healthcare"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-gray-900 p-1 rounded-xl w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-gray-500">Loading memory data...</div>}

        {!loading && (
          <>
            {/* Recommendations Tab */}
            {tab === "recommendations" && (
              <div className="space-y-6">
                {/* Suggested Angles */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  <h3 className="font-semibold mb-4">✨ Suggested Angles</h3>
                  {recommendations?.suggestedAngles &&
                  recommendations.suggestedAngles.length > 0 ? (
                    <div className="space-y-2">
                      {recommendations.suggestedAngles.map((angle, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-4 py-3 bg-gray-800/50 rounded-lg"
                        >
                          <div>
                            <span className="font-medium text-green-400">{angle.angleId}</span>
                            <p className="text-sm text-gray-500 mt-0.5">{angle.reason}</p>
                          </div>
                          <div className="text-sm font-semibold text-blue-400">
                            {(angle.score * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600 text-center py-8">
                      No angle recommendations yet. Run more sessions to build data.
                    </p>
                  )}
                </div>

                {/* Angles to Avoid */}
                {recommendations?.avoidAngles && recommendations.avoidAngles.length > 0 && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                    <h3 className="font-semibold mb-4">⚠️ Angles to Avoid</h3>
                    <div className="space-y-2">
                      {recommendations.avoidAngles.map((angle, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-3 bg-red-900/20 rounded-lg border border-red-900/30"
                        >
                          <span className="font-medium text-red-400">{angle.angleId}</span>
                          <span className="text-sm text-gray-500">{angle.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Past Insights */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  <h3 className="font-semibold mb-4">📝 Recent Insights</h3>
                  {recommendations?.pastInsights && recommendations.pastInsights.length > 0 ? (
                    <div className="space-y-3">
                      {recommendations.pastInsights.map((insight, i) => (
                        <div key={i} className="px-4 py-3 bg-gray-800/50 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">{insight.domain}</span>
                            <span className="text-xs font-semibold text-purple-400">
                              Quality: {insight.qualityScore}/10
                            </span>
                          </div>
                          <p className="text-sm text-gray-300">{insight.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600 text-center py-8">No insights recorded yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Effectiveness Tab — Heatmap Grid */}
            {tab === "effectiveness" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <h3 className="font-semibold mb-4">🎯 Angle Effectiveness Heatmap</h3>
                {effectiveness.length > 0 ? (
                  <>
                    {/* Legend */}
                    <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "rgba(239, 68, 68, 0.7)" }}
                        />
                        Low (&lt;4)
                      </span>
                      <span className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "rgba(234, 179, 8, 0.7)" }}
                        />
                        Medium (4-7)
                      </span>
                      <span className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: "rgba(34, 197, 94, 0.7)" }}
                        />
                        High (&gt;7)
                      </span>
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {effectiveness.map((e, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-4 border border-gray-700/50"
                          style={{ backgroundColor: qualityColor(e.averageQuality) }}
                        >
                          <div className="font-medium text-sm">{e.angleId}</div>
                          <div className="text-xs text-gray-300 mt-1">{e.domain}</div>
                          <div className="text-lg font-bold mt-2">
                            {e.averageQuality.toFixed(1)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {e.sampleCount} sample{e.sampleCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-600 text-center py-12">
                    No effectiveness data yet. Generate ideas to build the heatmap.
                  </p>
                )}
              </div>
            )}

            {/* Bias Analysis Tab */}
            {tab === "bias" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <h3 className="font-semibold mb-4">⚖️ Angle Usage Bias</h3>
                {bias.length > 0 ? (
                  <div className="space-y-3">
                    {bias.map((entry, i) => {
                      const isOverused = entry.percentage > 40;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span
                              className={`font-medium ${isOverused ? "text-yellow-400" : "text-gray-300"}`}
                            >
                              {entry.angleId}
                              {isOverused && " ⚠️"}
                            </span>
                            <span className="text-gray-500">
                              {entry.count} uses ({entry.percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                isOverused ? "bg-yellow-500" : "bg-blue-500"
                              }`}
                              style={{ width: `${Math.min(entry.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {bias.some((b) => b.percentage > 40) && (
                      <div className="mt-4 px-4 py-3 bg-yellow-900/20 border border-yellow-800/30 rounded-lg text-sm text-yellow-300">
                        ⚠️ You may be over-relying on certain angles. Try exploring underused angles
                        to discover fresh perspectives.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-12">
                    No usage data yet. Run sessions to build your bias profile.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
