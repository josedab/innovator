"use client";

import { useState, useEffect } from "react";

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

const INSIGHT_ICONS = {
  pattern: "📊",
  recommendation: "💡",
  anomaly: "⚠️",
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse text-center py-20">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-neutral-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">📊 Innovation Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Pipelines" value={summary.totalPipelines} icon="🔄" />
        <StatCard label="Ideas Generated" value={summary.totalIdeas} icon="💡" />
        <StatCard label="Angles Used" value={summary.totalAnglesUsed} icon="📐" />
        <StatCard
          label="Success Rate"
          value={`${Math.round(summary.successRate * 100)}%`}
          icon="✅"
        />
        <StatCard
          label="Avg Duration"
          value={`${Math.round(summary.averageDurationMs / 1000)}s`}
          icon="⏱️"
        />
      </div>

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
                <div>
                  <h3 className="font-semibold">{insight.title}</h3>
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

        {/* Angle Usage */}
        {summary.angleUsage.length > 0 && (
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold mb-4">📐 Angle Usage</h3>
            <div className="space-y-2">
              {summary.angleUsage.map((a) => (
                <div key={a.angleId} className="flex items-center gap-2">
                  <span className="text-xs w-28 truncate text-neutral-600 dark:text-neutral-400">
                    {a.angleId}
                  </span>
                  <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded h-4 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded"
                      style={{ width: `${(a.count / maxAngle) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-500 w-8 text-right">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subject Word Cloud */}
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
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
