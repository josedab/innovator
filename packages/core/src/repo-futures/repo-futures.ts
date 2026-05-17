// Builds capability graph from file listings
// Detects deltas between two graphs
// Generates innovation opportunities from deltas
// Noise suppression via confidence thresholds

import { randomUUID } from "node:crypto";
import {
  CapabilityGraphSchema,
  CapabilityNodeSchema,
  CodeDeltaSchema,
  InnovationOpportunitySchema,
  type CapabilityGraph,
  type CapabilityNode,
  type CodeDelta,
  type InnovationOpportunity,
} from "./types.js";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function titleCase(input: string): string {
  return input
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function inferCapabilityType(
  path: string,
  explicitType?: string
): CapabilityNode["type"] {
  const haystack = `${explicitType ?? ""} ${path}`.toLowerCase();

  if (["api", "route", "graphql", "rpc", "endpoint"].some((token) => haystack.includes(token))) {
    return "api";
  }
  if (["service", "worker", "server", "bot", "daemon"].some((token) => haystack.includes(token))) {
    return "service";
  }
  if (
    ["infra", "infrastructure", "terraform", "helm", "k8s", "kubernetes", "docker", "deploy"].some(
      (token) => haystack.includes(token)
    )
  ) {
    return "infrastructure";
  }
  if (["lib", "library", "sdk", "core", "package"].some((token) => haystack.includes(token))) {
    return "library";
  }

  return "module";
}

function deriveCapabilityIds(path: string, explicitType?: string): {
  rootId: string;
  rootName: string;
  rootType: CapabilityNode["type"];
  nodeId: string;
  nodeName: string;
  nodeType: CapabilityNode["type"];
} {
  const normalized = normalizePath(path);
  const parts = normalized.split("/").filter(Boolean);

  if (parts[0] === "packages" && parts.length >= 2) {
    const rootId = `packages/${parts[1]}`;
    const moduleSegment = parts[2] === "src" ? parts[3] : parts[2];
    const nodeId = moduleSegment && !moduleSegment.includes(".") ? `${rootId}/${moduleSegment}` : rootId;
    return {
      rootId,
      rootName: titleCase(parts[1]),
      rootType: "library",
      nodeId,
      nodeName: nodeId === rootId ? titleCase(parts[1]) : `${titleCase(parts[1])} ${titleCase(moduleSegment)}`,
      nodeType: inferCapabilityType(normalized, explicitType),
    };
  }

  if (parts[0] === "apps" && parts.length >= 2) {
    const rootId = `apps/${parts[1]}`;
    const moduleSegment = parts[2] === "src" ? parts[3] : parts[2];
    const nodeId = moduleSegment && !moduleSegment.includes(".") ? `${rootId}/${moduleSegment}` : rootId;
    return {
      rootId,
      rootName: titleCase(parts[1]),
      rootType: inferCapabilityType(rootId, explicitType === "api" ? "service" : explicitType),
      nodeId,
      nodeName: nodeId === rootId ? titleCase(parts[1]) : `${titleCase(parts[1])} ${titleCase(moduleSegment)}`,
      nodeType: inferCapabilityType(normalized, explicitType),
    };
  }

  const rootId = parts.slice(0, Math.min(2, parts.length)).join("/") || "repository";
  const moduleSegment = parts[2] && !parts[2].includes(".") ? parts[2] : undefined;
  const nodeId = moduleSegment ? `${rootId}/${moduleSegment}` : rootId;

  return {
    rootId,
    rootName: titleCase(parts[0] ?? "repository"),
    rootType: inferCapabilityType(rootId, explicitType),
    nodeId,
    nodeName: titleCase(nodeId.split("/").slice(-1)[0] ?? rootId),
    nodeType: inferCapabilityType(normalized, explicitType),
  };
}

function ensureNode(
  nodes: Map<string, CapabilityNode>,
  id: string,
  name: string,
  type: CapabilityNode["type"],
  dependencies: string[] = []
): CapabilityNode {
  const existing = nodes.get(id);
  if (existing) {
    const merged = CapabilityNodeSchema.parse({
      ...existing,
      name,
      type: existing.type === "module" ? type : existing.type,
      dependencies: [...new Set([...existing.dependencies, ...dependencies])].slice(0, 50),
      metadata: existing.metadata,
    });
    nodes.set(id, merged);
    return merged;
  }

  const created = CapabilityNodeSchema.parse({
    id,
    name,
    type,
    description: `Capability inferred from repository paths under ${id}.`,
    dependencies: [...new Set(dependencies)].slice(0, 50),
    metadata: {
      sourcePaths: [],
      fileCount: 0,
    },
  });
  nodes.set(id, created);
  return created;
}

function attachPath(node: CapabilityNode, path: string, explicitType?: string): CapabilityNode {
  const metadata = (node.metadata ?? {}) as Record<string, unknown>;
  const sourcePaths = Array.isArray(metadata.sourcePaths)
    ? metadata.sourcePaths.filter((entry): entry is string => typeof entry === "string")
    : [];
  const types = Array.isArray(metadata.fileTypes)
    ? metadata.fileTypes.filter((entry): entry is string => typeof entry === "string")
    : [];

  const updated = CapabilityNodeSchema.parse({
    ...node,
    metadata: {
      ...metadata,
      sourcePaths: [...new Set([...sourcePaths, path])].sort(),
      fileTypes: explicitType ? [...new Set([...types, explicitType])] : types,
      fileCount: [...new Set([...sourcePaths, path])].length,
    },
  });

  return updated;
}

function extractSourcePaths(node: CapabilityNode): string[] {
  const metadata = (node.metadata ?? {}) as Record<string, unknown>;
  const sourcePaths = metadata.sourcePaths;
  return Array.isArray(sourcePaths)
    ? sourcePaths.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function buildPathIndex(graph: CapabilityGraph): Map<string, { nodeId: string; nodeType: CapabilityNode["type"] }> {
  const index = new Map<string, { nodeId: string; nodeType: CapabilityNode["type"] }>();

  for (const node of graph.nodes) {
    for (const path of extractSourcePaths(node)) {
      index.set(path, { nodeId: node.id, nodeType: node.type });
    }
  }

  return index;
}

function findUnlockedNodes(paths: string[], graph: CapabilityGraph): string[] {
  const pathIndex = buildPathIndex(graph);
  return [...new Set(paths.map((path) => pathIndex.get(path)?.nodeId).filter((value): value is string => Boolean(value)))];
}

function createOpportunity(params: Omit<InnovationOpportunity, "id">): InnovationOpportunity {
  return InnovationOpportunitySchema.parse({
    id: randomUUID(),
    ...params,
  });
}

// Builds capability graph from file listings
export function buildCapabilityGraph(files: Array<{ path: string; type?: string }>): CapabilityGraph {
  const nodes = new Map<string, CapabilityNode>();
  const edges = new Map<string, CapabilityGraph["edges"][number]>();

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!normalizedPath) continue;

    const capability = deriveCapabilityIds(normalizedPath, file.type);
    ensureNode(nodes, capability.rootId, capability.rootName, capability.rootType);

    const targetId = capability.nodeId;
    const target = ensureNode(
      nodes,
      targetId,
      capability.nodeName,
      capability.nodeType,
      targetId === capability.rootId ? [] : [capability.rootId]
    );
    nodes.set(targetId, attachPath(target, normalizedPath, file.type));

    if (targetId !== capability.rootId) {
      edges.set(`${targetId}:${capability.rootId}:depends-on`, {
        from: targetId,
        to: capability.rootId,
        type: "depends-on",
      });
    }
  }

  return CapabilityGraphSchema.parse({
    nodes: Array.from(nodes.values()).sort((left, right) => left.id.localeCompare(right.id)),
    edges: Array.from(edges.values()).sort(
      (left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`)
    ),
    analyzedAt: new Date().toISOString(),
  });
}

// Detects deltas between two graphs
export function detectDelta(before: CapabilityGraph, after: CapabilityGraph): CodeDelta {
  const beforePaths = buildPathIndex(before);
  const afterPaths = buildPathIndex(after);
  const files: CodeDelta["files"] = [];

  for (const [path, details] of afterPaths.entries()) {
    const previous = beforePaths.get(path);
    if (!previous) {
      files.push({
        path,
        changeType: "added",
        summary: `New ${details.nodeType} capability surfaced in ${details.nodeId}.`,
      });
      continue;
    }

    if (previous.nodeId !== details.nodeId || previous.nodeType !== details.nodeType) {
      files.push({
        path,
        changeType: "modified",
        summary: `Capability classification changed from ${previous.nodeId} (${previous.nodeType}) to ${details.nodeId} (${details.nodeType}).`,
      });
    }
  }

  for (const [path, details] of beforePaths.entries()) {
    if (afterPaths.has(path)) continue;
    files.push({
      path,
      changeType: "deleted",
      summary: `Capability removed from ${details.nodeId}.`,
    });
  }

  return CodeDeltaSchema.parse({
    id: randomUUID(),
    files: files.sort((left, right) => left.path.localeCompare(right.path)).slice(0, 200),
    detectedAt: new Date().toISOString(),
  });
}

// Generates innovation opportunities from deltas
export function generateOpportunities(
  delta: CodeDelta,
  graph: CapabilityGraph,
  opts?: { minConfidence?: number }
): InnovationOpportunity[] {
  const opportunities: InnovationOpportunity[] = [];
  const addedPaths = delta.files.filter((file) => file.changeType === "added").map((file) => file.path);
  const modifiedPaths = delta.files.filter((file) => file.changeType === "modified").map((file) => file.path);
  const deletedPaths = delta.files.filter((file) => file.changeType === "deleted").map((file) => file.path);
  const changedPaths = delta.files.map((file) => file.path);
  const pathIndex = buildPathIndex(graph);
  const changedNodes = changedPaths
    .map((path) => pathIndex.get(path))
    .filter((value): value is { nodeId: string; nodeType: CapabilityNode["type"] } => Boolean(value));
  const changedRoots = new Set(changedNodes.map((node) => node.nodeId.split("/").slice(0, 2).join("/")));
  const addedNodeTypes = new Set(addedPaths.map((path) => pathIndex.get(path)?.nodeType).filter(Boolean));

  if (addedNodeTypes.has("api") || addedNodeTypes.has("service")) {
    opportunities.push(
      createOpportunity({
        title: "Productize newly exposed delivery surfaces",
        description:
          "Recently added API or service capabilities can be bundled into a roadmap-ready product or partner offering.",
        confidence: 0.78,
        category: addedNodeTypes.has("api") ? "integration" : "new-product",
        unlockedBy: findUnlockedNodes(addedPaths, graph),
        effort: "medium",
        impact: "high",
        suggestedArtifacts: ["prd", "github-issue", "tech-spec"],
      })
    );
  }

  if (changedNodes.some((node) => node.nodeType === "infrastructure")) {
    opportunities.push(
      createOpportunity({
        title: "Turn infrastructure changes into a platform initiative",
        description:
          "Infrastructure movement often unlocks reusable deployment patterns, operational automation, or self-serve platform capabilities.",
        confidence: 0.68,
        category: "platform-play",
        unlockedBy: findUnlockedNodes(changedPaths, graph),
        effort: "high",
        impact: "high",
        suggestedArtifacts: ["adr", "tech-spec", "github-issue"],
      })
    );
  }

  if (changedNodes.some((node) => node.nodeType === "library" || node.nodeType === "module")) {
    opportunities.push(
      createOpportunity({
        title: "Package internal capability as a developer accelerator",
        description:
          "Changes inside core modules and libraries can often become reusable scaffolds, generators, or internal developer tools.",
        confidence: 0.62,
        category: "developer-tool",
        unlockedBy: findUnlockedNodes([...addedPaths, ...modifiedPaths], graph),
        effort: "medium",
        impact: "medium",
        suggestedArtifacts: ["github-issue", "tech-spec"],
      })
    );
  }

  if (deletedPaths.length > 0) {
    opportunities.push(
      createOpportunity({
        title: "Capture simplification gains from removed surface area",
        description:
          "Deleted capabilities suggest an opportunity to consolidate adjacent flows, retire maintenance burden, and document the streamlined target architecture.",
        confidence: 0.56,
        category: "optimization",
        unlockedBy: findUnlockedNodes([...modifiedPaths, ...deletedPaths], graph),
        effort: "low",
        impact: "medium",
        suggestedArtifacts: ["adr", "github-issue"],
      })
    );
  }

  if (changedRoots.size > 1) {
    opportunities.push(
      createOpportunity({
        title: "Connect newly changing capabilities across repository boundaries",
        description:
          "Concurrent changes across multiple apps or packages often reveal an integration opportunity that can unify user flows or platform handoffs.",
        confidence: 0.72,
        category: "integration",
        unlockedBy: findUnlockedNodes(changedPaths, graph),
        effort: "medium",
        impact: "high",
        suggestedArtifacts: ["prd", "tech-spec"],
      })
    );
  }

  if (addedPaths.length >= 3) {
    opportunities.push(
      createOpportunity({
        title: "Bundle new capability growth into a roadmap bet",
        description:
          "A cluster of added files indicates enough momentum to scope a coherent product, platform, or integration initiative around the new surface area.",
        confidence: 0.74,
        category: "new-product",
        unlockedBy: findUnlockedNodes(addedPaths, graph),
        effort: "high",
        impact: "high",
        suggestedArtifacts: ["prd", "github-issue", "tech-spec"],
      })
    );
  }

  return rankOpportunities(suppressNoise(opportunities, opts?.minConfidence ?? 0.55));
}

// Noise suppression via confidence thresholds
export function suppressNoise(
  opportunities: InnovationOpportunity[],
  threshold: number = 0.55
): InnovationOpportunity[] {
  const deduped = new Map<string, InnovationOpportunity>();

  for (const opportunity of opportunities) {
    if (opportunity.confidence < threshold) continue;
    if (opportunity.unlockedBy.length === 0) continue;

    const key = `${opportunity.category}:${opportunity.title}`;
    const existing = deduped.get(key);
    if (!existing || opportunity.confidence > existing.confidence) {
      deduped.set(key, InnovationOpportunitySchema.parse(opportunity));
    }
  }

  return Array.from(deduped.values());
}

// Ranks opportunities by impact, confidence, and relative effort
export function rankOpportunities(opportunities: InnovationOpportunity[]): InnovationOpportunity[] {
  const impactWeight = { low: 1, medium: 2, high: 3 };
  const effortWeight = { low: 3, medium: 2, high: 1 };

  return [...opportunities].sort((left, right) => {
    const leftScore = left.confidence * 10 + impactWeight[left.impact] * 4 + effortWeight[left.effort] * 2;
    const rightScore = right.confidence * 10 + impactWeight[right.impact] * 4 + effortWeight[right.effort] * 2;
    return rightScore - leftScore || right.title.localeCompare(left.title);
  });
}
