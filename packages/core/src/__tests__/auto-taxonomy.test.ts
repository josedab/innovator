import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  exportTaxonomyAsMarkdown,
  getTaxonomyStats,
  flattenTaxonomy,
  mergeTaxonomies,
  refineTaxonomy,
  TaxonomyNodeSchema,
  TaxonomyTreeSchema,
} from "../auto-taxonomy/index.js";

function makeNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "node-1",
    label: "Technology",
    description: "Technology-related ideas",
    parentId: null,
    children: [],
    ideaCount: 5,
    level: 0,
    confidence: 0.9,
    ...overrides,
  };
}

function makeTaxonomy(overrides: Record<string, unknown> = {}) {
  const child1 = makeNode({
    id: "child-1",
    label: "AI",
    description: "AI ideas",
    parentId: "root",
    level: 1,
    ideaCount: 3,
    children: [],
  });
  const child2 = makeNode({
    id: "child-2",
    label: "Web",
    description: "Web ideas",
    parentId: "root",
    level: 1,
    ideaCount: 4,
    children: [],
  });
  const root = makeNode({
    id: "root",
    label: "Root",
    description: "Root category",
    parentId: null,
    level: 0,
    ideaCount: 7,
    children: [child1, child2],
  });
  return {
    root,
    totalNodes: 3,
    totalIdeas: 7,
    maxDepth: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("TaxonomyNodeSchema", () => {
  it("validates a valid node", () => {
    const node = makeNode();
    const result = TaxonomyNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it("rejects node without label", () => {
    const node = makeNode();
    delete (node as Record<string, unknown>).label;
    const result = TaxonomyNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });
});

describe("TaxonomyTreeSchema", () => {
  it("validates a valid taxonomy tree", () => {
    const taxonomy = makeTaxonomy();
    const result = TaxonomyTreeSchema.safeParse(taxonomy);
    expect(result.success).toBe(true);
  });
});

describe("exportTaxonomyAsMarkdown", () => {
  it("returns a markdown string containing node labels", () => {
    const taxonomy = makeTaxonomy();
    const md = exportTaxonomyAsMarkdown(taxonomy as never);
    expect(typeof md).toBe("string");
    expect(md).toContain("Root");
    expect(md).toContain("AI");
    expect(md).toContain("Web");
  });

  it("handles single-node taxonomy", () => {
    const taxonomy = makeTaxonomy({
      root: makeNode({ children: [] }),
      totalNodes: 1,
      totalIdeas: 5,
      maxDepth: 0,
    });
    const md = exportTaxonomyAsMarkdown(taxonomy as never);
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(0);
  });
});

describe("getTaxonomyStats", () => {
  it("returns correct stats for a taxonomy", () => {
    const taxonomy = makeTaxonomy();
    const stats = getTaxonomyStats(taxonomy as never);
    expect(stats.totalNodes).toBeGreaterThanOrEqual(1);
    expect(stats.totalIdeas).toBeGreaterThanOrEqual(0);
    expect(stats.maxDepth).toBeGreaterThanOrEqual(0);
    expect(stats).toHaveProperty("leafCount");
    expect(stats).toHaveProperty("avgBranchingFactor");
  });

  it("leaf count equals number of leaf nodes", () => {
    const taxonomy = makeTaxonomy();
    const stats = getTaxonomyStats(taxonomy as never);
    expect(stats.leafCount).toBe(2);
  });
});

describe("flattenTaxonomy", () => {
  it("returns flat list of paths", () => {
    const taxonomy = makeTaxonomy();
    const flat = flattenTaxonomy(taxonomy as never);
    expect(Array.isArray(flat)).toBe(true);
    expect(flat.length).toBeGreaterThan(0);
    for (const entry of flat) {
      expect(entry).toHaveProperty("path");
      expect(entry).toHaveProperty("nodeId");
      expect(entry).toHaveProperty("ideaCount");
      expect(Array.isArray(entry.path)).toBe(true);
    }
  });

  it("includes paths for child nodes", () => {
    const taxonomy = makeTaxonomy();
    const flat = flattenTaxonomy(taxonomy as never);
    const aiEntry = flat.find((e) => e.nodeId === "child-1");
    expect(aiEntry).toBeDefined();
    expect(aiEntry!.path.length).toBeGreaterThan(0);
  });
});

describe("mergeTaxonomies", () => {
  it("merges two taxonomies into one", () => {
    const t1 = makeTaxonomy();
    const t2 = makeTaxonomy({
      root: makeNode({
        id: "root2",
        label: "Science",
        children: [
          makeNode({
            id: "child-3",
            label: "Biology",
            parentId: "root2",
            level: 1,
            ideaCount: 2,
          }),
        ],
      }),
      totalNodes: 2,
      totalIdeas: 2,
    });
    const merged = mergeTaxonomies([t1 as never, t2 as never]);
    expect(merged).toBeDefined();
    expect(merged.root).toBeDefined();
    expect(merged.totalNodes).toBeGreaterThanOrEqual(2);
  });

  it("handles single taxonomy merge", () => {
    const t1 = makeTaxonomy();
    const merged = mergeTaxonomies([t1 as never]);
    expect(merged.root).toBeDefined();
  });
});

describe("refineTaxonomy", () => {
  it("renames a node", () => {
    const taxonomy = makeTaxonomy();
    const refined = refineTaxonomy(taxonomy as never, [
      { action: "rename", nodeId: "child-1", newLabel: "Artificial Intelligence" },
    ]);
    expect(refined).toBeDefined();
    const flat = flattenTaxonomy(refined as never);
    const renamedNode = flat.find((e) => e.nodeId === "child-1");
    expect(renamedNode).toBeDefined();
  });

  it("processes a merge action", () => {
    const taxonomy = makeTaxonomy();
    const refined = refineTaxonomy(taxonomy as never, [
      { action: "merge", nodeId: "child-2", mergeIntoId: "child-1" },
    ]);
    expect(refined).toBeDefined();
    expect(refined.root).toBeDefined();
  });
});
