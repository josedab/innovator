/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DebateArena } from "../DebateArena";

const mockIdeas = [
  { title: "Solar Paint", description: "Paint generating electricity", potentialImpact: "High" },
  { title: "Wind Kites", description: "High-altitude wind energy", potentialImpact: "Medium" },
];

const mockInvestigation = {
  summary: "Renewable energy innovations",
  challenges: ["Cost", "Scalability"],
  opportunities: ["Growing market", "Policy support"],
};

const mockDebateResult = {
  idea: "Solar Paint",
  rounds: [
    {
      round: 0,
      proArguments: [
        {
          point: "High efficiency potential",
          evidence: "Research shows 40% conversion",
          strength: 8,
        },
      ],
      conArguments: [
        { point: "Manufacturing cost", evidence: "Current costs are prohibitive", strength: 7 },
      ],
      proRebuttal: "Costs will decrease with scale",
      conRebuttal: "Scale requires massive investment",
    },
    {
      round: 1,
      proArguments: [
        { point: "Easy application", evidence: "Can be applied like regular paint", strength: 6 },
      ],
      conArguments: [
        { point: "Durability concerns", evidence: "UV degradation within 5 years", strength: 7 },
      ],
    },
  ],
  verdict: {
    winner: "nuanced" as const,
    confidence: 0.72,
    summary: "Both sides have merit",
    keyInsight: "Success depends on material science breakthroughs",
    conditions: ["R&D investment", "Policy support"],
  },
  quality: {
    argumentDepth: 7,
    evidenceQuality: 6,
    balanceScore: 8,
    insightNovelty: 7,
    overall: 7,
  },
  totalRounds: 2,
};

