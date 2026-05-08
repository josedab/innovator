/**
 * @module cross-repo
 *
 * Cross-Repository Innovation Graph — scans multiple repositories to
 * build a unified innovation graph showing shared dependencies,
 * common patterns, technology overlap, and cross-boundary opportunities.
 * Enables discovery of reusable libraries, integration points, and
 * innovation gaps across an organization's codebase portfolio.
 */

import { z } from "zod";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

// ---- Schemas ----

/** Schema for a repository dependency entry. */
export const RepoDependencySchema = z.object({
  name: z.string().max(200),
  version: z.string().max(50),
});

/** Schema for scanned repository information. */
export const RepoInfoSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  url: z.string().max(500),
  language: z.string().max(50),
  dependencies: z.array(RepoDependencySchema).max(500),
  patterns: z.array(z.string().max(200)).max(100),
  architecturalLayers: z.array(z.string().max(200)).max(50),
  techStack: z.array(z.string().max(100)).max(50),
});

/** Schema for an innovation graph node. */
export const GraphNodeSchema = z.object({
  id: z.string().max(300),
  type: z.enum(["repo", "dependency", "pattern", "technology", "opportunity"]),
  label: z.string().max(300),
  metadata: z.record(z.unknown()).optional(),
  repos: z.array(z.string().max(200)).max(200).describe("Repos that contain this node"),
});

/** Schema for an innovation graph edge. */
export const GraphEdgeSchema = z.object({
  source: z.string().max(300),
  target: z.string().max(300),
  type: z.enum([
    "depends-on",
    "shares-pattern",
    "uses-technology",
    "overlaps-with",
    "opportunity-link",
  ]),
  weight: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
});

/** Schema for a cluster of related repositories. */
export const RepoClusterSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(300),
  repoIds: z.array(z.string().max(200)).max(200),
  sharedTechnologies: z.array(z.string().max(100)).max(50),
});

/** Schema for a detected innovation gap. */
export const InnovationGapSchema = z.object({
  type: z.enum(["missing-technology", "pattern-opportunity", "integration-gap"]),
  description: z.string().max(1000),
  affectedRepos: z.array(z.string().max(200)).max(200),
  suggestedAction: z.string().max(500),
});

/** Schema for the full cross-repository innovation graph. */
export const CrossRepoGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  clusters: z.array(RepoClusterSchema),
  gaps: z.array(InnovationGapSchema),
  createdAt: z.string(),
});

// ---- Types ----

export type RepoDependency = z.infer<typeof RepoDependencySchema>;
export type RepoInfo = z.infer<typeof RepoInfoSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type RepoCluster = z.infer<typeof RepoClusterSchema>;
export type InnovationGap = z.infer<typeof InnovationGapSchema>;
export type CrossRepoGraph = z.infer<typeof CrossRepoGraphSchema>;

// ---- Repository Scanning ----

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".swift": "Swift",
  ".kt": "Kotlin",
};

const PATTERN_INDICATORS: Record<string, string[]> = {
  middleware: ["middleware", "interceptor"],
  MVC: ["controllers", "models", "views"],
  "component-based": ["components", "widgets"],
  "event-driven": ["events", "listeners", "handlers", "subscribers"],
  "plugin-architecture": ["plugins", "extensions", "addons"],
  microservices: ["services", "gateway", "api-gateway"],
  monorepo: ["packages", "workspaces", "apps"],
  testing: ["__tests__", "test", "spec", "tests"],
  "CI/CD": [".github/workflows", ".circleci", ".gitlab-ci"],
};

const LAYER_DIRECTORIES: Record<string, string> = {
  src: "source",
  lib: "library",
  api: "API",
  ui: "UI",
  core: "core",
  utils: "utilities",
  config: "configuration",
  db: "database",
  models: "data-models",
  services: "services",
  controllers: "controllers",
  middleware: "middleware",
  routes: "routing",
  hooks: "hooks",
  store: "state-management",
};

