"use client";

import { useState } from "react";

interface ImpactData {
  totalIdeas: number;
  implementedIdeas: number;
  implementationRate: number;
  avgTimeToImplementationDays: number | null;
  totalEstimatedROI: number;
  ideaByStatus: Record<string, number>;
  topPerformers: Array<{
    ideaTitle: string;
    roi: number;
    timeToImplementDays: number;
  }>;
  angleEffectiveness: Array<{
    angleId: string;
    ideasGenerated: number;
    ideasImplemented: number;
    implementationRate: number;
  }>;
}

export default function ImpactDashboard() {
  const [data] = useState<ImpactData>({
    totalIdeas: 0,
    implementedIdeas: 0,
    implementationRate: 0,
    avgTimeToImplementationDays: null,
    totalEstimatedROI: 0,
    ideaByStatus: {},
    topPerformers: [],
    angleEffectiveness: [],
  });

  const statusColors: Record<string, string> = {
    "not-started": "#6B7280",
    "in-progress": "#3B82F6",
    implemented: "#10B981",
    launched: "#8B5CF6",
    abandoned: "#EF4444",
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Innovation Impact Tracker
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track the real-world impact of generated ideas — from concept to implementation
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KPICard label="Total Ideas" value={data.totalIdeas.toString()} icon="💡" />
          <KPICard
            label="Implemented"
            value={data.implementedIdeas.toString()}
            icon="✅"
            color="#10B981"
          />
          <KPICard
            label="Implementation Rate"
            value={`${Math.round(data.implementationRate * 100)}%`}
            icon="📊"
            color={data.implementationRate > 0.3 ? "#10B981" : "#F59E0B"}
          />
          <KPICard
            label="Avg Time to Impl."
            value={
              data.avgTimeToImplementationDays !== null
                ? `${data.avgTimeToImplementationDays}d`
                : "—"
            }
            icon="⏱"
          />
          <KPICard
            label="Estimated ROI"
            value={formatCurrency(data.totalEstimatedROI)}
            icon="💰"
            color="#8B5CF6"
          />
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Ideas by Status
            </h2>
            {Object.keys(data.ideaByStatus).length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No ideas tracked yet. Link ideas to commits, PRs, or tickets to start tracking
                impact.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(data.ideaByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: statusColors[status] ?? "#6B7280" }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize flex-1">
                      {status.replace("-", " ")}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {count}
                    </span>
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${data.totalIdeas > 0 ? (count / data.totalIdeas) * 100 : 0}%`,
                          backgroundColor: statusColors[status] ?? "#6B7280",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Angle Effectiveness */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Angle Effectiveness
            </h2>
            {data.angleEffectiveness.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Track more ideas to see which angles produce the most implementable innovations.
              </p>
            ) : (
              <div className="space-y-3">
                {data.angleEffectiveness.map((angle) => (
                  <div key={angle.angleId} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300 w-32 truncate">
                      {angle.angleId}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{
                            width: `${Math.round(angle.implementationRate * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right">
                        {Math.round(angle.implementationRate * 100)}%
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {angle.ideasImplemented}/{angle.ideasGenerated}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Performers */}
        {data.topPerformers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Top Performing Ideas
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 text-gray-500">Idea</th>
                    <th className="text-right py-2 text-gray-500">Est. ROI</th>
                    <th className="text-right py-2 text-gray-500">Time to Impl.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPerformers.map((performer, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2 text-gray-900 dark:text-white">{performer.ideaTitle}</td>
                      <td className="py-2 text-right text-green-600 font-medium">
                        {formatCurrency(performer.roi)}
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        {performer.timeToImplementDays}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
