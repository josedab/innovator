import type { CanvasNode, CanvasEdge, InnovationCanvas } from "./types.js";

export type LayoutAlgorithm = "force-directed" | "grid" | "radial" | "hierarchical";

const DEFAULT_CENTER = { x: 400, y: 300 };
const GRID_PADDING_X = 60;
const GRID_PADDING_Y = 60;
const GRID_GAP_X = 40;
const GRID_GAP_Y = 40;

function cloneNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}

function maxNodeWidth(nodes: CanvasNode[]): number {
  return Math.max(...nodes.map((node) => node.size.width), 180);
}

function maxNodeHeight(nodes: CanvasNode[]): number {
  return Math.max(...nodes.map((node) => node.size.height), 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nodeDegree(nodeId: string, edges: CanvasEdge[]): number {
  return edges.filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId).length;
}

/** Apply one of the supported canvas auto-layout algorithms. */
export function applyLayout(
  canvas: InnovationCanvas,
  algorithm: LayoutAlgorithm
): InnovationCanvas {
  const centerNodeId =
    canvas.nodes
      .slice()
      .sort((a, b) => nodeDegree(b.id, canvas.edges) - nodeDegree(a.id, canvas.edges))[0]?.id ??
    canvas.nodes[0]?.id;

  const nodes =
    algorithm === "force-directed"
      ? forceDirectedLayout(canvas.nodes, canvas.edges)
      : algorithm === "grid"
        ? gridLayout(canvas.nodes)
        : algorithm === "radial"
          ? radialLayout(canvas.nodes, centerNodeId)
          : hierarchicalLayout(canvas.nodes, canvas.edges);

  return {
    ...canvas,
    nodes,
    updatedAt: new Date().toISOString(),
  };
}

/** Arrange nodes in a deterministic grid. */
export function gridLayout(nodes: CanvasNode[], columns?: number): CanvasNode[] {
  if (nodes.length === 0) return [];

  const laidOutNodes = nodes.map(cloneNode);
  const gridColumns = Math.max(1, columns ?? Math.ceil(Math.sqrt(laidOutNodes.length)));
  const cellWidth = maxNodeWidth(laidOutNodes) + GRID_GAP_X;
  const cellHeight = maxNodeHeight(laidOutNodes) + GRID_GAP_Y;

  return laidOutNodes.map((node, index) => {
    const col = index % gridColumns;
    const row = Math.floor(index / gridColumns);
    return {
      ...node,
      position: {
        x: roundPosition(GRID_PADDING_X + col * cellWidth),
        y: roundPosition(GRID_PADDING_Y + row * cellHeight),
      },
    };
  });
}

/** Arrange nodes in concentric circles around a center node. */
export function radialLayout(nodes: CanvasNode[], centerNodeId?: string): CanvasNode[] {
  if (nodes.length === 0) return [];

  const laidOutNodes = nodes.map(cloneNode);
  const centerIndex = Math.max(
    0,
    laidOutNodes.findIndex((node) => node.id === centerNodeId)
  );
  const centerNode = laidOutNodes[centerIndex];
  const orbitingNodes = laidOutNodes.filter((_, index) => index !== centerIndex);
  const positions = new Map<string, { x: number; y: number }>();

  positions.set(centerNode.id, { ...DEFAULT_CENTER });

  orbitingNodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(orbitingNodes.length, 1);
    const radius = Math.max(180, orbitingNodes.length * 24);
    positions.set(node.id, {
      x: roundPosition(DEFAULT_CENTER.x + Math.cos(angle) * radius),
      y: roundPosition(DEFAULT_CENTER.y + Math.sin(angle) * radius),
    });
  });

  return laidOutNodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

