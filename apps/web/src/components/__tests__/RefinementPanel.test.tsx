/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RefinementPanel from "../RefinementPanel";

const mockIdeas = [
  { id: "idea-1", title: "AI Dashboard", description: "An AI-powered analytics dashboard" },
  { id: "idea-2", title: "Smart Search", description: "Intelligent search with NLP" },
];

function mockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  });
}

describe("RefinementPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Initial render ---

  it("renders initial concept tier with idea list", () => {
    render(<RefinementPanel ideas={mockIdeas} />);
    expect(screen.getByText("🔄 Progressive Refinement")).toBeTruthy();
    expect(screen.getByText("AI Dashboard")).toBeTruthy();
    expect(screen.getByText("Smart Search")).toBeTruthy();
    expect(screen.getByText(/Concept → Plan → Specification/)).toBeTruthy();
  });

  it("renders start button with correct idea count", () => {
    render(<RefinementPanel ideas={mockIdeas} />);
    expect(screen.getByText("Refine 2 Ideas")).toBeTruthy();
  });

  it("disables start button when no ideas", () => {
    render(<RefinementPanel ideas={[]} />);
    const btn = screen.getByText("Refine 0 Ideas");
    expect(btn).toHaveProperty("disabled", true);
  });

  // --- Session start ---

  it("starts refinement session and shows tier progression", async () => {
    const sessionData = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "Desc",
            selected: true,
            currentTier: "concept",
          },
          {
            id: "idea-2",
            title: "Smart Search",
            description: "Desc",
            selected: true,
            currentTier: "concept",
          },
        ],
        iterations: [],
        convergenceScore: 0,
        suggestStop: false,
      },
    };
    global.fetch = mockFetch(sessionData);

    render(<RefinementPanel ideas={mockIdeas} />);
    fireEvent.click(screen.getByText("Refine 2 Ideas"));

    await waitFor(() => {
      expect(screen.getByText("📋 Refine to Plan")).toBeTruthy();
    });
    expect(screen.getAllByText("💡 Concept").length).toBeGreaterThan(0);
  });

  // --- Tier progression (concept → plan) ---

  it("progresses from concept to plan tier", async () => {
    const conceptSession = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "concept",
          },
        ],
        iterations: [],
        convergenceScore: 0,
        suggestStop: false,
      },
    };
    const planSession = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "plan",
          },
        ],
        iterations: [
          {
            id: "iter-1",
            tier: "plan",
            ideaId: "idea-1",
            output: { tier: "plan", content: "Detailed plan" },
            createdAt: new Date().toISOString(),
            qualityDelta: 0.15,
          },
        ],
        convergenceScore: 0.3,
        suggestStop: false,
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(conceptSession) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(planSession) });

    render(<RefinementPanel ideas={[mockIdeas[0]]} />);
    fireEvent.click(screen.getByText("Refine 1 Ideas"));

    await waitFor(() => expect(screen.getByText("📋 Refine to Plan")).toBeTruthy());
    fireEvent.click(screen.getByText("📋 Refine to Plan"));

    await waitFor(() => expect(screen.getByText("📝 Refine to Specification")).toBeTruthy());
  });

  // --- Cannot skip tiers ---

  it("cannot skip from concept directly to specification", async () => {
    const session = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "concept",
          },
        ],
        iterations: [],
        convergenceScore: 0,
        suggestStop: false,
      },
    };
    global.fetch = mockFetch(session);

    render(<RefinementPanel ideas={[mockIdeas[0]]} />);
    fireEvent.click(screen.getByText("Refine 1 Ideas"));

    await waitFor(() => expect(screen.getByText("📋 Refine to Plan")).toBeTruthy());
    // Only "Refine to Plan" should be visible, not "Refine to Specification"
    expect(screen.queryByText("📝 Refine to Specification")).toBeNull();
  });

  // --- Convergence score / suggestStop ---

  it("shows convergence warning when suggestStop is true", async () => {
    const session = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "concept",
          },
        ],
        iterations: [],
        convergenceScore: 0.92,
        suggestStop: true,
      },
    };
    global.fetch = mockFetch(session);

    render(<RefinementPanel ideas={[mockIdeas[0]]} />);
    fireEvent.click(screen.getByText("Refine 1 Ideas"));

    await waitFor(() => {
      expect(screen.getByText(/Marginal gains are plateauing/)).toBeTruthy();
      expect(screen.getByText(/Convergence: 92%/)).toBeTruthy();
    });
  });

  // --- Feedback submission ---

  it("submits feedback when refining", async () => {
    const session = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "concept",
          },
        ],
        iterations: [],
        convergenceScore: 0,
        suggestStop: false,
      },
    };
    const refined = {
      session: {
        ...session.session,
        ideas: [{ ...session.session.ideas[0], currentTier: "plan" }],
        iterations: [
          {
            id: "i1",
            tier: "plan",
            ideaId: "idea-1",
            feedback: "Focus on UX",
            output: { tier: "plan", content: "Plan content" },
            createdAt: new Date().toISOString(),
          },
        ],
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(session) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(refined) });

    render(<RefinementPanel ideas={[mockIdeas[0]]} />);
    fireEvent.click(screen.getByText("Refine 1 Ideas"));

    await waitFor(() => expect(screen.getByText("📋 Refine to Plan")).toBeTruthy());

    const textarea = screen.getByPlaceholderText(/Add context, constraints/);
    fireEvent.change(textarea, { target: { value: "Focus on UX" } });
    fireEvent.click(screen.getByText("📋 Refine to Plan"));

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls;
      const lastBody = JSON.parse(calls[calls.length - 1][1]?.body as string);
      expect(lastBody.feedback).toBe("Focus on UX");
    });
  });

  // --- Iteration history ---

  it("displays iteration history with expand/collapse", async () => {
    const session = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "plan",
          },
        ],
        iterations: [
          {
            id: "iter-1",
            tier: "plan",
            ideaId: "idea-1",
            output: {
              tier: "plan",
              content: "Plan details here",
              implementationSteps: ["Step 1", "Step 2"],
            },
            createdAt: new Date().toISOString(),
            qualityDelta: 0.12,
          },
        ],
        convergenceScore: 0.3,
        suggestStop: false,
      },
    };
    global.fetch = mockFetch(session);

    render(<RefinementPanel ideas={[mockIdeas[0]]} />);
    fireEvent.click(screen.getByText("Refine 1 Ideas"));

    await waitFor(() => expect(screen.getByText("📜 Refinement History")).toBeTruthy());
    expect(screen.getByText(/\+12%/)).toBeTruthy();

    // Expand iteration
    fireEvent.click(screen.getByText("Expand"));
    await waitFor(() => expect(screen.getByText("Step 1")).toBeTruthy());

    // Collapse
    fireEvent.click(screen.getByText("Collapse"));
  });

  // --- No refine button at specification tier ---

  it("hides refine buttons when idea reaches specification tier", async () => {
    const session = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "specification",
          },
        ],
        iterations: [
          {
            id: "i1",
            tier: "specification",
            ideaId: "idea-1",
            output: { tier: "specification", content: "Full spec" },
            createdAt: new Date().toISOString(),
          },
        ],
        convergenceScore: 0.9,
        suggestStop: false,
      },
    };
    global.fetch = mockFetch(session);

    render(<RefinementPanel ideas={[mockIdeas[0]]} />);
    fireEvent.click(screen.getByText("Refine 1 Ideas"));

    await waitFor(() => {
      expect(screen.queryByText("📋 Refine to Plan")).toBeNull();
      expect(screen.queryByText("📝 Refine to Specification")).toBeNull();
    });
  });

  // --- Idea tab switching preserves state ---

  it("switches between ideas preserving state", async () => {
    const session = {
      session: {
        id: "session-1",
        ideas: [
          {
            id: "idea-1",
            title: "AI Dashboard",
            description: "D",
            selected: true,
            currentTier: "plan",
          },
          {
            id: "idea-2",
            title: "Smart Search",
            description: "D",
            selected: true,
            currentTier: "concept",
          },
        ],
        iterations: [
          {
            id: "i1",
            tier: "plan",
            ideaId: "idea-1",
            output: { tier: "plan", content: "Plan" },
            createdAt: new Date().toISOString(),
          },
        ],
        convergenceScore: 0.2,
        suggestStop: false,
      },
    };
    global.fetch = mockFetch(session);

    render(<RefinementPanel ideas={mockIdeas} />);
    fireEvent.click(screen.getByText("Refine 2 Ideas"));

    await waitFor(() => expect(screen.getByText("📝 Refine to Specification")).toBeTruthy());

    // Switch to second idea
    fireEvent.click(screen.getByText("Smart Search"));
    await waitFor(() => expect(screen.getByText("📋 Refine to Plan")).toBeTruthy());

    // Switch back to first idea
    fireEvent.click(screen.getByText("AI Dashboard"));
    await waitFor(() => expect(screen.getByText("📝 Refine to Specification")).toBeTruthy());
  });

  // --- Loading state ---

  it("shows loading state during start", async () => {
    // Make fetch hang
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<RefinementPanel ideas={mockIdeas} />);
    fireEvent.click(screen.getByText("Refine 2 Ideas"));

    await waitFor(() => expect(screen.getByText("Starting...")).toBeTruthy());
  });
});
