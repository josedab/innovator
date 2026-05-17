/**
 * @description Canvas-based idea dependency graph with drag-and-drop node positioning.
 */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface GraphNode {
  id: string;
  title: string;
  description: string;
  angleId: string;
  feasibility: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship:
    | "builds-on"
    | "conflicts-with"
    | "prerequisite-of"
    | "alternative-to"
    | "complements";
  confidence: number;
}

interface IdeaGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  criticalPath: string[];
}

interface IdeaDependencyGraphProps {
  sessionId: string;
  onClose?: () => void;
}

const EDGE_COLORS: Record<string, string> = {
  "builds-on": "#22c55e",
  "conflicts-with": "#ef4444",
  "prerequisite-of": "#3b82f6",
  "alternative-to": "#f59e0b",
  complements: "#8b5cf6",
};

const ANGLE_COLORS: Record<string, string> = {
  scamper: "#f59e0b",
  "first-principles": "#3b82f6",
  "cross-domain": "#8b5cf6",
  constraints: "#ef4444",
  inversion: "#ec4899",
  perspectives: "#22c55e",
  "what-if": "#06b6d4",
  "trend-collision": "#f97316",
};

const FEAS_RADIUS: Record<string, number> = { high: 24, medium: 18, low: 14 };

/** Interactive force-directed graph visualization of idea relationships. */
export function IdeaDependencyGraph({ sessionId, onClose }: IdeaDependencyGraphProps) {
  const [graph, setGraph] = useState<IdeaGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);

  const WIDTH = 800;
  const HEIGHT = 500;

  const runSimulation = useCallback((data: IdeaGraph) => {
    const nodes = data.nodes;
    const edges = data.edges;

    let tick = 0;
    const maxTicks = 200;

    function step() {
      if (tick >= maxTicks) return;
      tick++;

      // Repulsion (all pairs)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[j].x ?? 0) - (nodes[i].x ?? 0);
          const dy = (nodes[j].y ?? 0) - (nodes[i].y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx = (nodes[i].vx ?? 0) - fx;
          nodes[i].vy = (nodes[i].vy ?? 0) - fy;
          nodes[j].vx = (nodes[j].vx ?? 0) + fx;
          nodes[j].vy = (nodes[j].vy ?? 0) + fy;
        }
      }

      // Attraction (edges)
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = (tgt.x ?? 0) - (src.x ?? 0);
        const dy = (tgt.y ?? 0) - (src.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx = (src.vx ?? 0) + fx;
        src.vy = (src.vy ?? 0) + fy;
        tgt.vx = (tgt.vx ?? 0) - fx;
        tgt.vy = (tgt.vy ?? 0) - fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx = (node.vx ?? 0) + (WIDTH / 2 - (node.x ?? 0)) * 0.005;
        node.vy = (node.vy ?? 0) + (HEIGHT / 2 - (node.y ?? 0)) * 0.005;
      }

      // Apply velocity with damping
      const damping = 0.85;
      for (const node of nodes) {
        node.vx = (node.vx ?? 0) * damping;
        node.vy = (node.vy ?? 0) * damping;
        node.x = Math.max(30, Math.min(WIDTH - 30, (node.x ?? 0) + (node.vx ?? 0)));
        node.y = Math.max(30, Math.min(HEIGHT - 30, (node.y ?? 0) + (node.vy ?? 0)));
      }

      nodesRef.current = [...nodes];
      setGraph((prev) => (prev ? { ...prev, nodes: [...nodes] } : null));

      if (tick < maxTicks) {
        animRef.current = requestAnimationFrame(step);
      }
    }

    animRef.current = requestAnimationFrame(step);
  }, []);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/idea-graph/${sessionId}`);
      if (!res.ok) throw new Error((await res.text()) || "Failed to load graph");
      const data: IdeaGraph = await res.json();

      // Initialize positions in a circle
      const cx = WIDTH / 2;
      const cy = HEIGHT / 2;
      const r = Math.min(WIDTH, HEIGHT) * 0.35;
      data.nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / data.nodes.length;
        node.x = cx + r * Math.cos(angle);
        node.y = cy + r * Math.sin(angle);
        node.vx = 0;
        node.vy = 0;
      });

      nodesRef.current = data.nodes;
      setGraph(data);
      runSimulation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [runSimulation, sessionId]);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
        <p className="text-sm text-neutral-500">Building idea dependency graph…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button
          onClick={loadGraph}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold mb-2">Idea Dependency Graph</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Visualize relationships between ideas using AI classification
        </p>
        <button
          onClick={loadGraph}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 transition"
        >
          Generate Graph
        </button>
      </div>
    );
  }

  const critSet = new Set(graph.criticalPath);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Idea Dependency Graph</h3>
        {onClose && (
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 transition">
            ✕
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(EDGE_COLORS).map(([rel, color]) => (
          <div key={rel} className="flex items-center gap-1">
            <div className="h-0.5 w-4" style={{ backgroundColor: color }} />
            <span className="text-neutral-600 dark:text-neutral-400">{rel}</span>
          </div>
        ))}
      </div>

      {/* SVG Graph */}
      <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ maxHeight: "500px" }}
        >
          {/* Edges */}
          {graph.edges.map((edge, i) => {
            const src = graph.nodes.find((n) => n.id === edge.source);
            const tgt = graph.nodes.find((n) => n.id === edge.target);
            if (!src || !tgt) return null;
            const isHovered = hoveredEdge === edge;
            return (
              <line
                key={i}
                x1={src.x ?? 0}
                y1={src.y ?? 0}
                x2={tgt.x ?? 0}
                y2={tgt.y ?? 0}
                stroke={EDGE_COLORS[edge.relationship] ?? "#999"}
                strokeWidth={isHovered ? 3 : 1.5}
                strokeOpacity={edge.confidence}
                strokeDasharray={edge.relationship === "conflicts-with" ? "4,4" : undefined}
                onMouseEnter={() => setHoveredEdge(edge)}
                onMouseLeave={() => setHoveredEdge(null)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const r = FEAS_RADIUS[node.feasibility] ?? 18;
            const fill = ANGLE_COLORS[node.angleId] ?? "#6b7280";
            const isCritical = critSet.has(node.id);
            const isSelected = selected?.id === node.id;
            return (
              <g
                key={node.id}
                onClick={() => setSelected(isSelected ? null : node)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={node.x ?? 0}
                  cy={node.y ?? 0}
                  r={r}
                  fill={fill}
                  stroke={isCritical ? "#000" : isSelected ? "#4f46e5" : "none"}
                  strokeWidth={isCritical ? 3 : isSelected ? 2 : 0}
                  opacity={0.85}
                />
                <text
                  x={node.x ?? 0}
                  y={(node.y ?? 0) + r + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  className="pointer-events-none"
                >
                  {node.title.length > 20 ? node.title.slice(0, 20) + "…" : node.title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected idea details */}
      {selected && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
          <h4 className="font-medium text-neutral-800 dark:text-neutral-200">{selected.title}</h4>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {selected.description}
          </p>
          <div className="flex gap-3 mt-2 text-xs text-neutral-500">
            <span>Angle: {selected.angleId}</span>
            <span>Feasibility: {selected.feasibility}</span>
            {critSet.has(selected.id) && (
              <span className="text-indigo-600 font-medium">On critical path</span>
            )}
          </div>
          <div className="mt-2 text-xs">
            <strong>Connections:</strong>{" "}
            {graph.edges
              .filter((e) => e.source === selected.id || e.target === selected.id)
              .map((e, i) => {
                const otherId = e.source === selected.id ? e.target : e.source;
                const other = graph.nodes.find((n) => n.id === otherId);
                return (
                  <span key={i} className="mr-2">
                    <span style={{ color: EDGE_COLORS[e.relationship] }}>{e.relationship}</span>
                    {" → "}
                    {other?.title ?? otherId}
                  </span>
                );
              })}
            {graph.edges.filter((e) => e.source === selected.id || e.target === selected.id)
              .length === 0 && "None"}
          </div>
        </div>
      )}

      {/* Critical path */}
      {graph.criticalPath.length > 1 && (
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Critical Path</h4>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {graph.criticalPath.map((id, i) => {
              const node = graph.nodes.find((n) => n.id === id);
              return (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-neutral-400">→</span>}
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {node?.title ?? id}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        {graph.nodes.length} ideas · {graph.edges.length} relationships · Node size = feasibility
      </p>
    </div>
  );
}
