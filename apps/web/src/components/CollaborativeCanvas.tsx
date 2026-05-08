"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  CollaborativeCanvasState,
  CanvasNode,
  CanvasVote,
  CursorState,
} from "@innovator/core/types";

// ---- Types ----

interface CollaborativeCanvasProps {
  sessionId: string;
  userId: string;
  displayName: string;
  initialNodes?: CanvasNode[];
  readOnly?: boolean;
}

interface LocalCanvasState {
  nodes: CanvasNode[];
  edges: Array<{ id: string; sourceId: string; targetId: string; type: string }>;
  annotations: Array<{
    id: string;
    content: string;
    x: number;
    y: number;
    color: string;
    author?: string;
  }>;
  votes: Record<string, { up: number; down: number }>;
  cursors: CursorState[];
  viewport: { x: number; y: number; zoom: number };
}

// ---- User Colors ----

const USER_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ---- Component ----

export default function CollaborativeCanvas({
  sessionId,
  userId,
  displayName,
  initialNodes = [],
  readOnly = false,
}: CollaborativeCanvasProps) {
  const [state, setState] = useState<LocalCanvasState>({
    nodes: initialNodes,
    edges: [],
    annotations: [],
    votes: {},
    cursors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const myColor = getUserColor(userId);

  // Track cursor position
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = canvasRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / state.viewport.zoom - state.viewport.x;
      const y = (e.clientY - rect.top) / state.viewport.zoom - state.viewport.y;

      if (isDragging && dragNodeId) {
        setState((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === dragNodeId
              ? { ...n, position: { x: x - dragOffset.current.x, y: y - dragOffset.current.y } }
              : n
          ),
        }));
      }
    },
    [state.viewport, isDragging, dragNodeId]
  );

  const handleNodeMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (connectionStart) {
        // Create edge
        if (connectionStart !== nodeId) {
          setState((prev) => ({
            ...prev,
            edges: [
              ...prev.edges,
              {
                id: `edge-${Date.now()}`,
                sourceId: connectionStart,
                targetId: nodeId,
                type: "related",
              },
            ],
          }));
        }
        setConnectionStart(null);
        return;
      }

      setDragNodeId(nodeId);
      setIsDragging(true);
      setSelectedNode(nodeId);

      const svg = canvasRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) / state.viewport.zoom - state.viewport.x;
        const y = (e.clientY - rect.top) / state.viewport.zoom - state.viewport.y;
        dragOffset.current = {
          x: x - node.position.x,
          y: y - node.position.y,
        };
      }
    },
    [connectionStart, readOnly, state.nodes, state.viewport]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragNodeId(null);
  }, []);

  const handleVote = useCallback((nodeId: string, value: 1 | -1) => {
    setState((prev) => {
      const existing = prev.votes[nodeId] ?? { up: 0, down: 0 };
      return {
        ...prev,
        votes: {
          ...prev.votes,
          [nodeId]: {
            up: existing.up + (value === 1 ? 1 : 0),
            down: existing.down + (value === -1 ? 1 : 0),
          },
        },
      };
    });
  }, []);

  const handleAddStickyNote = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isAddingNote || readOnly) return;
      const svg = canvasRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / state.viewport.zoom - state.viewport.x;
      const y = (e.clientY - rect.top) / state.viewport.zoom - state.viewport.y;

      setState((prev) => ({
        ...prev,
        annotations: [
          ...prev.annotations,
          {
            id: `note-${Date.now()}`,
            content: "New note",
            x,
            y,
            color: "#fef3c7",
            author: displayName,
          },
        ],
      }));
      setIsAddingNote(false);
    },
    [isAddingNote, readOnly, state.viewport, displayName]
  );

  const handleAddIdeaCard = useCallback(() => {
    if (readOnly) return;
    const newNode: CanvasNode = {
      id: `idea-${Date.now()}`,
      type: "idea",
      title: "New Idea",
      description: "Click to edit",
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      size: { width: 200, height: 120 },
      color: myColor,
      metadata: { createdBy: userId },
    };
    setState((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }));
  }, [readOnly, myColor, userId]);

  const canvasWidth = Math.max(
    1200,
    Math.max(...state.nodes.map((n) => n.position.x + n.size.width), 0) + 200
  );
  const canvasHeight = Math.max(
    800,
    Math.max(...state.nodes.map((n) => n.position.y + n.size.height), 0) + 200
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg border">
        <span className="text-xs font-medium text-gray-500">
          Canvas · {state.nodes.length} ideas
        </span>
        <div className="flex-1" />
        {!readOnly && (
          <>
            <button
              onClick={handleAddIdeaCard}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + Idea
            </button>
            <button
              onClick={() => setIsAddingNote(!isAddingNote)}
              className={`text-xs px-2 py-1 rounded border ${
                isAddingNote
                  ? "bg-yellow-100 border-yellow-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              📝 Note
            </button>
            <button
              onClick={() => setConnectionStart(connectionStart ? null : selectedNode)}
              className={`text-xs px-2 py-1 rounded border ${
                connectionStart
                  ? "bg-green-100 border-green-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
              disabled={!selectedNode && !connectionStart}
            >
              🔗 Connect
            </button>
          </>
        )}

        {/* Participant indicators */}
        <div className="flex -space-x-1 ml-2">
          <div
            className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
            style={{ backgroundColor: myColor }}
            title={displayName}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          {state.cursors
            .filter((c) => c.userId !== userId)
            .map((cursor) => (
              <div
                key={cursor.userId}
                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
                style={{ backgroundColor: cursor.color }}
                title={cursor.displayName}
              >
                {cursor.displayName.charAt(0).toUpperCase()}
              </div>
            ))}
        </div>
      </div>

      {/* Canvas */}
      <div
        className="overflow-auto border rounded-lg bg-white dark:bg-gray-950"
        style={{ maxHeight: "70vh" }}
      >
        <svg
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleAddStickyNote}
          role="img"
          aria-label="Collaborative innovation canvas"
        >
          {/* Grid pattern */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Edges */}
          {state.edges.map((edge) => {
            const source = state.nodes.find((n) => n.id === edge.sourceId);
            const target = state.nodes.find((n) => n.id === edge.targetId);
            if (!source || !target) return null;
            return (
              <line
                key={edge.id}
                x1={source.position.x + source.size.width / 2}
                y1={source.position.y + source.size.height / 2}
                x2={target.position.x + target.size.width / 2}
                y2={target.position.y + target.size.height / 2}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray={edge.type === "conflicts" ? "6 3" : undefined}
              />
            );
          })}

          {/* Idea nodes */}
          {state.nodes.map((node) => {
            const isSelected = selectedNode === node.id;
            const votes = state.votes[node.id] ?? { up: 0, down: 0 };
            const voteScore = votes.up - votes.down;

            return (
              <g
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                className="cursor-grab active:cursor-grabbing"
              >
                {/* Card shadow */}
                <rect
                  x={node.position.x + 2}
                  y={node.position.y + 2}
                  width={node.size.width}
                  height={node.size.height}
                  rx={8}
                  fill="rgba(0,0,0,0.05)"
                />
                {/* Card */}
                <rect
                  x={node.position.x}
                  y={node.position.y}
                  width={node.size.width}
                  height={node.size.height}
                  rx={8}
                  fill="white"
                  stroke={isSelected ? (node.color ?? "#3b82f6") : "#e5e7eb"}
                  strokeWidth={isSelected ? 2.5 : 1}
                  className="dark:fill-gray-900"
                />
                {/* Color accent bar */}
                <rect
                  x={node.position.x}
                  y={node.position.y}
                  width={node.size.width}
                  height={4}
                  rx={8}
                  fill={node.color ?? "#3b82f6"}
                />
                {/* Title */}
                <text
                  x={node.position.x + 12}
                  y={node.position.y + 28}
                  fontSize={13}
                  fontWeight="600"
                  fill="currentColor"
                >
                  {node.title.length > 24 ? node.title.slice(0, 24) + "…" : node.title}
                </text>
                {/* Description */}
                <text
                  x={node.position.x + 12}
                  y={node.position.y + 48}
                  fontSize={11}
                  fill="#6b7280"
                >
                  {node.description.length > 35
                    ? node.description.slice(0, 35) + "…"
                    : node.description}
                </text>
                {/* Vote buttons */}
                {!readOnly && (
                  <>
                    <text
                      x={node.position.x + 12}
                      y={node.position.y + node.size.height - 12}
                      fontSize={14}
                      fill="#22c55e"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(node.id, 1);
                      }}
                    >
                      👍 {votes.up}
                    </text>
                    <text
                      x={node.position.x + 65}
                      y={node.position.y + node.size.height - 12}
                      fontSize={14}
                      fill="#ef4444"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(node.id, -1);
                      }}
                    >
                      👎 {votes.down}
                    </text>
                    {voteScore !== 0 && (
                      <text
                        x={node.position.x + node.size.width - 30}
                        y={node.position.y + node.size.height - 12}
                        fontSize={12}
                        fontWeight="bold"
                        fill={voteScore > 0 ? "#22c55e" : "#ef4444"}
                      >
                        {voteScore > 0 ? "+" : ""}
                        {voteScore}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Sticky notes */}
          {state.annotations.map((note) => (
            <g key={note.id}>
              <rect
                x={note.x}
                y={note.y}
                width={150}
                height={80}
                rx={4}
                fill={note.color}
                stroke="#d4aa4f"
                strokeWidth={1}
              />
              <text x={note.x + 8} y={note.y + 20} fontSize={11} fill="#333">
                {note.content.length > 40 ? note.content.slice(0, 40) + "…" : note.content}
              </text>
              {note.author && (
                <text x={note.x + 8} y={note.y + 70} fontSize={9} fill="#666">
                  — {note.author}
                </text>
              )}
            </g>
          ))}

          {/* Remote cursors */}
          {state.cursors
            .filter((c) => c.userId !== userId)
            .map((cursor) => (
              <g key={cursor.userId}>
                <polygon
                  points={`${cursor.x},${cursor.y} ${cursor.x},${cursor.y + 18} ${cursor.x + 12},${cursor.y + 12}`}
                  fill={cursor.color}
                />
                <text
                  x={cursor.x + 16}
                  y={cursor.y + 14}
                  fontSize={10}
                  fill={cursor.color}
                  fontWeight="600"
                >
                  {cursor.displayName}
                </text>
              </g>
            ))}
        </svg>
      </div>

      {/* Connection mode indicator */}
      {connectionStart && (
        <div className="text-xs text-green-600 text-center py-1">
          Click another node to create a connection. Press Esc to cancel.
        </div>
      )}
      {isAddingNote && (
        <div className="text-xs text-yellow-600 text-center py-1">
          Click on the canvas to place a sticky note.
        </div>
      )}
    </div>
  );
}
