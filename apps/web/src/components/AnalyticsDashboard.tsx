/**
 * @description Innovation analytics dashboard with time-series charts, angle usage stats, and session metrics.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface TimeSeriesPoint {
  date: string;
  value: number;
}

interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  value: number;
}

interface ROIData {
  investment: { totalSessions: number; totalCost: number };
  returns: { totalIdeas: number; totalValue: number };
  roi: { roiPercent: number; netValue: number; costPerIdea: number; valuePerSession: number };
  currency: string;
}

type ViewTab = "overview" | "velocity" | "heatmap" | "leaderboard" | "roi";

export default function AnalyticsDashboard() {
  const [tab, setTab] = useState<ViewTab>("overview");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roi, setROI] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, tsRes, heatmapRes, lbRes] = await Promise.all([
        fetch("/api/analytics").then((r) => r.json()).catch(() => null),
        fetch("/api/analytics?view=timeseries&metric=sessions&granularity=day").then((r) => r.json()).catch(() => null),
        fetch("/api/analytics?view=heatmap&type=hour-day").then((r) => r.json()).catch(() => null),
        fetch("/api/analytics?view=leaderboard&metric=ideas&limit=10").then((r) => r.json()).catch(() => null),
      ]);

      if (summaryRes?.summary) setSummary(summaryRes.summary);
      if (tsRes?.timeSeries) setTimeSeries(tsRes.timeSeries);
      if (heatmapRes?.heatmap) setHeatmap(heatmapRes.heatmap);
      if (lbRes?.leaderboard) setLeaderboard(lbRes.leaderboard);

      // Fetch ROI
      const roiRes = await fetch("/api/analytics?view=roi").then((r) => r.json()).catch(() => null);
      if (roiRes?.roi) setROI(roiRes.roi);
    } catch {
      // Data fetch failures are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const TABS: { id: ViewTab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "velocity", label: "Velocity", icon: "📈" },
    { id: "heatmap", label: "Heatmap", icon: "🔥" },
    { id: "leaderboard", label: "Leaderboard", icon: "🏆" },
    { id: "roi", label: "ROI", icon: "💰" },
  ];

  return (
    <div className="bg-gray-950 text-white min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">📊 Innovation Analytics</h1>
        <p className="text-gray-400 mb-8">Track innovation velocity, quality, and ROI</p>

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

        {loading && (
          <div className="text-center py-20 text-gray-500">Loading analytics...</div>
        )}

        {!loading && (
          <>
            {/* Overview */}
            {tab === "overview" && summary && (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Total Sessions", value: summary.totalSessions ?? 0, color: "text-blue-400" },
                    { label: "Ideas Generated", value: summary.totalIdeas ?? 0, color: "text-green-400" },
                    { label: "Avg Quality", value: summary.averageScore ?? "N/A", color: "text-purple-400" },
                    { label: "Active Angles", value: summary.anglesUsed ?? 0, color: "text-orange-400" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                      <div className={`text-3xl font-bold ${stat.color}`}>{String(stat.value)}</div>
                      <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Velocity Chart */}
            {tab === "velocity" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <h3 className="font-semibold mb-4">Session Velocity (Last 30 Days)</h3>
                {timeSeries.length > 0 ? (
                  <div className="flex items-end gap-1 h-48">
                    {timeSeries.slice(-30).map((point, i) => {
                      const maxVal = Math.max(...timeSeries.map((p) => p.value), 1);
                      const height = (point.value / maxVal) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-blue-600 rounded-t hover:bg-blue-500 transition relative group"
                          style={{ height: `${Math.max(height, 2)}%` }}
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                            {point.date}: {point.value}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-12">No velocity data yet. Run some innovation sessions!</p>
                )}
              </div>
            )}

            {/* Heatmap */}
            {tab === "heatmap" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <h3 className="font-semibold mb-4">Activity Heatmap</h3>
                {heatmap.length > 0 ? (
                  <div className="grid grid-cols-7 gap-1">
                    {heatmap.slice(0, 168).map((cell, i) => {
                      const maxVal = Math.max(...heatmap.map((c) => c.value), 1);
                      const intensity = cell.value / maxVal;
                      return (
                        <div
                          key={i}
                          className="aspect-square rounded-sm"
                          style={{
                            backgroundColor: intensity > 0
                              ? `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`
                              : "rgba(255, 255, 255, 0.05)",
                          }}
                          title={`${cell.row} × ${cell.col}: ${cell.value}`}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-12">No activity data yet.</p>
                )}
              </div>
            )}

            {/* Leaderboard */}
            {tab === "leaderboard" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                <h3 className="font-semibold mb-4">🏆 Innovation Leaderboard</h3>
                {leaderboard.length > 0 ? (
                  <div className="space-y-2">
                    {leaderboard.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-4 py-3 bg-gray-800/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-bold ${i < 3 ? "text-yellow-400" : "text-gray-500"}`}>
                            #{entry.rank}
                          </span>
                          <span className="font-medium">{entry.name}</span>
                        </div>
                        <span className="text-blue-400 font-semibold">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-12">No leaderboard data yet.</p>
                )}
              </div>
            )}

            {/* ROI */}
            {tab === "roi" && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                    <div className="text-sm text-gray-500 mb-1">Total Investment</div>
                    <div className="text-2xl font-bold text-red-400">
                      {roi ? `${roi.currency} ${roi.investment.totalCost.toLocaleString()}` : "—"}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {roi?.investment.totalSessions ?? 0} sessions
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                    <div className="text-sm text-gray-500 mb-1">Estimated Returns</div>
                    <div className="text-2xl font-bold text-green-400">
                      {roi ? `${roi.currency} ${roi.returns.totalValue.toLocaleString()}` : "—"}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {roi?.returns.totalIdeas ?? 0} ideas generated
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                    <div className="text-sm text-gray-500 mb-1">ROI</div>
                    <div className={`text-2xl font-bold ${(roi?.roi.roiPercent ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {roi ? `${roi.roi.roiPercent}%` : "—"}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Net: {roi ? `${roi.currency} ${roi.roi.netValue.toLocaleString()}` : "—"}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  <h3 className="font-semibold mb-4">ROI Breakdown</h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Cost Per Idea</h4>
                      <div className="text-xl font-semibold">
                        {roi ? `${roi.currency} ${roi.roi.costPerIdea}` : "—"}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Value Per Session</h4>
                      <div className="text-xl font-semibold">
                        {roi ? `${roi.currency} ${roi.roi.valuePerSession}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
