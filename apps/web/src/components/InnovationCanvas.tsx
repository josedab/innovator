"use client";

/**
 * InnovationCanvas — interactive drag-and-drop canvas for spatial idea arrangement.
 * Uses DnD Kit for drag-and-drop, built-in pan/zoom for infinite canvas.
 * Falls back to card-based layout on mobile.
 */

import { useState, useCallback, useRef, type MouseEvent, type WheelEvent } from "react";
import type {
  CanvasNode,
  CanvasEdge,
  CanvasCluster,
  CanvasAnnotation,
  InnovationCanvas as CanvasData,
} from "@innovator/core/types";

interface InnovationCanvasProps {
  canvas: CanvasData;
  onNodeMove?: (nodeId: string, x: number, y: number) => void;
  onEdgeAdd?: (sourceId: string, targetId: string) => void;
  onAnnotationAdd?: (content: string, x: number, y: number) => void;
  readOnly?: boolean;
}

const ANGLE_COLORS: Record<string, string> = {
  scamper: "#3b82f6",
  "first-principles": "#ef4444",
  "cross-domain": "#22c55e",
  constraints: "#f59e0b",
  inversion: "#8b5cf6",
  perspectives: "#ec4899",
  "what-if": "#06b6d4",
  "trend-collision": "#f97316",
};

