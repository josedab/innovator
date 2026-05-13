/**
 * @description Visual workflow editor for composing and configuring multi-step innovation DAG pipelines.
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import type { DAGWorkflow, DAGNode, DAGNodeStatus, WorkflowTemplate } from "@innovator/core/types";

// ---- Types ----

interface VisualNode {
  id: string;
  type: DAGNode["type"];
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: DAGNodeStatus;
  dependsOn: string[];
  config?: Record<string, unknown>;
}

interface VisualEdge {
  from: string;
  to: string;
  type: "dependency" | "branch-true" | "branch-false" | "loop";
}

interface WorkflowEditorProps {
  workflow?: DAGWorkflow;
  templates?: WorkflowTemplate[];
  onSave?: (workflow: DAGWorkflow) => void;
  onExecute?: (workflow: DAGWorkflow) => void;
  readOnly?: boolean;
}

// ---- Layout Engine ----

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 60;

const NODE_TYPE_COLORS: Record<string, string> = {
  investigate: "#3b82f6",
  generate: "#10b981",
  score: "#f59e0b",
  filter: "#ef4444",
  synthesize: "#8b5cf6",
  artifact: "#06b6d4",
  redteam: "#dc2626",
  debate: "#f97316",
  export: "#6366f1",
  gate: "#ec4899",
  condition: "#14b8a6",
  loop: "#a855f7",
  "human-review": "#eab308",
  custom: "#6b7280",
};

const NODE_TYPE_ICONS: Record<string, string> = {
  investigate: "🔍",
  generate: "💡",
  score: "📊",
  filter: "🔽",
  synthesize: "🔬",
  artifact: "📄",
  redteam: "🛡️",
  debate: "💬",
  export: "📤",
  gate: "🚧",
  condition: "⑃",
  loop: "🔄",
  "human-review": "👤",
  custom: "⚙️",
};

function layoutDAG(nodes: DAGNode[]): VisualNode[] {
  if (nodes.length === 0) return [];

  // Assign levels via BFS from roots
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const levels = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const children = childrenOf.get(dep) ?? [];
      children.push(node.id);
      childrenOf.set(dep, children);
    }
  }

  const roots = nodes.filter((n) => n.dependsOn.length === 0);
  const queue = roots.map((r) => ({ id: r.id, level: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const existing = levels.get(id) ?? 0;
    levels.set(id, Math.max(existing, level));

    for (const childId of childrenOf.get(id) ?? []) {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    }
  }

  // Handle unvisited nodes
  for (const node of nodes) {
    if (!levels.has(node.id)) levels.set(node.id, 0);
  }

  // Group by level and position
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    const group = byLevel.get(level) ?? [];
    group.push(id);
    byLevel.set(level, group);
  }

  const visualNodes: VisualNode[] = [];
  for (const [level, ids] of byLevel) {
    ids.forEach((id, index) => {
      const node = nodeMap.get(id)!;
      visualNodes.push({
        id: node.id,
        type: node.type,
        name: node.name,
        x: level * (NODE_WIDTH + HORIZONTAL_GAP) + 40,
        y: index * (NODE_HEIGHT + VERTICAL_GAP) + 40,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        status: "pending",
        dependsOn: node.dependsOn,
        config: node.config,
      });
    });
  }

  return visualNodes;
}

function getEdges(nodes: DAGNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      edges.push({ from: dep, to: node.id, type: "dependency" });
    }
    if (node.branches) {
      for (const id of node.branches.trueBranch ?? []) {
        edges.push({ from: node.id, to: id, type: "branch-true" });
      }
      for (const id of node.branches.falseBranch ?? []) {
        edges.push({ from: node.id, to: id, type: "branch-false" });
      }
    }
    if (node.loop) {
      for (const id of node.loop.loopBody) {
        edges.push({ from: node.id, to: id, type: "loop" });
      }
    }
  }
  return edges;
}

// ---- Component ----

export default function WorkflowEditor({
  workflow,
  templates = [],
  onSave,
  onExecute,
  readOnly = false,
}: WorkflowEditorProps) {
  const [currentWorkflow, setCurrentWorkflow] = useState<DAGWorkflow | null>(workflow ?? null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(!workflow);

  const visualNodes = useMemo(
    () => (currentWorkflow ? layoutDAG(currentWorkflow.nodes) : []),
    [currentWorkflow]
  );

  const edges = useMemo(
    () => (currentWorkflow ? getEdges(currentWorkflow.nodes) : []),
    [currentWorkflow]
  );

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of visualNodes) {
      map.set(node.id, {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
      });
    }
    return map;
  }, [visualNodes]);

  const handleSelectTemplate = useCallback((template: WorkflowTemplate) => {
    setCurrentWorkflow(template.workflow);
    setShowTemplates(false);
  }, []);

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      if (!currentWorkflow || readOnly) return;
      setCurrentWorkflow({
        ...currentWorkflow,
        nodes: currentWorkflow.nodes
          .filter((n) => n.id !== nodeId)
          .map((n) => ({
            ...n,
            dependsOn: n.dependsOn.filter((d) => d !== nodeId),
          })),
      });
      setSelectedNode(null);
    },
    [currentWorkflow, readOnly]
  );

  const handleAddNode = useCallback(
    (type: DAGNode["type"]) => {
      if (!currentWorkflow || readOnly) return;
      const id = `${type}-${Date.now()}`;
      const newNode: DAGNode = {
        id,
        type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} Stage`,
        dependsOn: [],
        timeout: 120,
        retries: 0,
        continueOnError: false,
      };
      setCurrentWorkflow({
        ...currentWorkflow,
        nodes: [...currentWorkflow.nodes, newNode],
      });
    },
    [currentWorkflow, readOnly]
  );

  // Template picker
  if (showTemplates && templates.length > 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">Choose a Workflow Template</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTemplate(t)}
              className="p-4 border rounded-lg text-left hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
            >
              <h3 className="font-semibold text-base">{t.name}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t.description}</p>
              <div className="flex gap-1 mt-2 flex-wrap">
                {t.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t.workflow.nodes.length} stages · {t.category}
              </p>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setCurrentWorkflow({
              id: `workflow-${Date.now()}`,
              name: "New Workflow",
              version: "1.0.0",
              nodes: [],
            });
            setShowTemplates(false);
          }}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          Or start from scratch →
        </button>
      </div>
    );
  }

  if (!currentWorkflow) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>No workflow loaded.</p>
        {templates.length > 0 && (
          <button
            onClick={() => setShowTemplates(true)}
            className="mt-2 text-blue-600 hover:underline text-sm"
          >
            Browse templates
          </button>
        )}
      </div>
    );
  }

  const canvasWidth = Math.max(800, Math.max(...visualNodes.map((n) => n.x + n.width)) + 100);
  const canvasHeight = Math.max(400, Math.max(...visualNodes.map((n) => n.y + n.height), 0) + 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <h3 className="font-semibold text-sm flex-1">{currentWorkflow.name}</h3>
        {!readOnly && (
          <>
            <select
              onChange={(e) => {
                if (e.target.value) handleAddNode(e.target.value as DAGNode["type"]);
                e.target.value = "";
              }}
              className="text-xs px-2 py-1 border rounded bg-white dark:bg-gray-800"
              defaultValue=""
              aria-label="Add stage"
            >
              <option value="" disabled>
                + Add Stage
              </option>
              {Object.keys(NODE_TYPE_COLORS).map((type) => (
                <option key={type} value={type}>
                  {NODE_TYPE_ICONS[type]} {type}
                </option>
              ))}
            </select>
            {onSave && (
              <button
                onClick={() => onSave(currentWorkflow)}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            )}
          </>
        )}
        {onExecute && (
          <button
            onClick={() => onExecute(currentWorkflow)}
            className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
          >
            ▶ Execute
          </button>
        )}
        {templates.length > 0 && (
          <button
            onClick={() => setShowTemplates(true)}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Templates
          </button>
        )}
      </div>

      {/* Canvas */}
      <div
        className="overflow-auto border rounded-b-lg bg-white dark:bg-gray-950"
        style={{ maxHeight: "600px" }}
      >
        <svg
          width={canvasWidth}
          height={canvasHeight}
          className="select-none"
          role="img"
          aria-label="Workflow DAG visualization"
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" />
            </marker>
            <marker
              id="arrow-green"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
            </marker>
            <marker id="arrow-red" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const from = nodePositions.get(edge.from);
            const to = nodePositions.get(edge.to);
            if (!from || !to) return null;

            const strokeColor =
              edge.type === "branch-true"
                ? "#10b981"
                : edge.type === "branch-false"
                  ? "#ef4444"
                  : edge.type === "loop"
                    ? "#a855f7"
                    : "#9ca3af";

            const markerId =
              edge.type === "branch-true"
                ? "arrow-green"
                : edge.type === "branch-false"
                  ? "arrow-red"
                  : "arrow";

            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x + NODE_WIDTH / 2}
                y1={from.y}
                x2={to.x - NODE_WIDTH / 2}
                y2={to.y}
                stroke={strokeColor}
                strokeWidth={2}
                strokeDasharray={edge.type === "loop" ? "6 3" : undefined}
                markerEnd={`url(#${markerId})`}
              />
            );
          })}

          {/* Nodes */}
          {visualNodes.map((node) => {
            const color = NODE_TYPE_COLORS[node.type] ?? "#6b7280";
            const icon = NODE_TYPE_ICONS[node.type] ?? "⚙️";
            const isSelected = selectedNode === node.id;

            return (
              <g
                key={node.id}
                onClick={() => setSelectedNode(isSelected ? null : node.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${node.name} (${node.type})`}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  fill="white"
                  stroke={isSelected ? color : "#e5e7eb"}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  className="dark:fill-gray-900"
                />
                <rect x={node.x} y={node.y} width={6} height={node.height} rx={8} fill={color} />
                <text
                  x={node.x + 20}
                  y={node.y + 28}
                  fontSize={13}
                  fontWeight="600"
                  fill="currentColor"
                  className="dark:fill-gray-100"
                >
                  {icon} {node.name.length > 20 ? node.name.slice(0, 20) + "…" : node.name}
                </text>
                <text x={node.x + 20} y={node.y + 48} fontSize={11} fill="#9ca3af">
                  {node.type}
                  {node.config ? ` · ${Object.keys(node.config).length} params` : ""}
                </text>
                <text
                  x={node.x + 20}
                  y={node.y + 65}
                  fontSize={10}
                  fill={
                    node.status === "completed"
                      ? "#10b981"
                      : node.status === "failed"
                        ? "#ef4444"
                        : node.status === "running"
                          ? "#3b82f6"
                          : "#d1d5db"
                  }
                >
                  {node.status}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node detail panel */}
      {selectedNode && (
        <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
          {(() => {
            const node = currentWorkflow.nodes.find((n) => n.id === selectedNode);
            if (!node) return null;
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">
                    {NODE_TYPE_ICONS[node.type]} {node.name}
                  </h4>
                  {!readOnly && (
                    <button
                      onClick={() => handleRemoveNode(node.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Type: {node.type} · ID: {node.id}
                </p>
                {node.dependsOn.length > 0 && (
                  <p className="text-xs text-gray-500">Depends on: {node.dependsOn.join(", ")}</p>
                )}
                {node.description && <p className="text-sm">{node.description}</p>}
                {node.config && (
                  <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(node.config, null, 2)}
                  </pre>
                )}
                {node.gate && (
                  <div className="text-xs mt-1">
                    <p className="font-medium">Gate: {node.gate.prompt}</p>
                    <p>
                      Timeout: {node.gate.timeout}s · Approvers: {node.gate.requiredApprovers}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
