"use client";

import { useEffect, useState, useCallback } from "react";

// ---- Types ----

interface DashboardOverview {
  totalSessions: number;
  totalIdeas: number;
  avgQuality: number;
  topAngles: Array<{ angleId: string; count: number }>;
  trendDirection: "up" | "down" | "stable";
  successRate: number;
  avgDurationMs: number;
  recentEvents: Array<{ id: string; type: string; timestamp: string }>;
}

interface VelocityChartData {
  granularity: string;
  sessions: Array<{ bucket: string; count: number }>;
  ideas: Array<{ bucket: string; count: number }>;
  quality: Array<{ bucket: string; avgQuality: number; count: number }>;
  velocity: {
    sessionsPerWeek: number;
    ideasPerSession: number;
    qualityAvg: number;
    totalSessions: number;
    totalIdeas: number;
  };
}

interface QualityHeatmapData {
  cells: Array<{ angle: string; domain: string; avgQuality: number; count: number }>;
  angles: string[];
  domains: string[];
}

interface TeamComparisonData {
  teams: Array<{
    teamId: string;
    sessions: number;
    ideas: number;
    implementations: number;
    avgQuality: number;
    innovationScore: number;
  }>;
}

interface ROISummaryData {
  totalIdeas: number;
  implementedCount: number;
  estimatedValue: number;
  actualValue: number;
  roi: number;
  implementationRate: number;
  funnelStages: Array<{ stage: string; count: number }>;
}

interface ExecutiveSummaryReport {
  period: string;
  highlights: string[];
  risks: string[];
  recommendations: string[];
  metrics: {
    totalSessions: number;
    totalIdeas: number;
    totalImplementations: number;
    avgQuality: number;
    velocityTrend: string;
    topAngle: string | null;
    topTeam: string | null;
    summary: string;
  };
}

// ---- Tabs ----

type Tab = "overview" | "velocity" | "effectiveness" | "team" | "roi";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "velocity", label: "Velocity", icon: "🚀" },
  { id: "effectiveness", label: "Effectiveness", icon: "🎯" },
  { id: "team", label: "Team", icon: "👥" },
  { id: "roi", label: "ROI", icon: "💰" },
];

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Year", days: 365 },
];

// ---- Helpers ----

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

async function fetchDashboard<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`Dashboard request failed: ${res.statusText}`);
  return res.json();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function qualityColor(score: number): string {
  if (score >= 8) return "bg-green-500 dark:bg-green-600";
  if (score >= 6) return "bg-emerald-400 dark:bg-emerald-500";
  if (score >= 4) return "bg-yellow-400 dark:bg-yellow-500";
  if (score >= 2) return "bg-orange-400 dark:bg-orange-500";
  return "bg-red-400 dark:bg-red-500";
}

const TREND_ICON: Record<string, string> = { up: "📈", down: "📉", stable: "➡️" };

// ---- Component ----

