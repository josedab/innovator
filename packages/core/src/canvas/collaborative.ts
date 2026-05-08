/**
 * @module canvas/collaborative
 *
 * CRDT-inspired collaborative canvas state management.
 * Provides conflict-free shared canvas operations with
 * operation-based merging, voting overlays, and AI synthesis hooks.
 *
 * Designed to work with any transport (WebSocket, Yjs, etc.)
 * by exposing an operation log that can be replicated.
 */

import { randomUUID } from "node:crypto";
import type { InnovationCanvas, CanvasNode, CanvasEdge, CanvasAnnotation } from "./index.js";

// ---- Operation Types ----

export type CanvasOperationType =
  | "add_node"
  | "move_node"
  | "remove_node"
  | "update_node"
  | "add_edge"
  | "remove_edge"
  | "add_annotation"
  | "update_annotation"
  | "remove_annotation"
  | "add_cluster"
  | "vote"
  | "unvote"
  | "cursor_update"
  | "viewport_sync";

export interface CanvasOperation {
  id: string;
  type: CanvasOperationType;
  userId: string;
  timestamp: string;
  data: Record<string, unknown>;
  /** Lamport timestamp for causal ordering */
  lamport: number;
}

export interface CanvasVote {
  nodeId: string;
  userId: string;
  value: 1 | -1;
  timestamp: string;
}

export interface CursorState {
  userId: string;
  displayName: string;
  x: number;
  y: number;
  color: string;
  lastUpdate: string;
}

