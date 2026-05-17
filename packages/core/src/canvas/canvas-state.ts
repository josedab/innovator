import { randomUUID } from "node:crypto";
import { z } from "zod";

export const CanvasNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["idea", "cluster", "note", "image"]),
  x: z.number(),
  y: z.number(),
  width: z.number().default(200),
  height: z.number().default(100),
  label: z.string().max(500),
  data: z.record(z.unknown()).optional(),
  clusterId: z.string().optional(),
  color: z.string().max(20).optional(),
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string().max(200).optional(),
  weight: z.number().default(1),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasClusterSchema = z.object({
  id: z.string(),
  label: z.string().max(500),
  nodeIds: z.array(z.string()),
  color: z.string().max(20).optional(),
});
export type CanvasCluster = z.infer<typeof CanvasClusterSchema>;

export const CanvasStateSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
  clusters: z.array(CanvasClusterSchema),
  layout: z.enum(["free", "force-directed", "grid", "hierarchical"]).default("free"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CanvasState = z.infer<typeof CanvasStateSchema>;

const canvasStates = new Map<string, CanvasState>();

function cloneCanvasState(canvas: CanvasState): CanvasState {
  return CanvasStateSchema.parse({
    ...canvas,
    nodes: canvas.nodes.map((node) => ({ ...node })),
    edges: canvas.edges.map((edge) => ({ ...edge })),
    clusters: canvas.clusters.map((cluster) => ({
      ...cluster,
      nodeIds: [...cluster.nodeIds],
    })),
  });
}

function updateTimestamp(canvas: CanvasState): void {
  canvas.updatedAt = new Date().toISOString();
}

function pruneClusters(canvas: CanvasState): void {
  canvas.clusters = canvas.clusters
    .map((cluster) => ({
      ...cluster,
      nodeIds: cluster.nodeIds.filter((nodeId) =>
        canvas.nodes.some((node) => node.id === nodeId && node.clusterId === cluster.id)
      ),
    }))
    .filter((cluster) => cluster.nodeIds.length > 0);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

export function createCanvasState(name: string): CanvasState {
  const now = new Date().toISOString();
  const canvas = CanvasStateSchema.parse({
    id: randomUUID(),
    name,
    nodes: [],
    edges: [],
    clusters: [],
    layout: "free",
    createdAt: now,
    updatedAt: now,
  });

  canvasStates.set(canvas.id, canvas);
  return canvas;
}

export function getCanvasState(id: string): CanvasState | undefined {
  return canvasStates.get(id);
}

export function addCanvasNode(
  canvasId: string,
  node: Omit<CanvasNode, "id">
): CanvasNode | undefined {
  const canvas = canvasStates.get(canvasId);
  if (!canvas) return undefined;

  const createdNode = CanvasNodeSchema.parse({
    ...node,
    id: randomUUID(),
  });

  canvas.nodes.push(createdNode);
  updateTimestamp(canvas);
  return createdNode;
}

export function removeCanvasNode(canvasId: string, nodeId: string): boolean {
  const canvas = canvasStates.get(canvasId);
  if (!canvas) return false;

  const before = canvas.nodes.length;
  canvas.nodes = canvas.nodes.filter((node) => node.id !== nodeId);
  if (canvas.nodes.length === before) return false;

  canvas.edges = canvas.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  for (const cluster of canvas.clusters) {
    cluster.nodeIds = cluster.nodeIds.filter((id) => id !== nodeId);
  }
  pruneClusters(canvas);
  updateTimestamp(canvas);
  return true;
}

export function addCanvasEdge(
  canvasId: string,
  from: string,
  to: string,
  label?: string
): CanvasEdge | undefined {
  const canvas = canvasStates.get(canvasId);
  if (!canvas) return undefined;
  if (
    !canvas.nodes.some((node) => node.id === from) ||
    !canvas.nodes.some((node) => node.id === to)
  ) {
    return undefined;
  }

  const edge = CanvasEdgeSchema.parse({
    id: randomUUID(),
    from,
    to,
    label,
    weight: 1,
  });

  canvas.edges.push(edge);
  updateTimestamp(canvas);
  return edge;
}

export function createCluster(
  canvasId: string,
  label: string,
  nodeIds: string[]
): CanvasCluster | undefined {
  const canvas = canvasStates.get(canvasId);
  if (!canvas) return undefined;

  const uniqueNodeIds = Array.from(new Set(nodeIds)).filter((nodeId) =>
    canvas.nodes.some((node) => node.id === nodeId)
  );
  if (uniqueNodeIds.length === 0) return undefined;

  const clusterId = randomUUID();
  for (const node of canvas.nodes) {
    if (uniqueNodeIds.includes(node.id)) {
      node.clusterId = clusterId;
    }
  }

  const cluster = CanvasClusterSchema.parse({
    id: clusterId,
    label,
    nodeIds: uniqueNodeIds,
  });

  canvas.clusters = canvas.clusters.filter(
    (existing) => !existing.nodeIds.some((nodeId) => uniqueNodeIds.includes(nodeId))
  );
  canvas.clusters.push(cluster);
  pruneClusters(canvas);
  updateTimestamp(canvas);
  return cluster;
}

export function mergeCluster(
  canvasId: string,
  clusterIds: string[],
  newLabel: string
): CanvasCluster | undefined {
  const canvas = canvasStates.get(canvasId);
  if (!canvas) return undefined;

  const clusters = canvas.clusters.filter((cluster) => clusterIds.includes(cluster.id));
  if (clusters.length === 0) return undefined;

  const mergedNodeIds = Array.from(new Set(clusters.flatMap((cluster) => cluster.nodeIds)));
  canvas.clusters = canvas.clusters.filter((cluster) => !clusterIds.includes(cluster.id));

  return createCluster(canvasId, newLabel, mergedNodeIds);
}

export function ungroupCluster(canvasId: string, clusterId: string): boolean {
  const canvas = canvasStates.get(canvasId);
  if (!canvas) return false;

  const cluster = canvas.clusters.find((entry) => entry.id === clusterId);
  if (!cluster) return false;

  for (const node of canvas.nodes) {
    if (node.clusterId === clusterId) {
      delete node.clusterId;
    }
  }

  canvas.clusters = canvas.clusters.filter((entry) => entry.id !== clusterId);
  updateTimestamp(canvas);
  return true;
}

export function applyForceDirectedLayout(canvas: CanvasState, iterations = 50): CanvasState {
  const next = cloneCanvasState(canvas);
  if (next.nodes.length <= 1) {
    next.layout = "force-directed";
    updateTimestamp(next);
    return next;
  }

  const positions = new Map(next.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const repulsion = 4_000;
  const attraction = 0.01;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const forces = new Map(next.nodes.map((node) => [node.id, { x: 0, y: 0 }]));

    for (let i = 0; i < next.nodes.length; i++) {
      for (let j = i + 1; j < next.nodes.length; j++) {
        const left = next.nodes[i];
        const right = next.nodes[j];
        const leftPos = positions.get(left.id)!;
        const rightPos = positions.get(right.id)!;
        const dx = leftPos.x - rightPos.x;
        const dy = leftPos.y - rightPos.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const magnitude = repulsion / (distance * distance);
        const fx = (dx / distance) * magnitude;
        const fy = (dy / distance) * magnitude;

        forces.get(left.id)!.x += fx;
        forces.get(left.id)!.y += fy;
        forces.get(right.id)!.x -= fx;
        forces.get(right.id)!.y -= fy;
      }
    }

    for (const edge of next.edges) {
      const source = positions.get(edge.from);
      const target = positions.get(edge.to);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const desired = 220;
      const magnitude = (distance - desired) * attraction * edge.weight;
      const fx = (dx / distance) * magnitude;
      const fy = (dy / distance) * magnitude;

      forces.get(edge.from)!.x += fx;
      forces.get(edge.from)!.y += fy;
      forces.get(edge.to)!.x -= fx;
      forces.get(edge.to)!.y -= fy;
    }

    for (const node of next.nodes) {
      const position = positions.get(node.id)!;
      const force = forces.get(node.id)!;
      position.x = Math.round((position.x + force.x) * 100) / 100;
      position.y = Math.round((position.y + force.y) * 100) / 100;
    }
  }

  next.nodes = next.nodes.map((node) => ({
    ...node,
    x: positions.get(node.id)!.x,
    y: positions.get(node.id)!.y,
  }));
  next.layout = "force-directed";
  updateTimestamp(next);
  return next;
}

export function applyGridLayout(canvas: CanvasState): CanvasState {
  const next = cloneCanvasState(canvas);
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(next.nodes.length, 1))));
  const horizontalGap = 260;
  const verticalGap = 160;

  next.nodes = next.nodes.map((node, index) => ({
    ...node,
    x: (index % columns) * horizontalGap,
    y: Math.floor(index / columns) * verticalGap,
  }));
  next.layout = "grid";
  updateTimestamp(next);
  return next;
}

