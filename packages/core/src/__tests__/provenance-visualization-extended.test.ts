import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  buildProvenanceChain,
  generateSankeyDiagram,
  compareProvenanceChains,
  mergeProvenanceDiagrams,
  findHighImpactPaths,
} from "../provenance-visualization/index.js";

function makeChain(
  subject = "AI in healthcare",
  angleName = "Contrarian",
  angleId = "contrarian",
  ideaTitles = ["Anti-AI diagnostics", "Hybrid approach"],
  scores?: Array<{
    ideaTitle: string;
    angleId: string;
    feasibility: number;
    impact: number;
    novelty: number;
  }>
) {
  return buildProvenanceChain(
    subject,
    {
      summary: "AI is transforming healthcare diagnostics",
      keyAspects: [{ title: "ML Diagnostics", description: "ML is used in diagnostics" }],
      currentState: "Rapidly evolving field",
      challenges: ["Data privacy concerns"],
      opportunities: ["Rural healthcare access"],
    },
    [
      {
        angleId,
        angleName,
        reasoning: "Applied thinking to challenge conventional approaches",
        ideas: ideaTitles.map((title) => ({
          title,
          description: `Description for ${title}`,
          potentialImpact: "High",
          implementationHint: "Start with pilot",
        })),
      },
    ],
    undefined,
    scores
  );
}

describe("compareProvenanceChains", () => {
  it("returns all empty for empty chains", () => {
    const result = compareProvenanceChains([]);
    expect(result).toEqual({
      commonAngles: [],
      uniqueAngles: {},
      ideaCounts: {},
      averageScores: {},
      sharedThemes: [],
    });
  });

  it("finds common angles across two chains", () => {
    const chain1 = makeChain("AI in healthcare", "Contrarian", "contrarian");
    const chain2 = makeChain("AI in education", "Contrarian", "contrarian");
    const result = compareProvenanceChains([chain1, chain2]);
    expect(result.commonAngles).toContain("Contrarian");
  });

  it("populates uniqueAngles for chains with different angles", () => {
    const chain1 = makeChain("AI in healthcare", "Contrarian", "contrarian", ["Idea A"]);
    const chain2 = makeChain("AI in education", "First Principles", "first-principles", ["Idea B"]);
    const result = compareProvenanceChains([chain1, chain2]);
    expect(result.commonAngles).toHaveLength(0);
    expect(result.uniqueAngles["AI in healthcare"]).toContain("Contrarian");
    expect(result.uniqueAngles["AI in education"]).toContain("First Principles");
  });

  it("computes ideaCounts per chain subject", () => {
    const chain1 = makeChain("AI in healthcare", "Contrarian", "contrarian", ["Idea A", "Idea B"]);
    const chain2 = makeChain("AI in education", "Contrarian", "contrarian", ["Idea C"]);
    const result = compareProvenanceChains([chain1, chain2]);
    expect(result.ideaCounts["AI in healthcare"]).toBe(2);
    expect(result.ideaCounts["AI in education"]).toBe(1);
  });

  it("computes averageScores from overall score values", () => {
    const chain1 = makeChain(
      "AI in healthcare",
      "Contrarian",
      "contrarian",
      ["Anti-AI diagnostics"],
      [
        {
          ideaTitle: "Anti-AI diagnostics",
          angleId: "contrarian",
          feasibility: 8,
          impact: 9,
          novelty: 7,
        },
      ]
    );
    const result = compareProvenanceChains([chain1]);
    expect(result.averageScores["AI in healthcare"]).toBeGreaterThan(0);
    // overall = round((8+9+7)/3 * 10) / 10 = 8
    expect(result.averageScores["AI in healthcare"]).toBe(8);
  });

  it("detects shared themes across multiple chains", () => {
    const chain1 = makeChain("AI in healthcare", "Contrarian", "contrarian", [
      "Smart diagnostics platform",
    ]);
    const chain2 = makeChain("AI in education", "First Principles", "first-principles", [
      "Smart learning platform",
    ]);
    const result = compareProvenanceChains([chain1, chain2]);
    // "smart" and "platform" are >4 chars and appear in both chains
    expect(result.sharedThemes).toContain("smart");
    expect(result.sharedThemes).toContain("platform");
  });

  it("returns empty sharedThemes for a single chain", () => {
    const chain = makeChain("AI in healthcare", "Contrarian", "contrarian", ["Smart diagnostics"]);
    const result = compareProvenanceChains([chain]);
    expect(result.sharedThemes).toEqual([]);
  });
});

