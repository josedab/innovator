import { describe, expect, it } from "vitest";
import {
  CapabilityGraphSchema,
  CodeDeltaSchema,
  InnovationOpportunitySchema,
  buildCapabilityGraph,
  detectDelta,
  generateOpportunities,
  rankOpportunities,
  suppressNoise,
} from "../repo-futures/index.js";

describe("repo-futures", () => {
  it("builds a capability graph from file listings", () => {
    const graph = buildCapabilityGraph([
      { path: "packages/core/src/portfolio/index.ts", type: "library" },
      { path: "packages/core/src/portfolio/dashboard.ts", type: "module" },
      { path: "apps/web/src/api/route.ts", type: "api" },
    ]);

    expect(CapabilityGraphSchema.parse(graph)).toEqual(graph);
    expect(graph.nodes.some((node) => node.id === "packages/core")).toBe(true);
    expect(graph.nodes.some((node) => node.id === "packages/core/portfolio")).toBe(true);
    expect(graph.edges.some((edge) => edge.from === "packages/core/portfolio")).toBe(true);
  });

  it("detects added, deleted, and modified capability paths", () => {
    const before = buildCapabilityGraph([
      { path: "packages/core/src/portfolio/index.ts", type: "library" },
      { path: "apps/web/src/api/route.ts", type: "api" },
      { path: "infra/terraform/main.tf", type: "infrastructure" },
    ]);
    const after = buildCapabilityGraph([
      { path: "packages/core/src/portfolio/index.ts", type: "service" },
      { path: "apps/web/src/api/route.ts", type: "api" },
      { path: "packages/core/src/repo-futures/index.ts", type: "module" },
    ]);

    const delta = detectDelta(before, after);

    expect(CodeDeltaSchema.parse(delta)).toEqual(delta);
    expect(delta.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "packages/core/src/portfolio/index.ts", changeType: "modified" }),
        expect.objectContaining({ path: "packages/core/src/repo-futures/index.ts", changeType: "added" }),
        expect.objectContaining({ path: "infra/terraform/main.tf", changeType: "deleted" }),
      ])
    );
  });

  it("generates and ranks innovation opportunities", () => {
    const graph = buildCapabilityGraph([
      { path: "packages/core/src/repo-futures/index.ts", type: "module" },
      { path: "packages/core/src/repo-futures/repo-futures.ts", type: "service" },
      { path: "apps/web/src/api/route.ts", type: "api" },
      { path: "infra/terraform/main.tf", type: "infrastructure" },
    ]);
    const delta = detectDelta(
      buildCapabilityGraph([{ path: "packages/core/src/repo-futures/index.ts", type: "module" }]),
      graph
    );

    const opportunities = generateOpportunities(delta, graph, { minConfidence: 0.6 });

    expect(opportunities.length).toBeGreaterThan(0);
    expect(InnovationOpportunitySchema.parse(opportunities[0])).toEqual(opportunities[0]);
    expect(opportunities.some((opportunity) => ["integration", "new-product"].includes(opportunity.category))).toBe(true);

    const ranked = rankOpportunities([
      {
        ...opportunities[0],
        title: "Lower signal",
        confidence: 0.61,
        impact: "medium",
        effort: "high",
      },
      {
        ...opportunities[0],
        title: "Higher signal",
        confidence: 0.9,
        impact: "high",
        effort: "low",
      },
    ]);

    expect(ranked[0].title).toBe("Higher signal");
  });

  it("suppresses low-confidence noise", () => {
    const filtered = suppressNoise([
      {
        id: "low",
        title: "Ignore me",
        description: "Low confidence",
        confidence: 0.3,
        category: "optimization",
        unlockedBy: ["packages/core/portfolio"],
        effort: "low",
        impact: "low",
      },
      {
        id: "high",
        title: "Keep me",
        description: "High confidence",
        confidence: 0.8,
        category: "developer-tool",
        unlockedBy: ["packages/core/repo-futures"],
        effort: "medium",
        impact: "high",
      },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Keep me");
  });
});
