"use client";

import { useState, useEffect, useCallback } from "react";

interface TeamMetrics {
  teamId: string;
  period: string;
  periodType: string;
  ideasGenerated: number;
  ideasImplemented: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  avgQualityScore: number;
  qualityTrend: number;
  ideaVelocity: number;
  implementationRate: number;
  topAngles: Array<{ angleId: string; count: number; avgScore: number }>;
  memberActivity: Array<{ userId: string; ideas: number; sessions: number; avgScore: number }>;
  currentStreak: number;
}

interface LeaderboardEntry {
  userId: string;
  totalIdeas: number;
  avgQualityScore: number;
  qualityWeightedScore: number;
  sessionsCompleted: number;
  currentStreak: number;
  rank: number;
}

export default function TeamMetricsPage() {
  const [teamId, setTeamId] = useState("default-team");
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [metrics, setMetrics] = useState<TeamMetrics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, lbRes] = await Promise.all([
        fetch("/api/team-metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "metrics", teamId, periodType }),
        }),
        fetch("/api/team-metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leaderboard", teamId }),
        }),
      ]);
      const metricsData = await metricsRes.json();
      const lbData = await lbRes.json();
      setMetrics(metricsData.metrics);
      setLeaderboard(lbData.leaderboard ?? []);
    } catch {
      // Fetch failed
    } finally {
      setLoading(false);
    }
  }, [teamId, periodType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-2xl">📊</div>
        <p className="text-neutral-500 mt-2">Loading team metrics...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">👥 Team Velocity</h1>
          <p className="text-neutral-500">Track innovation metrics across your team.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="Team ID..."
            className="px-3 py-2 border rounded text-sm dark:bg-neutral-800 dark:border-neutral-600 w-40"
          />
          <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {(["weekly", "monthly"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setPeriodType(period)}
                className={`px-3 py-2 text-sm ${
                  periodType === period ? "bg-blue-600 text-white" : "bg-white dark:bg-neutral-800"
                }`}
              >
                {period === "weekly" ? "7d" : "30d"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {metrics && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
              <p className="text-3xl font-bold">{metrics.ideasGenerated}</p>
              <p className="text-sm text-neutral-500">Ideas Generated</p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
              <p className="text-3xl font-bold">{metrics.ideasImplemented}</p>
              <p className="text-sm text-neutral-500">Implemented</p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
              <p className="text-3xl font-bold">{metrics.avgQualityScore}</p>
              <p className="text-sm text-neutral-500">Avg Quality</p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
              <p className="text-3xl font-bold">{metrics.ideaVelocity}</p>
              <p className="text-sm text-neutral-500">Ideas/Day</p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center">
              <p className="text-3xl font-bold text-orange-500">🔥 {metrics.currentStreak}</p>
              <p className="text-sm text-neutral-500">Day Streak</p>
            </div>
          </div>

          {/* Quality Trend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-3">📈 Quality Trend</h3>
              <div className="flex items-center gap-3">
                <span
                  className={`text-2xl ${
                    metrics.qualityTrend > 0
                      ? "text-green-600"
                      : metrics.qualityTrend < 0
                        ? "text-red-600"
                        : "text-neutral-500"
                  }`}
                >
                  {metrics.qualityTrend > 0 ? "↑" : metrics.qualityTrend < 0 ? "↓" : "→"}
                </span>
                <div>
                  <p className="text-lg font-bold">
                    {metrics.qualityTrend > 0 ? "+" : ""}
                    {Math.round(metrics.qualityTrend * 100)}%
                  </p>
                  <p className="text-xs text-neutral-500">vs. previous period</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-3">🎯 Implementation Rate</h3>
              <div className="flex items-center gap-3">
                <div className="w-full h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex-1">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${metrics.implementationRate * 100}%` }}
                  />
                </div>
                <span className="text-lg font-bold">
                  {Math.round(metrics.implementationRate * 100)}%
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {metrics.ideasImplemented} of {metrics.ideasGenerated} ideas
              </p>
            </div>
          </div>

          {/* Top Angles */}
          {metrics.topAngles.length > 0 && (
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-3">📐 Top Performing Angles</h3>
              <div className="space-y-2">
                {metrics.topAngles.map((angle) => (
                  <div
                    key={angle.angleId}
                    className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800"
                  >
                    <span className="text-sm font-medium">{angle.angleId}</span>
                    <div className="flex gap-4 text-xs text-neutral-500">
                      <span>{angle.count} uses</span>
                      <span>Avg: {angle.avgScore}/100</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Member Activity */}
          {metrics.memberActivity.length > 0 && (
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold mb-3">👤 Member Activity</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                      <th className="pb-2">Member</th>
                      <th className="pb-2 text-center">Ideas</th>
                      <th className="pb-2 text-center">Sessions</th>
                      <th className="pb-2 text-center">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.memberActivity.map((member) => (
                      <tr
                        key={member.userId}
                        className="border-b border-neutral-100 dark:border-neutral-800"
                      >
                        <td className="py-2 font-mono text-xs">{member.userId}</td>
                        <td className="py-2 text-center">{member.ideas}</td>
                        <td className="py-2 text-center">{member.sessions}</td>
                        <td className="py-2 text-center">{member.avgScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Leaderboard (opt-in) */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">🏆 Leaderboard</h3>
              <button
                onClick={() => setShowLeaderboard(!showLeaderboard)}
                className="text-xs text-blue-500 hover:underline"
              >
                {showLeaderboard ? "Hide" : "Show"} (opt-in)
              </button>
            </div>
            {showLeaderboard && leaderboard.length > 0 && (
              <div className="space-y-2">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      entry.rank === 1
                        ? "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800"
                        : "bg-neutral-50 dark:bg-neutral-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold w-8">
                        {entry.rank === 1
                          ? "🥇"
                          : entry.rank === 2
                            ? "🥈"
                            : entry.rank === 3
                              ? "🥉"
                              : `#${entry.rank}`}
                      </span>
                      <div>
                        <p className="text-sm font-medium font-mono">{entry.userId}</p>
                        <p className="text-xs text-neutral-500">🔥 {entry.currentStreak}d streak</p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-neutral-500">
                      <span>{entry.totalIdeas} ideas</span>
                      <span>Q: {entry.avgQualityScore}</span>
                      <span className="font-bold text-blue-600">
                        WS: {entry.qualityWeightedScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showLeaderboard && leaderboard.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">
                No data yet. Record team events to populate the leaderboard.
              </p>
            )}
          </div>
        </div>
      )}

      {!metrics && (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-4xl mb-4">📊</p>
          <p>No metrics data available for this team.</p>
          <p className="text-sm mt-1">Start recording innovation events to see team metrics.</p>
        </div>
      )}
    </div>
  );
}