export function applyHierarchicalLayout(canvas: CanvasState): CanvasState {
  const next = cloneCanvasState(canvas);
  const indegree = new Map(next.nodes.map((node) => [node.id, 0]));
  const children = new Map<string, string[]>();

  for (const edge of next.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }

  const levels = new Map<string, number>();
  const queue = next.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  if (queue.length === 0) {
    queue.push(...next.nodes.map((node) => node.id));
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentLevel = levels.get(currentId) ?? 0;
    for (const childId of children.get(currentId) ?? []) {
      levels.set(childId, Math.max(levels.get(childId) ?? 0, currentLevel + 1));
      indegree.set(childId, (indegree.get(childId) ?? 1) - 1);
      if ((indegree.get(childId) ?? 0) <= 0) {
        queue.push(childId);
      }
    }
  }

  for (const node of next.nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  }

  const layers = new Map<number, CanvasNode[]>();
  for (const node of next.nodes) {
    const level = levels.get(node.id) ?? 0;
    layers.set(level, [...(layers.get(level) ?? []), node]);
  }

  for (const [level, nodes] of layers) {
    nodes.forEach((node, index) => {
      node.x = level * 280;
      node.y = index * 160;
    });
  }

  next.layout = "hierarchical";
  updateTimestamp(next);
  return next;
}

