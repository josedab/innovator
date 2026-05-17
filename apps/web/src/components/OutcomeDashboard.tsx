/**
 * @description Innovation Outcome Dashboard — tracks ideas from genesis to business impact
 * with ROI charts, model effectiveness, team heatmaps, and executive export.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface AngleROIPoint {
  angleId: string;
  ideasGenerated: number;
  ideasShipped: number;
  shipRate: number;
  avgQualityScore: number;
  totalRevenue: number;
  roi: number;
}

interface ModelMetrics {
  model: string;
  totalInvocations: number;
  successRate: number;
  avgLatencyMs: number;
  ideasShipped: number;
}

interface HeatmapCell {
  userId: string;
  week: string;
  ideasGenerated: number;
  ideasShipped: number;
  intensity: number;
}

interface DashboardKPIs {
  totalIdeas: number;
  ideasShipped: number;
  overallShipRate: number;
  totalRevenue: number;
  avgTimeToValueDays: number | null;
  topPerformingModel: string | null;
  topPerformingAngle: string | null;
}

type Tab = "overview" | "angle-roi" | "models" | "team" | "export";

export default function OutcomeDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [angleROI, setAngleROI] = useState<AngleROIPoint[]>([]);
  const [models, setModels] = useState<ModelMetrics[]>([]);
  const [heatmap, setHeatmap] = useState<{
    cells: HeatmapCell[];
    users: string[];
    weeks: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"json" | "markdown" | "csv">("json");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [execRes, roiRes, modelRes, heatRes] = await Promise.all([
        fetch("/api/outcome-tracking?view=executive-export"),
        fetch("/api/outcome-tracking?view=angle-roi"),
        fetch("/api/outcome-tracking?view=model-effectiveness"),
        fetch("/api/outcome-tracking?view=team-heatmap"),
      ]);

      if (execRes.ok) {
        const data = await execRes.json();
        setKpis(data.kpis);
      }
      if (roiRes.ok) {
        const data = await roiRes.json();
        setAngleROI(data.chart ?? []);
      }
      if (modelRes.ok) {
        const data = await modelRes.json();
        setModels(data.metrics ?? []);
      }
      if (heatRes.ok) {
        const data = await heatRes.json();
        setHeatmap(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchData();
    });
  }, [fetchData]);

  const handleExport = useCallback(async () => {
    const url = `/api/outcome-tracking?view=executive-export&format=${exportFormat}`;
    if (exportFormat === "json") {
      const res = await fetch(url);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      downloadBlob(blob, "innovation-report.json");
    } else {
      const res = await fetch(url);
      const text = await res.text();
      const mime = exportFormat === "markdown" ? "text/markdown" : "text/csv";
      const ext = exportFormat === "markdown" ? "md" : "csv";
      downloadBlob(new Blob([text], { type: mime }), `innovation-report.${ext}`);
    }
  }, [exportFormat]);

  if (loading) return <div className="p-6 text-center">Loading outcome dashboard…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Innovation Outcomes Dashboard</h2>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b pb-2">
        {(["overview", "angle-roi", "models", "team", "export"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-t text-sm ${tab === t ? "bg-blue-100 font-semibold border-b-2 border-blue-600" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {t.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Total Ideas" value={kpis.totalIdeas} />
          <KPICard label="Ideas Shipped" value={kpis.ideasShipped} />
          <KPICard label="Ship Rate" value={`${Math.round(kpis.overallShipRate * 100)}%`} />
          <KPICard label="Revenue Impact" value={`$${kpis.totalRevenue.toLocaleString()}`} />
          <KPICard
            label="Avg Time-to-Value"
            value={kpis.avgTimeToValueDays != null ? `${kpis.avgTimeToValueDays}d` : "—"}
          />
          <KPICard label="Top Model" value={kpis.topPerformingModel ?? "—"} />
          <KPICard label="Top Angle" value={kpis.topPerformingAngle ?? "—"} />
        </div>
      )}

      {/* Angle ROI */}
      {tab === "angle-roi" && (
        <div className="space-y-2">
          <h3 className="font-semibold">Per-Angle ROI</h3>
          {angleROI.length === 0 ? (
            <p className="text-gray-500">No angle data yet. Run innovation sessions to populate.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Angle</th>
                  <th className="p-2">Ideas</th>
                  <th className="p-2">Shipped</th>
                  <th className="p-2">Ship Rate</th>
                  <th className="p-2">Revenue</th>
                  <th className="p-2">ROI</th>
                </tr>
              </thead>
              <tbody>
                {angleROI.map((a) => (
                  <tr key={a.angleId} className="border-t">
                    <td className="p-2 font-medium">{a.angleId}</td>
                    <td className="p-2 text-center">{a.ideasGenerated}</td>
                    <td className="p-2 text-center">{a.ideasShipped}</td>
                    <td className="p-2 text-center">{Math.round(a.shipRate * 100)}%</td>
                    <td className="p-2 text-right">${a.totalRevenue.toLocaleString()}</td>
                    <td
                      className="p-2 text-right font-semibold"
                      style={{ color: a.roi > 0 ? "#16a34a" : "#dc2626" }}
                    >
                      {a.roi}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Model Effectiveness */}
      {tab === "models" && (
        <div className="space-y-2">
          <h3 className="font-semibold">Model Effectiveness</h3>
          {models.length === 0 ? (
            <p className="text-gray-500">No model data yet.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Model</th>
                  <th className="p-2">Invocations</th>
                  <th className="p-2">Success Rate</th>
                  <th className="p-2">Avg Latency</th>
                  <th className="p-2">Ideas Shipped</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.model} className="border-t">
                    <td className="p-2 font-medium">{m.model}</td>
                    <td className="p-2 text-center">{m.totalInvocations}</td>
                    <td className="p-2 text-center">{Math.round(m.successRate * 100)}%</td>
                    <td className="p-2 text-center">{m.avgLatencyMs}ms</td>
                    <td className="p-2 text-center">{m.ideasShipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Team Heatmap */}
      {tab === "team" && heatmap && (
        <div className="space-y-2">
          <h3 className="font-semibold">Team Contribution Heatmap</h3>
          {heatmap.users.length === 0 ? (
            <p className="text-gray-500">No team contribution data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-1">User</th>
                    {heatmap.weeks.map((w) => (
                      <th key={w} className="p-1">
                        {w.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.users.map((user) => (
                    <tr key={user}>
                      <td className="p-1 font-medium">{user}</td>
                      {heatmap.weeks.map((week) => {
                        const cell = heatmap.cells.find(
                          (c) => c.userId === user && c.week === week
                        );
                        const intensity = cell?.intensity ?? 0;
                        return (
                          <td
                            key={week}
                            className="p-1 text-center"
                            style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                            title={`${cell?.ideasGenerated ?? 0} ideas, ${cell?.ideasShipped ?? 0} shipped`}
                          >
                            {cell?.ideasGenerated ?? ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Export */}
      {tab === "export" && (
        <div className="space-y-4">
          <h3 className="font-semibold">Executive Summary Export</h3>
          <div className="flex gap-3 items-center">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}
              className="border rounded px-3 py-1"
            >
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
              <option value="csv">CSV</option>
            </select>
            <button
              onClick={handleExport}
              className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700"
            >
              Download Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
