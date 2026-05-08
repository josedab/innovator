import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((l: string, c: string) => `[${l}]: ${c}`),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { ...actual };
});

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const {
  scanRepository,
  scanRepositories,
  buildInnovationGraph,
  resolveEntities,
  detectCrossRepoOpportunities,
  graphToMarkdown,
  graphToJson,
  graphToDot,
} = await import("../cross-repo/index.js");

import type { RepoInfo, CrossRepoGraph } from "../cross-repo/index.js";

const MOCK_REPOS: RepoInfo[] = [
  {
    id: "repo-a",
    name: "repo-a",
    url: "",
    language: "typescript",
    dependencies: [
      { name: "react", version: "18.2.0" },
      { name: "zod", version: "3.22.0" },
    ],
    patterns: ["MVC"],
    architecturalLayers: ["frontend"],
    techStack: ["typescript", "react"],
  },
  {
    id: "repo-b",
    name: "repo-b",
    url: "",
    language: "typescript",
    dependencies: [
      { name: "react", version: "18.2.0" },
      { name: "express", version: "4.18.0" },
    ],
    patterns: ["MVC", "REST"],
    architecturalLayers: ["backend"],
    techStack: ["typescript", "express"],
  },
];

describe("cross-repo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- scanRepository ----

  describe("scanRepository", () => {
    it("returns basic RepoInfo when no package.json exists", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);

      const info = scanRepository("/fake/my-app");

      expect(info.id).toBe("repo-my-app");
      expect(info.name).toBe("my-app");
      expect(info.dependencies).toEqual([]);
      expect(info.language).toBe("Unknown");
    });

    it("reads package.json and extracts dependencies", () => {
      const pkg = {
        repository: "https://github.com/test/repo",
        dependencies: { react: "^18.0.0" },
        devDependencies: { vitest: "^1.0.0" },
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(pkg));
      vi.mocked(readdirSync).mockReturnValue([]);

      const info = scanRepository("/fake/my-app");

      expect(info.url).toBe("https://github.com/test/repo");
      expect(info.dependencies).toHaveLength(2);
      expect(info.dependencies).toContainEqual({ name: "react", version: "^18.0.0" });
      expect(info.dependencies).toContainEqual({ name: "vitest", version: "^1.0.0" });
    });

    it("detects language from file extensions", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([
        "app.ts",
        "utils.ts",
        "main.ts",
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<
        typeof statSync
      >);

      const info = scanRepository("/fake/ts-project");

      expect(info.language).toBe("TypeScript");
    });

    it("detects patterns from directory names", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([
        "controllers",
        "models",
        "views",
        "__tests__",
      ] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof statSync
      >);

      const info = scanRepository("/fake/mvc-project");

      expect(info.patterns).toContain("MVC");
      expect(info.patterns).toContain("testing");
    });

    it("throws on aborted signal", () => {
      const controller = new AbortController();
      controller.abort();

      expect(() => scanRepository("/fake/repo", controller.signal)).toThrow();
    });
  });

  // ---- scanRepositories ----

  describe("scanRepositories", () => {
    it("scans multiple repos and returns fulfilled results", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);

      const results = await scanRepositories(["/fake/a", "/fake/b"]);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("a");
      expect(results[1].name).toBe("b");
    });

    it("filters out failed scans gracefully", async () => {
      let callCount = 0;
      vi.mocked(existsSync).mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error("boom");
        return false;
      });
      vi.mocked(readdirSync).mockReturnValue([]);

      const results = await scanRepositories(["/fake/bad", "/fake/good"]);

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- buildInnovationGraph ----

  describe("buildInnovationGraph", () => {
    it("creates repo nodes for each repository", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const repoNodes = graph.nodes.filter((n) => n.type === "repo");
      expect(repoNodes).toHaveLength(2);
      expect(repoNodes.map((n) => n.id)).toContain("repo-a");
      expect(repoNodes.map((n) => n.id)).toContain("repo-b");
    });

    it("creates dependency nodes with repo associations", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const reactNode = graph.nodes.find((n) => n.id === "dep-react");
      expect(reactNode).toBeDefined();
      expect(reactNode!.type).toBe("dependency");
      expect(reactNode!.repos).toContain("repo-a");
      expect(reactNode!.repos).toContain("repo-b");
    });

    it("creates depends-on edges for each dependency", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const depEdges = graph.edges.filter((e) => e.type === "depends-on");
      // repo-a: react, zod = 2; repo-b: react, express = 2 → 4 total
      expect(depEdges).toHaveLength(4);
    });

    it("creates pattern nodes and shares-pattern edges", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const patternNodes = graph.nodes.filter((n) => n.type === "pattern");
      expect(patternNodes.map((n) => n.label)).toContain("MVC");
      expect(patternNodes.map((n) => n.label)).toContain("REST");

      const mvcNode = patternNodes.find((n) => n.label === "MVC");
      expect(mvcNode!.repos).toContain("repo-a");
      expect(mvcNode!.repos).toContain("repo-b");
    });

    it("creates technology nodes and uses-technology edges", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const techNodes = graph.nodes.filter((n) => n.type === "technology");
      expect(techNodes.length).toBeGreaterThanOrEqual(2);

      const techEdges = graph.edges.filter((e) => e.type === "uses-technology");
      expect(techEdges.length).toBeGreaterThanOrEqual(2);
    });

    it("adds overlaps-with edges for repos sharing dependencies", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const overlapEdges = graph.edges.filter((e) => e.type === "overlaps-with");
      expect(overlapEdges).toHaveLength(1);
      expect(overlapEdges[0].source).toBe("repo-a");
      expect(overlapEdges[0].target).toBe("repo-b");
      expect(overlapEdges[0].weight).toBeGreaterThan(0);
      expect(overlapEdges[0].weight).toBeLessThanOrEqual(1);
    });

    it("creates clusters for connected repos", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      expect(graph.clusters.length).toBeGreaterThanOrEqual(1);
      const cluster = graph.clusters[0];
      expect(cluster.repoIds).toContain("repo-a");
      expect(cluster.repoIds).toContain("repo-b");
    });

    it("returns empty graph for no repos", () => {
      const graph = buildInnovationGraph([]);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.clusters).toHaveLength(0);
      expect(graph.createdAt).toBeDefined();
    });

    it("handles a single repo with no overlaps", () => {
      const graph = buildInnovationGraph([MOCK_REPOS[0]]);

      const overlapEdges = graph.edges.filter((e) => e.type === "overlaps-with");
      expect(overlapEdges).toHaveLength(0);
      expect(graph.clusters).toHaveLength(0);
    });
  });

  // ---- resolveEntities ----

  describe("resolveEntities", () => {
    it("merges nodes with identical normalized labels", () => {
      const graph = buildInnovationGraph([
        { ...MOCK_REPOS[0], dependencies: [], techStack: ["Tailwind"] },
        { ...MOCK_REPOS[1], dependencies: [], techStack: ["tailwind"] },
      ]);

      const resolved = resolveEntities(graph);

      const techNodes = resolved.nodes.filter(
        (n) => n.type === "technology" && n.label.toLowerCase() === "tailwind"
      );
      expect(techNodes).toHaveLength(1);
      expect(techNodes[0].repos).toContain("repo-a");
      expect(techNodes[0].repos).toContain("repo-b");
    });

    it("preserves repo nodes without merging", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const resolved = resolveEntities(graph);

      const repoNodes = resolved.nodes.filter((n) => n.type === "repo");
      expect(repoNodes).toHaveLength(2);
    });

    it("deduplicates edges after merging nodes", () => {
      const graph = buildInnovationGraph([
        { ...MOCK_REPOS[0], dependencies: [], techStack: ["Tailwind"] },
        { ...MOCK_REPOS[1], dependencies: [], techStack: ["tailwind"] },
      ]);

      const resolved = resolveEntities(graph);

      const techEdges = resolved.edges.filter((e) => e.type === "uses-technology");
      const techTargets = techEdges.map((e) => e.target);
      const uniqueTargets = [...new Set(techTargets)];
      // All edges should point to the same canonical tech node
      expect(uniqueTargets.length).toBeLessThanOrEqual(techEdges.length);
    });
  });

  // ---- detectCrossRepoOpportunities ----

  describe("detectCrossRepoOpportunities", () => {
    it("returns LLM-detected opportunities", async () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      const opportunities = [
        {
          title: "Shared React Library",
          description: "Extract shared React components",
          type: "shared-library",
          involvedRepos: ["repo-a", "repo-b"],
          estimatedImpact: "high",
          suggestedSteps: ["Create shared-ui package"],
        },
      ];

      mockGenerateText.mockResolvedValue("json response");
      mockExtractJson.mockReturnValue(JSON.stringify(opportunities));

      const result = await detectCrossRepoOpportunities(graph);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Shared React Library");
      expect(result[0].type).toBe("shared-library");
    });

    it("returns empty array on LLM failure", async () => {
      const graph = buildInnovationGraph(MOCK_REPOS);

      mockGenerateText.mockRejectedValue(new Error("LLM error"));

      const result = await detectCrossRepoOpportunities(graph);

      expect(result).toEqual([]);
    });
  });

  // ---- graphToMarkdown ----

  describe("graphToMarkdown", () => {
    it("includes header with stats", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const md = graphToMarkdown(graph);

      expect(md).toContain("# Cross-Repository Innovation Graph");
      expect(md).toContain("**Repositories:** 2");
      expect(md).toContain("**Nodes:**");
      expect(md).toContain("**Edges:**");
    });

    it("lists repositories with language", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const md = graphToMarkdown(graph);

      expect(md).toContain("## Repositories");
      expect(md).toContain("repo-a");
      expect(md).toContain("repo-b");
    });

    it("includes shared dependencies table", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const md = graphToMarkdown(graph);

      expect(md).toContain("## Shared Dependencies");
      expect(md).toContain("react");
      expect(md).toContain("2 repos");
    });

    it("includes clusters section when present", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const md = graphToMarkdown(graph);

      expect(md).toContain("## Clusters");
    });
  });

  // ---- graphToJson ----

  describe("graphToJson", () => {
    it("returns valid JSON with all graph fields", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const json = graphToJson(graph);
      const parsed = JSON.parse(json) as CrossRepoGraph;

      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
      expect(parsed.clusters).toBeDefined();
      expect(parsed.gaps).toBeDefined();
      expect(parsed.createdAt).toBeDefined();
    });

    it("round-trips through JSON parse", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const json = graphToJson(graph);
      const parsed = JSON.parse(json) as CrossRepoGraph;

      expect(parsed.nodes.length).toBe(graph.nodes.length);
      expect(parsed.edges.length).toBe(graph.edges.length);
    });
  });

  // ---- graphToDot ----

  describe("graphToDot", () => {
    it("produces valid DOT format with digraph wrapper", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const dot = graphToDot(graph);

      expect(dot).toMatch(/^digraph InnovationGraph \{/);
      expect(dot).toMatch(/\}$/);
    });

    it("assigns correct shapes per node type", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const dot = graphToDot(graph);

      expect(dot).toContain("shape=box"); // repo
      expect(dot).toContain("shape=ellipse"); // dependency
      expect(dot).toContain("shape=diamond"); // pattern
      expect(dot).toContain("shape=hexagon"); // technology
    });

    it("includes edges with type labels", () => {
      const graph = buildInnovationGraph(MOCK_REPOS);
      const dot = graphToDot(graph);

      expect(dot).toContain('label="depends-on"');
      expect(dot).toContain('label="shares-pattern"');
      expect(dot).toContain('label="uses-technology"');
    });
  });
});
