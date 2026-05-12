/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IdeaDependencyGraph } from "../IdeaDependencyGraph";

const sampleGraph = {
  nodes: [
    {
      id: "n1",
      title: "AI Assistant",
      description: "An AI helper",
      angleId: "scamper",
      feasibility: "high",
    },
    {
      id: "n2",
      title: "Code Generator",
      description: "Generate code",
      angleId: "first-principles",
      feasibility: "medium",
    },
    {
      id: "n3",
      title: "Modular UI",
      description: "Component library",
      angleId: "cross-domain",
      feasibility: "low",
    },
  ],
  edges: [
    { source: "n1", target: "n2", relationship: "builds-on" as const, confidence: 0.8 },
    { source: "n2", target: "n3", relationship: "prerequisite-of" as const, confidence: 0.9 },
  ],
  criticalPath: ["n1", "n2", "n3"],
};

function mockFetch(responseData: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(responseData),
    text: () => Promise.resolve(JSON.stringify(responseData)),
  });
}

describe("IdeaDependencyGraph Component", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalRAF: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalRAF = globalThis.requestAnimationFrame;
    // Stub requestAnimationFrame to run callback immediately (just once)
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      // Don't run simulation — just return a fake id
      return 0;
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalRAF;
  });

  it("renders empty state with Generate Graph button", () => {
    render(<IdeaDependencyGraph sessionId="test-session" />);
    expect(screen.getByText("Idea Dependency Graph")).not.toBeNull();
    expect(screen.getByText("Generate Graph")).not.toBeNull();
  });

  it("shows loading state when loading", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<IdeaDependencyGraph sessionId="test-session" />);
    fireEvent.click(screen.getByText("Generate Graph"));
    expect(screen.getByText(/Building idea dependency graph/)).not.toBeNull();
  });

  it("shows error state on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Server error"),
    });

    render(<IdeaDependencyGraph sessionId="test-session" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).not.toBeNull();
    });
    expect(screen.getByText("Retry")).not.toBeNull();
  });

  it("renders nodes with correct labels after loading", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    const { container } = render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });

    const texts = container.querySelectorAll("text");
    const labels = Array.from(texts).map((t) => t.textContent);
    expect(labels).toContain("AI Assistant");
    expect(labels).toContain("Code Generator");
    expect(labels).toContain("Modular UI");
  });

  it("renders circles for each node", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    const { container } = render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      const circles = container.querySelectorAll("circle");
      expect(circles.length).toBe(3);
    });
  });

  it("renders edges as lines", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    const { container } = render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBe(2);
    });
  });

  it("selects a node on click and shows details", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    const { container } = render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });

    const nodeGroup = container.querySelector("g[style*='cursor: pointer']");
    expect(nodeGroup).not.toBeNull();
    fireEvent.click(nodeGroup!);

    await waitFor(() => {
      // Title appears in SVG label, details panel h4, and possibly critical path
      expect(screen.getAllByText("AI Assistant").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/An AI helper/)).not.toBeNull();
    });
  });

  it("deselects a node on second click", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    const { container } = render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });

    const nodeGroup = container.querySelector("g[style*='cursor: pointer']");
    fireEvent.click(nodeGroup!);

    await waitFor(() => {
      expect(screen.getByText(/An AI helper/)).not.toBeNull();
    });

    fireEvent.click(nodeGroup!);
    await waitFor(() => {
      expect(screen.queryByText(/An AI helper/)).toBeNull();
    });
  });

  it("renders critical path section when present", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(screen.getByText("Critical Path")).not.toBeNull();
    });
  });

  it("renders legend with relationship types", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(screen.getByText("builds-on")).not.toBeNull();
      expect(screen.getByText("conflicts-with")).not.toBeNull();
      expect(screen.getByText("prerequisite-of")).not.toBeNull();
      expect(screen.getByText("alternative-to")).not.toBeNull();
      expect(screen.getByText("complements")).not.toBeNull();
    });
  });

  it("renders footer with idea and edge counts", async () => {
    globalThis.fetch = mockFetch(sampleGraph);
    render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(screen.getByText(/3 ideas/)).not.toBeNull();
      expect(screen.getByText(/2 relationships/)).not.toBeNull();
    });
  });

  it("renders single node with no edges", async () => {
    const singleNodeGraph = {
      nodes: [
        {
          id: "n1",
          title: "Solo Idea",
          description: "Only one",
          angleId: "scamper",
          feasibility: "high",
        },
      ],
      edges: [],
      criticalPath: [],
    };
    globalThis.fetch = mockFetch(singleNodeGraph);
    const { container } = render(<IdeaDependencyGraph sessionId="s1" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      const circles = container.querySelectorAll("circle");
      expect(circles.length).toBe(1);
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBe(0);
    });
  });

  it("renders close button when onClose is provided", async () => {
    const onClose = vi.fn();
    globalThis.fetch = mockFetch(sampleGraph);
    render(<IdeaDependencyGraph sessionId="s1" onClose={onClose} />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      const closeBtn = screen.getByText("✕");
      expect(closeBtn).not.toBeNull();
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("fetches correct URL with sessionId", async () => {
    const fetchMock = mockFetch(sampleGraph);
    globalThis.fetch = fetchMock;
    render(<IdeaDependencyGraph sessionId="my-session-123" />);
    fireEvent.click(screen.getByText("Generate Graph"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/idea-graph/my-session-123");
    });
  });
});
