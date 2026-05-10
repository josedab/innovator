/**
 * @module canvas
 *
 * Innovation Canvas data model: spatial arrangement of ideas as nodes
 * with edges (relationships), clusters (groups), and annotations.
 * This module provides the data structures and layout algorithms.
 * The UI component lives in apps/web/src/components/InnovationCanvas.tsx.
 */

import { randomUUID } from "node:crypto";
import type { AngleResult, InnovationIdea } from "../types.js";

// ---- Types ----

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** A node on the canvas representing an idea. */
export interface CanvasNode {
  id: string;
  type: "idea" | "annotation" | "cluster-label";
  /** Source angle for color-coding. */
  angleId?: string;
  title: string;
  description: string;
  position: CanvasPosition;
  size: CanvasSize;
  /** Color override (hex). */
  color?: string;
  /** Parent cluster ID. */
  clusterId?: string;
  metadata?: Record<string, unknown>;
}

/** An edge connecting two nodes. */
export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  type: "related" | "enables" | "conflicts" | "derives" | "synergy";
  /** Edge style. */
  style?: "solid" | "dashed" | "dotted";
}

/** A cluster grouping multiple nodes. */
export interface CanvasCluster {
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
  position: CanvasPosition;
  size: CanvasSize;
}

/** An annotation (sticky note) on the canvas. */
export interface CanvasAnnotation {
  id: string;
  content: string;
  position: CanvasPosition;
  color: string;
  author?: string;
  createdAt: string;
}

/** Full canvas state. */
export interface InnovationCanvas {
  id: string;
  title: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  clusters: CanvasCluster[];
  annotations: CanvasAnnotation[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  createdAt: string;
  updatedAt: string;
}

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
    throw new Error("No valid nodes found for cluster");
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

/**
 * Export canvas as SVG string.
 */
export function canvasToSvg(canvas: InnovationCanvas): string {
  const padding = 50;
  const allX = canvas.nodes.map((n) => n.position.x);
  const allY = canvas.nodes.map((n) => n.position.y);
  const minX = Math.min(0, ...allX) - padding;
  const minY = Math.min(0, ...allY) - padding;
  const maxX = Math.max(800, ...canvas.nodes.map((n) => n.position.x + n.size.width)) + padding;
  const maxY = Math.max(600, ...canvas.nodes.map((n) => n.position.y + n.size.height)) + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`,
    `<style>text { font-family: system-ui, sans-serif; } .node-title { font-weight: 600; font-size: 12px; } .node-desc { font-size: 10px; fill: #666; } .cluster-label { font-size: 14px; font-weight: 700; }</style>`,
  ];

  // Clusters (background)
  for (const cluster of canvas.clusters) {
    parts.push(
      `<rect x="${cluster.position.x}" y="${cluster.position.y}" width="${cluster.size.width}" height="${cluster.size.height}" rx="8" fill="${cluster.color}20" stroke="${cluster.color}" stroke-width="2" />`,
      `<text x="${cluster.position.x + 10}" y="${cluster.position.y + 24}" class="cluster-label" fill="${cluster.color}">${escapeXml(cluster.label)}</text>`
    );
  }

  // Edges
  for (const edge of canvas.edges) {
    const source = canvas.nodes.find((n) => n.id === edge.sourceId);
    const target = canvas.nodes.find((n) => n.id === edge.targetId);
    if (source && target) {
      const sx = source.position.x + source.size.width / 2;
      const sy = source.position.y + source.size.height / 2;
      const tx = target.position.x + target.size.width / 2;
      const ty = target.position.y + target.size.height / 2;
      const dashArray =
        edge.style === "dashed"
          ? ' stroke-dasharray="8,4"'
          : edge.style === "dotted"
            ? ' stroke-dasharray="2,4"'
            : "";
      parts.push(
        `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#94a3b8" stroke-width="2"${dashArray} />`
      );
    }
  }

  // Nodes
  for (const node of canvas.nodes) {
    const fill = node.color ?? "#ffffff";
    parts.push(
      `<rect x="${node.position.x}" y="${node.position.y}" width="${node.size.width}" height="${node.size.height}" rx="6" fill="${fill}15" stroke="${fill}" stroke-width="2" />`,
      `<text x="${node.position.x + 8}" y="${node.position.y + 20}" class="node-title" fill="${fill}">${escapeXml(truncate(node.title, 30))}</text>`,
      `<text x="${node.position.x + 8}" y="${node.position.y + 38}" class="node-desc">${escapeXml(truncate(node.description, 50))}</text>`
    );
  }

  // Annotations
  for (const ann of canvas.annotations) {
    parts.push(
      `<rect x="${ann.position.x}" y="${ann.position.y}" width="150" height="80" rx="4" fill="${ann.color}" stroke="#d4a" stroke-width="1" />`,
      `<text x="${ann.position.x + 8}" y="${ann.position.y + 20}" class="node-desc" fill="#333">${escapeXml(truncate(ann.content, 60))}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ---- Re-exports ----
export {
  type CanvasOperationType,
  type CanvasOperation,
  type CanvasVote,
  type CursorState,
  type CollaborativeCanvasState,
  createCollaborativeCanvas,
  applyOperation,
  mergeRemoteOperation,
  getNodeVotes,
  getTopVotedNodes,
  autoClusterByAngle,
  detectConsensus,
  getActiveCursors,
  serializeCollaborativeState,
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