export default function InnovationDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [velocity, setVelocity] = useState<VelocityChartData | null>(null);
  const [heatmap, setHeatmap] = useState<QualityHeatmapData | null>(null);
  const [teamData, setTeamData] = useState<TeamComparisonData | null>(null);
  const [roiData, setRoiData] = useState<ROISummaryData | null>(null);
  const [execSummary, setExecSummary] = useState<ExecutiveSummaryReport | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = getDateRange(rangeDays);

    try {
      const [ov, vel, hm, team, roi, exec] = await Promise.all([
        fetchDashboard<DashboardOverview>("overview", range),
        fetchDashboard<VelocityChartData>("velocity", { granularity: "day", ...range }),
        fetchDashboard<QualityHeatmapData>("heatmap"),
        fetchDashboard<TeamComparisonData>("leaderboard", { limit: 20 }),
        fetchDashboard<ROISummaryData>("roi_summary"),
        fetchDashboard<ExecutiveSummaryReport>("executive_summary", {
          period: `last_${rangeDays}_days`,
        }),
      ]);
      setOverview(ov);
      setVelocity(vel);
      setHeatmap(hm);
      setTeamData(team);
      setRoiData(roi);
      setExecSummary(exec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    try {
      const result = await fetchDashboard<{ markdown: string }>("report", {
        title: "Innovation Portfolio Report",
      });
      const blob = new Blob([result.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `innovation-report-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently
    }
  };

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-red-800 dark:text-red-200">
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (loading || !overview) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-2xl">📊</div>
        <p className="text-neutral-500 mt-2">Loading innovation dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">🚀 Innovation Portfolio Dashboard</h1>
        <div className="flex items-center gap-3">
          {/* Date Range Picker */}
          <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {DATE_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setRangeDays(r.days)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  rangeDays === r.days
                    ? "bg-blue-600 text-white"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Export */}
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            📥 Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Sessions" value={overview.totalSessions} icon="📋" />
        <SummaryCard label="Ideas Generated" value={overview.totalIdeas} icon="💡" />
        <SummaryCard
          label="Avg Quality"
          value={overview.avgQuality > 0 ? overview.avgQuality.toFixed(1) : "—"}
          icon="⭐"
        />
        <SummaryCard
          label="Innovation Velocity"
          value={`${velocity?.velocity.sessionsPerWeek ?? 0}/wk`}
          icon="🚀"
          trend={overview.trendDirection}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-700 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab overview={overview} velocity={velocity} execSummary={execSummary} />
      )}
      {activeTab === "velocity" && <VelocityTab velocity={velocity} />}
      {activeTab === "effectiveness" && <EffectivenessTab heatmap={heatmap} />}
      {activeTab === "team" && <TeamTab teamData={teamData} />}
      {activeTab === "roi" && <ROITab roiData={roiData} />}
    </div>
  );
}

// ---- Sub-Components ----

function SummaryCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg">{icon}</span>
        {trend && <span className="text-xs">{TREND_ICON[trend] ?? ""}</span>}
      </div>
      <p className="text-2xl font-bold">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function OverviewTab({
  overview,
  velocity,
  execSummary,
}: {
  overview: DashboardOverview;
  velocity: VelocityChartData | null;
  execSummary: ExecutiveSummaryReport | null;
}) {
  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {execSummary &&
        (execSummary.highlights.length > 0 || execSummary.recommendations.length > 0) && (
          <div className="p-5 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold mb-3">💡 Executive Summary</h3>
            {execSummary.highlights.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                  Highlights
                </p>
                {execSummary.highlights.map((h, i) => (
                  <p key={i} className="text-sm text-neutral-700 dark:text-neutral-300">
                    • {h}
                  </p>
                ))}
              </div>
            )}
            {execSummary.risks.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Risks</p>
                {execSummary.risks.map((r, i) => (
                  <p key={i} className="text-sm text-neutral-700 dark:text-neutral-300">
                    • {r}
                  </p>
                ))}
              </div>
            )}
            {execSummary.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                  Recommendations
                </p>
                {execSummary.recommendations.map((r, i) => (
                  <p key={i} className="text-sm text-neutral-700 dark:text-neutral-300">
                    • {r}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

      {/* CSS-based Velocity Line Chart */}
      {velocity && velocity.sessions.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">📈 Session Activity</h3>
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-end gap-1 h-32">
              {velocity.sessions.map((point, i) => {
                const max = Math.max(...velocity.sessions.map((s) => s.count), 1);
                const height = (point.count / max) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end"
                    title={`${point.bucket}: ${point.count} sessions`}
                  >
                    <div
                      className="w-full bg-blue-500 dark:bg-blue-400 rounded-t min-h-[2px]"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-neutral-400">
                {velocity.sessions[0]?.bucket ?? ""}
              </span>
              <span className="text-[10px] text-neutral-400">
                {velocity.sessions[velocity.sessions.length - 1]?.bucket ?? ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {overview.recentEvents.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">🕐 Recent Activity</h3>
          <div className="space-y-2">
            {overview.recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{event.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {overview.totalSessions === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-4xl mb-4">🚀</p>
          <p>No innovation sessions yet.</p>
          <p className="text-sm mt-1">
            Start an innovation session to see your dashboard come alive.
          </p>
        </div>
      )}
    </div>
  );
}

function VelocityTab({ velocity }: { velocity: VelocityChartData | null }) {
  if (!velocity) {
    return <p className="text-neutral-500 text-sm">No velocity data available.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Velocity Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold">{velocity.velocity.sessionsPerWeek}</p>
          <p className="text-xs text-neutral-500">Sessions / Week</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold">{velocity.velocity.ideasPerSession}</p>
          <p className="text-xs text-neutral-500">Ideas / Session</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold">{velocity.velocity.totalSessions}</p>
          <p className="text-xs text-neutral-500">Total Sessions</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold">{velocity.velocity.totalIdeas}</p>
          <p className="text-xs text-neutral-500">Total Ideas</p>
        </div>
      </div>

      {/* Ideas Chart */}
      {velocity.ideas.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">💡 Ideas Over Time</h3>
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-end gap-1 h-32">
              {velocity.ideas.map((point, i) => {
                const max = Math.max(...velocity.ideas.map((s) => s.count), 1);
                const height = (point.count / max) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end"
                    title={`${point.bucket}: ${point.count} ideas`}
                  >
                    <div
                      className="w-full bg-purple-500 dark:bg-purple-400 rounded-t min-h-[2px]"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-neutral-400">
                {velocity.ideas[0]?.bucket ?? ""}
              </span>
              <span className="text-[10px] text-neutral-400">
                {velocity.ideas[velocity.ideas.length - 1]?.bucket ?? ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quality Trend */}
      {velocity.quality.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">⭐ Quality Trend</h3>
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-end gap-1 h-32">
              {velocity.quality.map((point, i) => {
                const height = (point.avgQuality / 10) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end"
                    title={`${point.bucket}: avg ${point.avgQuality}`}
                  >
                    <div
                      className={`w-full rounded-t min-h-[2px] ${qualityColor(point.avgQuality)}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EffectivenessTab({ heatmap }: { heatmap: QualityHeatmapData | null }) {
  if (!heatmap || heatmap.cells.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <p className="text-4xl mb-4">🎯</p>
        <p>No effectiveness data available yet.</p>
        <p className="text-sm mt-1">Score ideas to see angle × domain effectiveness.</p>
      </div>
    );
  }

  // Build lookup
  const lookup = new Map<string, number>();
  for (const cell of heatmap.cells) {
    lookup.set(`${cell.angle}::${cell.domain}`, cell.avgQuality);
  }

  return (
    <div>
      <h3 className="font-semibold mb-3">🎯 Angle × Domain Effectiveness</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left font-medium text-neutral-500">Angle / Domain</th>
              {heatmap.domains.map((d) => (
                <th key={d} className="p-2 text-center font-medium text-neutral-500">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.angles.map((angle) => (
              <tr key={angle} className="border-t border-neutral-200 dark:border-neutral-700">
                <td className="p-2 font-medium">{angle}</td>
                {heatmap.domains.map((domain) => {
                  const val = lookup.get(`${angle}::${domain}`);
                  return (
                    <td key={domain} className="p-2 text-center">
                      {val != null ? (
                        <span
                          className={`inline-block w-8 h-8 rounded flex items-center justify-center text-white text-[10px] font-bold ${qualityColor(val)}`}
                        >
                          {val.toFixed(1)}
                        </span>
                      ) : (
                        <span className="inline-block w-8 h-8 rounded bg-neutral-100 dark:bg-neutral-800" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamTab({ teamData }: { teamData: TeamComparisonData | null }) {
  if (!teamData || teamData.teams.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <p className="text-4xl mb-4">👥</p>
        <p>No team data available yet.</p>
        <p className="text-sm mt-1">Assign team IDs to events to see the leaderboard.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-semibold mb-3">🏆 Team Leaderboard</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-700">
              <th className="p-3 text-left font-medium text-neutral-500">Rank</th>
              <th className="p-3 text-left font-medium text-neutral-500">Team</th>
              <th className="p-3 text-right font-medium text-neutral-500">Sessions</th>
              <th className="p-3 text-right font-medium text-neutral-500">Ideas</th>
              <th className="p-3 text-right font-medium text-neutral-500">Implemented</th>
              <th className="p-3 text-right font-medium text-neutral-500">Avg Quality</th>
              <th className="p-3 text-right font-medium text-neutral-500">Score</th>
            </tr>
          </thead>
          <tbody>
            {teamData.teams.map((team, i) => (
              <tr key={team.teamId} className="border-b border-neutral-100 dark:border-neutral-800">
                <td className="p-3 font-bold text-neutral-400">{i + 1}</td>
                <td className="p-3 font-medium">{team.teamId}</td>
                <td className="p-3 text-right">{team.sessions}</td>
                <td className="p-3 text-right">{team.ideas}</td>
                <td className="p-3 text-right">{team.implementations}</td>
                <td className="p-3 text-right">{team.avgQuality.toFixed(1)}</td>
                <td className="p-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                  {team.innovationScore.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ROITab({ roiData }: { roiData: ROISummaryData | null }) {
  if (!roiData) {
    return <p className="text-neutral-500 text-sm">No ROI data available.</p>;
  }

  return (
    <div className="space-y-6">
      {/* ROI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold">{formatNumber(roiData.totalIdeas)}</p>
          <p className="text-xs text-neutral-500">Total Ideas</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold">{formatNumber(roiData.implementedCount)}</p>
          <p className="text-xs text-neutral-500">Implemented</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-2xl font-bold text-green-600">${formatNumber(roiData.actualValue)}</p>
          <p className="text-xs text-neutral-500">Actual Value</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p
            className={`text-2xl font-bold ${roiData.roi >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {roiData.roi}%
          </p>
          <p className="text-xs text-neutral-500">ROI</p>
        </div>
      </div>

      {/* Implementation Funnel */}
      <div>
        <h3 className="font-semibold mb-3">🔽 Idea-to-Implementation Funnel</h3>
        <div className="space-y-2">
          {roiData.funnelStages.map((stage, i) => {
            const maxCount = Math.max(...roiData.funnelStages.map((s) => s.count), 1);
            const width = Math.max(5, (stage.count / maxCount) * 100);
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 w-28 text-right shrink-0">
                  {stage.stage}
                </span>
                <div className="flex-1 h-8 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-400 rounded flex items-center px-2"
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-xs text-white font-medium">{stage.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Estimated vs Actual */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800">
        <h3 className="font-semibold mb-2">📊 Value Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-neutral-500">Estimated Value</p>
            <p className="text-lg font-bold">${formatNumber(roiData.estimatedValue)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Actual Value</p>
            <p className="text-lg font-bold text-green-600">${formatNumber(roiData.actualValue)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Implementation Rate</p>
            <p className="text-lg font-bold">{(roiData.implementationRate * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-neutral-500">Return on Investment</p>
            <p
              className={`text-lg font-bold ${roiData.roi >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {roiData.roi}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
