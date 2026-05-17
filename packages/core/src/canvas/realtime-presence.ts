/**
 * @module canvas/realtime-presence
 *
 * WebSocket presence server types and AI-powered auto-clustering
 * for the collaborative canvas. Designed to integrate with Yjs CRDT
 * library for multiplayer innovation sessions.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Presence ----

export const PresenceUserSchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  avatarUrl: z.string().max(2000).optional(),
  color: z.string().max(50),
  cursor: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  selection: z.array(z.string().max(100)).max(50).optional(),
  status: z.enum(["active", "idle", "away"]).default("active"),
  lastSeenAt: z.string(),
});
export type PresenceUser = z.infer<typeof PresenceUserSchema>;

export const PresenceRoomSchema = z.object({
  roomId: z.string().max(200),
  sessionId: z.string().max(200),
  users: z.array(PresenceUserSchema).max(50),
  createdAt: z.string(),
  maxUsers: z.number().int().min(1).max(50).default(20),
});
export type PresenceRoom = z.infer<typeof PresenceRoomSchema>;

// ---- WebSocket Messages ----

export const WSMessageTypeSchema = z.enum([
  "join",
  "leave",
  "cursor-move",
  "selection-change",
  "node-add",
  "node-move",
  "node-update",
  "node-delete",
  "edge-add",
  "edge-delete",
  "vote",
  "cluster-update",
  "sync-request",
  "sync-response",
  "awareness-update",
]);
export type WSMessageType = z.infer<typeof WSMessageTypeSchema>;

export const WSMessageSchema = z.object({
  type: WSMessageTypeSchema,
  roomId: z.string().max(200),
  userId: z.string().max(200),
  timestamp: z.string(),
  payload: z.unknown(),
  version: z.number().int().min(0).optional(),
});
export type WSMessage = z.infer<typeof WSMessageSchema>;

// ---- AI Clustering ----

export const ClusterSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  description: z.string().max(1000).optional(),
  nodeIds: z.array(z.string().max(100)).max(100),
  color: z.string().max(50),
  center: z.object({ x: z.number(), y: z.number() }),
  radius: z.number().min(0),
  confidence: z.number().min(0).max(1),
});
export type Cluster = z.infer<typeof ClusterSchema>;

export const AutoClusterResultSchema = z.object({
  clusters: z.array(ClusterSchema).max(20),
  unclustered: z.array(z.string().max(100)).max(100),
  suggestedConnections: z
    .array(
      z.object({
        sourceId: z.string().max(100),
        targetId: z.string().max(100),
        reason: z.string().max(500),
        strength: z.number().min(0).max(1),
      })
    )
    .max(50),
  timestamp: z.string(),
});
export type AutoClusterResult = z.infer<typeof AutoClusterResultSchema>;

// ---- In-Memory Presence Store ----

const rooms = new Map<string, PresenceRoom>();

export function createPresenceRoom(sessionId: string, maxUsers: number = 20): PresenceRoom {
  const room: PresenceRoom = {
    roomId: `room-${randomUUID().slice(0, 12)}`,
    sessionId,
    users: [],
    createdAt: new Date().toISOString(),
    maxUsers,
  };
  rooms.set(room.roomId, room);
  return room;
}

export function joinRoom(
  roomId: string,
  user: Omit<PresenceUser, "lastSeenAt" | "status">
): PresenceRoom | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.users.length >= room.maxUsers) return null;

  // Remove existing user entry
  room.users = room.users.filter((u) => u.userId !== user.userId);
  room.users.push({
    ...user,
    status: "active",
    lastSeenAt: new Date().toISOString(),
  });

  return room;
}

export function leaveRoom(roomId: string, userId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.users = room.users.filter((u) => u.userId !== userId);
  if (room.users.length === 0) {
    rooms.delete(roomId);
  }
  return true;
}

export function updateCursor(roomId: string, userId: string, x: number, y: number): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const user = room.users.find((u) => u.userId === userId);
  if (user) {
    user.cursor = { x, y };
    user.lastSeenAt = new Date().toISOString();
    user.status = "active";
  }
}

export function getRoom(roomId: string): PresenceRoom | undefined {
  return rooms.get(roomId);
}

export function getRoomBySession(sessionId: string): PresenceRoom | undefined {
  return Array.from(rooms.values()).find((r) => r.sessionId === sessionId);
}

// ---- Auto-Clustering (TF-IDF based) ----

export function autoClusterNodes(
  nodes: Array<{
    id: string;
    title: string;
    description?: string;
    x: number;
    y: number;
  }>
): AutoClusterResult {
  if (nodes.length === 0) {
    return {
      clusters: [],
      unclustered: [],
      suggestedConnections: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Simple keyword-based clustering using word frequency
  const nodeTexts = nodes.map((n) => ({
    id: n.id,
    text: `${n.title} ${n.description ?? ""}`.toLowerCase(),
    x: n.x,
    y: n.y,
  }));

  // Extract keywords (simple TF approach)
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "when",
    "at",
    "by",
    "for",
    "with",
    "about",
    "against",
    "between",
    "to",
    "from",
    "in",
    "on",
    "of",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
  ]);

  const nodeKeywords = nodeTexts.map((nt) => ({
    ...nt,
    keywords: nt.text.split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w)),
  }));

  // Build keyword frequency
  const keywordFreq = new Map<string, string[]>();
  for (const nk of nodeKeywords) {
    for (const kw of nk.keywords) {
      const existing = keywordFreq.get(kw) ?? [];
      if (!existing.includes(nk.id)) existing.push(nk.id);
      keywordFreq.set(kw, existing);
    }
  }

  // Find clusters: groups of nodes sharing keywords
  const clusterColors = [
    "#3b82f6",
    "#ef4444",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#f97316",
  ];
  const assigned = new Set<string>();
  const clusters: Cluster[] = [];

  // Sort by frequency to find most common themes
  const sortedKeywords = Array.from(keywordFreq.entries())
    .filter(([, ids]) => ids.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length);

  for (const [keyword, nodeIds] of sortedKeywords.slice(0, 8)) {
    const unassigned = nodeIds.filter((id) => !assigned.has(id));
    if (unassigned.length < 2) continue;

    const clusterNodes = unassigned.map((id) => {
      const node = nodeTexts.find((n) => n.id === id)!;
      assigned.add(id);
      return node;
    });

    const centerX = clusterNodes.reduce((s, n) => s + n.x, 0) / clusterNodes.length;
    const centerY = clusterNodes.reduce((s, n) => s + n.y, 0) / clusterNodes.length;
    const maxDist = Math.max(
      ...clusterNodes.map((n) => Math.sqrt((n.x - centerX) ** 2 + (n.y - centerY) ** 2)),
      50
    );

    clusters.push({
      id: `cluster-${randomUUID().slice(0, 8)}`,
      label: keyword.charAt(0).toUpperCase() + keyword.slice(1),
      nodeIds: clusterNodes.map((n) => n.id),
      color: clusterColors[clusters.length % clusterColors.length],
      center: { x: centerX, y: centerY },
      radius: maxDist + 30,
      confidence: Math.min(1, unassigned.length / nodeIds.length),
    });
  }

  // Find suggested connections between clusters
  const suggestedConnections: AutoClusterResult["suggestedConnections"] = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      // Check if clusters share any keywords
      const nodesI = clusters[i].nodeIds;
      const nodesJ = clusters[j].nodeIds;
      const kwI = new Set(
        nodesI.flatMap((id) => nodeKeywords.find((nk) => nk.id === id)?.keywords ?? [])
      );
      const kwJ = new Set(
        nodesJ.flatMap((id) => nodeKeywords.find((nk) => nk.id === id)?.keywords ?? [])
      );
      const shared = [...kwI].filter((kw) => kwJ.has(kw));

      if (shared.length > 0) {
        suggestedConnections.push({
          sourceId: nodesI[0],
          targetId: nodesJ[0],
          reason: `Shared themes: ${shared.slice(0, 3).join(", ")}`,
          strength: Math.min(1, shared.length * 0.3),
        });
      }
    }
  }

  return {
    clusters,
    unclustered: nodes.filter((n) => !assigned.has(n.id)).map((n) => n.id),
    suggestedConnections: suggestedConnections.slice(0, 20),
    timestamp: new Date().toISOString(),
  };
}

// ---- Export Formats ----

export interface CanvasExportOptions {
  format: "json" | "svg" | "pdf" | "miro" | "figjam";
  includeVotes?: boolean;
  includeClusters?: boolean;
  includeAnnotations?: boolean;
}

export function exportCanvasToJSON(
  nodes: Array<{
    id: string;
    title: string;
    description?: string;
    x: number;
    y: number;
  }>,
  edges: Array<{ sourceId: string; targetId: string; type: string }>,
  clusters: Cluster[],
  options?: CanvasExportOptions
): string {
  const data = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    format: options?.format ?? "json",
    nodes,
    edges,
    clusters: options?.includeClusters !== false ? clusters : [],
  };
  return JSON.stringify(data, null, 2);
}

export function exportCanvasToSVG(
  nodes: Array<{
    id: string;
    title: string;
    x: number;
    y: number;
    color?: string;
  }>,
  edges: Array<{ sourceId: string; targetId: string }>,
  width: number = 1200,
  height: number = 800
): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <style>`,
    `    .node-rect { rx: 8; ry: 8; stroke: #333; stroke-width: 1; }`,
    `    .node-text { font-family: sans-serif; font-size: 12px; fill: white; text-anchor: middle; }`,
    `    .edge-line { stroke: #999; stroke-width: 1; fill: none; }`,
    `  </style>`,
  ];

  // Draw edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.sourceId);
    const target = nodeMap.get(edge.targetId);
    if (source && target) {
      lines.push(
        `  <line class="edge-line" x1="${source.x + 80}" y1="${source.y + 25}" x2="${target.x + 80}" y2="${target.y + 25}" />`
      );
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const color = node.color ?? "#3b82f6";
    lines.push(
      `  <rect class="node-rect" x="${node.x}" y="${node.y}" width="160" height="50" fill="${color}" />`
    );
    lines.push(
      `  <text class="node-text" x="${node.x + 80}" y="${node.y + 30}">${escapeXml(node.title.slice(0, 25))}</text>`
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
