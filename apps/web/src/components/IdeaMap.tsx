"use client";

import { useMemo, useState, useCallback } from "react";
import type { AngleResult, Synthesis } from "@innovator/core/types";

interface IdeaNode {
  id: string;
  label: string;
  description: string;
  angleId: string;
  angleName: string;
  impactScore: number;
  group: string;
  x: number;
  y: number;
}

interface IdeaEdge {
  source: string;
  target: string;
  weight: number;
  sharedKeywords: string[];
}

const ANGLE_COLORS: Record<string, string> = {
  scamper: "#3B82F6",
  "first-principles": "#EF4444",
  "cross-domain": "#10B981",
  constraints: "#F59E0B",
  inversion: "#8B5CF6",
  perspectives: "#EC4899",
  "what-if": "#06B6D4",
  "trend-collision": "#F97316",
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "this", "that", "it", "its", "not", "no", "as", "if", "also", "more",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .reduce<string[]>((acc, word) => {
      if (!acc.includes(word)) acc.push(word);
      return acc;
    }, []);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

interface IdeaMapProps {
  angleResults: AngleResult[];
  synthesis?: Synthesis | null;
}

/**
 * Interactive SVG-based idea map showing relationships between ideas across angles.
 * Color-coded by angle, sized by estimated impact.
 */
export function IdeaMap({ angleResults, synthesis }: IdeaMapProps) {
  const [selectedNode, setSelectedNode] = useState<IdeaNode | null>(null);
  const [filterAngle, setFilterAngle] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const nodesRaw: Omit<IdeaNode, "x" | "y">[] = [];
    const keywordsMap = new Map<string, string[]>();

    for (const angle of angleResults) {
      for (let i = 0; i < angle.ideas.length; i++) {
        const idea = angle.ideas[i];
        const nodeId = `${angle.angleId}-${i}`;
        const keywords = extractKeywords(`${idea.title} ${idea.description}`);
        keywordsMap.set(nodeId, keywords);

        const text = `${idea.potentialImpact} ${idea.description}`.toLowerCase();
        let score = 5;
        if (text.match(/revolutionary|transformative|breakthrough/)) score += 2;
        if (text.match(/significant|substantial/)) score += 1;

        nodesRaw.push({
          id: nodeId,
          label: idea.title,
          description: idea.description,
          angleId: angle.angleId,
          angleName: angle.angleName,
          impactScore: Math.min(10, score),
          group: angle.angleName,
        });
      }
    }

    // Position nodes in a circular layout grouped by angle
    const angleGroups = [...new Set(nodesRaw.map((n) => n.angleId))];
    const width = 800;
    const height = 600;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const positioned: IdeaNode[] = nodesRaw.map((node, idx) => {
      const groupIdx = angleGroups.indexOf(node.angleId);
      const groupAngle = (groupIdx / angleGroups.length) * 2 * Math.PI - Math.PI / 2;
      const nodesInGroup = nodesRaw.filter((n) => n.angleId === node.angleId);
      const inGroupIdx = nodesInGroup.indexOf(node);
      const spread = 0.3;
      const offset = (inGroupIdx - (nodesInGroup.length - 1) / 2) * 30;

      return {
        ...node,
        x: cx + Math.cos(groupAngle) * radius + Math.cos(groupAngle + Math.PI / 2) * offset,
        y: cy + Math.sin(groupAngle) * radius + Math.sin(groupAngle + Math.PI / 2) * offset,
      };
    });

    // Build edges
    const edgesArr: IdeaEdge[] = [];
    const nodeIds = positioned.map((n) => n.id);
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const kwA = keywordsMap.get(nodeIds[i]) ?? [];
        const kwB = keywordsMap.get(nodeIds[j]) ?? [];
        const sim = jaccardSimilarity(kwA, kwB);
        if (sim >= 0.1) {
          edgesArr.push({
            source: nodeIds[i],
            target: nodeIds[j],
            weight: sim,
            sharedKeywords: kwA.filter((w) => kwB.includes(w)),
          });
        }
      }
    }

    return { nodes: positioned, edges: edgesArr };
  }, [angleResults]);

  const filteredNodes = filterAngle
    ? nodes.filter((n) => n.angleId === filterAngle)
    : nodes;
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
  );

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const uniqueAngles = [...new Set(angleResults.map((a) => a.angleId))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">🗺️ Idea Map</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterAngle(null)}
            className={`text-xs px-2 py-1 rounded-full ${!filterAngle ? "bg-neutral-800 text-white dark:bg-white dark:text-black" : "bg-neutral-100 dark:bg-neutral-800"}`}
          >
            All
          </button>
          {uniqueAngles.map((angleId) => (
            <button
              key={angleId}
              onClick={() => setFilterAngle(filterAngle === angleId ? null : angleId)}
              className="text-xs px-2 py-1 rounded-full transition"
              style={{
                backgroundColor:
                  filterAngle === angleId
                    ? ANGLE_COLORS[angleId] ?? "#6B7280"
                    : "transparent",
                color: filterAngle === angleId ? "white" : ANGLE_COLORS[angleId] ?? "#6B7280",
                border: `1px solid ${ANGLE_COLORS[angleId] ?? "#6B7280"}`,
              }}
            >
              {angleId}
            </button>
          ))}
        </div>
      </div>

      <div className="relative border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden bg-neutral-50 dark:bg-neutral-900">
        <svg viewBox="0 0 800 600" className="w-full h-auto" style={{ minHeight: 400 }}>
          {/* Edges */}
          {filteredEdges.map((edge, i) => {
            const s = nodeMap.get(edge.source);
            const t = nodeMap.get(edge.target);
            if (!s || !t) return null;
            return (
              <line
                key={`edge-${i}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={selectedNode && (selectedNode.id === edge.source || selectedNode.id === edge.target) ? "#6366F1" : "#D1D5DB"}
                strokeWidth={Math.max(0.5, edge.weight * 4)}
                strokeOpacity={selectedNode ? (selectedNode.id === edge.source || selectedNode.id === edge.target ? 0.8 : 0.1) : 0.3}
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const r = 8 + node.impactScore * 1.5;
            const isSelected = selectedNode?.id === node.id;
            return (
              <g
                key={node.id}
                onClick={() => setSelectedNode(isSelected ? null : node)}
                className="cursor-pointer"
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={ANGLE_COLORS[node.angleId] ?? "#6B7280"}
                  fillOpacity={isSelected ? 1 : 0.7}
                  stroke={isSelected ? "#000" : "none"}
                  strokeWidth={isSelected ? 2 : 0}
                />
                <text
                  x={node.x}
                  y={node.y + r + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill="currentColor"
                  className="pointer-events-none select-none"
                >
                  {node.label.length > 25 ? node.label.slice(0, 22) + "..." : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNode && (
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: ANGLE_COLORS[selectedNode.angleId] ?? "#6B7280" }}
            />
            <h4 className="font-semibold">{selectedNode.label}</h4>
            <span className="text-xs text-neutral-500">({selectedNode.angleName})</span>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{selectedNode.description}</p>
          <div className="mt-2 text-xs text-neutral-500">
            Impact: {"⭐".repeat(Math.round(selectedNode.impactScore / 2))}
            {" "}({selectedNode.impactScore}/10)
          </div>
          {filteredEdges
            .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
            .length > 0 && (
            <div className="mt-2 text-xs text-neutral-500">
              Connected to{" "}
              {filteredEdges
                .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                .map((e) => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                  return nodeMap.get(otherId)?.label;
                })
                .filter(Boolean)
                .join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-neutral-500">
        {filteredNodes.length} ideas • {filteredEdges.length} connections • Click a node for details
      </div>
    </div>
  );
}