describe("mergeProvenanceDiagrams", () => {
  it("returns empty diagram for empty array", () => {
    const result = mergeProvenanceDiagrams([]);
    expect(result).toEqual({
      nodes: [],
      links: [],
      title: "Merged Provenance",
    });
  });

  it("returns the single diagram unchanged", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const result = mergeProvenanceDiagrams([diagram]);
    expect(result).toBe(diagram);
  });

  it("merges two diagrams with merged-root and prefixed IDs", () => {
    const chain1 = makeChain("AI in healthcare", "Contrarian", "contrarian", ["Idea A"]);
    const chain2 = makeChain("AI in education", "First Principles", "first-principles", ["Idea B"]);
    const d1 = generateSankeyDiagram(chain1);
    const d2 = generateSankeyDiagram(chain2);
    const merged = mergeProvenanceDiagrams([d1, d2]);

    // Should have a merged-root node
    const rootNode = merged.nodes.find((n) => n.id === "merged-root");
    expect(rootNode).toBeDefined();
    expect(rootNode!.label).toBe("All Sessions");

    // All original nodes should be prefixed
    const s0Nodes = merged.nodes.filter((n) => n.id.startsWith("s0-"));
    const s1Nodes = merged.nodes.filter((n) => n.id.startsWith("s1-"));
    expect(s0Nodes.length).toBe(d1.nodes.length);
    expect(s1Nodes.length).toBe(d2.nodes.length);

    // Total nodes = merged-root + d1.nodes + d2.nodes
    expect(merged.nodes.length).toBe(1 + d1.nodes.length + d2.nodes.length);

    // Links from merged-root to each session's subject
    const rootLinks = merged.links.filter((l) => l.source === "merged-root");
    expect(rootLinks.length).toBe(2);

    // Total links = d1.links + d2.links + 2 root links
    expect(merged.links.length).toBe(d1.links.length + d2.links.length + 2);
  });
});

describe("findHighImpactPaths", () => {
  it("finds paths from score nodes sorted by score descending", () => {
    const chain = makeChain(
      "AI in healthcare",
      "Contrarian",
      "contrarian",
      ["Anti-AI diagnostics", "Hybrid approach"],
      [
        {
          ideaTitle: "Anti-AI diagnostics",
          angleId: "contrarian",
          feasibility: 8,
          impact: 9,
          novelty: 7,
        },
        {
          ideaTitle: "Hybrid approach",
          angleId: "contrarian",
          feasibility: 5,
          impact: 6,
          novelty: 4,
        },
      ]
    );
    const diagram = generateSankeyDiagram(chain);
    const paths = findHighImpactPaths(diagram);

    expect(paths.length).toBe(2);
    // Should be sorted by score descending
    expect(paths[0].score).toBeGreaterThanOrEqual(paths[1].score);
    // Each path should be a non-empty array of node IDs
    for (const p of paths) {
      expect(p.path.length).toBeGreaterThan(0);
      expect(typeof p.score).toBe("number");
    }
  });

  it("returns empty array for diagram with no score nodes", () => {
    const chain = makeChain("AI in healthcare", "Contrarian", "contrarian", [
      "Anti-AI diagnostics",
    ]);
    const diagram = generateSankeyDiagram(chain);
    const paths = findHighImpactPaths(diagram);

    expect(paths).toEqual([]);
  });
});
