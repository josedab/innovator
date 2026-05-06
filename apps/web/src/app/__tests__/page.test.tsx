/**
 * @vitest-environment jsdom
 */
import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all child components to isolate the page logic
vi.mock("@/components/SubjectInput", () => ({
  SubjectInput: ({
    onSubmit,
    onAutoMode,
  }: {
    onSubmit: (s: string) => void;
    onAutoMode: (s: string) => void;
  }) => (
    <div data-testid="subject-input">
      <button data-testid="investigate-btn" onClick={() => onSubmit("test subject")}>
        Investigate
      </button>
      <button data-testid="auto-btn" onClick={() => onAutoMode("test subject")}>
        Auto
      </button>
    </div>
  ),
}));

vi.mock("@/components/InvestigationView", () => ({
  InvestigationView: () => <div data-testid="investigation-view">Investigation View</div>,
}));

vi.mock("@/components/AngleSelector", () => ({
  AngleSelector: ({ onSubmit }: { onSubmit: (angles: string[]) => void }) => (
    <div data-testid="angle-selector">
      <button data-testid="innovate-btn" onClick={() => onSubmit(["scamper"])}>
        Innovate
      </button>
    </div>
  ),
}));

vi.mock("@/components/InnovationResults", () => ({
  InnovationResults: () => <div data-testid="innovation-results">Results</div>,
}));

vi.mock("@/components/AutoModePanel", () => ({
  AutoModePanel: ({
    onComplete,
    onReset,
  }: {
    subject: string;
    onComplete: (r: unknown[], s: unknown) => void;
    onReset: () => void;
  }) => (
    <div data-testid="auto-mode-panel">
      <button data-testid="auto-complete-btn" onClick={() => onComplete([], null)}>
        Complete
      </button>
      <button data-testid="auto-reset-btn" onClick={() => onReset()}>
        Reset
      </button>
    </div>
  ),
}));

vi.mock("@/components/IdeaWorkshop", () => ({
  IdeaWorkshop: () => <div data-testid="idea-workshop">Workshop</div>,
}));

vi.mock("@/components/ExploreExamples", () => ({
  ExploreExamples: () => <div data-testid="explore-examples">Examples</div>,
}));

import Home from "../page";

describe("Home page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("stage-based rendering", () => {
    it("renders input stage initially with SubjectInput", () => {
      render(<Home />);
      expect(screen.getByTestId("subject-input")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText(/What do you want to innovate on/)).toBeInstanceOf(HTMLElement);
    });

    it("renders investigating stage with loading indicator", async () => {
      fetchMock.mockReturnValue(new Promise(() => {})); // Never resolves
      render(<Home />);
      await act(async () => {
        screen.getByTestId("investigate-btn").click();
      });
      expect(screen.getByText(/Investigating/)).toBeInstanceOf(HTMLElement);
    });

    it("renders explored stage after successful investigation", async () => {
      const mockInvestigation = {
        summary: "Test",
        keyAspects: [],
        currentState: "Current",
        challenges: [],
        opportunities: [],
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockInvestigation),
      });

      render(<Home />);
      await act(async () => {
        screen.getByTestId("investigate-btn").click();
      });

      await waitFor(() => {
        expect(screen.getByTestId("investigation-view")).toBeInstanceOf(HTMLElement);
        expect(screen.getByTestId("angle-selector")).toBeInstanceOf(HTMLElement);
      });
    });

    it("renders auto mode panel when auto mode selected", async () => {
      render(<Home />);
      await act(async () => {
        screen.getByTestId("auto-btn").click();
      });
      expect(screen.getByTestId("auto-mode-panel")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("error state rendering", () => {
    it("shows error alert on fetch failure", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("Server error"),
      });

      render(<Home />);
      await act(async () => {
        screen.getByTestId("investigate-btn").click();
      });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInstanceOf(HTMLElement);
        expect(screen.getByText(/Server error/)).toBeInstanceOf(HTMLElement);
      });
    });

    it("shows error on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      render(<Home />);
      await act(async () => {
        screen.getByTestId("investigate-btn").click();
      });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInstanceOf(HTMLElement);
        expect(screen.getByText(/Network error/)).toBeInstanceOf(HTMLElement);
      });
    });

    it("shows error on invalid JSON response", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Bad JSON")),
      });

      render(<Home />);
      await act(async () => {
        screen.getByTestId("investigate-btn").click();
      });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInstanceOf(HTMLElement);
        expect(screen.getByText(/Invalid response/)).toBeInstanceOf(HTMLElement);
      });
    });
  });

  describe("API call to /api/investigate", () => {
    it("calls /api/investigate with correct body", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            summary: "S",
            keyAspects: [],
            currentState: "C",
            challenges: [],
            opportunities: [],
          }),
      });

      render(<Home />);
      await act(async () => {
        screen.getByTestId("investigate-btn").click();
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/investigate",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: "test subject" }),
          })
        );
      });
    });
  });

  describe("auto mode flow", () => {
    it("transitions to results after auto complete", async () => {
      render(<Home />);
      await act(async () => {
        screen.getByTestId("auto-btn").click();
      });
      expect(screen.getByTestId("auto-mode-panel")).toBeInstanceOf(HTMLElement);

      await act(async () => {
        screen.getByTestId("auto-complete-btn").click();
      });
      expect(screen.getByTestId("innovation-results")).toBeInstanceOf(HTMLElement);
    });
  });

  describe("reset flow", () => {
    it("returns to input stage from auto mode on reset", async () => {
      render(<Home />);
      await act(async () => {
        screen.getByTestId("auto-btn").click();
      });
      await act(async () => {
        screen.getByTestId("auto-reset-btn").click();
      });
      expect(screen.getByTestId("subject-input")).toBeInstanceOf(HTMLElement);
    });
  });
});
