/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeGraphExplorer } from "../components/KnowledgeGraphExplorer";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeGraphLayout(overrides: Record<string, unknown> = {}) {
  return {
    layout: {
      nodes: [
        { id: "n1", label: "AI Ethics", type: "concept", size: 20, color: "#3b82f6", x: 100, y: 100, cluster: 0 },
        { id: "n2", label: "Machine Learning", type: "technology", size: 15, color: "#22c55e", x: 200, y: 200, cluster: 0 },
      ],
      edges: [
        { source: "n1", target: "n2", weight: 0.8, type: "related", label: "uses" },
      ],
      clusters: [
        { id: 0, label: "Tech Cluster", nodeIds: ["n1", "n2"], dominantType: "concept" },
      ],
      bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 },
      ...overrides,
    },
  };
}

describe("KnowledgeGraphExplorer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading state initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<KnowledgeGraphExplorer />);
    expect(screen.getByText(/Loading knowledge graph/)).toBeInstanceOf(HTMLElement);
  });

  it("renders empty state when no nodes", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ layout: { nodes: [], edges: [], clusters: [], bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } } }),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/No entities yet/)).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders error state with retry button", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load knowledge graph/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("Retry")).toBeInstanceOf(HTMLElement);
  });

  it("renders graph toolbar with node/edge counts", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/2 nodes/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText(/1 edges/)).toBeInstanceOf(HTMLElement);
  });

  it("renders SVG with node circles", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    const { container } = render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/Knowledge Graph/)).toBeInstanceOf(HTMLElement);
    });
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
  });

  it("renders node labels in non-compact mode", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText("AI Ethics")).toBeDefined();
    });
    expect(screen.getByText("Machine Learning")).toBeDefined();
  });

  it("renders legend in non-compact mode", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("Technology")).toBeInstanceOf(HTMLElement);
  });

  it("does not render legend in compact mode", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer compact />);
    await waitFor(() => {
      expect(screen.getByText(/Knowledge Graph/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.queryByText("Concept")).toBeNull();
  });

  it("renders zoom controls", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText("+")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("−")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("⟲")).toBeInstanceOf(HTMLElement);
  });

  it("renders fullscreen toggle button", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText("⇱")).toBeInstanceOf(HTMLElement);
    });
  });

  it("applies custom className", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    const { container } = render(<KnowledgeGraphExplorer className="test-class" />);
    await waitFor(() => {
      expect(container.querySelector(".test-class")).toBeInstanceOf(HTMLElement);
    });
  });

  it("retry button re-fetches graph data", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    render(<KnowledgeGraphExplorer />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInstanceOf(HTMLElement);
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(screen.getByText(/2 nodes/)).toBeInstanceOf(HTMLElement);
    });
  });

  it("passes initial filters to fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeGraphLayout()),
    });
    render(<KnowledgeGraphExplorer initialFilters={{ type: "concept", minOccurrences: 3 }} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.filters).toEqual({ type: "concept", minOccurrences: 3 });
  });
});
