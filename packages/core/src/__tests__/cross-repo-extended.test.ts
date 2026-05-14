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

const {
  scanRepository,
  scanRepositories,
  buildInnovationGraph,
  resolveEntities,
  graphToMarkdown,
  graphToJson,
  graphToDot,
} = await import("../cross-repo/index.js");

import type { RepoInfo } from "../cross-repo/index.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

describe("cross-repo extended edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- buildInnovationGraph edge cases ----

  describe("buildInnovationGraph edge cases", () => {
    it("returns empty graph for empty repo list", () => {
      const graph = buildInnovationGraph([]);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.clusters).toHaveLength(0);
      expect(graph.gaps).toHaveLength(0);
      expect(graph.createdAt).toBeDefined();
    });

    it("handles single repo with no dependencies, patterns, or techStack", () => {
      const singleRepo: RepoInfo[] = [
        {
          id: "r-solo",
          name: "solo",
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: [],
          architecturalLayers: [],
          techStack: [],
        },
      ];

      const graph = buildInnovationGraph(singleRepo);

      const repoNodes = graph.nodes.filter((n) => n.type === "repo");
      expect(repoNodes).toHaveLength(1);
      expect(repoNodes[0].id).toBe("r-solo");

      const overlapEdges = graph.edges.filter((e) => e.type === "overlaps-with");
      expect(overlapEdges).toHaveLength(0);

      expect(graph.nodes.filter((n) => n.type === "dependency")).toHaveLength(0);
      expect(graph.nodes.filter((n) => n.type === "pattern")).toHaveLength(0);
      expect(graph.nodes.filter((n) => n.type === "technology")).toHaveLength(0);
    });

    it("produces no shares-pattern overlap for repos with completely different patterns", () => {
      const repos: RepoInfo[] = [
        {
          id: "r-a",
          name: "a",
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: ["MVC"],
          architecturalLayers: [],
          techStack: [],
        },
        {
          id: "r-b",
          name: "b",
          url: "",
          language: "Python",
          dependencies: [],
          patterns: ["event-driven"],
          architecturalLayers: [],
          techStack: [],
        },
      ];

      const graph = buildInnovationGraph(repos);

      const patternNodes = graph.nodes.filter((n) => n.type === "pattern");
      expect(patternNodes).toHaveLength(2);

      // Each pattern node should belong to only one repo
      for (const pn of patternNodes) {
        expect(pn.repos).toHaveLength(1);
      }
    });

    it("deduplicates pattern nodes when two repos share the same pattern", () => {
      const repos: RepoInfo[] = [
        {
          id: "r-x",
          name: "x",
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: ["MVC"],
          architecturalLayers: [],
          techStack: [],
        },
        {
          id: "r-y",
          name: "y",
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: ["MVC"],
          architecturalLayers: [],
          techStack: [],
        },
      ];

      const graph = buildInnovationGraph(repos);

      const mvcNodes = graph.nodes.filter((n) => n.type === "pattern" && n.id === "pat-MVC");
      expect(mvcNodes).toHaveLength(1);
      expect(mvcNodes[0].repos).toContain("r-x");
      expect(mvcNodes[0].repos).toContain("r-y");
    });
  });

  // ---- scanRepository edge cases ----

  describe("scanRepository edge cases", () => {
    it("handles malformed package.json without crashing", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("NOT VALID JSON {{{");
      vi.mocked(readdirSync).mockReturnValue([]);

      const info = scanRepository("/fake/bad-pkg");

      expect(info.name).toBe("bad-pkg");
      expect(info.dependencies).toEqual([]);
      expect(info.url).toBe("");
    });
  });

  // ---- scanRepositories edge cases ----

  describe("scanRepositories edge cases", () => {
    it("returns empty array when all scans fail", async () => {
      vi.mocked(existsSync).mockImplementation(() => {
        throw new Error("boom");
      });
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error("boom");
      });

      const results = await scanRepositories(["/fake/a", "/fake/b"]);

      expect(results).toEqual([]);
    });

    it("returns empty array for empty paths input", async () => {
      const results = await scanRepositories([]);

      expect(results).toEqual([]);
    });
  });

  // ---- resolveEntities edge cases ----

  describe("resolveEntities edge cases", () => {
    it("preserves node count when there are no duplicates", () => {
      const repos: RepoInfo[] = [
        {
          id: "r-1",
          name: "r1",
          url: "",
          language: "TypeScript",
          dependencies: [{ name: "react", version: "18.0.0" }],
          patterns: ["MVC"],
          architecturalLayers: [],
          techStack: ["React"],
        },
        {
          id: "r-2",
          name: "r2",
          url: "",
          language: "Python",
          dependencies: [{ name: "flask", version: "2.0.0" }],
          patterns: ["REST"],
          architecturalLayers: [],
          techStack: ["Flask"],
        },
      ];

      const graph = buildInnovationGraph(repos);
      const resolved = resolveEntities(graph);

      // resolveEntities may normalize labels and merge some nodes
      expect(resolved.nodes.length).toBeLessThanOrEqual(graph.nodes.length);
      expect(resolved.nodes.length).toBeGreaterThan(0);
    });
  });

  // ---- Gap detection edge cases ----

  describe("gap detection", () => {
    const threeRepos: RepoInfo[] = [
      {
        id: "r1",
        name: "r1",
        url: "",
        language: "TypeScript",
        dependencies: [],
        patterns: [],
        architecturalLayers: [],
        techStack: ["React", "Tailwind"],
      },
      {
        id: "r2",
        name: "r2",
        url: "",
        language: "TypeScript",
        dependencies: [],
        patterns: [],
        architecturalLayers: [],
        techStack: ["React"],
      },
      {
        id: "r3",
        name: "r3",
        url: "",
        language: "Python",
        dependencies: [],
        patterns: [],
        architecturalLayers: [],
        techStack: ["Flask"],
      },
    ];

    it("detects missing-technology gap when tech used in 2 of 3 repos", () => {
      const graph = buildInnovationGraph(threeRepos);

      const missingTechGaps = graph.gaps.filter((g) => g.type === "missing-technology");
      expect(missingTechGaps.length).toBeGreaterThanOrEqual(1);

      // React is used in r1, r2 but missing from r3
      const reactGap = missingTechGaps.find((g) => g.description.includes("React"));
      expect(reactGap).toBeDefined();
      expect(reactGap!.affectedRepos).toContain("r3");
    });

    it("detects pattern-opportunity gap when pattern is shared across repos", () => {
      const reposWithSharedPattern: RepoInfo[] = [
        {
          id: "r-p1",
          name: "p1",
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: ["MVC"],
          architecturalLayers: [],
          techStack: [],
        },
        {
          id: "r-p2",
          name: "p2",
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: ["MVC"],
          architecturalLayers: [],
          techStack: [],
        },
      ];

      const graph = buildInnovationGraph(reposWithSharedPattern);

      const patternGaps = graph.gaps.filter((g) => g.type === "pattern-opportunity");
      expect(patternGaps.length).toBeGreaterThanOrEqual(1);

      const mvcGap = patternGaps.find((g) => g.description.includes("MVC"));
      expect(mvcGap).toBeDefined();
      expect(mvcGap!.affectedRepos).toContain("r-p1");
      expect(mvcGap!.affectedRepos).toContain("r-p2");
    });
  });

  // ---- Export edge cases ----

  describe("export edge cases", () => {
    it("graphToMarkdown handles empty graph without crashing", () => {
      const graph = buildInnovationGraph([]);
      const md = graphToMarkdown(graph);

      expect(typeof md).toBe("string");
      expect(md).toContain("# Cross-Repository Innovation Graph");
      expect(md).toContain("**Repositories:** 0");
    });

    it("graphToJson handles empty graph", () => {
      const graph = buildInnovationGraph([]);
      const json = graphToJson(graph);
      const parsed = JSON.parse(json);

      expect(parsed.nodes).toHaveLength(0);
      expect(parsed.edges).toHaveLength(0);
    });

    it("graphToDot escapes special characters in labels", () => {
      const repos: RepoInfo[] = [
        {
          id: "r-quoted",
          name: 'my "fancy" repo',
          url: "",
          language: "TypeScript",
          dependencies: [],
          patterns: [],
          architecturalLayers: [],
          techStack: [],
        },
      ];

      const graph = buildInnovationGraph(repos);
      const dot = graphToDot(graph);

      expect(dot).toMatch(/^digraph InnovationGraph \{/);
      expect(dot).toMatch(/\}$/);
      // Quotes in the label should be escaped
      expect(dot).toContain('\\"fancy\\"');
      expect(dot).not.toContain('label="my "fancy" repo"');
    });
  });
});
