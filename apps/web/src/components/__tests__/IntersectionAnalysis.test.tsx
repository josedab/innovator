/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntersectionAnalysis } from "../IntersectionAnalysis";

function mockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    body: new ReadableStream({
      start(controller) {
        const data = JSON.stringify({ ...(response as object), stage: "complete" });
        controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        controller.close();
      },
    }),
  });
}

describe("IntersectionAnalysis", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Subject list rendering ---

  it("renders input form with 2 subject fields by default", () => {
    render(<IntersectionAnalysis />);
    expect(screen.getByText("Multi-Subject Intersection Analysis")).toBeTruthy();
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    expect(inputs).toHaveLength(2);
  });

  it("adds a third subject field", () => {
    render(<IntersectionAnalysis />);
    fireEvent.click(screen.getByText("+ Add subject"));
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    expect(inputs).toHaveLength(3);
  });

  it("hides add button when 3 subjects exist", () => {
    render(<IntersectionAnalysis />);
    fireEvent.click(screen.getByText("+ Add subject"));
    expect(screen.queryByText("+ Add subject")).toBeNull();
  });

  it("removes a subject when 3 exist", () => {
    render(<IntersectionAnalysis />);
    fireEvent.click(screen.getByText("+ Add subject"));
    const removeButtons = screen.getAllByText("✕");
    // There are remove buttons for each of the 3 subjects
    fireEvent.click(removeButtons[0]);
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    expect(inputs).toHaveLength(2);
  });

  // --- Analyze button disabled state ---

  it("disables analyze button when fewer than 2 subjects filled", () => {
    render(<IntersectionAnalysis />);
    const btn = screen.getByText("🔬 Analyze Intersections");
    expect(btn).toHaveProperty("disabled", true);
  });

  it("enables analyze button when 2 subjects are filled", () => {
    render(<IntersectionAnalysis />);
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    fireEvent.change(inputs[0], { target: { value: "AI" } });
    fireEvent.change(inputs[1], { target: { value: "Healthcare" } });
    const btn = screen.getByText("🔬 Analyze Intersections");
    expect(btn).toHaveProperty("disabled", false);
  });

  // --- Loading state ---

  it("shows loading spinner during analysis", async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<IntersectionAnalysis />);
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    fireEvent.change(inputs[0], { target: { value: "AI" } });
    fireEvent.change(inputs[1], { target: { value: "Healthcare" } });
    fireEvent.click(screen.getByText("🔬 Analyze Intersections"));
    await waitFor(() => expect(screen.getByText("Cancel")).toBeTruthy());
  });

  // --- Error state ---

  it("returns to input form after fetch rejection", async () => {
    // Fetch rejects entirely (network failure)
    let rejectFn: (err: Error) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((_, reject) => {
        rejectFn = reject;
      })
    );
    render(<IntersectionAnalysis />);
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    fireEvent.change(inputs[0], { target: { value: "AI" } });
    fireEvent.change(inputs[1], { target: { value: "Bio" } });
    fireEvent.click(screen.getByText("🔬 Analyze Intersections"));
    // Loading state visible
    await waitFor(() => expect(screen.getByText("Cancel")).toBeTruthy());
    // Now reject
    rejectFn!(new Error("Network error"));
    // Component catches error and returns to a rendered state
    await waitFor(() => expect(screen.queryByText("Cancel")).toBeNull(), { timeout: 2000 });
  });

  // --- Results rendering ---

  it("renders results with subjects and opportunities", async () => {
    const result = {
      subjectResults: [
        { subject: "AI", investigationSummary: "AI summary", ideaCount: 5 },
        { subject: "Healthcare", investigationSummary: "HC summary", ideaCount: 3 },
      ],
      overlaps: [
        {
          idea1: { subject: "AI", title: "AI Idea" },
          idea2: { subject: "Healthcare", title: "HC Idea" },
          similarity: 0.75,
        },
      ],
      opportunities: [
        {
          title: "AI + Healthcare",
          description: "Intersection opp",
          subjects: ["AI", "Healthcare"],
          sourceIdeas: [],
          confidence: 0.8,
        },
      ],
    };
    global.fetch = mockFetch(result);

    render(<IntersectionAnalysis />);
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    fireEvent.change(inputs[0], { target: { value: "AI" } });
    fireEvent.change(inputs[1], { target: { value: "Healthcare" } });
    fireEvent.click(screen.getByText("🔬 Analyze Intersections"));

    await waitFor(() => expect(screen.getByText("Intersection Results")).toBeTruthy());
    expect(screen.getAllByText("AI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Healthcare").length).toBeGreaterThan(0);
    expect(screen.getByText("AI + Healthcare")).toBeTruthy();
    expect(screen.getByText("80% confidence")).toBeTruthy();
    expect(screen.getByText("5 ideas generated")).toBeTruthy();
    expect(screen.getByText("3 ideas generated")).toBeTruthy();
  });

  // --- Empty intersection state ---

  it("shows empty message when no opportunities for filter", async () => {
    const result = {
      subjectResults: [
        { subject: "AI", investigationSummary: "S", ideaCount: 2 },
        { subject: "Bio", investigationSummary: "S", ideaCount: 2 },
      ],
      overlaps: [],
      opportunities: [],
    };
    global.fetch = mockFetch(result);

    render(<IntersectionAnalysis />);
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    fireEvent.change(inputs[0], { target: { value: "AI" } });
    fireEvent.change(inputs[1], { target: { value: "Bio" } });
    fireEvent.click(screen.getByText("🔬 Analyze Intersections"));

    await waitFor(() => expect(screen.getByText("No opportunities for this filter.")).toBeTruthy());
  });

  // --- Close button ---

  it("renders close button when onClose provided", () => {
    const onClose = vi.fn();
    render(<IntersectionAnalysis onClose={onClose} />);
    const closeBtn = screen.getByText("✕");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  // --- 3-subject layout ---

  it("handles 3-subject intersection analysis", async () => {
    const result = {
      subjectResults: [
        { subject: "AI", investigationSummary: "S", ideaCount: 3 },
        { subject: "Bio", investigationSummary: "S", ideaCount: 3 },
        { subject: "Nano", investigationSummary: "S", ideaCount: 3 },
      ],
      overlaps: [],
      opportunities: [
        {
          title: "Triple Opp",
          description: "All three",
          subjects: ["AI", "Bio", "Nano"],
          sourceIdeas: [],
          confidence: 0.6,
        },
      ],
    };
    global.fetch = mockFetch(result);

    render(<IntersectionAnalysis />);
    fireEvent.click(screen.getByText("+ Add subject"));
    const inputs = screen.getAllByPlaceholderText(/Subject/);
    fireEvent.change(inputs[0], { target: { value: "AI" } });
    fireEvent.change(inputs[1], { target: { value: "Bio" } });
    fireEvent.change(inputs[2], { target: { value: "Nano" } });
    fireEvent.click(screen.getByText("🔬 Analyze Intersections"));

    await waitFor(() => expect(screen.getByText("Triple Opp")).toBeTruthy());
  });

  // --- Cost warning ---

  it("shows cost warning note", () => {
    render(<IntersectionAnalysis />);
    expect(screen.getByText(/2-3× the normal LLM cost/)).toBeTruthy();
  });
});
