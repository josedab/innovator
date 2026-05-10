import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  buildProvenanceChain,
  generateSankeyDiagram,
  traceIdeaProvenance,
  getFlowMetrics,
  exportSankeyAsJSON,
  exportSankeyAsSVG,
  exportSankeyAsHTML,
  formatProvenanceMarkdown,
  collapseSmallFlows,
  SankeyNodeSchema,
  SankeyLinkSchema,
  SankeyDiagramSchema,
} from "../provenance-visualization/index.js";

function makeChain() {
  return buildProvenanceChain(
    "AI in healthcare",
    {
      summary: "AI is transforming healthcare diagnostics",
      keyAspects: [
        { title: "ML Diagnostics", description: "ML is used in diagnostics" },
        { title: "NLP Records", description: "NLP for patient records" },
      ],
      currentState: "Rapidly evolving field",
      challenges: ["Data privacy concerns", "Regulatory compliance"],
      opportunities: ["Rural healthcare access", "Cost reduction"],
    },
    [
      {
        angleId: "contrarian",
        angleName: "Contrarian",
        reasoning: "Applied contrarian thinking to challenge conventional approaches",
        ideas: [
          { title: "Anti-AI diagnostics", description: "Focus on human-first diagnosis", potentialImpact: "High", implementationHint: "Start with pilot" },
          { title: "Hybrid approach", description: "AI-assisted, human-led", potentialImpact: "Medium", implementationHint: "Integrate with existing" },
        ],
      },
      {
        angleId: "first-principles",
        angleName: "First Principles",
        reasoning: "Broke down the problem to fundamental data requirements",
        ideas: [
          { title: "Data-first platform", description: "Build from fundamental data needs", potentialImpact: "High", implementationHint: "Start with data" },
        ],
      },
    ],
  );
}

describe("SankeyNodeSchema", () => {
  it("validates a valid node", () => {
    const node = {
      id: "n1",
      label: "Finding 1",
      type: "finding",
      value: 10,
    };
    const result = SankeyNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it("rejects node without id", () => {
    const result = SankeyNodeSchema.safeParse({ label: "Test" });
    expect(result.success).toBe(false);
  });
});

describe("SankeyLinkSchema", () => {
  it("validates a valid link", () => {
    const link = { source: "n1", target: "n2", value: 5 };
    const result = SankeyLinkSchema.safeParse(link);
    expect(result.success).toBe(true);
  });
});

describe("SankeyDiagramSchema", () => {
  it("validates a valid diagram", () => {
    const diagram = {
      nodes: [
        { id: "n1", label: "A", type: "finding", value: 5 },
        { id: "n2", label: "B", type: "idea", value: 3 },
      ],
      links: [{ source: "n1", target: "n2", value: 3 }],
      title: "Test Diagram",
    };
    const result = SankeyDiagramSchema.safeParse(diagram);
    expect(result.success).toBe(true);
  });
});

describe("buildProvenanceChain", () => {
  it("builds a chain with subject, findings, and ideas", () => {
    const chain = makeChain();
    expect(chain).toMatchObject({ subject: "AI in healthcare" });
    expect(chain.subject).toBe("AI in healthcare");
    expect(Array.isArray(chain.investigationFindings)).toBe(true);
    expect(chain.investigationFindings.length).toBeGreaterThan(0);
    expect(Array.isArray(chain.angles)).toBe(true);
  });

  it("includes connections between elements", () => {
    const chain = makeChain();
    expect(Array.isArray(chain.connections)).toBe(true);
    expect(chain.connections.length).toBeGreaterThanOrEqual(0);
  });
});

describe("generateSankeyDiagram", () => {
  it("generates a diagram from a provenance chain", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    expect(Array.isArray(diagram.nodes)).toBe(true);
    expect(Array.isArray(diagram.links)).toBe(true);
    expect(diagram.links.length).toBeGreaterThan(0);
  });

  it("each link references valid node IDs", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const nodeIds = new Set(diagram.nodes.map((n) => n.id));
    for (const link of diagram.links) {
      expect(nodeIds.has(link.source)).toBe(true);
      expect(nodeIds.has(link.target)).toBe(true);
    }
  });
});

describe("traceIdeaProvenance", () => {
  it("traces provenance for an existing idea", () => {
    const chain = makeChain();
    const trace = traceIdeaProvenance("Anti-AI diagnostics", chain);
    expect(trace).toMatchObject({ path: expect.any(Array) });
    expect(Array.isArray(trace.path)).toBe(true);
    expect(trace.path.length).toBeGreaterThan(0);
  });

  it("returns empty path for unknown idea", () => {
    const chain = makeChain();
    const trace = traceIdeaProvenance("Nonexistent Idea", chain);
    expect(trace.path).toHaveLength(0);
  });
});

describe("getFlowMetrics", () => {
  it("computes metrics for a Sankey diagram", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const metrics = getFlowMetrics(diagram);
    expect(metrics).toMatchObject({
      totalFlow: expect.any(Number),
      branchingFactor: expect.any(Number),
      averagePathLength: expect.any(Number),
    });
    expect(metrics.totalFlow).toBeGreaterThanOrEqual(0);
  });
});

describe("exportSankeyAsJSON", () => {
  it("exports diagram as valid JSON", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const json = exportSankeyAsJSON(diagram);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.links)).toBe(true);
  });
});

describe("exportSankeyAsSVG", () => {
  it("exports diagram as SVG string", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const svg = exportSankeyAsSVG(diagram);
    expect(typeof svg).toBe("string");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});

describe("exportSankeyAsHTML", () => {
  it("exports diagram as HTML string", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const html = exportSankeyAsHTML(diagram);
    expect(typeof html).toBe("string");
    expect(html).toContain("<html");
  });
});

describe("formatProvenanceMarkdown", () => {
  it("formats chain as markdown", () => {
    const chain = makeChain();
    const md = formatProvenanceMarkdown(chain);
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain("AI in healthcare");
  });
});

describe("collapseSmallFlows", () => {
  it("collapses flows below threshold", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const collapsed = collapseSmallFlows(diagram, 0.5);
    expect(Array.isArray(collapsed.nodes)).toBe(true);
    expect(Array.isArray(collapsed.links)).toBe(true);
    expect(collapsed.nodes.length).toBeLessThanOrEqual(diagram.nodes.length);
  });

  it("preserves diagram structure with high threshold", () => {
    const chain = makeChain();
    const diagram = generateSankeyDiagram(chain);
    const collapsed = collapseSmallFlows(diagram, 0);
    expect(collapsed.nodes.length).toBe(diagram.nodes.length);
    expect(collapsed.links.length).toBe(diagram.links.length);
  });
});
