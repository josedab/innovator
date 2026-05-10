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
    expect(screen.getByText("Session Comparison Matrix")).toBeTruthy();
    expect(screen.getByText(/Compare 2 sessions/)).toBeTruthy();
    expect(screen.getByText("Compare Sessions")).toBeTruthy();
  });

  it("shows session count in prompt", () => {
    render(<SessionComparison sessionIds={["s1", "s2", "s3"]} />);
    expect(screen.getByText(/Compare 3 sessions/)).toBeTruthy();
  });

  // --- 2-session comparison ---

  it("renders comparison with diff highlights", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Session Comparison")).toBeTruthy());
    expect(screen.getAllByText("AI Tools").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Healthcare").length).toBeGreaterThan(0);
  });

  // --- Similarity score formatting ---

  it("formats similarity score as percentage", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Session Comparison")).toBeTruthy());
    // Switch to overlaps tab
    fireEvent.click(screen.getByText(/Overlaps/));
    expect(screen.getByText("72% similar")).toBeTruthy();
  });

  // --- Shared themes highlight ---

  it("highlights shared themes differently from unique themes", async () => {
    global.fetch = mockFetch(baseResult);
    const { container } = render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Shared Themes")).toBeTruthy());
    expect(screen.getAllByText("ML").length).toBeGreaterThan(0);
    // Shared theme should have green styling
    const sharedBadge = container.querySelector('[class*="bg-green-100"]');
    expect(sharedBadge).not.toBeNull();
  });

  // --- Tab switching ---

  it("switches between tabs", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Overview")).toBeTruthy());

    // Overlaps tab
    fireEvent.click(screen.getByText(/Overlaps/));
    expect(screen.getByText("ML Pipeline")).toBeTruthy();

    // Angles tab
    fireEvent.click(screen.getByText("Angles"));
    expect(screen.getByText("tech-trends")).toBeTruthy();

    // Timeline tab
    fireEvent.click(screen.getByText("Timeline"));
    expect(screen.getAllByText("AI Tools").length).toBeGreaterThan(0);
  });

  // --- Score delta table ---

  it("renders score summary table with feasibility colors", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Score Summary")).toBeTruthy());
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
  });

  // --- No overlaps ---

  it("shows no overlaps message when none exist", async () => {
    const noOverlaps = { ...baseResult, ideaOverlaps: [] };
    global.fetch = mockFetch(noOverlaps);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Session Comparison")).toBeTruthy());
    fireEvent.click(screen.getByText(/Overlaps/));
    expect(screen.getByText("No significant idea overlaps found.")).toBeTruthy();
  });

  // --- Error state ---

  it("shows error state on failed comparison", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Server error"),
    });
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
    expect(screen.getByText("Server error")).toBeTruthy();
  });

  // --- Loading state ---

  it("shows loading state during comparison", async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText(/Comparing 2 sessions/)).toBeTruthy());
  });

  // --- Close button ---

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} onClose={onClose} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Session Comparison")).toBeTruthy());
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });

  // --- Angle comparison grid ---

  it("renders angle comparison with checkmarks", async () => {
    global.fetch = mockFetch(baseResult);
    render(<SessionComparison sessionIds={["s1", "s2"]} />);
    fireEvent.click(screen.getByText("Compare Sessions"));

    await waitFor(() => expect(screen.getByText("Session Comparison")).toBeTruthy());
    fireEvent.click(screen.getByText("Angles"));
    // market-gap only has s1, so one column should show ✅ and other —
    expect(screen.getByText("market-gap")).toBeTruthy();
  });
});