export interface CollaborativeCanvasState {
  canvas: InnovationCanvas;
  operations: CanvasOperation[];
  votes: Map<string, CanvasVote[]>;
  cursors: Map<string, CursorState>;
  participants: Set<string>;
  lamportClock: number;
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
  "#14b8a6",
  "#a855f7",
  "#84cc16",
  "#e11d48",
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ---- Collaborative Canvas ----

/**
 * Create a new collaborative canvas state.
 */
export function createCollaborativeCanvas(
  title: string,
  creatorId: string
): CollaborativeCanvasState {
  const now = new Date().toISOString();
  return {
    canvas: {
      id: randomUUID(),
      title,
      nodes: [],
      edges: [],
      clusters: [],
      annotations: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    },
    operations: [],
    votes: new Map(),
    cursors: new Map(),
    participants: new Set([creatorId]),
    lamportClock: 0,
  };
}

/**
 * Apply an operation to the collaborative canvas state.
 * Returns the applied operation for replication.
 */
export function applyOperation(
  state: CollaborativeCanvasState,
  type: CanvasOperationType,
  userId: string,
  data: Record<string, unknown>
): CanvasOperation {
  state.lamportClock++;
  state.participants.add(userId);

  const operation: CanvasOperation = {
    id: randomUUID(),
    type,
    userId,
    timestamp: new Date().toISOString(),
    data,
    lamport: state.lamportClock,
  };

  switch (type) {
    case "add_node": {
      const node: CanvasNode = {
        id: (data.id as string) ?? randomUUID(),
        type: (data.nodeType as CanvasNode["type"]) ?? "idea",
        title: (data.title as string) ?? "",
        description: (data.description as string) ?? "",
        position: {
          x: (data.x as number) ?? 0,
          y: (data.y as number) ?? 0,
        },
        size: {
          width: (data.width as number) ?? 200,
          height: (data.height as number) ?? 120,
        },
        angleId: data.angleId as string | undefined,
        color: data.color as string | undefined,
        metadata: { createdBy: userId },
      };
      state.canvas.nodes.push(node);
      operation.data.nodeId = node.id;
      break;
    }

    case "move_node": {
      const moveNode = state.canvas.nodes.find((n) => n.id === data.nodeId);
      if (moveNode) {
        moveNode.position = {
          x: (data.x as number) ?? moveNode.position.x,
          y: (data.y as number) ?? moveNode.position.y,
        };
      }
      break;
    }

    case "remove_node": {
      const nodeId = data.nodeId as string;
      state.canvas.nodes = state.canvas.nodes.filter((n) => n.id !== nodeId);
      state.canvas.edges = state.canvas.edges.filter(
        (e) => e.sourceId !== nodeId && e.targetId !== nodeId
      );
      state.votes.delete(nodeId);
      break;
    }

    case "update_node": {
      const updateNode = state.canvas.nodes.find((n) => n.id === data.nodeId);
      if (updateNode) {
        if (data.title) updateNode.title = data.title as string;
        if (data.description) updateNode.description = data.description as string;
        if (data.color) updateNode.color = data.color as string;
      }
      break;
    }

    case "add_edge": {
      const edge: CanvasEdge = {
        id: randomUUID(),
        sourceId: data.sourceId as string,
        targetId: data.targetId as string,
        type: (data.edgeType as CanvasEdge["type"]) ?? "related",
        label: data.label as string | undefined,
        style: "solid",
      };
      state.canvas.edges.push(edge);
      operation.data.edgeId = edge.id;
      break;
    }

    case "remove_edge": {
      state.canvas.edges = state.canvas.edges.filter((e) => e.id !== data.edgeId);
      break;
    }

    case "add_annotation": {
      const annotation: CanvasAnnotation = {
        id: randomUUID(),
        content: (data.content as string) ?? "",
        position: {
          x: (data.x as number) ?? 0,
          y: (data.y as number) ?? 0,
        },
        color: (data.color as string) ?? "#fef3c7",
        author: userId,
        createdAt: new Date().toISOString(),
      };
      state.canvas.annotations.push(annotation);
      operation.data.annotationId = annotation.id;
      break;
    }

    case "remove_annotation": {
      state.canvas.annotations = state.canvas.annotations.filter((a) => a.id !== data.annotationId);
      break;
    }

    case "vote": {
      const nodeId = data.nodeId as string;
      const voteValue = (data.value as 1 | -1) ?? 1;
      const votes = state.votes.get(nodeId) ?? [];
      // Remove existing vote from same user
      const filtered = votes.filter((v) => v.userId !== userId);
      filtered.push({
        nodeId,
        userId,
        value: voteValue,
        timestamp: new Date().toISOString(),
      });
      state.votes.set(nodeId, filtered);
      break;
    }

    case "unvote": {
      const unvoteNodeId = data.nodeId as string;
      const existing = state.votes.get(unvoteNodeId) ?? [];
      state.votes.set(
        unvoteNodeId,
        existing.filter((v) => v.userId !== userId)
      );
      break;
    }

    case "cursor_update": {
      state.cursors.set(userId, {
        userId,
        displayName: (data.displayName as string) ?? userId,
        x: (data.x as number) ?? 0,
        y: (data.y as number) ?? 0,
        color: getUserColor(userId),
        lastUpdate: new Date().toISOString(),
      });
      break;
    }

    case "viewport_sync":
      // View-only, no state mutation needed
      break;
  }

  state.canvas.updatedAt = new Date().toISOString();
  state.operations.push(operation);

  // Trim operation history to prevent unbounded growth
  if (state.operations.length > 1000) {
    state.operations = state.operations.slice(-500);
  }

  return operation;
}

/**
 * Merge a remote operation into the local state.
 * Uses Lamport timestamps for causal ordering.
 */
export function mergeRemoteOperation(
  state: CollaborativeCanvasState,
  operation: CanvasOperation
): void {
  // Update Lamport clock
  state.lamportClock = Math.max(state.lamportClock, operation.lamport) + 1;

  // Check for duplicate
  if (state.operations.some((op) => op.id === operation.id)) return;

  // Apply the operation
  applyOperation(state, operation.type, operation.userId, operation.data);
}

/**
 * Get vote tally for a node.
 */
export function getNodeVotes(
  state: CollaborativeCanvasState,
  nodeId: string
): { up: number; down: number; total: number; voters: string[] } {
  const votes = state.votes.get(nodeId) ?? [];
  const up = votes.filter((v) => v.value === 1).length;
  const down = votes.filter((v) => v.value === -1).length;
  return {
    up,
    down,
    total: up - down,
    voters: votes.map((v) => v.userId),
  };
}

/**
 * Get top-voted nodes for AI synthesis.
 */
export function getTopVotedNodes(
  state: CollaborativeCanvasState,
  limit = 10
): Array<{ node: CanvasNode; score: number }> {
  return state.canvas.nodes
    .map((node) => ({
      node,
      score: getNodeVotes(state, node.id).total,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Auto-cluster related nodes by angle.
 */
export function autoClusterByAngle(state: CollaborativeCanvasState): void {
  const angleGroups = new Map<string, string[]>();

  for (const node of state.canvas.nodes) {
    if (node.angleId) {
      const group = angleGroups.get(node.angleId) ?? [];
      group.push(node.id);
      angleGroups.set(node.angleId, group);
    }
  }

  for (const [angleId, nodeIds] of angleGroups) {
    if (nodeIds.length < 2) continue;

    const existingCluster = state.canvas.clusters.find((c) => c.label === angleId);
    if (existingCluster) {
      existingCluster.nodeIds = nodeIds;
      continue;
    }

    const nodes = state.canvas.nodes.filter((n) => nodeIds.includes(n.id));
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const maxX = Math.max(...nodes.map((n) => n.position.x + n.size.width));
    const maxY = Math.max(...nodes.map((n) => n.position.y + n.size.height));

    state.canvas.clusters.push({
      id: randomUUID(),
      label: angleId,
      color: nodes[0]?.color ?? "#6b7280",
      nodeIds,
      position: { x: minX - 20, y: minY - 40 },
      size: { width: maxX - minX + 40, height: maxY - minY + 60 },
    });
  }
}

/**
 * Detect potential consensus: nodes with majority upvotes.
 */
export function detectConsensus(state: CollaborativeCanvasState, threshold = 0.6): CanvasNode[] {
  const participantCount = state.participants.size;
  if (participantCount < 2) return [];

  return state.canvas.nodes.filter((node) => {
    const votes = getNodeVotes(state, node.id);
    return votes.up / participantCount >= threshold;
  });
}

/**
 * Get all active cursors (within last 30 seconds).
 */
export function getActiveCursors(state: CollaborativeCanvasState): CursorState[] {
  const cutoff = Date.now() - 30_000;
  return Array.from(state.cursors.values()).filter(
    (c) => new Date(c.lastUpdate).getTime() > cutoff
  );
}

/**
 * Serialize collaborative state for persistence or transmission.
 */
export function serializeCollaborativeState(
  state: CollaborativeCanvasState
): Record<string, unknown> {
  return {
    canvas: state.canvas,
    votes: Object.fromEntries(state.votes),
    participants: Array.from(state.participants),
    lamportClock: state.lamportClock,
    operationCount: state.operations.length,
  };
}