/** Arrange nodes in top-down levels based on edge direction. */
export function hierarchicalLayout(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  if (nodes.length === 0) return [];

  const laidOutNodes = nodes.map(cloneNode);
  const nodeIds = new Set(laidOutNodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of laidOutNodes) {
    incoming.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) continue;
    adjacency.get(edge.sourceId)?.push(edge.targetId);
    incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? 0) + 1);
  }

  const roots = laidOutNodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.title.localeCompare(b.title));
  const queue = (roots.length > 0 ? roots : [laidOutNodes[0]]).map((node) => ({
    id: node.id,
    level: 0,
  }));
  const levels = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const knownLevel = levels.get(current.id);
    if (knownLevel !== undefined && knownLevel <= current.level) continue;

    levels.set(current.id, current.level);
    for (const targetId of adjacency.get(current.id) ?? []) {
      queue.push({ id: targetId, level: current.level + 1 });
    }
  }

  let fallbackLevel = Math.max(...levels.values(), 0) + 1;
  for (const node of laidOutNodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, fallbackLevel);
      fallbackLevel++;
    }
  }

  const nodesByLevel = new Map<number, CanvasNode[]>();
  for (const node of laidOutNodes) {
    const level = levels.get(node.id) ?? 0;
    const group = nodesByLevel.get(level) ?? [];
    group.push(node);
    nodesByLevel.set(level, group);
  }

  const maxWidth = maxNodeWidth(laidOutNodes);
  const maxHeight = maxNodeHeight(laidOutNodes);
  const levelGapY = maxHeight + 70;
  const siblingGapX = maxWidth + 50;

  for (const [level, group] of [...nodesByLevel.entries()].sort((a, b) => a[0] - b[0])) {
    group.sort((a, b) => a.title.localeCompare(b.title));
    const totalWidth = (group.length - 1) * siblingGapX;
    const startX = DEFAULT_CENTER.x - totalWidth / 2;

    group.forEach((node, index) => {
      node.position = {
        x: roundPosition(startX + index * siblingGapX),
        y: roundPosition(GRID_PADDING_Y + level * levelGapY),
      };
    });
  }

  return laidOutNodes;
}

/** Run a lightweight force-directed simulation using node positions and edge springs. */
export function forceDirectedLayout(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  if (nodes.length <= 1) return nodes.map(cloneNode);

  let laidOutNodes = nodes.map(cloneNode);
  const uniquePositions = new Set(
    laidOutNodes.map((node) => `${node.position.x}:${node.position.y}`)
  );
  if (uniquePositions.size <= 1) {
    laidOutNodes = gridLayout(laidOutNodes);
  }

  const width = 1200;
  const height = 800;
  const area = width * height;
  const iterations = 50;
  const springLength = Math.sqrt(area / laidOutNodes.length);
  const indexById = new Map(laidOutNodes.map((node, index) => [node.id, index]));

  for (let iteration = 0; iteration < iterations; iteration++) {
    const forces = laidOutNodes.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < laidOutNodes.length; i++) {
      for (let j = i + 1; j < laidOutNodes.length; j++) {
        const dx = laidOutNodes[i].position.x - laidOutNodes[j].position.x;
        const dy = laidOutNodes[i].position.y - laidOutNodes[j].position.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const repulsion = (springLength * springLength) / distance;
        const fx = (dx / distance) * repulsion;
        const fy = (dy / distance) * repulsion;
        forces[i].x += fx;
        forces[i].y += fy;
        forces[j].x -= fx;
        forces[j].y -= fy;
      }
    }

    for (const edge of edges) {
      const sourceIndex = indexById.get(edge.sourceId);
      const targetIndex = indexById.get(edge.targetId);
      if (sourceIndex === undefined || targetIndex === undefined) continue;

      const dx = laidOutNodes[sourceIndex].position.x - laidOutNodes[targetIndex].position.x;
      const dy = laidOutNodes[sourceIndex].position.y - laidOutNodes[targetIndex].position.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const attraction = (distance * distance) / springLength;
      const fx = (dx / distance) * attraction;
      const fy = (dy / distance) * attraction;

      forces[sourceIndex].x -= fx;
      forces[sourceIndex].y -= fy;
      forces[targetIndex].x += fx;
      forces[targetIndex].y += fy;
    }

    const temperature = 30 * (1 - iteration / iterations);

    laidOutNodes = laidOutNodes.map((node, index) => {
      const force = forces[index];
      const displacement = Math.max(Math.hypot(force.x, force.y), 1);
      const limited = Math.min(displacement, temperature);
      const x = node.position.x + (force.x / displacement) * limited;
      const y = node.position.y + (force.y / displacement) * limited;

      return {
        ...node,
        position: {
          x: roundPosition(clamp(x, 20, width - node.size.width - 20)),
          y: roundPosition(clamp(y, 20, height - node.size.height - 20)),
        },
      };
    });
  }

  return laidOutNodes;
}
