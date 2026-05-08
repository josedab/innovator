"use client";

import { useState, useEffect, useMemo } from "react";

interface AnalyticsSummary {
  totalPipelines: number;
  totalIdeas: number;
  totalAnglesUsed: number;
  successRate: number;
  averageDurationMs: number;
  ideasOverTime: Array<{ date: string; count: number }>;
  angleUsage: Array<{ angleId: string; count: number; successRate: number }>;
  subjectWordCloud: Array<{ word: string; count: number }>;
  sessionFrequency: Array<{ date: string; count: number }>;
  topModels: Array<{ model: string; count: number }>;
}

interface AnalyticsInsight {
  id: string;
  type: "pattern" | "recommendation" | "anomaly";
  title: string;
  description: string;
  confidence: number;
}

type TabId = "overview" | "trends" | "quality" | "team" | "roi";

const INSIGHT_ICONS = {
  pattern: "📊",
  recommendation: "💡",
  anomaly: "⚠️",
};

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "trends", label: "Trends", icon: "📈" },
  { id: "quality", label: "Quality", icon: "⭐" },
  { id: "team", label: "Team", icon: "👥" },
  { id: "roi", label: "ROI", icon: "💰" },
];

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [drillDownAngle, setDrillDownAngle] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load analytics");
        const data = await res.json();
        setSummary(data.summary);
        setInsights(data.insights);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Derived metrics
  const derivedMetrics = useMemo(() => {
    if (!summary) return null;

    const velocity =
      summary.sessionFrequency.length > 0
        ? summary.totalIdeas / Math.max(summary.sessionFrequency.length, 1)
        : 0;

    const topAngle = summary.angleUsage[0];
    const worstAngle = [...summary.angleUsage].sort((a, b) => a.successRate - b.successRate)[0];

    const biasIndex =
      summary.angleUsage.length > 1
        ? (Math.max(...summary.angleUsage.map((a) => a.count)) -
            Math.min(...summary.angleUsage.map((a) => a.count))) /
          Math.max(...summary.angleUsage.map((a) => a.count))
        : 0;

    // Weekly heatmap data (last 12 weeks, 7 days)
    const heatmap: number[][] = [];
    for (let w = 0; w < 12; w++) {
      const week: number[] = [];
      for (let d = 0; d < 7; d++) {
        const idx = w * 7 + d;
        const freq = summary.sessionFrequency[summary.sessionFrequency.length - 1 - idx];
        week.push(freq?.count ?? 0);
      }
      heatmap.push(week);
    }

    return { velocity, topAngle, worstAngle, biasIndex, heatmap };
  }, [summary]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse text-center py-20">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-neutral-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <p className="text-red-500">{error ?? "No analytics data available"}</p>
          <p className="text-sm text-neutral-500 mt-2">
            Run some innovation pipelines first to generate analytics data.
          </p>
        </div>
      </div>
    );
  }

  const maxIdeas = Math.max(...summary.ideasOverTime.map((d) => d.count), 1);
  const maxAngle = Math.max(...summary.angleUsage.map((a) => a.count), 1);
  const maxWord = Math.max(...summary.subjectWordCloud.map((w) => w.count), 1);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">📊 Innovation Analytics</h1>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
            className="text-sm border rounded px-2 py-1 bg-white dark:bg-gray-800"
            aria-label="Time range"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
              activeTab === tab.id
                ? "bg-white dark:bg-gray-800 border border-b-white dark:border-b-gray-800 -mb-px text-blue-600"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard label="Pipelines" value={summary.totalPipelines} icon="🔄" />
            <StatCard label="Ideas Generated" value={summary.totalIdeas} icon="💡" />
            <StatCard label="Angles Used" value={summary.totalAnglesUsed} icon="📐" />
            <StatCard
              label="Success Rate"
              value={`${Math.round(summary.successRate * 100)}%`}
              icon="✅"
              trend={
                summary.successRate >= 0.8 ? "up" : summary.successRate < 0.5 ? "down" : undefined
              }
            />
            <StatCard
              label="Avg Duration"
              value={`${Math.round(summary.averageDurationMs / 1000)}s`}
              icon="⏱️"
            />
          </div>

          {/* Velocity & Bias metrics */}
          {derivedMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Innovation Velocity"
                value={`${derivedMetrics.velocity.toFixed(1)}/day`}
                icon="🚀"
              />
              <StatCard
                label="Angle Diversity"
                value={`${Math.round((1 - derivedMetrics.biasIndex) * 100)}%`}
                icon="🎯"
                trend={derivedMetrics.biasIndex < 0.3 ? "up" : "down"}
              />
              <StatCard
                label="Top Angle"
                value={derivedMetrics.topAngle?.angleId ?? "N/A"}
                icon="🏆"
              />
              <StatCard label="Models Used" value={summary.topModels.length} icon="🤖" />
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">🧠 AI Insights</h2>
              <div className="space-y-3">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 flex gap-3"
                  >
                    <span className="text-2xl">{INSIGHT_ICONS[insight.type]}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{insight.title}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
                          {Math.round(insight.confidence * 100)}% confidence
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {insight.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Ideas Over Time */}
            {summary.ideasOverTime.length > 0 && (
              <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h3 className="font-semibold mb-4">📈 Ideas Over Time</h3>
                <div className="flex items-end gap-1 h-40">
                  {summary.ideasOverTime.slice(-30).map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                      <div
                        className="w-full bg-indigo-500 rounded-t opacity-80 hover:opacity-100 transition min-h-[2px]"
                        style={{ height: `${(d.count / maxIdeas) * 100}%` }}
                        title={`${d.date}: ${d.count} ideas`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-neutral-500 mt-1">
                  <span>{summary.ideasOverTime[0]?.date}</span>
                  <span>{summary.ideasOverTime[summary.ideasOverTime.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* Angle Usage with drill-down */}
            {summary.angleUsage.length > 0 && (
              <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h3 className="font-semibold mb-4">📐 Angle Usage</h3>
                <div className="space-y-2">
                  {summary.angleUsage.map((a) => (
                    <button
                      key={a.angleId}
                      className="w-full flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded p-1 -m-1 transition"
                      onClick={() =>
                        setDrillDownAngle(drillDownAngle === a.angleId ? null : a.angleId)
                      }
                    >
                      <span className="text-xs w-28 truncate text-neutral-600 dark:text-neutral-400 text-left">
                        {a.angleId}
                      </span>
                      <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded h-4 overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 rounded"
                          style={{ width: `${(a.count / maxAngle) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-neutral-500 w-8 text-right">{a.count}</span>
                      <span
                        className={`text-xs w-12 text-right ${a.successRate >= 0.8 ? "text-green-500" : a.successRate < 0.5 ? "text-red-500" : "text-yellow-500"}`}
                      >
                        {Math.round(a.successRate * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
                {drillDownAngle && (
                  <div className="mt-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <h4 className="text-sm font-semibold mb-2">Drill-down: {drillDownAngle}</h4>
                    {(() => {
                      const a = summary.angleUsage.find((x) => x.angleId === drillDownAngle);
                      if (!a) return null;
                      return (
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center">
                            <div className="text-lg font-bold">{a.count}</div>
                            <div className="text-neutral-500">Uses</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold">
                              {Math.round(a.successRate * 100)}%
                            </div>
                            <div className="text-neutral-500">Success</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold">
                              {Math.round((a.count / summary.totalAnglesUsed) * 100)}%
                            </div>
                            <div className="text-neutral-500">Share</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Word Cloud */}
            {summary.subjectWordCloud.length > 0 && (
              <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h3 className="font-semibold mb-4">☁️ Subject Word Cloud</h3>
                <div className="flex flex-wrap gap-2">
                  {summary.subjectWordCloud.slice(0, 30).map((w) => {
                    const size = 12 + (w.count / maxWord) * 16;
                    const opacity = 0.4 + (w.count / maxWord) * 0.6;
                    return (
                      <span
                        key={w.word}
                        className="text-indigo-600 dark:text-indigo-400"
                        style={{ fontSize: `${size}px`, opacity }}
                      >
                        {w.word}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Model Usage */}
            {summary.topModels.length > 0 && (
              <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h3 className="font-semibold mb-4">🤖 Model Usage</h3>
                <div className="space-y-2">
                  {summary.topModels.map((m) => (
                    <div key={m.model} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-700 dark:text-neutral-300">{m.model}</span>
                      <span className="font-mono text-neutral-500">{m.count}x</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Trends Tab */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          {/* Activity Heatmap */}
          {derivedMetrics && (
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-4">🗓️ Activity Heatmap</h3>
              <div className="flex gap-1">
                {derivedMetrics.heatmap.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-1">
                    {week.map((count, di) => {
                      const maxCount = Math.max(...derivedMetrics.heatmap.flatMap((w) => w), 1);
                      const intensity = count / maxCount;
                      return (
                        <div
                          key={di}
                          className="w-4 h-4 rounded-sm"
                          style={{
                            backgroundColor:
                              count === 0
                                ? "#f3f4f6"
                                : `rgba(34, 197, 94, ${0.2 + intensity * 0.8})`,
                          }}
                          title={`${count} sessions`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-neutral-500">
                <span>Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-sm"
                    style={{
                      backgroundColor: i === 0 ? "#f3f4f6" : `rgba(34, 197, 94, ${0.2 + i * 0.8})`,
                    }}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          )}

          {/* Session Frequency */}
          {summary.sessionFrequency.length > 0 && (
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-4">📆 Session Frequency</h3>
              <div className="flex items-end gap-1 h-32">
                {summary.sessionFrequency.slice(-30).map((d, i) => {
                  const maxFreq = Math.max(
                    ...summary.sessionFrequency.slice(-30).map((s) => s.count),
                    1
                  );
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className="w-full bg-green-500 rounded-t min-h-[2px]"
                        style={{ height: `${(d.count / maxFreq) * 100}%` }}
                        title={`${d.date}: ${d.count} sessions`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Innovation Velocity Trend */}
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">🚀 Innovation Velocity</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{summary.totalIdeas}</div>
                <div className="text-xs text-neutral-500">Total Ideas</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {summary.sessionFrequency.length > 0
                    ? (summary.totalPipelines / summary.sessionFrequency.length).toFixed(1)
                    : "0"}
                </div>
                <div className="text-xs text-neutral-500">Pipelines/Day</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {summary.totalPipelines > 0
                    ? (summary.totalIdeas / summary.totalPipelines).toFixed(1)
                    : "0"}
                </div>
                <div className="text-xs text-neutral-500">Ideas/Pipeline</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quality Tab */}
      {activeTab === "quality" && (
        <div className="space-y-6">
          {/* Angle Leaderboard */}
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">🏆 Angle Leaderboard</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b">
                  <th className="pb-2">Rank</th>
                  <th className="pb-2">Angle</th>
                  <th className="pb-2 text-right">Uses</th>
                  <th className="pb-2 text-right">Success Rate</th>
                  <th className="pb-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {[...summary.angleUsage]
                  .sort((a, b) => b.count * b.successRate - a.count * a.successRate)
                  .map((a, i) => (
                    <tr
                      key={a.angleId}
                      className="border-b border-neutral-100 dark:border-neutral-800"
                    >
                      <td className="py-2">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </td>
                      <td className="py-2 font-medium">{a.angleId}</td>
                      <td className="py-2 text-right">{a.count}</td>
                      <td className="py-2 text-right">
                        <span
                          className={
                            a.successRate >= 0.8
                              ? "text-green-600"
                              : a.successRate < 0.5
                                ? "text-red-600"
                                : "text-yellow-600"
                          }
                        >
                          {Math.round(a.successRate * 100)}%
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono">
                        {(a.count * a.successRate).toFixed(1)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Bias Frequency */}
          {derivedMetrics && (
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-4">🎯 Diversity & Bias Index</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        derivedMetrics.biasIndex < 0.3
                          ? "bg-green-500"
                          : derivedMetrics.biasIndex < 0.6
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{
                        width: `${(1 - derivedMetrics.biasIndex) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium">
                  {Math.round((1 - derivedMetrics.biasIndex) * 100)}% diverse
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {derivedMetrics.biasIndex < 0.3
                  ? "Great diversity! You're exploring angles evenly."
                  : derivedMetrics.biasIndex < 0.6
                    ? "Moderate bias detected. Consider trying underused angles."
                    : "High bias toward certain angles. Try diversifying your approach."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Team Tab */}
      {activeTab === "team" && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">👥 Team Creativity Patterns</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{summary.totalPipelines}</div>
                <div className="text-xs text-neutral-500">Total Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.angleUsage.length}</div>
                <div className="text-xs text-neutral-500">Angles Explored</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {summary.totalPipelines > 0
                    ? Math.round(summary.totalIdeas / summary.totalPipelines)
                    : 0}
                </div>
                <div className="text-xs text-neutral-500">Avg Ideas/Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.topModels.length}</div>
                <div className="text-xs text-neutral-500">Models Used</div>
              </div>
            </div>
          </div>

          {/* Session Patterns */}
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">📅 Session Patterns</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Most active periods and topic evolution are tracked here. Invite team members to
              collaborative sessions to see team-level patterns.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded">
                <div className="text-sm font-medium">Peak Activity</div>
                <div className="text-xs text-neutral-500">
                  {summary.sessionFrequency.length > 0
                    ? [...summary.sessionFrequency].sort((a, b) => b.count - a.count)[0]?.date
                    : "No data yet"}
                </div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded">
                <div className="text-sm font-medium">Most Explored Topic</div>
                <div className="text-xs text-neutral-500">
                  {summary.subjectWordCloud[0]?.word ?? "No data yet"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROI Tab */}
      {activeTab === "roi" && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">💰 Innovation ROI Calculator</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{summary.totalIdeas}</div>
                <div className="text-xs text-neutral-500">Ideas Generated</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{Math.round(summary.totalIdeas * 0.15)}</div>
                <div className="text-xs text-neutral-500">Est. Actionable</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {Math.round(summary.averageDurationMs / 1000 / 60)}m
                </div>
                <div className="text-xs text-neutral-500">Time/Pipeline</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {Math.round((summary.totalPipelines * summary.averageDurationMs) / 1000 / 3600)}h
                </div>
                <div className="text-xs text-neutral-500">Total Time Invested</div>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">📊 Executive Summary</h3>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p>
                Your innovation pipeline has generated <strong>{summary.totalIdeas} ideas</strong>{" "}
                across <strong>{summary.totalPipelines} sessions</strong> with a{" "}
                <strong>{Math.round(summary.successRate * 100)}% success rate</strong>.
              </p>
              <p>
                {summary.angleUsage.length > 0
                  ? `Most effective angle: "${summary.angleUsage[0].angleId}" (${Math.round(summary.angleUsage[0].successRate * 100)}% success rate).`
                  : "Run more sessions to identify your most effective angles."}
              </p>
              <p>
                {derivedMetrics && derivedMetrics.biasIndex > 0.5
                  ? "Consider diversifying your angle usage to discover more novel ideas."
                  : "Good diversity in angle usage — continue exploring different perspectives."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold flex items-center justify-center gap-1">
        {value}
        {trend && (
          <span className={`text-sm ${trend === "up" ? "text-green-500" : "text-red-500"}`}>
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