const TECH_STACK_INDICATORS: Record<string, string[]> = {
  React: ["react", "react-dom"],
  Next: ["next"],
  Vue: ["vue"],
  Angular: ["@angular/core"],
  Express: ["express"],
  Fastify: ["fastify"],
  Prisma: ["prisma", "@prisma/client"],
  Docker: ["Dockerfile"],
  Kubernetes: ["k8s", "kubernetes"],
  GraphQL: ["graphql", "apollo-server", "@apollo/client"],
  REST: ["express", "fastify", "koa"],
  Tailwind: ["tailwindcss"],
  Webpack: ["webpack"],
  Vite: ["vite"],
  Vitest: ["vitest"],
  Jest: ["jest"],
  ESLint: ["eslint"],
  Prettier: ["prettier"],
};

/**
 * Scan a single repository to extract structural information.
 *
 * @param repoPath - Absolute path to the repository root
 * @param signal - Optional AbortSignal for cancellation
 * @returns Scanned repository information
 */
export function scanRepository(repoPath: string, signal?: AbortSignal): RepoInfo {
  signal?.throwIfAborted();

  const name = basename(repoPath);
  const id = `repo-${name}`;

  // Read package.json if present
  const pkgPath = join(repoPath, "package.json");
  let dependencies: RepoDependency[] = [];
  let depNames: string[] = [];
  let url = "";

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      url = pkg.repository?.url ?? pkg.repository ?? "";
      const allDeps: Record<string, string> = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      dependencies = Object.entries(allDeps).map(([n, v]) => ({
        name: n,
        version: String(v),
      }));
      depNames = Object.keys(allDeps);
    } catch {
      // Ignore parse errors
    }
  }

  signal?.throwIfAborted();

  // Detect primary language from file extensions
  const extensionCounts = new Map<string, number>();
  collectExtensions(repoPath, extensionCounts, 0, 4);
  let language = "Unknown";
  let maxCount = 0;
  for (const [ext, count] of extensionCounts) {
    if (LANGUAGE_EXTENSIONS[ext] && count > maxCount) {
      maxCount = count;
      language = LANGUAGE_EXTENSIONS[ext];
    }
  }

  signal?.throwIfAborted();

  // Detect patterns from directory structure
  const patterns: string[] = [];
  const topDirs = safeReaddir(repoPath);
  for (const [pattern, indicators] of Object.entries(PATTERN_INDICATORS)) {
    if (indicators.some((ind) => topDirs.some((d) => d.toLowerCase().includes(ind)))) {
      patterns.push(pattern);
    }
  }

  // Detect architectural layers
  const architecturalLayers: string[] = [];
  for (const dir of topDirs) {
    const layer = LAYER_DIRECTORIES[dir.toLowerCase()];
    if (layer) architecturalLayers.push(layer);
  }
  // Also check under src/
  const srcDir = join(repoPath, "src");
  if (existsSync(srcDir)) {
    for (const dir of safeReaddir(srcDir)) {
      const layer = LAYER_DIRECTORIES[dir.toLowerCase()];
      if (layer && !architecturalLayers.includes(layer)) {
        architecturalLayers.push(layer);
      }
    }
  }

  // Detect tech stack from dependencies and files
  const techStack: string[] = [];
  for (const [tech, indicators] of Object.entries(TECH_STACK_INDICATORS)) {
    const fromDeps = indicators.some((ind) => depNames.includes(ind));
    const fromFiles = indicators.some((ind) => topDirs.includes(ind));
    if (fromDeps || fromFiles) {
      techStack.push(tech);
    }
  }

  return RepoInfoSchema.parse({
    id,
    name,
    url,
    language,
    dependencies,
    patterns,
    architecturalLayers,
    techStack,
  });
}

/**
 * Scan multiple repositories concurrently.
 *
 * @param repoPaths - Array of absolute paths to repository roots
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of scanned repository information
 */
