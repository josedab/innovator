/**
 * @description Interactive dependency graph visualization showing relationships between ideas.
 */
"use client";

import { useState } from "react";
import type { IdeaDependencyGraph } from "@innovator/core/types";

interface DependencyGraphViewProps {
  graph: IdeaDependencyGraph;
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  enables: "#27ae60",
  requires: "#2980b9",
  conflicts: "#e74c3c",
  complements: "#8e44ad",
  extends: "#f39c12",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  enables: "→ enables",
  requires: "⋯→ requires",
  conflicts: "✕ conflicts",
  complements: "↔ complements",
  extends: "⇒ extends",
};

export default function DependencyGraphView({ graph }: DependencyGraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const selectedEdges = selectedNode
    ? graph.edges.filter((e) => e.source === selectedNode || e.target === selectedNode)
    : [];

  const _connectedNodeIds = new Set(selectedEdges.flatMap((e) => [e.source, e.target]));

  return (
    <div className="border rounded-lg p-4 my-4">
      <h3 className="text-lg font-semibold mb-4">🔗 Idea Dependency Graph</h3>

      {/* Implementation Sequence */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">Implementation Sequence</h4>
        <div className="flex flex-wrap gap-2">
          {graph.sequencedPlan.map((phase) => (
            <div key={phase.phase} className="border rounded p-3 min-w-[200px]">
              <div className="text-sm font-bold text-blue-600 mb-1">Phase {phase.phase}</div>
              {phase.nodeIds.map((nodeId) => {
                const node = graph.nodes.find((n) => n.id === nodeId);
                if (!node) return null;
                return (
                  <div
                    key={nodeId}
                    className={`text-xs p-1 rounded cursor-pointer mb-1 ${
                      node.isCriticalPath ? "bg-red-100 border-red-300 border" : "bg-gray-50"
                    } ${selectedNode === nodeId ? "ring-2 ring-blue-500" : ""}`}
                    onClick={() => setSelectedNode(selectedNode === nodeId ? null : nodeId)}
                    title={`Impact: ${node.impactScore}/10, Complexity: ${node.complexityScore}/10`}
                  >
                    {node.isCriticalPath && "⚡ "}
                    {node.title}
                  </div>
                );
              })}
              <div className="text-xs text-gray-500 mt-1">{phase.rationale}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Relationships Table */}
      {graph.edges.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">Relationships ({graph.edges.length})</h4>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr>
                  <th className="p-2 text-left border">Source</th>
                  <th className="p-2 text-center border">Relationship</th>
                  <th className="p-2 text-left border">Target</th>
                  <th className="p-2 text-center border">Strength</th>
                </tr>
              </thead>
              <tbody>
                {graph.edges.map((edge, idx) => {
                  const source = graph.nodes.find((n) => n.id === edge.source);
                  const target = graph.nodes.find((n) => n.id === edge.target);
                  const isHighlighted =
                    selectedNode && (edge.source === selectedNode || edge.target === selectedNode);
                  return (
                    <tr key={idx} className={isHighlighted ? "bg-blue-50" : ""}>
                      <td className="p-2 border">{source?.title ?? edge.source}</td>
                      <td className="p-2 border text-center">
                        <span
                          className="px-2 py-0.5 rounded text-white text-xs"
                          style={{
                            backgroundColor: RELATIONSHIP_COLORS[edge.relationship] ?? "#999",
                          }}
                        >
                          {edge.relationship}
                        </span>
                      </td>
                      <td className="p-2 border">{target?.title ?? edge.target}</td>
                      <td className="p-2 border text-center">{Math.round(edge.strength * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clusters */}
      {graph.clusters.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">Idea Clusters</h4>
          <div className="flex flex-wrap gap-2">
            {graph.clusters.map((cluster, idx) => (
              <div key={idx} className="border rounded p-2 bg-gray-50">
                <div className="text-sm font-medium">{cluster.label}</div>
                <div className="text-xs text-gray-600">
                  {cluster.nodeIds.length} idea{cluster.nodeIds.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Path */}
      {graph.criticalPath.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">⚡ Critical Path</h4>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {graph.criticalPath.map((nodeId, idx) => {
              const node = graph.nodes.find((n) => n.id === nodeId);
              return (
                <span key={nodeId} className="flex items-center gap-1">
                  <span className="bg-red-100 border border-red-300 rounded px-2 py-1">
                    {node?.title ?? nodeId}
                  </span>
                  {idx < graph.criticalPath.length - 1 && <span className="text-gray-400">→</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 text-xs text-gray-600 mt-4 pt-3 border-t">
        {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: RELATIONSHIP_COLORS[key] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
