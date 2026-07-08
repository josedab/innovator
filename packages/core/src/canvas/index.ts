/**
 * @module canvas
 *
 * Innovation Canvas data model: spatial arrangement of ideas as nodes
 * with edges (relationships), clusters (groups), and annotations.
 * This module provides the data structures and layout algorithms.
 * The UI component lives in apps/web/src/components/InnovationCanvas.tsx.
 */

import { randomUUID } from "node:crypto";
import type { AngleResult } from "../types.js";
import { ValidationError } from "../errors.js";
import type {
  CanvasAnnotation,
  CanvasCluster,
  CanvasEdge,
  CanvasNode,
  CanvasPosition,
  InnovationCanvas,
} from "./types.js";

// ---- Types ----

export type {
  CanvasPosition,
  CanvasSize,
  CanvasNode,
  CanvasEdge,
  CanvasCluster,
  CanvasAnnotation,
  InnovationCanvas,
} from "./types.js";

// ---- Canvas Builder ----

/** Angle-to-color mapping for visual differentiation. */
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

/**
 * Create a canvas from angle results, automatically laying out ideas.
 */
export function createCanvasFromResults(
  title: string,
  angleResults: AngleResult[]
): InnovationCanvas {
  const id = randomUUID();
  const now = new Date().toISOString();
  const nodes: CanvasNode[] = [];
  const clusters: CanvasCluster[] = [];

  // Layout: cluster per angle, ideas arranged in grid within cluster
  const clusterSpacing = 400;
  const nodeWidth = 200;
  const nodeHeight = 120;
  const nodeSpacing = 20;
  const nodesPerRow = 3;

  angleResults.forEach((ar, angleIdx) => {
    const clusterX = (angleIdx % 2) * (clusterSpacing + nodesPerRow * (nodeWidth + nodeSpacing));
    const clusterY = Math.floor(angleIdx / 2) * (clusterSpacing + 200);
    const clusterId = randomUUID();
    const clusterNodeIds: string[] = [];

    ar.ideas.forEach((idea, ideaIdx) => {
      const nodeId = randomUUID();
      const col = ideaIdx % nodesPerRow;
      const row = Math.floor(ideaIdx / nodesPerRow);

      nodes.push({
        id: nodeId,
        type: "idea",
        angleId: ar.angleId,
        title: idea.title,
        description: idea.description,
        position: {
          x: clusterX + col * (nodeWidth + nodeSpacing) + 20,
          y: clusterY + row * (nodeHeight + nodeSpacing) + 60,
        },
        size: { width: nodeWidth, height: nodeHeight },
        color: ANGLE_COLORS[ar.angleId] ?? "#6b7280",
        clusterId,
        metadata: {
          potentialImpact: idea.potentialImpact,
          implementationHint: idea.implementationHint,
        },
      });
      clusterNodeIds.push(nodeId);
    });

    const rows = Math.ceil(ar.ideas.length / nodesPerRow);
    clusters.push({
      id: clusterId,
      label: ar.angleName,
      color: ANGLE_COLORS[ar.angleId] ?? "#6b7280",
      nodeIds: clusterNodeIds,
      position: { x: clusterX, y: clusterY },
      size: {
        width: Math.min(ar.ideas.length, nodesPerRow) * (nodeWidth + nodeSpacing) + 40,
        height: rows * (nodeHeight + nodeSpacing) + 80,
      },
    });
  });

  return {
    id,
    title,
    nodes,
    edges: [],
    clusters,
    annotations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Add an edge between two nodes.
 */
export function addCanvasEdge(
  canvas: InnovationCanvas,
  sourceId: string,
  targetId: string,
  type: CanvasEdge["type"] = "related",
  label?: string
): CanvasEdge {
  const edge: CanvasEdge = {
    id: randomUUID(),
    sourceId,
    targetId,
    type,
    label,
    style: type === "conflicts" ? "dashed" : "solid",
  };
  canvas.edges.push(edge);
  canvas.updatedAt = new Date().toISOString();
  return edge;
}

/**
 * Add an annotation to the canvas.
 */
export function addCanvasAnnotation(
  canvas: InnovationCanvas,
  content: string,
  position: CanvasPosition,
  author?: string
): CanvasAnnotation {
  const annotation: CanvasAnnotation = {
    id: randomUUID(),
    content,
    position,
    color: "#fef3c7", // Default sticky note yellow
    author,
    createdAt: new Date().toISOString(),
  };
  canvas.annotations.push(annotation);
  canvas.updatedAt = new Date().toISOString();
  return annotation;
}

/**
 * Move a node to a new position.
 */
export function moveCanvasNode(
  canvas: InnovationCanvas,
  nodeId: string,
  position: CanvasPosition
): boolean {
  const node = canvas.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  node.position = position;
  canvas.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Group nodes into a new cluster.
 */
export function createCluster(
  canvas: InnovationCanvas,
  label: string,
  nodeIds: string[],
  color?: string
): CanvasCluster {
  const nodes = canvas.nodes.filter((n) => nodeIds.includes(n.id));
  if (nodes.length === 0) {
    throw new ValidationError("No valid nodes found for cluster");
  }

  // Compute bounding box
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x + n.size.width));
  const maxY = Math.max(...nodes.map((n) => n.position.y + n.size.height));

  const cluster: CanvasCluster = {
    id: randomUUID(),
    label,
    color: color ?? "#e5e7eb",
    nodeIds,
    position: { x: minX - 20, y: minY - 40 },
    size: { width: maxX - minX + 40, height: maxY - minY + 60 },
  };

  // Update nodes' cluster reference
  for (const node of nodes) {
    node.clusterId = cluster.id;
  }

  canvas.clusters.push(cluster);
  canvas.updatedAt = new Date().toISOString();
  return cluster;
}

// ---- Re-exports ----
export {
  type CanvasOperationType,
  type CanvasOperation,
  type CanvasVote,
  type CursorState,
  type CollaborativeCanvasState,
  type CanvasRoom,
  type HeatMapCell,
  type VotingHeatMap,
  createCollaborativeCanvas,
  applyOperation,
  mergeRemoteOperation,
  getNodeVotes,
  getTopVotedNodes,
  autoClusterByAngle,
  detectConsensus,
  getActiveCursors,
  serializeCollaborativeState,
  createCanvasRoom,
  getCanvasRoom,
  getCanvasRoomBySession,
  applyRoomOperation,
  deleteCanvasRoom,
  clearCanvasRooms,
  generateVotingHeatMap,
} from "./collaborative.js";

// ---- Workshop Mode ----
export {
  type WorkshopPhase,
  type WorkshopConfig,
  type WorkshopParticipant,
  type WorkshopTimer,
  type WorkshopEvent,
  type WorkshopSession,
  type WorkshopSummary,
  DEFAULT_WORKSHOP_CONFIG,
  createWorkshop,
  getWorkshop,
  joinWorkshop,
  leaveWorkshop,
  advanceWorkshopPhase,
  pauseTimer,
  resumeTimer,
  extendTimer,
  submitWorkshopIdea,
  castWorkshopVote,
  generateWorkshopSummary,
  getWorkshopReplay,
  deleteWorkshop,
  clearWorkshops,
  listWorkshops,
} from "./workshop.js";

// ---- AI Canvas Features ----
export {
  type CanvasCluster as AICanvasCluster,
  type ConnectionSuggestion,
  type ConsensusResult,
  type CanvasSynthesis,
  autoClusterNodes,
  suggestConnections,
  detectConsensus as detectAIConsensus,
  synthesizeCanvas,
} from "./ai-canvas.js";

// ---- Realtime Presence & Collaborative Features ----
export {
  PresenceUserSchema,
  PresenceRoomSchema,
  WSMessageTypeSchema,
  WSMessageSchema,
  ClusterSchema,
  AutoClusterResultSchema,
  createPresenceRoom,
  joinRoom,
  leaveRoom,
  updateCursor,
  getRoom,
  getRoomBySession,
  autoClusterNodes as autoClusterCanvasNodes,
  exportCanvasToJSON,
  exportCanvasToSVG,
} from "./realtime-presence.js";
export type {
  PresenceUser,
  PresenceRoom,
  WSMessageType,
  WSMessage,
  Cluster,
  AutoClusterResult,
  CanvasExportOptions,
} from "./realtime-presence.js";

// ---- Priority Matrix ----
export {
  QuadrantSchema,
  PriorityMatrixNodeSchema,
  PriorityMatrixSchema,
  classifyQuadrant,
  buildPriorityMatrix,
  layoutPriorityMatrix,
  priorityMatrixToSvg,
  priorityMatrixToMarkdown,
} from "./priority-matrix.js";
export type { Quadrant, PriorityMatrixNode, PriorityMatrix } from "./priority-matrix.js";

// ---- Auto Layout ----
export {
  applyLayout,
  forceDirectedLayout,
  gridLayout,
  radialLayout,
  hierarchicalLayout,
} from "./auto-layout.js";
export type { LayoutAlgorithm } from "./auto-layout.js";

// ---- Canvas Export Formats ----
export { canvasToSvg, canvasToJson, canvasToPng, canvasToMarkdown } from "./canvas-export.js";

// ---- Canvas State Management ----
export {
  CanvasNodeSchema as CanvasStateNodeSchema,
  CanvasEdgeSchema as CanvasStateEdgeSchema,
  CanvasClusterSchema as CanvasStateClusterSchema,
  CanvasStateSchema,
  createCanvasState,
  getCanvasState,
  addCanvasNode,
  removeCanvasNode,
  addCanvasEdge as addCanvasStateEdge,
  createCluster as createCanvasStateCluster,
  mergeCluster,
  ungroupCluster,
  applyForceDirectedLayout,
  applyGridLayout,
  applyHierarchicalLayout,
  canvasStateToSvg,
  canvasStateToJson,
  clearCanvasStates,
} from "./canvas-state.js";
export type {
  CanvasNode as CanvasStateNode,
  CanvasEdge as CanvasStateEdge,
  CanvasCluster as CanvasStateCluster,
  CanvasState,
} from "./canvas-state.js";
