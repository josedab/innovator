/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisualOutput } from "../components/VisualOutput";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeMermaidArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    type: "diagram" as const,
    format: "mermaid" as const,
    content: "graph TD; A-->B;",
    title: "Test Diagram",
    ...overrides,
  };
}

function makeChartArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "chart-1",
    type: "chart" as const,
    format: "json" as const,
    content: JSON.stringify([
      { label: "Metric A", value: 0.8, color: "#3b82f6" },
      { label: "Metric B", value: 0.6, color: "#22c55e" },
    ]),
    title: "Test Chart",
    ...overrides,
  };
}

function makeIdeaMapArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "map-1",
    type: "mindmap" as const,
    format: "json" as const,
    content: JSON.stringify({
      nodes: [
        {
          id: "n1",
          label: "Idea 1",
          x: 100,
          y: 100,
          size: 20,
          color: "#3b82f6",
          angle: "tech",
          score: 0.9,
          connections: [],
        },
      ],
      width: 600,
      height: 400,
      title: "Test Map",
    }),
    title: "Test Idea Map",
    ...overrides,
  };
}

describe("VisualOutput", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it("renders empty state when no artifacts", () => {
    render(<VisualOutput artifacts={[]} />);
    expect(screen.getByText(/No visualizations generated yet/)).toBeInstanceOf(HTMLElement);
  });

  it("renders tabs when artifacts are present", () => {
    render(<VisualOutput artifacts={[makeMermaidArtifact()]} />);
    expect(screen.getByText("Diagrams")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Idea Maps")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Charts")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Export")).toBeInstanceOf(HTMLElement);
  });

  it("renders diagram title on diagrams tab", () => {
    render(<VisualOutput artifacts={[makeMermaidArtifact({ title: "My Diagram" })]} />);
    expect(screen.getByText("My Diagram")).toBeInstanceOf(HTMLElement);
  });

  it("shows empty state on idea maps tab when no idea maps", () => {
    render(<VisualOutput artifacts={[makeMermaidArtifact()]} />);
    fireEvent.click(screen.getByText("Idea Maps"));
    expect(screen.getByText("No idea maps generated")).toBeInstanceOf(HTMLElement);
  });

  it("renders idea map nodes", () => {
    render(<VisualOutput artifacts={[makeIdeaMapArtifact()]} />);
    fireEvent.click(screen.getByText("Idea Maps"));
    expect(screen.getByText("Idea 1")).toBeInstanceOf(HTMLElement);
  });

  it("shows empty state on charts tab when no charts", () => {
    render(<VisualOutput artifacts={[makeMermaidArtifact()]} />);
    fireEvent.click(screen.getByText("Charts"));
    expect(screen.getByText("No charts generated")).toBeInstanceOf(HTMLElement);
  });

  it("renders chart data points", () => {
    render(<VisualOutput artifacts={[makeChartArtifact()]} />);
    fireEvent.click(screen.getByText("Charts"));
    expect(screen.getByText("Metric A")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Metric B")).toBeInstanceOf(HTMLElement);
  });

  it("renders export tab with buttons", () => {
    render(<VisualOutput artifacts={[makeMermaidArtifact()]} />);
    fireEvent.click(screen.getByText("Export"));
    expect(screen.getByText("Figma JSON")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Miro Board")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("SVG Export")).toBeInstanceOf(HTMLElement);
  });

  it("shows badge count on diagram tab", () => {
    render(<VisualOutput artifacts={[makeMermaidArtifact()]} />);
    expect(screen.getByText("1")).toBeInstanceOf(HTMLElement);
  });

  it("applies custom className", () => {
    const { container } = render(
      <VisualOutput artifacts={[makeMermaidArtifact()]} className="my-custom" />
    );
    expect(container.querySelector(".my-custom")).toBeInstanceOf(HTMLElement);
  });

  it("renders with multiple artifact types", () => {
    const artifacts = [makeMermaidArtifact(), makeChartArtifact(), makeIdeaMapArtifact()];
    render(<VisualOutput artifacts={artifacts} />);
    // Should render without crashing
    expect(screen.getByText("Diagrams")).toBeInstanceOf(HTMLElement);
  });
});
