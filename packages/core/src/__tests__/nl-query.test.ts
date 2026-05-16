import { describe, it, expect } from "vitest";
import {
  parseNLQuery,
  executeNLQuery,
  generateSuggestions,
  buildSubjectContext,
  toVisualizationData,
} from "../knowledge-graph/nl-query.js";
import type { KnowledgeGraph, EntityNode, RelationshipEdge } from "../knowledge-graph/index.js";

function makeNode(overrides: Partial<EntityNode> = {}): EntityNode {
  return {
    id: overrides.id ?? "node-1",
    label: overrides.label ?? "AI Technology",
    type: overrides.type ?? "technology",
    description: overrides.description ?? "Artificial Intelligence applications",
    sourceSessionIds: overrides.sourceSessionIds ?? ["s1"],
    firstSeen: "2024-01-01T00:00:00Z",
    lastSeen: overrides.lastSeen ?? new Date().toISOString(),
    occurrenceCount: overrides.occurrenceCount ?? 3,
    metadata: overrides.metadata,
  };
}

function makeEdge(overrides: Partial<RelationshipEdge> = {}): RelationshipEdge {
  return {
    id: overrides.id ?? "edge-1",
    source: overrides.source ?? "node-1",
    target: overrides.target ?? "node-2",
    type: overrides.type ?? "related_to",
    weight: overrides.weight ?? 0.8,
    sourceSessionIds: overrides.sourceSessionIds ?? ["s1"],
    label: overrides.label,
  };
}

function makeGraph(nodes: EntityNode[] = [], edges: RelationshipEdge[] = []): KnowledgeGraph {
  return {
    nodes,
    edges,
    lastUpdated: new Date().toISOString(),
    sessionCount: 1,
  };
}

describe("parseNLQuery", () => {
  it("detects 'search' intent from 'what' keyword", () => {
    const parsed = parseNLQuery("What ideas have we explored?");
    expect(parsed.intent).toBe("search");
  });

  it("detects 'list' intent from 'list' keyword", () => {
    const parsed = parseNLQuery("List all technologies");
    expect(parsed.intent).toBe("list");
    expect(parsed.typeFilter).toBe("technology");
  });

  it("detects 'compare' intent", () => {
    const parsed = parseNLQuery("Compare React vs Angular");
    expect(parsed.intent).toBe("compare");
  });

  it("detects 'timeline' intent", () => {
    const parsed = parseNLQuery("When did we first explore blockchain?");
    expect(parsed.intent).toBe("timeline");
  });

  it("detects 'connections' intent", () => {
    const parsed = parseNLQuery("How does AI connect to healthcare?");
    expect(parsed.intent).toBe("connections");
  });

  it("extracts type filter for 'challenge' keyword", () => {
    // "fintech" contains "tech" which maps to "technology" and is matched first
    // Use a query without tech-related words
    const parsed = parseNLQuery("What challenges exist in education?");
    expect(parsed.typeFilter).toBe("challenge");
  });

  it("extracts entity filter excluding stop words", () => {
    const parsed = parseNLQuery("What ideas have we explored for sustainability?");
    expect(parsed.entityFilter).toContain("sustainability");
  });

  it("returns undefined entityFilter when only stop words remain", () => {
    const parsed = parseNLQuery("what is the");
    expect(parsed.entityFilter).toBeUndefined();
  });

  it("performs case-insensitive intent detection", () => {
    const parsed = parseNLQuery("FIND technologies about data");
    expect(parsed.intent).toBe("search");
  });
});

