import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateMermaidDiagram = vi.fn();
const mockGenerateIdeaMap = vi.fn();
const mockGenerateComparisonChart = vi.fn();
const mockExportToFigmaFormat = vi.fn();
const mockExportToMiroFormat = vi.fn();

vi.mock("@innovator/core", () => ({
  VisualOutputGenerator: function () {
    return {
      generateMermaidDiagram: mockGenerateMermaidDiagram,
      generateIdeaMap: mockGenerateIdeaMap,
      generateComparisonChart: mockGenerateComparisonChart,
      exportToFigmaFormat: mockExportToFigmaFormat,
      exportToMiroFormat: mockExportToMiroFormat,
    };
  },
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/visual/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/visual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/visual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("generates a mindmap diagram", async () => {
    mockGenerateMermaidDiagram.mockReturnValue({ mermaid: "graph TD" });
    const res = await POST(
      makePost({
        action: "diagram",
        ideas: [{ title: "Idea 1" }],
        diagramType: "mindmap",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifact).toEqual({ mermaid: "graph TD" });
  });

  it("generates a flowchart diagram", async () => {
    mockGenerateMermaidDiagram.mockReturnValue({ mermaid: "flowchart" });
    const res = await POST(
      makePost({
        action: "diagram",
        ideas: [{ title: "Idea 1" }],
        diagramType: "flowchart",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifact).toBeDefined();
  });

  it("generates an idea map from synthesis", async () => {
    mockGenerateIdeaMap.mockReturnValue({ map: "nodes" });
    const res = await POST(
      makePost({
        action: "idea_map",
        synthesis: { topIdeas: [{ title: "Best idea" }] },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifact).toEqual({ map: "nodes" });
  });

  it("generates a comparison chart", async () => {
    mockGenerateComparisonChart.mockReturnValue({ chart: "bars" });
    const res = await POST(
      makePost({
        action: "comparison",
        angleResults: [{ angle: "reverse", ideas: [{ title: "A" }] }],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifact).toEqual({ chart: "bars" });
  });

  it("exports to Figma format", async () => {
    mockExportToFigmaFormat.mockReturnValue({ figma: true });
    const res = await POST(
      makePost({
        action: "export_figma",
        artifacts: [{ id: "a1", type: "chart", format: "svg", content: "<svg/>", title: "Chart" }],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.export).toEqual({ figma: true });
  });

  it("exports to Miro format", async () => {
    mockExportToMiroFormat.mockReturnValue({ miro: true });
    const res = await POST(
      makePost({
        action: "export_miro",
        artifacts: [{ id: "a1", type: "diagram", format: "json", content: "{}", title: "Diagram" }],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.export).toEqual({ miro: true });
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(makePost({ action: "unknown" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for diagram with empty ideas array", async () => {
    const res = await POST(makePost({ action: "diagram", ideas: [], diagramType: "mindmap" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing diagramType", async () => {
    const res = await POST(makePost({ action: "diagram", ideas: [{ title: "A" }] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/visual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
