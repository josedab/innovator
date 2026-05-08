"use client";

import { useMemo, useState } from "react";

interface ClusterData {
  id: number;
  label: string;
  description: string;
  ideaCount: number;
  avgSimilarity: number;
  ideas: Array<{ id: string; title: string; uniquenessScore: number; isOutlier: boolean }>;
}

interface GapData {
  theme: string;
  description: string;
  relevance: "critical" | "important" | "nice-to-have";
  suggestedAngles: string[];
}

interface DedupStats {
  totalIdeas: number;
  uniqueIdeas: number;
  duplicatesFound: number;
  clustersFormed: number;
  outliersDetected: number;
}

interface ClusterVisualizationProps {
  clusters: ClusterData[];
  gaps: GapData[];
  stats: DedupStats;
  diversityScore: number;
}

const CLUSTER_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
];

const RELEVANCE_COLORS: Record<string, string> = {
  critical: "#EF4444",
  important: "#F59E0B",
  "nice-to-have": "#6B7280",
};

export default function ClusterVisualization({
  clusters,
  gaps,
  stats,
  diversityScore,
}: ClusterVisualizationProps) {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [view, setView] = useState<"clusters" | "gaps">("clusters");

  const maxClusterSize = useMemo(
    () => Math.max(1, ...clusters.map((c) => c.ideaCount)),
    [clusters]
  );

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total Ideas" value={stats.totalIdeas} />
        <StatCard label="Unique" value={stats.uniqueIdeas} />
        <StatCard label="Duplicates" value={stats.duplicatesFound} />
        <StatCard label="Clusters" value={stats.clustersFormed} />
        <StatCard
          label="Diversity"
          value={`${Math.round(diversityScore * 100)}%`}
          color={diversityScore > 0.7 ? "#10B981" : diversityScore > 0.4 ? "#F59E0B" : "#EF4444"}
        />
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("clusters")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === "clusters"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          Clusters ({clusters.length})
        </button>
        <button
          onClick={() => setView("gaps")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === "gaps"
              ? "bg-amber-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          Gaps ({gaps.length})
        </button>
      </div>

      {/* Cluster View */}
      {view === "clusters" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {clusters.map((cluster) => {
            const color = CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length];
            const sizePercent = (cluster.ideaCount / maxClusterSize) * 100;
            const isSelected = selectedCluster === cluster.id;

            return (
              <button
                key={cluster.id}
                onClick={() => setSelectedCluster(isSelected ? null : cluster.id)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-blue-500 shadow-lg"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="font-semibold text-sm truncate">{cluster.label}</h3>
                  <span className="ml-auto text-xs text-gray-500">{cluster.ideaCount} ideas</span>
                </div>

                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                  {cluster.description}
                </p>

                {/* Size bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${sizePercent}%`, backgroundColor: color }}
                  />
                </div>

                <div className="text-xs text-gray-500 mt-1">
                  Similarity: {Math.round(cluster.avgSimilarity * 100)}%
                </div>

                {/* Expanded idea list */}
                {isSelected && (
                  <div className="mt-3 space-y-1 border-t pt-2">
                    {cluster.ideas.map((idea) => (
                      <div key={idea.id} className="flex items-center gap-2 text-xs">
                        {idea.isOutlier && (
                          <span title="Novel outlier" className="text-amber-500">
                            ★
                          </span>
                        )}
                        <span className="truncate">{idea.title}</span>
                        <span className="ml-auto text-gray-400">
                          {Math.round(idea.uniquenessScore * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Gap Analysis View */}
      {view === "gaps" && (
        <div className="space-y-3">
          {gaps.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No significant gaps detected. Your ideation coverage is comprehensive.
            </p>
          ) : (
            gaps.map((gap, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: RELEVANCE_COLORS[gap.relevance] }}
                  >
                    {gap.relevance}
                  </span>
                  <h3 className="font-semibold text-sm">{gap.theme}</h3>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{gap.description}</p>
                {gap.suggestedAngles.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    <span className="text-xs text-gray-500">Try:</span>
                    {gap.suggestedAngles.map((angle) => (
                      <span
                        key={angle}
                        className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs"
                      >
                        {angle}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