describe("executeNLQuery", () => {
  it("returns matching nodes sorted by relevance", () => {
    const graph = makeGraph([
      makeNode({ id: "n1", label: "Machine Learning", occurrenceCount: 5 }),
      makeNode({ id: "n2", label: "Deep Learning", occurrenceCount: 2 }),
      makeNode({ id: "n3", label: "Blockchain", occurrenceCount: 10 }),
    ]);
    const result = executeNLQuery(graph, "Find learning technologies");
    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0].id).toBe("n1"); // higher occurrenceCount
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns empty results for empty graph", () => {
    const result = executeNLQuery(makeGraph(), "Find AI");
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.confidence).toBe(0);
    expect(result.answer).toContain("No matching entities");
  });

  it("filters by type when type keyword is present", () => {
    const graph = makeGraph([
      makeNode({ id: "n1", label: "Data privacy", type: "challenge" }),
      makeNode({ id: "n2", label: "Data lake", type: "technology" }),
    ]);
    const result = executeNLQuery(graph, "What challenges relate to data?");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].type).toBe("challenge");
  });

  it("matches case-insensitively in labels and descriptions", () => {
    const graph = makeGraph([
      makeNode({ id: "n1", label: "QUANTUM Computing", description: "quantum research" }),
    ]);
    const result = executeNLQuery(graph, "find quantum");
    expect(result.nodes).toHaveLength(1);
  });

  it("collects edges related to matched nodes", () => {
    const nodes = [
      makeNode({ id: "n1", label: "AI Tech" }),
      makeNode({ id: "n2", label: "Healthcare" }),
    ];
    const edges = [makeEdge({ source: "n1", target: "n2" })];
    const graph = makeGraph(nodes, edges);
    const result = executeNLQuery(graph, "Find AI");
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("generateSuggestions", () => {
  it("limits results to maxSuggestions", () => {
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeNode({
        id: `n${i}`,
        label: `Innovation concept ${i}`,
        type: i % 3 === 0 ? "domain" : "concept",
        occurrenceCount: 5,
        lastSeen: new Date().toISOString(),
      })
    );
    const graph = makeGraph(nodes);
    const suggestions = generateSuggestions(graph, "innovation", 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array for empty graph", () => {
    const suggestions = generateSuggestions(makeGraph(), "anything");
    expect(suggestions).toHaveLength(0);
  });

  it("includes unexplored-angle suggestions when related nodes exist but angles are unused", () => {
    const graph = makeGraph([
      makeNode({ id: "n1", label: "sustainability tech", type: "domain", metadata: {} }),
    ]);
    const suggestions = generateSuggestions(graph, "sustainability");
    const anglesSugg = suggestions.find((s) => s.type === "unexplored-angle");
    expect(anglesSugg).toBeDefined();
  });
});

describe("buildSubjectContext", () => {
  it("populates relatedEntities, previousSessions, and gaps", () => {
    const graph = makeGraph([
      makeNode({
        id: "n1",
        label: "Healthcare AI",
        type: "technology",
        sourceSessionIds: ["s1", "s2"],
      }),
    ]);
    const ctx = buildSubjectContext(graph, "Healthcare innovation");
    expect(ctx.subject).toBe("Healthcare innovation");
    expect(ctx.relatedEntities.length).toBeGreaterThan(0);
    expect(ctx.previousSessions).toContain("s1");
    // No challenges → knowledge gap
    expect(ctx.knowledgeGaps.length).toBeGreaterThan(0);
  });

  it("suggests inversion/constraints angles when challenges outnumber opportunities", () => {
    const graph = makeGraph([
      makeNode({ id: "n1", label: "data security", type: "challenge" }),
      makeNode({ id: "n2", label: "data breach", type: "challenge" }),
    ]);
    const ctx = buildSubjectContext(graph, "data protection");
    expect(ctx.suggestedAngles).toContain("inversion");
  });

  it("suggests trend-collision angles when opportunities outnumber challenges", () => {
    const graph = makeGraph([makeNode({ id: "n1", label: "market growth", type: "opportunity" })]);
    const ctx = buildSubjectContext(graph, "market expansion");
    expect(ctx.suggestedAngles).toContain("trend-collision");
  });
});

describe("toVisualizationData", () => {
  it("produces D3-compatible format with correct colors", () => {
    const nodes = [
      makeNode({ id: "n1", type: "concept", occurrenceCount: 2 }),
      makeNode({ id: "n2", type: "technology", occurrenceCount: 10 }),
    ];
    const edges = [makeEdge({ source: "n1", target: "n2", weight: 0.5 })];
    const viz = toVisualizationData(nodes, edges);

    expect(viz.nodes).toHaveLength(2);
    expect(viz.edges).toHaveLength(1);

    expect(viz.nodes[0].color).toBe("#3b82f6"); // concept
    expect(viz.nodes[1].color).toBe("#22c55e"); // technology

    // size is clamped between 10 and 50
    expect(viz.nodes[0].size).toBe(10); // 2*5=10
    expect(viz.nodes[1].size).toBe(50); // 10*5=50, clamped

    expect(viz.edges[0].source).toBe("n1");
    expect(viz.edges[0].weight).toBe(0.5);
  });

  it("uses fallback color for unknown node type", () => {
    const node = makeNode({ id: "n1" });
    (node as unknown as { type: string }).type = "unknown-type";
    const viz = toVisualizationData([node], []);
    expect(viz.nodes[0].color).toBe("#6b7280");
  });
});
