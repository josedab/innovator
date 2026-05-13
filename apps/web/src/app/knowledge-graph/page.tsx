"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";

// ---- Types ----

interface GraphNode {
  id: string;
  label: string;
  type: string;
  size: number;
  color: string;
  x: number;
  y: number;
  cluster: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  label: string;
}

interface GraphCluster {
  id: number;
  label: string;
  nodeIds: string[];
  dominantType: string;
  centerX: number;
  centerY: number;
}

interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface InsightSuggestion {
  type: string;
  title: string;
  description: string;
  entityIds: string[];
  confidence: number;
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  sessionCount: number;
  topEntities: Array<{ label: string; type: string; occurrences: number }>;
}

// ---- Constants ----

const TYPE_COLORS: Record<string, string> = {
  concept: "#3b82f6",
  technology: "#22c55e",
  challenge: "#ef4444",
  opportunity: "#f59e0b",
  domain: "#8b5cf6",
  person: "#ec4899",
  organization: "#06b6d4",
  trend: "#f97316",
};

const TYPE_LABELS: Record<string, string> = {
  concept: "Concept",
  technology: "Technology",
  challenge: "Challenge",
  opportunity: "Opportunity",
  domain: "Domain",
  person: "Person",
  organization: "Organization",
  trend: "Trend",
};

const ENTITY_TYPES = Object.keys(TYPE_COLORS);

const SVG_WIDTH = 800;
const SVG_HEIGHT = 600;

// ---- Main Page ----