export function canvasStateToSvg(canvas: CanvasState): string {
  const paddedNodes =
    canvas.nodes.length > 0
      ? canvas.nodes
      : [
          {
            id: "placeholder",
            type: "note",
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            label: canvas.name,
          },
        ];
  const minX = Math.min(...paddedNodes.map((node) => node.x), 0) - 50;
  const minY = Math.min(...paddedNodes.map((node) => node.y), 0) - 50;
  const maxX = Math.max(...paddedNodes.map((node) => node.x + node.width), 800) + 50;
  const maxY = Math.max(...paddedNodes.map((node) => node.y + node.height), 600) + 50;
  const width = maxX - minX;
  const height = maxY - minY;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`,
    `<style>text { font-family: system-ui, sans-serif; } .cluster { font-size: 14px; font-weight: 700; } .label { font-size: 12px; font-weight: 600; }</style>`,
  ];

  for (const cluster of canvas.clusters) {
    const clusterNodes = canvas.nodes.filter((node) => cluster.nodeIds.includes(node.id));
    if (clusterNodes.length === 0) continue;
    const clusterMinX = Math.min(...clusterNodes.map((node) => node.x)) - 20;
    const clusterMinY = Math.min(...clusterNodes.map((node) => node.y)) - 40;
    const clusterMaxX = Math.max(...clusterNodes.map((node) => node.x + node.width)) + 20;
    const clusterMaxY = Math.max(...clusterNodes.map((node) => node.y + node.height)) + 20;

    parts.push(
      `<rect x="${clusterMinX}" y="${clusterMinY}" width="${clusterMaxX - clusterMinX}" height="${clusterMaxY - clusterMinY}" rx="10" fill="${cluster.color ?? "#dbeafe"}22" stroke="${cluster.color ?? "#3b82f6"}" stroke-width="2" />`,
      `<text x="${clusterMinX + 10}" y="${clusterMinY + 24}" class="cluster" fill="${cluster.color ?? "#1d4ed8"}">${escapeXml(cluster.label)}</text>`
    );
  }

  for (const edge of canvas.edges) {
    const from = canvas.nodes.find((node) => node.id === edge.from);
    const to = canvas.nodes.find((node) => node.id === edge.to);
    if (!from || !to) continue;

    parts.push(
      `<line x1="${from.x + from.width / 2}" y1="${from.y + from.height / 2}" x2="${to.x + to.width / 2}" y2="${to.y + to.height / 2}" stroke="#94a3b8" stroke-width="${edge.weight}" />`
    );
  }

  for (const node of canvas.nodes) {
    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" fill="${node.color ?? "#ffffff"}" stroke="#334155" stroke-width="1.5" />`,
      `<text x="${node.x + 10}" y="${node.y + 24}" class="label">${escapeXml(node.label)}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

export function canvasStateToJson(canvas: CanvasState): string {
  return JSON.stringify(CanvasStateSchema.parse(canvas), null, 2);
}

export function clearCanvasStates(): void {
  canvasStates.clear();
}