export default function InnovationCanvas({
  canvas,
  onNodeMove,
  onEdgeAdd,
  onAnnotationAdd,
  readOnly = false,
}: InnovationCanvasProps) {
  const [viewport, setViewport] = useState(canvas.viewport);
  const [dragState, setDragState] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan handling
  const handleCanvasMouseDown = useCallback(
    (e: MouseEvent) => {
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).classList.contains("canvas-bg")
      ) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
        setSelectedNodeId(null);
      }
    },
    [viewport]
  );

  const handleCanvasMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning) {
        setViewport((v) => ({
          ...v,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        }));
      }
      if (dragState && !readOnly) {
        const dx = (e.clientX - dragState.startX) / viewport.zoom;
        const dy = (e.clientY - dragState.startY) / viewport.zoom;
        onNodeMove?.(dragState.nodeId, dragState.nodeStartX + dx, dragState.nodeStartY + dy);
      }
    },
    [isPanning, panStart, dragState, viewport.zoom, onNodeMove, readOnly]
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragState(null);
  }, []);

  // Zoom handling
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport((v) => ({
      ...v,
      zoom: Math.max(0.1, Math.min(3, v.zoom * delta)),
    }));
  }, []);

  // Node drag
  const handleNodeMouseDown = useCallback(
    (e: MouseEvent, node: CanvasNode) => {
      if (readOnly) return;
      e.stopPropagation();
      setSelectedNodeId(node.id);
      setDragState({
        nodeId: node.id,
        startX: e.clientX,
        startY: e.clientY,
        nodeStartX: node.position.x,
        nodeStartY: node.position.y,
      });
    },
    [readOnly]
  );

  // Mobile fallback: check viewport width
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  if (isMobile) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold">{canvas.title}</h2>
        {canvas.clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="rounded-lg border-2 p-3"
            style={{ borderColor: cluster.color }}
          >
            <h3 className="font-semibold text-sm mb-2" style={{ color: cluster.color }}>
              {cluster.label}
            </h3>
            <div className="space-y-2">
              {canvas.nodes
                .filter((n) => n.clusterId === cluster.id)
                .map((node) => (
                  <div
                    key={node.id}
                    className="p-2 rounded border text-sm"
                    style={{ borderColor: node.color }}
                  >
                    <p className="font-medium">{node.title}</p>
                    <p className="text-neutral-500 text-xs mt-1">{node.description}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
        {canvas.nodes
          .filter((n) => !n.clusterId)
          .map((node) => (
            <div
              key={node.id}
              className="p-2 rounded border text-sm"
              style={{ borderColor: node.color }}
            >
              <p className="font-medium">{node.title}</p>
              <p className="text-neutral-500 text-xs mt-1">{node.description}</p>
            </div>
          ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[600px] overflow-hidden bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 cursor-grab active:cursor-grabbing"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handleCanvasMouseUp}
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2 bg-white dark:bg-neutral-800 rounded-lg p-1 shadow-sm border border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(3, v.zoom * 1.2) }))}
          className="px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
          title="Zoom in"
        >
          🔍+
        </button>
        <button
          onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.1, v.zoom * 0.8) }))}
          className="px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
          title="Zoom out"
        >
          🔍−
        </button>
        <button
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          className="px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
          title="Reset view"
        >
          🏠
        </button>
        <span className="px-2 py-1 text-xs text-neutral-400">
          {Math.round(viewport.zoom * 100)}%
        </span>
      </div>

      {/* Canvas content */}
      <div
        className="canvas-bg absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Grid background */}
        <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Edges */}
          {canvas.edges.map((edge) => {
            const source = canvas.nodes.find((n) => n.id === edge.sourceId);
            const target = canvas.nodes.find((n) => n.id === edge.targetId);
            if (!source || !target) return null;
            return (
              <line
                key={edge.id}
                x1={source.position.x + source.size.width / 2}
                y1={source.position.y + source.size.height / 2}
                x2={target.position.x + target.size.width / 2}
                y2={target.position.y + target.size.height / 2}
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray={
                  edge.style === "dashed" ? "8,4" : edge.style === "dotted" ? "2,4" : "none"
                }
              />
            );
          })}
        </svg>

        {/* Clusters */}
        {canvas.clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="absolute rounded-lg border-2 pointer-events-none"
            style={{
              left: cluster.position.x,
              top: cluster.position.y,
              width: cluster.size.width,
              height: cluster.size.height,
              borderColor: cluster.color,
              backgroundColor: `${cluster.color}10`,
            }}
          >
            <span
              className="absolute -top-3 left-3 px-2 text-xs font-bold bg-white dark:bg-neutral-900 rounded"
              style={{ color: cluster.color }}
            >
              {cluster.label}
            </span>
          </div>
        ))}

        {/* Nodes */}
        {canvas.nodes.map((node) => (
          <div
            key={node.id}
            className={`absolute rounded-lg border-2 p-2 cursor-move select-none shadow-sm transition-shadow ${
              selectedNodeId === node.id ? "ring-2 ring-blue-400 shadow-lg" : "hover:shadow-md"
            }`}
            style={{
              left: node.position.x,
              top: node.position.y,
              width: node.size.width,
              height: node.size.height,
              borderColor: node.color ?? "#6b7280",
              backgroundColor: `${node.color ?? "#6b7280"}10`,
            }}
            onMouseDown={(e) => handleNodeMouseDown(e, node)}
          >
            <p className="text-xs font-semibold truncate" style={{ color: node.color }}>
              {node.title}
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-3">
              {node.description}
            </p>
          </div>
        ))}

        {/* Annotations */}
        {canvas.annotations.map((ann) => (
          <div
            key={ann.id}
            className="absolute w-36 p-2 rounded shadow-sm text-xs"
            style={{
              left: ann.position.x,
              top: ann.position.y,
              backgroundColor: ann.color,
              color: "#333",
            }}
          >
            {ann.content}
          </div>
        ))}
      </div>

      {/* Minimap */}
      <div className="absolute bottom-2 right-2 w-32 h-20 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden opacity-70 pointer-events-none">
        <svg viewBox="-100 -100 2000 1200" className="w-full h-full">
          {canvas.nodes.map((node) => (
            <rect
              key={node.id}
              x={node.position.x}
              y={node.position.y}
              width={node.size.width}
              height={node.size.height}
              fill={node.color ?? "#6b7280"}
              rx="2"
            />
          ))}
          <rect
            x={-viewport.x / viewport.zoom}
            y={-viewport.y / viewport.zoom}
            width={800 / viewport.zoom}
            height={600 / viewport.zoom}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="4"
          />
        </svg>
      </div>
    </div>
  );
}
