/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionComparison } from "../SessionComparison";

function mockFetch(response: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

const baseResult = {
  sessions: [
    {
      id: "s1",
      subject: "AI Tools",
      createdAt: "2025-01-01T00:00:00Z",
      angleCount: 3,
      ideaCount: 5,
      themes: ["automation", "ML"],
    },
    {
      id: "s2",
      subject: "Healthcare",
      createdAt: "2025-01-02T00:00:00Z",
      angleCount: 2,
      ideaCount: 4,
      themes: ["patient-care", "ML"],
    },
  ],
  sharedThemes: ["ML"],
  uniqueThemes: { s1: ["automation"], s2: ["patient-care"] },
  ideaOverlaps: [
    {
      idea1: { sessionId: "s1", title: "ML Pipeline", description: "A machine learning pipeline" },
      idea2: {
        sessionId: "s2",
        title: "ML Diagnostics",
        description: "ML for medical diagnostics",
      },
      similarity: 0.72,
    },
  ],
  angleComparison: { "tech-trends": ["s1", "s2"], "market-gap": ["s1"] },
  scoreDelta: [
    { sessionId: "s1", subject: "AI Tools", avgFeasibility: "high", ideaCount: 5 },
    { sessionId: "s2", subject: "Healthcare", avgFeasibility: "medium", ideaCount: 4 },
  ],
  timeline: [
    { sessionId: "s1", subject: "AI Tools", createdAt: "2025-01-01T00:00:00Z" },
    { sessionId: "s2", subject: "Healthcare", createdAt: "2025-01-02T00:00:00Z" },
  ],
};

describe("SessionComparison", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Initial prompt state ---

  it("renders initial prompt with Compare Sessions button", () => {
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    expect(screen.getByText("Session Comparison Matrix").textContent).toBe(
      "Session Comparison Matrix"
    );
    expect(screen.getByText(/Compare 2 sessions/).textContent).toContain("Compare 2 sessions");
    expect(screen.getByText("Compare Sessions").textContent).toBe("Compare Sessions");
  });

  it("shows session count in prompt", () => {
    render(<SessionComparison sessionIds={["s1", "s2", "s3"]} />);
    expect(screen.getByText(/Compare 3 sessions/).textContent).toContain("Compare 3 sessions");
  });

  // --- 2-session comparison ---

  it("renders comparison with session subjects", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Session Comparison").textContent).toBe("Session Comparison")
    );
    expect(screen.getAllByText("AI Tools").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Healthcare").length).toBeGreaterThan(0);
  });

  // --- Similarity score formatting ---

  it("formats similarity score as percentage", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Session Comparison").textContent).toBe("Session Comparison")
    );
    fireEvent.click(screen.getByText(/Overlaps/));
    expect(screen.getByText("72% similar").textContent).toBe("72% similar");
  });

  // --- Shared themes highlight ---

  it("highlights shared themes differently from unique themes", async () => {
    global.fetch = mockFetch(baseResult);
    const { container } = render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Shared Themes").textContent).toBe("Shared Themes")
    );
    expect(screen.getAllByText("ML").length).toBeGreaterThan(0);
    const sharedBadge = container.querySelector('[class*="bg-green-100"]');
    expect(sharedBadge).not.toBeNull();
    expect(sharedBadge!.className).toContain("bg-green-100");
  });

  // --- Tab switching ---

  it("switches between tabs with correct content", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Overview").textContent).toBe("Overview"));

    // Overlaps tab shows ML Pipeline
    fireEvent.click(screen.getByText(/Overlaps/));
    expect(screen.getByText("ML Pipeline").textContent).toBe("ML Pipeline");

    // Angles tab shows tech-trends
    fireEvent.click(screen.getByText("Angles"));
    expect(screen.getByText("tech-trends").textContent).toBe("tech-trends");

    // Timeline tab
    fireEvent.click(screen.getByText("Timeline"));
    expect(screen.getAllByText("AI Tools").length).toBeGreaterThan(0);
  });

  // --- Score delta table ---

  it("renders score summary table with feasibility classification", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Score Summary").textContent).toBe("Score Summary")
    );
    expect(screen.getByText("high").textContent).toBe("high");
    expect(screen.getByText("medium").textContent).toBe("medium");
  });

  // --- No overlaps ---

  it("shows no overlaps message when none exist", async () => {
    const noOverlaps = { ...baseResult, ideaOverlaps: [] };
    global.fetch = mockFetch(noOverlaps);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Session Comparison").textContent).toBe("Session Comparison")
    );
    fireEvent.click(screen.getByText(/Overlaps/));
    expect(screen.getByText("No significant idea overlaps found.").textContent).toBe(
      "No significant idea overlaps found."
    );
  });

  // --- Error state ---

  it("shows error state on failed comparison", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Server error"),
    });
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Retry").textContent).toBe("Retry"));
    expect(screen.getByText("Server error").textContent).toBe("Server error");
  });

  // --- Loading state ---

  it("shows loading state during comparison", async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText(/Comparing 2 sessions/).textContent).toContain("Comparing 2 sessions")
    );
  });

  // --- Close button ---

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} onClose={onClose} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Session Comparison").textContent).toBe("Session Comparison")
    );
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // --- Angle comparison grid ---

  it("renders angle comparison with checkmarks", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() =>
      expect(screen.getByText("Session Comparison").textContent).toBe("Session Comparison")
    );
    fireEvent.click(screen.getByText("Angles"));
    expect(screen.getByText("market-gap").textContent).toBe("market-gap");
  });
});