export default function KnowledgeGraphPage() {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [insights, setInsights] = useState<InsightSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Interaction state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(ENTITY_TYPES));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch graph data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_graph" }),
      });
      if (!res.ok) throw new Error("Failed to load knowledge graph");
      const data = await res.json();
      setLayout(data.layout);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInsights = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "insights" }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setInsights([...(data.knowledgeInsights ?? []), ...(data.structuralInsights ?? [])]);
    } catch {
      // Non-critical; silently ignore
    }
  }, []);

  useEffect(() => {
    loadGraph();
    loadInsights();
  }, [loadGraph, loadInsights]);

  // Expand from a node
  const expandNode = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand", nodeId, depth: 2 }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.neighborhood) {
        setLayout(data.neighborhood);
      }
    } catch {
      // Silently fail for expansion
    }
  }, []);

  // Search handler
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        loadGraph();
        return;
      }
      try {
        const res = await fetch("/api/knowledge-graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", query }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.results && layout) {
          const matchIds = new Set(data.results.map((n: GraphNode) => n.id));
          setLayout({
            ...layout,
            nodes: layout.nodes.map((n) => ({
              ...n,
              color: matchIds.has(n.id) ? n.color : "#374151",
            })),
          });
        }
      } catch {
        // Silently fail
      }
    },
    [layout, loadGraph]
  );

  // Filter nodes by type
  const filteredLayout = useMemo(() => {
    if (!layout) return null;
    const filteredNodes = layout.nodes.filter((n) => typeFilters.has(n.type));
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = layout.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    return { ...layout, nodes: filteredNodes, edges: filteredEdges };
  }, [layout, typeFilters]);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current || (e.target as SVGElement).tagName === "svg") {
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Node neighbors for selected node detail
  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode || !layout) return [];
    return layout.edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    );
  }, [selectedNode, layout]);

  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNode || !layout) return [];
    const neighborIds = selectedNodeEdges.map((e) =>
      e.source === selectedNode.id ? e.target : e.source
    );
    return layout.nodes.filter((n) => neighborIds.includes(n.id));
  }, [selectedNode, layout, selectedNodeEdges]);

  // Toggle type filter
  const toggleType = (type: string) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // ---- Render ----

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-red-800 dark:text-red-200">
          Failed to load knowledge graph: {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-2xl">🕸️</div>
        <p className="text-neutral-500 mt-2">Loading knowledge graph...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h1 className="text-xl font-bold">🕸️ Knowledge Graph Explorer</h1>
        {stats && (
          <div className="flex gap-4 text-sm text-neutral-500">
            <span>{stats.nodeCount} nodes</span>
            <span>{stats.edgeCount} edges</span>
            <span>{stats.sessionCount} sessions</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-neutral-200 dark:border-neutral-800 p-4 overflow-y-auto flex-shrink-0">
          {/* Search */}
          <div className="mb-4">
            <label className="text-xs font-semibold uppercase text-neutral-500 mb-1 block">
              Search
            </label>
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type Filters */}
          <div className="mb-4">
            <label className="text-xs font-semibold uppercase text-neutral-500 mb-2 block">
              Entity Types
            </label>
            <div className="space-y-1">
              {ENTITY_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeFilters.has(type)}
                    onChange={() => toggleType(type)}
                    className="rounded border-neutral-300 dark:border-neutral-600"
                  />
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[type] }}
                  />
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {TYPE_LABELS[type] ?? type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="mb-4">
            <label className="text-xs font-semibold uppercase text-neutral-500 mb-2 block">
              Zoom
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                className="px-3 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
              >
                +
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}
                className="px-3 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
              >
                −
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="px-3 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Top Entities */}
          {stats && stats.topEntities.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase text-neutral-500 mb-2 block">
                Top Entities
              </label>
              <div className="space-y-1">
                {stats.topEntities.slice(0, 8).map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400"
                  >
                    <span className="truncate">{e.label}</span>
                    <span className="text-neutral-400 ml-2">{e.occurrences}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Graph Area */}
        <div className="flex-1 relative overflow-hidden">
          <div
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full h-full"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: "center",
              }}
            >
              {/* Edges */}
              {filteredLayout?.edges.map((edge, i) => {
                const src = filteredLayout.nodes.find((n) => n.id === edge.source);
                const tgt = filteredLayout.nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                return (
                  <line
                    key={`edge-${i}`}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="#6b7280"
                    strokeWidth={Math.max(0.5, edge.weight * 3)}
                    strokeOpacity={0.3}
                  />
                );
              })}

              {/* Nodes */}
              {filteredLayout?.nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode?.id === node.id;
                const radius = Math.max(4, node.size / 2);
                return (
                  <g
                    key={node.id}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(isSelected ? null : node);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      expandNode(node.id);
                    }}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius}
                      fill={node.color}
                      stroke={isSelected ? "#fff" : isHovered ? "#d1d5db" : "none"}
                      strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 0}
                      opacity={0.85}
                    />
                    <text
                      x={node.x}
                      y={node.y + radius + 10}
                      textAnchor="middle"
                      fontSize={9}
                      fill="currentColor"
                      className="pointer-events-none select-none"
                      opacity={isSelected || isHovered || node.size > 15 ? 1 : 0.6}
                    >
                      {node.label.length > 18 ? node.label.slice(0, 18) + "…" : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Hover Tooltip */}
          {hoveredNode && !selectedNode && (
            <div className="absolute top-4 left-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 shadow-lg text-sm max-w-xs pointer-events-none z-10">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: hoveredNode.color }}
                />
                <span className="font-semibold">{hoveredNode.label}</span>
              </div>
              <span className="text-xs text-neutral-500">
                {TYPE_LABELS[hoveredNode.type] ?? hoveredNode.type} · Cluster {hoveredNode.cluster}
              </span>
            </div>
          )}

          {/* Empty state */}
          {filteredLayout && filteredLayout.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-neutral-500">
                <p className="text-4xl mb-3">🕸️</p>
                <p>No entities in the knowledge graph yet.</p>
                <p className="text-sm mt-1">Run investigations to build your knowledge graph.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-72 border-l border-neutral-200 dark:border-neutral-800 p-4 overflow-y-auto flex-shrink-0">
          {/* Selected Node Details */}
          {selectedNode ? (
            <div className="mb-6">
              <label className="text-xs font-semibold uppercase text-neutral-500 mb-2 block">
                Selected Entity
              </label>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: selectedNode.color }}
                  />
                  <h3 className="font-semibold text-sm">{selectedNode.label}</h3>
                </div>
                <div className="text-xs text-neutral-500 space-y-1">
                  <p>Type: {TYPE_LABELS[selectedNode.type] ?? selectedNode.type}</p>
                  <p>Size: {selectedNode.size}</p>
                  <p>Cluster: {selectedNode.cluster}</p>
                  <p>Connections: {selectedNodeEdges.length}</p>
                </div>

                {/* Related Entities */}
                {selectedNodeNeighbors.length > 0 && (
                  <div className="mt-3 border-t border-neutral-200 dark:border-neutral-700 pt-2">
                    <p className="text-xs font-semibold text-neutral-500 mb-1">Related Entities</p>
                    <div className="space-y-1">
                      {selectedNodeNeighbors.slice(0, 10).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => setSelectedNode(n)}
                          className="flex items-center gap-2 text-xs w-full text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1 py-0.5 transition"
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: n.color }}
                          />
                          <span className="truncate text-neutral-700 dark:text-neutral-300">
                            {n.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => expandNode(selectedNode.id)}
                  className="mt-3 w-full px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition"
                >
                  Expand Neighborhood
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 text-sm text-neutral-500">
              <p className="text-xs font-semibold uppercase mb-2">Selected Entity</p>
              <p className="italic">Click a node to view details</p>
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase text-neutral-500 mb-2 block">
                Insights
              </label>
              <div className="space-y-2">
                {insights.slice(0, 6).map((insight, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3"
                  >
                    <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {insight.title}
                    </h4>
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-3">
                      {insight.description}
                    </p>
                    <span className="text-xs text-neutral-400 mt-1 inline-block">
                      {Math.round(insight.confidence * 100)}% confidence
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Insights Bar */}
      {insights.length > 0 && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-4 py-3 overflow-x-auto">
          <div className="flex gap-3">
            {insights.slice(0, 4).map((insight, i) => (
              <div
                key={i}
                className="flex-shrink-0 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800 p-3 max-w-xs"
              >
                <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  💡 {insight.title}
                </h4>
                <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                  {insight.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