export async function scanRepositories(
  repoPaths: string[],
  signal?: AbortSignal
): Promise<RepoInfo[]> {
  signal?.throwIfAborted();

  const results = await Promise.allSettled(
    repoPaths.map((p) => Promise.resolve().then(() => scanRepository(p, signal)))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<RepoInfo> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---- Graph Building ----

/**
 * Build a cross-repository innovation graph from scanned repo data.
 *
 * @param repos - Array of scanned repository information
 * @returns The complete innovation graph
 */
export function buildInnovationGraph(repos: RepoInfo[]): CrossRepoGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIndex = new Map<string, GraphNode>();

  const addNode = (node: GraphNode): void => {
    if (!nodeIndex.has(node.id)) {
      nodeIndex.set(node.id, node);
      nodes.push(node);
    }
  };

  const addRepoToNode = (nodeId: string, repoId: string): void => {
    const node = nodeIndex.get(nodeId);
    if (node && !node.repos.includes(repoId)) {
      node.repos.push(repoId);
    }
  };

  // Create repo nodes
  for (const repo of repos) {
    addNode({
      id: repo.id,
      type: "repo",
      label: repo.name,
      metadata: { language: repo.language, url: repo.url },
      repos: [repo.id],
    });

    // Create dependency nodes and edges
    for (const dep of repo.dependencies) {
      const depId = `dep-${dep.name}`;
      if (!nodeIndex.has(depId)) {
        addNode({
          id: depId,
          type: "dependency",
          label: dep.name,
          metadata: { latestVersion: dep.version },
          repos: [],
        });
      }
      addRepoToNode(depId, repo.id);
      edges.push({
        source: repo.id,
        target: depId,
        type: "depends-on",
        weight: 0.5,
      });
    }

    // Create pattern nodes and edges
    for (const pattern of repo.patterns) {
      const patId = `pat-${pattern}`;
      if (!nodeIndex.has(patId)) {
        addNode({
          id: patId,
          type: "pattern",
          label: pattern,
          repos: [],
        });
      }
      addRepoToNode(patId, repo.id);
      edges.push({
        source: repo.id,
        target: patId,
        type: "shares-pattern",
        weight: 0.6,
      });
    }

    // Create technology nodes and edges
    for (const tech of repo.techStack) {
      const techId = `tech-${tech}`;
      if (!nodeIndex.has(techId)) {
        addNode({
          id: techId,
          type: "technology",
          label: tech,
          repos: [],
        });
      }
      addRepoToNode(techId, repo.id);
      edges.push({
        source: repo.id,
        target: techId,
        type: "uses-technology",
        weight: 0.7,
      });
    }
  }

  // Add overlap edges between repos sharing dependencies
  for (let i = 0; i < repos.length; i++) {
    for (let j = i + 1; j < repos.length; j++) {
      const depsA = new Set(repos[i].dependencies.map((d) => d.name));
      const depsB = new Set(repos[j].dependencies.map((d) => d.name));
      const shared = [...depsA].filter((d) => depsB.has(d));
      if (shared.length > 0) {
        const weight = Math.min(1, shared.length / Math.max(depsA.size, depsB.size));
        edges.push({
          source: repos[i].id,
          target: repos[j].id,
          type: "overlaps-with",
          weight: Math.round(weight * 100) / 100,
          metadata: { sharedDeps: shared.length },
        });
      }
    }
  }

  // Identify clusters of related repos
  const clusters = identifyClusters(repos, edges);

  // Detect gaps
  const gaps = detectGaps(repos);

  return CrossRepoGraphSchema.parse({
    nodes,
    edges,
    clusters,
    gaps,
    createdAt: new Date().toISOString(),
  });
}

// ---- Entity Resolution ----

/**
 * Resolve duplicate entities in the graph by normalizing names
 * and merging equivalent nodes.
 *
 * @param graph - The innovation graph to resolve
 * @returns A new graph with deduplicated nodes
 */
export function resolveEntities(graph: CrossRepoGraph): CrossRepoGraph {
  const normalizeLabel = (label: string): string =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const canonicalMap = new Map<string, string>(); // normalized -> first node id
  const mergeMap = new Map<string, string>(); // old id -> canonical id
  const mergedNodes: GraphNode[] = [];
  const seenNormalized = new Map<string, GraphNode>();

  for (const node of graph.nodes) {
    if (node.type === "repo") {
      mergedNodes.push(node);
      continue;
    }

    const normalized = normalizeLabel(node.label);
    const existing = seenNormalized.get(normalized);

    if (existing) {
      // Merge repos into existing node
      for (const r of node.repos) {
        if (!existing.repos.includes(r)) existing.repos.push(r);
      }
      mergeMap.set(node.id, existing.id);
    } else {
      seenNormalized.set(normalized, node);
      canonicalMap.set(normalized, node.id);
      mergedNodes.push(node);
    }
  }

  // Remap edges
  const remappedEdges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    const source = mergeMap.get(edge.source) ?? edge.source;
    const target = mergeMap.get(edge.target) ?? edge.target;
    if (source === target) continue;
    const key = `${source}|${target}|${edge.type}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    remappedEdges.push({ ...edge, source, target });
  }

  return CrossRepoGraphSchema.parse({
    ...graph,
    nodes: mergedNodes,
    edges: remappedEdges,
  });
}

// ---- Opportunity Detection (LLM) ----

/** Schema for a cross-repo innovation opportunity. */
export const CrossRepoOpportunitySchema = z.object({
  title: z.string().max(300),
  description: z.string().max(1000),
  type: z.enum(["shared-library", "pattern-reuse", "integration", "consolidation"]),
  involvedRepos: z.array(z.string().max(200)).max(50),
  estimatedImpact: z.enum(["low", "medium", "high"]),
  suggestedSteps: z.array(z.string().max(500)).max(10),
});

export type CrossRepoOpportunity = z.infer<typeof CrossRepoOpportunitySchema>;

/**
 * Use LLM analysis to detect cross-repo innovation opportunities
 * from the graph structure.
 *
 * @param graph - The innovation graph to analyze
 * @param model - Optional LLM model identifier
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of detected opportunities
 */
export async function detectCrossRepoOpportunities(
  graph: CrossRepoGraph,
  model?: string,
  signal?: AbortSignal
): Promise<CrossRepoOpportunity[]> {
  const { generateText, extractJson } = await import("../copilot/client.js");
  const { withRetry } = await import("../copilot/retry.js");
  const { wrapUserInput } = await import("../prompts/sanitize.js");

  const summary = buildGraphSummary(graph);

  const prompt = `You are an expert software architect analyzing a cross-repository innovation graph.

${wrapUserInput("GRAPH SUMMARY", summary)}

Based on this graph, identify actionable cross-repository innovation opportunities.
Consider:
- Shared dependencies that could become internal libraries
- Common patterns that could be extracted into reusable modules
- Integration opportunities between repos with overlapping tech stacks
- Consolidation of duplicate technologies

Return a JSON array of opportunities:
[
  {
    "title": "short title",
    "description": "detailed description of the opportunity",
    "type": "shared-library" | "pattern-reuse" | "integration" | "consolidation",
    "involvedRepos": ["repo-name-1", "repo-name-2"],
    "estimatedImpact": "low" | "medium" | "high",
    "suggestedSteps": ["step 1", "step 2"]
  }
]`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : (parsed.opportunities ?? []);
    return items.map((item: unknown) => CrossRepoOpportunitySchema.parse(item));
  } catch {
    return [];
  }
}

// ---- Graph Export ----

/**
 * Export the graph as a Markdown report.
 */
export function graphToMarkdown(graph: CrossRepoGraph): string {
  const lines: string[] = [
    "# Cross-Repository Innovation Graph",
    "",
    `**Generated:** ${graph.createdAt}`,
    `**Repositories:** ${graph.nodes.filter((n) => n.type === "repo").length}`,
    `**Nodes:** ${graph.nodes.length}`,
    `**Edges:** ${graph.edges.length}`,
    "",
  ];

  // Repositories
  const repoNodes = graph.nodes.filter((n) => n.type === "repo");
  if (repoNodes.length > 0) {
    lines.push("## Repositories", "");
    for (const node of repoNodes) {
      lines.push(
        `- **${node.label}** (${(node.metadata as Record<string, unknown>)?.language ?? "Unknown"})`
      );
    }
    lines.push("");
  }

  // Clusters
  if (graph.clusters.length > 0) {
    lines.push("## Clusters", "");
    for (const cluster of graph.clusters) {
      lines.push(`### ${cluster.label}`);
      lines.push(`Repos: ${cluster.repoIds.join(", ")}`);
      if (cluster.sharedTechnologies.length > 0) {
        lines.push(`Shared tech: ${cluster.sharedTechnologies.join(", ")}`);
      }
      lines.push("");
    }
  }

  // Gaps
  if (graph.gaps.length > 0) {
    lines.push("## Innovation Gaps", "");
    for (const gap of graph.gaps) {
      lines.push(`- **${gap.type}**: ${gap.description}`);
      lines.push(`  - Affected: ${gap.affectedRepos.join(", ")}`);
      lines.push(`  - Action: ${gap.suggestedAction}`);
    }
    lines.push("");
  }

  // Shared dependencies
  const sharedDeps = graph.nodes.filter((n) => n.type === "dependency" && n.repos.length > 1);
  if (sharedDeps.length > 0) {
    lines.push("## Shared Dependencies", "");
    lines.push("| Dependency | Shared By |");
    lines.push("|------------|-----------|");
    for (const dep of sharedDeps.sort((a, b) => b.repos.length - a.repos.length)) {
      lines.push(`| ${dep.label} | ${dep.repos.length} repos |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export the graph as a JSON string.
 */
export function graphToJson(graph: CrossRepoGraph): string {
  return JSON.stringify(graph, null, 2);
}

/**
 * Export the graph in DOT format for Graphviz visualization.
 */
export function graphToDot(graph: CrossRepoGraph): string {
  const lines: string[] = ["digraph InnovationGraph {", "  rankdir=LR;", ""];

  // Node shapes by type
  const shapeMap: Record<string, string> = {
    repo: "box",
    dependency: "ellipse",
    pattern: "diamond",
    technology: "hexagon",
    opportunity: "star",
  };

  for (const node of graph.nodes) {
    const shape = shapeMap[node.type] ?? "ellipse";
    const escaped = node.label.replace(/"/g, '\\"');
    lines.push(`  "${node.id}" [label="${escaped}" shape=${shape}];`);
  }

  lines.push("");

  for (const edge of graph.edges) {
    const style = edge.type === "opportunity-link" ? "dashed" : "solid";
    lines.push(
      `  "${edge.source}" -> "${edge.target}" [label="${edge.type}" style=${style} penwidth=${Math.max(0.5, edge.weight * 3)}];`
    );
  }

  lines.push("}");
  return lines.join("\n");
}

// ---- Helpers ----

function safeReaddir(dirPath: string): string[] {
  try {
    return readdirSync(dirPath).filter((f) => !f.startsWith(".") && f !== "node_modules");
  } catch {
    return [];
  }
}

function collectExtensions(
  dirPath: string,
  counts: Map<string, number>,
  depth: number,
  maxDepth: number
): void {
  if (depth >= maxDepth) return;
  for (const entry of safeReaddir(dirPath)) {
    const full = join(dirPath, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        collectExtensions(full, counts, depth + 1, maxDepth);
      } else {
        const ext = extname(entry);
        if (ext) counts.set(ext, (counts.get(ext) ?? 0) + 1);
      }
    } catch {
      // Skip inaccessible entries
    }
  }
}

function identifyClusters(repos: RepoInfo[], edges: GraphEdge[]): RepoCluster[] {
  const clusters: RepoCluster[] = [];
  const visited = new Set<string>();

  // Group repos by shared technology overlap
  const techMap = new Map<string, string[]>();
  for (const repo of repos) {
    for (const tech of repo.techStack) {
      const list = techMap.get(tech) ?? [];
      list.push(repo.id);
      techMap.set(tech, list);
    }
  }

  // Build adjacency from overlap edges
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type === "overlaps-with") {
      const setA = adjacency.get(edge.source) ?? new Set();
      setA.add(edge.target);
      adjacency.set(edge.source, setA);
      const setB = adjacency.get(edge.target) ?? new Set();
      setB.add(edge.source);
      adjacency.set(edge.target, setB);
    }
  }

  // BFS to find connected components
  for (const repo of repos) {
    if (visited.has(repo.id)) continue;
    const component: string[] = [];
    const queue = [repo.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    if (component.length > 1) {
      const sharedTech = [...techMap.entries()]
        .filter(([, repoIds]) => component.some((c) => repoIds.includes(c)))
        .filter(([, repoIds]) => component.filter((c) => repoIds.includes(c)).length > 1)
        .map(([tech]) => tech);

      clusters.push({
        id: `cluster-${clusters.length + 1}`,
        label: `Cluster ${clusters.length + 1}`,
        repoIds: component,
        sharedTechnologies: sharedTech,
      });
    }
  }

  return clusters;
}

function detectGaps(repos: RepoInfo[]): InnovationGap[] {
  const gaps: InnovationGap[] = [];

  // Find technologies used in most repos but missing from some
  const techCounts = new Map<string, string[]>();
  for (const repo of repos) {
    for (const tech of repo.techStack) {
      const list = techCounts.get(tech) ?? [];
      list.push(repo.id);
      techCounts.set(tech, list);
    }
  }

  for (const [tech, repoIds] of techCounts) {
    if (repoIds.length > 1 && repoIds.length < repos.length && repos.length >= 3) {
      const missing = repos.filter((r) => !repoIds.includes(r.id)).map((r) => r.id);
      gaps.push({
        type: "missing-technology",
        description: `"${tech}" is used in ${repoIds.length}/${repos.length} repos but missing from others`,
        affectedRepos: missing,
        suggestedAction: `Evaluate adopting ${tech} in ${missing.join(", ")} for consistency`,
      });
    }
  }

  // Find pattern opportunities
  const patternCounts = new Map<string, string[]>();
  for (const repo of repos) {
    for (const pattern of repo.patterns) {
      const list = patternCounts.get(pattern) ?? [];
      list.push(repo.id);
      patternCounts.set(pattern, list);
    }
  }

  for (const [pattern, repoIds] of patternCounts) {
    if (repoIds.length > 1) {
      gaps.push({
        type: "pattern-opportunity",
        description: `Pattern "${pattern}" is shared across ${repoIds.length} repos — consider extracting a shared library`,
        affectedRepos: repoIds,
        suggestedAction: `Extract "${pattern}" into a shared package`,
      });
    }
  }

  return gaps;
}

function buildGraphSummary(graph: CrossRepoGraph): string {
  const repoNodes = graph.nodes.filter((n) => n.type === "repo");
  const depNodes = graph.nodes.filter((n) => n.type === "dependency");
  const sharedDeps = depNodes.filter((n) => n.repos.length > 1);
  const techNodes = graph.nodes.filter((n) => n.type === "technology");

  const lines: string[] = [
    `Repositories (${repoNodes.length}):`,
    ...repoNodes.map(
      (n) =>
        `  - ${n.label} (${(n.metadata as Record<string, unknown> | undefined)?.language ?? "Unknown"})`
    ),
    "",
    `Shared Dependencies (${sharedDeps.length}):`,
    ...sharedDeps.map((n) => `  - ${n.label}: used by ${n.repos.join(", ")}`),
    "",
    `Technologies (${techNodes.length}):`,
    ...techNodes.map((n) => `  - ${n.label}: used by ${n.repos.join(", ")}`),
    "",
    `Clusters (${graph.clusters.length}):`,
    ...graph.clusters.map(
      (c) => `  - ${c.label}: ${c.repoIds.join(", ")} [${c.sharedTechnologies.join(", ")}]`
    ),
    "",
    `Gaps (${graph.gaps.length}):`,
    ...graph.gaps.map((g) => `  - ${g.type}: ${g.description}`),
  ];

  return lines.join("\n");
}
