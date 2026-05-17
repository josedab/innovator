/**
 * @module knowledge-graph/graph-visualizer
 *
 * Computes force-directed layouts and provides visualization utilities
 * for the knowledge graph. Produces positioned nodes, edges, clusters,
 * and insight suggestions for the graph explorer UI.
 */

import type { EntityNode, RelationshipEdge } from "./index.js";

// ---- Types ----

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  size: number;
  color: string;
  x: number;
  y: number;
  cluster: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  label: string;
}

export interface GraphCluster {
  id: number;
  label: string;
  nodeIds: string[];
  dominantType: string;
  centerX: number;
  centerY: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
  repulsionStrength?: number;
  attractionStrength?: number;
  damping?: number;
}

export interface InsightSuggestion {
  type: "bridge-node" | "isolated-cluster" | "trending-entity" | "gap-analysis";
  title: string;
  description: string;
  entityIds: string[];
  confidence: number;
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

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  width: 800,
  height: 600,
  iterations: 100,
  repulsionStrength: 3000,
  attractionStrength: 0.01,
  damping: 0.85,
};

// ---- GraphVisualizer Class ----

export class GraphVisualizer {
  /**
   * Compute a force-directed layout using a simplified Barnes-Hut algorithm.
   * Positions nodes via repulsion (all pairs) and attraction (edges).
   */
  computeForceLayout(
    entities: EntityNode[],
    relationships: RelationshipEdge[],
    options?: LayoutOptions
  ): GraphLayout {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { width, height, iterations, repulsionStrength, attractionStrength, damping } = opts;

    if (entities.length === 0) {
      return {
        nodes: [],
        edges: [],
        clusters: [],
        bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
      };
    }

    // Initialize node positions in a circle
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.35;

    const nodes: Array<GraphNode & { vx: number; vy: number }> = entities.map((e, i) => {
      const angle = (2 * Math.PI * i) / entities.length;
      return {
        id: e.id,
        label: e.label,
        type: e.type,
        size: Math.max(8, Math.min(40, e.occurrenceCount * 4)),
        color: TYPE_COLORS[e.type] ?? "#6b7280",
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        cluster: 0,
        vx: 0,
        vy: 0,
      };
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Run force simulation
    for (let tick = 0; tick < iterations; tick++) {
      const alpha = 1 - tick / iterations;

      // Repulsion between all node pairs (Barnes-Hut simplified: direct pairwise)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (repulsionStrength * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of relationships) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * attractionStrength * edge.weight * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (cx - node.x) * 0.005 * alpha;
        node.vy += (cy - node.y) * 0.005 * alpha;
      }

      // Apply velocity with damping and boundary clamping
      const margin = 30;
      for (const node of nodes) {
        node.vx *= damping;
        node.vy *= damping;
        node.x = Math.max(margin, Math.min(width - margin, node.x + node.vx));
        node.y = Math.max(margin, Math.min(height - margin, node.y + node.vy));
      }
    }

    // Build clusters
    const clusters = this.clusterByDomain(nodes);
    for (const cluster of clusters) {
      for (const nodeId of cluster.nodeIds) {
        const node = nodeMap.get(nodeId);
        if (node) node.cluster = cluster.id;
      }
    }

    // Compute bounds
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };

    // Build edges
    const edges: GraphEdge[] = relationships
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        type: e.type,
        label: e.label ?? e.type,
      }));

    // Strip velocity from output
    const outputNodes: GraphNode[] = nodes.map(({ vx: _vx, vy: _vy, ...rest }) => rest);

    return { nodes: outputNodes, edges, clusters, bounds };
  }

  /**
   * Group nodes into clusters using connected components.
   */
  clusterByDomain(nodes: GraphNode[]): GraphCluster[] {
    if (nodes.length === 0) return [];

    // Group by type as a simple domain clustering heuristic
    const typeGroups = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      const group = typeGroups.get(node.type) ?? [];
      group.push(node);
      typeGroups.set(node.type, group);
    }

    const clusters: GraphCluster[] = [];
    let clusterId = 0;
    for (const [type, group] of typeGroups) {
      if (group.length < 1) continue;
      const centerX = group.reduce((sum, n) => sum + n.x, 0) / group.length;
      const centerY = group.reduce((sum, n) => sum + n.y, 0) / group.length;
      clusters.push({
        id: clusterId++,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        nodeIds: group.map((n) => n.id),
        dominantType: type,
        centerX,
        centerY,
      });
    }

    return clusters;
  }

  /**
   * Filter layout to entities active within a given time range.
   */
  filterByTimeRange(
    layout: GraphLayout,
    from: string,
    to: string,
    entities: EntityNode[]
  ): GraphLayout {
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    const validIds = new Set<string>();

    for (const node of layout.nodes) {
      const entity = entityMap.get(node.id);
      if (entity) {
        const first = entity.firstSeen;
        const last = entity.lastSeen;
        if (last >= from && first <= to) {
          validIds.add(node.id);
        }
      }
    }

    const filteredNodes = layout.nodes.filter((n) => validIds.has(n.id));
    const filteredEdges = layout.edges.filter(
      (e) => validIds.has(e.source) && validIds.has(e.target)
    );
    const filteredClusters = layout.clusters
      .map((c) => ({
        ...c,
        nodeIds: c.nodeIds.filter((id) => validIds.has(id)),
      }))
      .filter((c) => c.nodeIds.length > 0);

    return { ...layout, nodes: filteredNodes, edges: filteredEdges, clusters: filteredClusters };
  }

  /**
   * Fuzzy search on node labels.
   */
  searchNodes(layout: GraphLayout, query: string): GraphNode[] {
    if (!query.trim()) return layout.nodes;
    const q = query.toLowerCase().trim();
    const terms = q.split(/\s+/);

    return layout.nodes
      .filter((node) => {
        const label = node.label.toLowerCase();
        return terms.some((t) => label.includes(t));
      })
      .sort((a, b) => {
        const aExact = a.label.toLowerCase() === q ? 1 : 0;
        const bExact = b.label.toLowerCase() === q ? 1 : 0;
        return bExact - aExact || b.size - a.size;
      });
  }

  /**
   * Get nodes within N hops of a given node.
   */
  getNodeNeighborhood(layout: GraphLayout, nodeId: string, depth: number = 1): GraphLayout {
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of layout.edges) {
          const neighborId =
            edge.source === id ? edge.target : edge.target === id ? edge.source : null;
          if (neighborId && !visited.has(neighborId)) {
            visited.add(neighborId);
            next.push(neighborId);
          }
        }
      }
      frontier = next;
    }

    const filteredNodes = layout.nodes.filter((n) => visited.has(n.id));
    const filteredEdges = layout.edges.filter(
      (e) => visited.has(e.source) && visited.has(e.target)
    );
    const filteredClusters = layout.clusters
      .map((c) => ({ ...c, nodeIds: c.nodeIds.filter((id) => visited.has(id)) }))
      .filter((c) => c.nodeIds.length > 0);

    return { ...layout, nodes: filteredNodes, edges: filteredEdges, clusters: filteredClusters };
  }

  /**
   * Generate insight suggestions from graph structure.
   */
  getInsightSuggestions(layout: GraphLayout): InsightSuggestion[] {
    const insights: InsightSuggestion[] = [];

    // 1. Bridge nodes (high betweenness centrality approximation)
    const connectionCounts = new Map<string, number>();
    for (const edge of layout.edges) {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
    }

    // Find nodes connected to multiple clusters
    const bridgeNodes = layout.nodes.filter((node) => {
      const neighbors = layout.edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => (e.source === node.id ? e.target : e.source));
      const neighborClusters = new Set(
        neighbors
          .map((nId) => layout.nodes.find((n) => n.id === nId)?.cluster)
          .filter((c) => c !== undefined)
      );
      return neighborClusters.size >= 2;
    });

    if (bridgeNodes.length > 0) {
      insights.push({
        type: "bridge-node",
        title: "Bridge Concepts",
        description: `These entities connect different clusters: ${bridgeNodes
          .slice(0, 3)
          .map((n) => n.label)
          .join(", ")}. They may be key interdisciplinary connectors.`,
        entityIds: bridgeNodes.slice(0, 5).map((n) => n.id),
        confidence: 0.8,
      });
    }

    // 2. Isolated clusters
    const clusterEdgeCounts = new Map<string, number>();
    for (const edge of layout.edges) {
      const srcCluster = layout.nodes.find((n) => n.id === edge.source)?.cluster;
      const tgtCluster = layout.nodes.find((n) => n.id === edge.target)?.cluster;
      if (srcCluster !== undefined && tgtCluster !== undefined && srcCluster !== tgtCluster) {
        const key = [srcCluster, tgtCluster].sort().join("-");
        clusterEdgeCounts.set(key, (clusterEdgeCounts.get(key) ?? 0) + 1);
      }
    }

    const isolatedClusters = layout.clusters.filter((cluster) => {
      const hasExternal = Array.from(clusterEdgeCounts.keys()).some((key) =>
        key.split("-").includes(String(cluster.id))
      );
      return !hasExternal && cluster.nodeIds.length >= 2;
    });

    if (isolatedClusters.length > 0) {
      insights.push({
        type: "isolated-cluster",
        title: "Isolated Knowledge Clusters",
        description: `${isolatedClusters.length} cluster(s) have no connections to others: ${isolatedClusters
          .map((c) => c.label)
          .join(", ")}. Connecting these could reveal new insights.`,
        entityIds: isolatedClusters.flatMap((c) => c.nodeIds.slice(0, 2)),
        confidence: 0.7,
      });
    }

    // 3. Trending entities (highest connection count relative to cluster size)
    const sortedByConnections = Array.from(connectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sortedByConnections.length > 0) {
      const trendingNodes = sortedByConnections
        .map(([id]) => layout.nodes.find((n) => n.id === id))
        .filter((n): n is GraphNode => n !== undefined);

      if (trendingNodes.length > 0) {
        insights.push({
          type: "trending-entity",
          title: "Most Connected Entities",
          description: `Highest connectivity: ${trendingNodes
            .slice(0, 3)
            .map((n) => `${n.label} (${connectionCounts.get(n.id)} connections)`)
            .join(", ")}`,
          entityIds: trendingNodes.map((n) => n.id),
          confidence: 0.85,
        });
      }
    }

    // 4. Gap analysis (domain pairs with few connections between them)
    if (layout.clusters.length >= 2) {
      const clusterPairs: Array<{ a: GraphCluster; b: GraphCluster; connections: number }> = [];
      for (let i = 0; i < layout.clusters.length; i++) {
        for (let j = i + 1; j < layout.clusters.length; j++) {
          const key = [layout.clusters[i].id, layout.clusters[j].id].sort().join("-");
          clusterPairs.push({
            a: layout.clusters[i],
            b: layout.clusters[j],
            connections: clusterEdgeCounts.get(key) ?? 0,
          });
        }
      }

      const gaps = clusterPairs.filter((p) => p.connections === 0).slice(0, 3);

      if (gaps.length > 0) {
        insights.push({
          type: "gap-analysis",
          title: "Knowledge Gaps",
          description: `No connections between: ${gaps
            .map((g) => `${g.a.label} ↔ ${g.b.label}`)
            .join("; ")}. Bridging these domains could unlock new innovation angles.`,
          entityIds: gaps.flatMap((g) => [...g.a.nodeIds.slice(0, 1), ...g.b.nodeIds.slice(0, 1)]),
          confidence: 0.65,
        });
      }
    }

    return insights;
  }
}
