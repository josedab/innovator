/**
 * @description Reusable Knowledge Graph Explorer component for embedding in dashboards or pages.
 */
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

interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Array<{ id: number; label: string; nodeIds: string[]; dominantType: string }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface KnowledgeGraphExplorerProps {
  initialFilters?: {
    type?: string;
    fromDate?: string;
    toDate?: string;
    minOccurrences?: number;
  };
  compact?: boolean;
  className?: string;
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

const SVG_WIDTH = 600;
const SVG_HEIGHT = 400;

// ---- Component ----

/**
 * Embeddable knowledge graph explorer with SVG-based visualization.
 * Supports compact mode for dashboards and full-screen toggle.
 */
export function KnowledgeGraphExplorer({
  initialFilters,
  compact = false,
  className = "",
}: KnowledgeGraphExplorerProps) {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_graph", filters: initialFilters }),
      });
      if (!res.ok) throw new Error("Failed to load knowledge graph");
      const data = await res.json();
      setLayout(data.layout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [initialFilters]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const expandNode = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand", nodeId, depth: 2 }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.neighborhood) setLayout(data.neighborhood);
    } catch {
      // Silently fail
    }
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement;
      if (target.tagName === "svg" || target.tagName === "rect") {
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPan({
        x: panStart.current.panX + e.clientX - panStart.current.x,
        y: panStart.current.panY + e.clientY - panStart.current.y,
      });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Selected node connections
  const selectedConnections = useMemo(() => {
    if (!selectedNode || !layout) return [];
    return layout.edges
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((e) => {
        const otherId = e.source === selectedNode.id ? e.target : e.source;
        const other = layout.nodes.find((n) => n.id === otherId);
        return { edge: e, node: other };
      })
      .filter((c) => c.node !== undefined);
  }, [selectedNode, layout]);

  // Full screen toggle
  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const width = isFullScreen ? 1000 : SVG_WIDTH;
  const height = isFullScreen ? 700 : compact ? 300 : SVG_HEIGHT;

  // ---- Render ----

  if (error) {
    return (
      <div
        className={`rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20 ${className}`}
      >
        <p className="text-sm text-red-700 dark:text-red-300 mb-2">{error}</p>
        <button
          onClick={loadGraph}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex flex-col items-center gap-3 p-8 ${className}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600" />
        <p className="text-sm text-neutral-500">Loading knowledge graph…</p>
      </div>
    );
  }

  if (!layout || layout.nodes.length === 0) {
    return (
      <div
        className={`rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900 ${className}`}
      >
        <p className="text-3xl mb-2">🕸️</p>
        <p className="text-sm text-neutral-500">
          No entities yet. Run investigations to build the knowledge graph.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden ${
        isFullScreen ? "fixed inset-4 z-50 shadow-2xl" : ""
      } ${className}`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          🕸️ Knowledge Graph
          <span className="text-neutral-400 font-normal ml-2">
            {layout.nodes.length} nodes · {layout.edges.length} edges
          </span>
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            className="px-2 py-1 rounded text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}
            className="px-2 py-1 rounded text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            −
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 py-1 rounded text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            ⟲
          </button>
          <button
            onClick={toggleFullScreen}
            className="px-2 py-1 rounded text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            {isFullScreen ? "⇲" : "⇱"}
          </button>
        </div>
      </div>

      <div className={`flex ${isFullScreen ? "h-[calc(100%-40px)]" : ""}`}>
        {/* SVG Graph */}
        <div
          className="flex-1 cursor-grab active:cursor-grabbing overflow-hidden"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{
              height: isFullScreen ? "100%" : compact ? "300px" : "400px",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: "center",
            }}
          >
            {/* Background for pan detection */}
            <rect width={width} height={height} fill="transparent" />

            {/* Edges */}
            {layout.edges.map((edge, i) => {
              const src = layout.nodes.find((n) => n.id === edge.source);
              const tgt = layout.nodes.find((n) => n.id === edge.target);
              if (!src || !tgt) return null;
              return (
                <line
                  key={`e-${i}`}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke="#6b7280"
                  strokeWidth={Math.max(0.5, edge.weight * 2)}
                  strokeOpacity={0.25}
                />
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isHovered = hoveredNode?.id === node.id;
              const r = Math.max(3, node.size / (compact ? 3 : 2));
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
                    r={r}
                    fill={node.color}
                    stroke={isSelected ? "#fff" : isHovered ? "#d1d5db" : "none"}
                    strokeWidth={isSelected ? 2 : isHovered ? 1 : 0}
                    opacity={0.85}
                  />
                  {!compact && (
                    <text
                      x={node.x}
                      y={node.y + r + 9}
                      textAnchor="middle"
                      fontSize={8}
                      fill="currentColor"
                      className="pointer-events-none select-none"
                      opacity={isSelected || isHovered || node.size > 15 ? 1 : 0.5}
                    >
                      {node.label.length > 16 ? node.label.slice(0, 16) + "…" : node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Side detail panel (shown when a node is selected and not in compact mode) */}
        {selectedNode && !compact && (
          <div className="w-56 border-l border-neutral-200 dark:border-neutral-700 p-3 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedNode.color }}
              />
              <h4 className="text-sm font-semibold truncate">{selectedNode.label}</h4>
            </div>
            <div className="text-xs text-neutral-500 space-y-0.5 mb-3">
              <p>Type: {TYPE_LABELS[selectedNode.type] ?? selectedNode.type}</p>
              <p>Connections: {selectedConnections.length}</p>
            </div>

            {selectedConnections.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-500 mb-1">Connected To</p>
                <div className="space-y-1">
                  {selectedConnections.slice(0, 8).map(({ edge, node }, i) => (
                    <button
                      key={i}
                      onClick={() => node && setSelectedNode(node)}
                      className="flex items-center gap-1.5 text-xs w-full text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1 py-0.5 transition"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: node?.color }}
                      />
                      <span className="truncate text-neutral-700 dark:text-neutral-300">
                        {node?.label}
                      </span>
                      <span className="text-neutral-400 ml-auto text-[10px]">{edge.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => expandNode(selectedNode.id)}
              className="mt-3 w-full px-2 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition"
            >
              Expand
            </button>
          </div>
        )}
      </div>

      {/* Compact: Hover tooltip */}
      {compact && hoveredNode && (
        <div className="absolute bottom-2 left-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md px-2 py-1 text-xs shadow-md pointer-events-none">
          <span className="font-medium">{hoveredNode.label}</span>
          <span className="text-neutral-400 ml-1">{TYPE_LABELS[hoveredNode.type]}</span>
        </div>
      )}

      {/* Legend */}
      {!compact && (
        <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-neutral-200 dark:border-neutral-700 text-xs">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-neutral-500">{TYPE_LABELS[type] ?? type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