describe("DebateArena", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("renders start screen with idea count", () => {
      render(<DebateArena ideas={mockIdeas} />);
      expect(screen.getByText("Debate Arena").textContent).toBe("Debate Arena");
      expect(screen.getByText(/Analyze 2 ideas/).textContent).toContain("Analyze 2 ideas");
      expect(screen.getByText("Start Debate").textContent).toBe("Start Debate");
    });

    it("shows singular text for single idea", () => {
      render(<DebateArena ideas={[mockIdeas[0]]} />);
      expect(screen.getByText(/Analyze 1 idea /).textContent).toContain("Analyze 1 idea");
    });

    it("shows cancel button when onClose is provided", () => {
      const onClose = vi.fn();
      render(<DebateArena ideas={mockIdeas} onClose={onClose} />);
      const cancelBtn = screen.getByText("Cancel");
      expect(cancelBtn.textContent).toBe("Cancel");
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not show cancel when onClose is not provided", () => {
      render(<DebateArena ideas={mockIdeas} />);
      expect(screen.queryByText("Cancel")).toBeNull();
    });
  });

  describe("loading state", () => {
    it("shows loading spinner when debate is running", async () => {
      // Mock fetch to never resolve (keeps loading)
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      expect(screen.getByText(/Running debate analysis/).textContent).toContain(
        "Running debate analysis"
      );
    });
  });

  describe("error state", () => {
    it("shows error message and retry button on fetch failure", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      await waitFor(() => {
        expect(screen.getByText("Network error").textContent).toBe("Network error");
      });
      expect(screen.getByText("Retry").textContent).toBe("Retry");
    });

    it("shows error for non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Server error",
      }) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      await waitFor(() => {
        expect(screen.getByText("Server error").textContent).toBe("Server error");
      });
    });
  });

  describe("results display", () => {
    async function renderWithResults() {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDebateResult,
      }) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("Start Debate"));

      await waitFor(() => {
        expect(screen.getByText(/Debate: Solar Paint/).textContent).toContain("Solar Paint");
      });
    }

    it("displays debate title with idea name", async () => {
      await renderWithResults();
      expect(screen.getByText(/Debate: Solar Paint/).textContent).toContain("Solar Paint");
    });

    it("renders round accordions", async () => {
      await renderWithResults();
      expect(screen.getByText("Round 1").textContent).toBe("Round 1");
      expect(screen.getByText("Round 2").textContent).toBe("Round 2");
    });

    it("shows verdict with winner badge", async () => {
      await renderWithResults();
      expect(screen.getByText("Verdict").textContent).toBe("Verdict");
      expect(screen.getByText("nuanced").textContent).toBe("nuanced");
      expect(screen.getByText("72% confidence").textContent).toBe("72% confidence");
    });

    it("displays quality scores", async () => {
      await renderWithResults();
      expect(screen.getByText("Quality Scores").textContent).toBe("Quality Scores");
      expect(screen.getAllByText("7/10").length).toBeGreaterThanOrEqual(1);
    });

    it("shows conditions list in verdict", async () => {
      await renderWithResults();
      expect(screen.getByText("R&D investment").textContent).toBe("R&D investment");
      expect(screen.getByText("Policy support").textContent).toBe("Policy support");
    });
  });

  describe("voting", () => {
    async function renderWithResultsAndExpand() {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDebateResult,
      }) as unknown as typeof fetch;

      const result = render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      await waitFor(() => {
        expect(screen.getByText(/Debate: Solar Paint/).textContent).toContain("Solar Paint");
      });

      // First round should be auto-expanded (expandedRound=0)
      return result;
    }

    it("renders upvote and downvote buttons on arguments", async () => {
      await renderWithResultsAndExpand();
      const upvotes = screen.getAllByLabelText("Upvote");
      const downvotes = screen.getAllByLabelText("Downvote");
      expect(upvotes.length).toBeGreaterThan(0);
      expect(downvotes.length).toBeGreaterThan(0);
    });

    it("increments vote count when upvote is clicked", async () => {
      await renderWithResultsAndExpand();
      const upvotes = screen.getAllByLabelText("Upvote");
      fireEvent.click(upvotes[0]);
      // Should now show "▲ 1"
      expect(upvotes[0].textContent).toContain("1");
    });
  });

  describe("forking", () => {
    async function renderWithResultsAndExpand() {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDebateResult,
      }) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      await waitFor(() => {
        expect(screen.getByText(/Debate: Solar Paint/).textContent).toContain("Solar Paint");
      });
    }

    it("shows fork dialog when fork button is clicked", async () => {
      await renderWithResultsAndExpand();
      const forkBtns = screen.getAllByLabelText("Fork argument");
      fireEvent.click(forkBtns[0]);
      expect(screen.getByText(/Forking from/).textContent).toContain("Forking from");
      expect(screen.getByPlaceholderText(/Add your branching argument/)).not.toBeNull();
    });

    it("submits a forked argument", async () => {
      await renderWithResultsAndExpand();
      const forkBtns = screen.getAllByLabelText("Fork argument");
      fireEvent.click(forkBtns[0]);

      const textarea = screen.getByPlaceholderText(/Add your branching argument/);
      fireEvent.change(textarea, { target: { value: "My counter-point" } });
      fireEvent.click(screen.getByText("Fork"));

      expect(screen.getByText("Forked Branch").textContent).toBe("Forked Branch");
      expect(screen.getByText("My counter-point").textContent).toBe("My counter-point");
    });

    it("cancels fork dialog", async () => {
      await renderWithResultsAndExpand();
      const forkBtns = screen.getAllByLabelText("Fork argument");
      fireEvent.click(forkBtns[0]);
      expect(screen.getByText(/Forking from/).textContent).toContain("Forking from");

      // Click cancel in the fork dialog
      const cancelBtns = screen.getAllByText("Cancel");
      fireEvent.click(cancelBtns[cancelBtns.length - 1]);
      expect(screen.queryByText(/Forking from/)).toBeNull();
    });
  });

  describe("custom arguments", () => {
    async function renderWithResults() {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDebateResult,
      }) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      await waitFor(() => {
        expect(screen.getByText("Add Argument").textContent).toBe("Add Argument");
      });
    }

    it("adds a custom pro argument", async () => {
      await renderWithResults();
      const input = screen.getByPlaceholderText("Type your argument…");
      fireEvent.change(input, { target: { value: "My custom pro argument" } });
      fireEvent.click(screen.getByText("Add"));
      expect(screen.getByText("My custom pro argument").textContent).toContain(
        "My custom pro argument"
      );
    });

    it("adds a custom con argument", async () => {
      await renderWithResults();
      const select = screen.getByDisplayValue("Pro") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "con" } });
      const input = screen.getByPlaceholderText("Type your argument…");
      fireEvent.change(input, { target: { value: "My con argument" } });
      fireEvent.click(screen.getByText("Add"));
      expect(screen.getByText("My con argument").textContent).toContain("My con argument");
    });

    it("submits on Enter key", async () => {
      await renderWithResults();
      const input = screen.getByPlaceholderText("Type your argument…");
      fireEvent.change(input, { target: { value: "Enter-submitted" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByText("Enter-submitted").textContent).toContain("Enter-submitted");
    });

    it("does not add empty argument", async () => {
      await renderWithResults();
      const addBtn = screen.getByText("Add");
      expect(addBtn).toHaveProperty("disabled", true);
    });
  });

  describe("abort handling", () => {
    it("ignores abort errors", async () => {
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";
      globalThis.fetch = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

      render(<DebateArena ideas={mockIdeas} />);
      fireEvent.click(screen.getByText("Start Debate"));

      // Should NOT show error for abort
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText("Retry")).toBeNull();
    });
  });
});
