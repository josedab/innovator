"use client";

import { useEffect, useState } from "react";
import type { TrackerDashboard, TrackedIdea } from "@innovator/core/types";

interface DashboardData {
  dashboard: TrackerDashboard;
  recentIdeas: TrackedIdea[];
}

const STATUS_COLORS = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "in-progress": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  unknown: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tracker")
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-red-800 dark:text-red-200">
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-2xl">📊</div>
        <p className="text-neutral-500 mt-2">Loading dashboard...</p>
      </div>
    );
  }

  const { dashboard, recentIdeas } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">📊 Innovation Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-3xl font-bold">{dashboard.totalTracked}</p>
          <p className="text-sm text-neutral-500">Ideas Tracked</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-3xl font-bold">{dashboard.byStatus["in-progress"]}</p>
          <p className="text-sm text-neutral-500">In Progress</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-3xl font-bold">{dashboard.byStatus.closed}</p>
          <p className="text-sm text-neutral-500">Shipped</p>
        </div>
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <p className="text-3xl font-bold text-green-600">
            {Math.round(dashboard.innovationHitRate * 100)}%
          </p>
          <p className="text-sm text-neutral-500">Hit Rate</p>
        </div>
      </div>

      {/* Insights */}
      {dashboard.insights.length > 0 && (
        <div className="mb-8 p-5 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold mb-2">💡 Insights</h3>
          <ul className="space-y-1">
            {dashboard.insights.map((insight, i) => (
              <li key={i} className="text-sm text-neutral-700 dark:text-neutral-300">
                • {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-Angle Performance */}
      {Object.keys(dashboard.byAngle).length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold mb-3">📐 Performance by Angle</h3>
          <div className="space-y-2">
            {Object.entries(dashboard.byAngle).map(([angleId, stats]) => (
              <div
                key={angleId}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <span className="font-medium text-sm">{angleId}</span>
                <div className="flex gap-3 text-xs text-neutral-500">
                  <span>Exported: {stats.exported}</span>
                  <span>Shipped: {stats.shipped}</span>
                  <span>
                    Rate:{" "}
                    {stats.exported > 0 ? Math.round((stats.shipped / stats.exported) * 100) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Ideas */}
      {recentIdeas.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">🕐 Recent Tracked Ideas</h3>
          <div className="space-y-2">
            {recentIdeas.map((idea) => (
              <div
                key={idea.id}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{idea.ideaTitle}</p>
                  <p className="text-xs text-neutral-500">
                    {idea.platform} • {idea.angleId} •{" "}
                    {new Date(idea.exportedAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[idea.status]}`}
                >
                  {idea.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dashboard.totalTracked === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-4xl mb-4">📭</p>
          <p>No ideas tracked yet.</p>
          <p className="text-sm mt-1">
            Export ideas to GitHub Issues, Linear, or Jira to start tracking.
          </p>
        </div>
      )}
    </div>
  );
}
