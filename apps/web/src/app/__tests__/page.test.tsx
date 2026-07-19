/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  actions: [] as Array<Record<string, unknown>>,
  investigate: null as null | ((subject: string) => void),
  saveSession: vi.fn(),
}));

vi.mock("../appReducer", async () => {
  const actual = await vi.importActual<typeof import("../appReducer")>("../appReducer");

  return {
    ...actual,
    appReducer: (
      state: Parameters<typeof actual.appReducer>[0],
      action: Parameters<typeof actual.appReducer>[1]
    ) => {
      harness.actions.push(action);
      return actual.appReducer(state, action);
    },
  };
});

vi.mock("@/components/SubjectInput", () => ({
  SubjectInput: ({
    onSubmit,
    onAutoMode,
  }: {
    onSubmit: (subject: string) => void;
    onAutoMode: (subject: string) => void;
  }) => {
    harness.investigate = onSubmit;
    return (
      <div data-testid="subject-input">
        <button data-testid="investigate-btn" onClick={() => onSubmit("test subject")}>
          Investigate
        </button>
        <button data-testid="auto-btn" onClick={() => onAutoMode("test subject")}>
          Auto
        </button>
      </div>
    );
  },
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
    onComplete: (results: unknown[], synthesis: unknown) => void;
    onReset: () => void;
  }) => (
    <div data-testid="auto-mode-panel">
      <button
        data-testid="auto-complete-btn"
        onClick={() => onComplete([{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }], null)}
      >
        Complete
      </button>
      <button data-testid="auto-reset-btn" onClick={onReset}>
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

vi.mock("@/components/OnboardingWizard", () => ({
  OnboardingWizard: ({ onSkip }: { onSkip: () => void }) => (
    <div data-testid="onboarding-wizard">
      <button data-testid="skip-onboarding" onClick={onSkip}>
        Skip
      </button>
    </div>
  ),
}));

vi.mock("@/components/ElapsedTimer", () => ({
  ElapsedTimer: () => <span data-testid="elapsed-timer">0s</span>,
}));

vi.mock("@/components/ResultsActionBar", () => ({
  ResultsActionBar: () => <div data-testid="results-action-bar">Actions</div>,
}));

vi.mock("@/components/RecentSessions", () => ({
  RecentSessions: () => <div data-testid="recent-sessions">Recent</div>,
}));

vi.mock("@/lib/session-storage", () => ({
  saveSession: harness.saveSession,
}));

import Home from "../page";

const investigation = {
  summary: "Test",
  keyAspects: [],
  currentState: "Current",
  challenges: [],
  opportunities: [],
};

const angleResults = [{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }];
const synthesis = { themes: [], topRecommendations: [], crossCuttingInsights: [] };

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(data),
  };
}

async function submitInvestigation() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("investigate-btn"));
  });
}

async function reachExploredStage(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockResolvedValueOnce(jsonResponse(investigation));
  render(<Home />);
  await submitInvestigation();
  await screen.findByTestId("angle-selector");
}

describe("Home page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    harness.actions.length = 0;
    harness.investigate = null;
    harness.saveSession.mockReset();
    localStorage.setItem("innovator-onboarded", "true");
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("stage-based rendering", () => {
    it("renders input stage initially with SubjectInput", () => {
      render(<Home />);

      expect(screen.getByTestId("subject-input")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText(/What do you want to innovate on/)).toBeInstanceOf(HTMLElement);
    });

    it("renders investigating and explored stages", async () => {
      let resolveFetch!: (value: unknown) => void;
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      render(<Home />);
      await submitInvestigation();
      expect(screen.getByText(/Investigating/)).toBeInstanceOf(HTMLElement);

      await act(async () => {
        resolveFetch(jsonResponse(investigation));
      });

      expect(await screen.findByTestId("investigation-view")).toBeInstanceOf(HTMLElement);
      expect(screen.getByTestId("angle-selector")).toBeInstanceOf(HTMLElement);
    });

    it("renders auto mode and results after the completion callback", async () => {
      render(<Home />);

      fireEvent.click(screen.getByTestId("auto-btn"));
      expect(screen.getByTestId("auto-mode-panel")).toBeInstanceOf(HTMLElement);

      fireEvent.click(screen.getByTestId("auto-complete-btn"));
      expect(screen.getByTestId("innovation-results")).toBeInstanceOf(HTMLElement);
      expect(harness.actions.map((action) => action.type)).toEqual(["START_AUTO", "AUTO_COMPLETE"]);
      expect(harness.saveSession).toHaveBeenCalledWith("test subject", angleResults, null);
    });
  });

  describe("request orchestration", () => {
    it("sends the exact investigation and innovation requests with 60 second signals", async () => {
      const timeoutSignal = new AbortController().signal;
      const combinedSignal = new AbortController().signal;
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
      const anySpy = vi.spyOn(AbortSignal, "any").mockReturnValue(combinedSignal);

      fetchMock
        .mockResolvedValueOnce(jsonResponse(investigation))
        .mockResolvedValueOnce(jsonResponse({ angleResults, synthesis }));

      render(<Home />);
      await submitInvestigation();
      await screen.findByTestId("angle-selector");

      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "test subject" }),
        signal: combinedSignal,
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("innovate-btn"));
      });
      await screen.findByTestId("innovation-results");

      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/innovate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "test subject",
          investigation,
          angles: ["scamper"],
          synthesize: true,
        }),
        signal: combinedSignal,
      });
      expect(timeoutSpy).toHaveBeenNthCalledWith(1, 60_000);
      expect(timeoutSpy).toHaveBeenNthCalledWith(2, 60_000);
      expect(anySpy).toHaveBeenCalledTimes(2);
      expect(anySpy.mock.calls[0]?.[0]).toEqual([expect.any(AbortSignal), timeoutSignal]);
      expect(anySpy.mock.calls[1]?.[0]).toEqual([expect.any(AbortSignal), timeoutSignal]);
    });

    it("aborts the active request before restarting investigation", async () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      render(<Home />);

      await submitInvestigation();
      const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
      expect(firstSignal.aborted).toBe(false);

      await act(async () => {
        harness.investigate?.("replacement subject");
      });

      expect(firstSignal.aborted).toBe(true);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/investigate",
        expect.objectContaining({
          body: JSON.stringify({ subject: "replacement subject" }),
        })
      );
    });

    it("aborts the investigation controller before innovation and on reset", async () => {
      await reachExploredStage(fetchMock);
      const investigationSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
      expect(investigationSignal.aborted).toBe(false);

      fetchMock.mockReturnValueOnce(new Promise(() => {}));
      await act(async () => {
        fireEvent.click(screen.getByTestId("innovate-btn"));
      });
      expect(investigationSignal.aborted).toBe(true);

      const innovationSignal = fetchMock.mock.calls[1]?.[1]?.signal as AbortSignal;
      expect(innovationSignal.aborted).toBe(false);

      fetchMock.mockResolvedValueOnce(jsonResponse(investigation));
      await act(async () => {
        harness.investigate?.("replacement");
      });
      await waitFor(() => expect(innovationSignal.aborted).toBe(true));
      await screen.findByTestId("angle-selector");

      const replacementSignal = fetchMock.mock.calls[2]?.[1]?.signal as AbortSignal;
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
      expect(replacementSignal.aborted).toBe(true);
      expect(harness.actions.at(-1)).toEqual({ type: "RESET" });
    });

    it("dispatches the existing reducer actions for successful flows", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(investigation))
        .mockResolvedValueOnce(jsonResponse({ angleResults, synthesis }));

      render(<Home />);
      await submitInvestigation();
      await screen.findByTestId("angle-selector");
      fireEvent.click(screen.getByTestId("innovate-btn"));
      await screen.findByTestId("innovation-results");

      expect(harness.actions).toEqual([
        { type: "START_INVESTIGATE", subject: "test subject" },
        { type: "INVESTIGATION_SUCCESS", investigation },
        { type: "START_INNOVATE", angles: ["scamper"] },
        {
          type: "INNOVATION_SUCCESS",
          angleResults,
          synthesis,
        },
      ]);
    });
  });

  describe("response parsing and persistence", () => {
    it("maps an investigation JSON parse failure to the existing action and alert", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("Bad JSON")),
      });

      render(<Home />);
      await submitInvestigation();

      expect(await screen.findByText("Invalid response from server")).toBeInstanceOf(HTMLElement);
      expect(harness.actions.at(-1)).toEqual({
        type: "INVESTIGATION_ERROR",
        error: "Invalid response from server",
      });
    });

    it("maps an innovation JSON parse failure and does not save a session", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(investigation)).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("Bad JSON")),
      });

      render(<Home />);
      await submitInvestigation();
      await screen.findByTestId("angle-selector");
      fireEvent.click(screen.getByTestId("innovate-btn"));

      expect(await screen.findByText("Invalid response from server")).toBeInstanceOf(HTMLElement);
      expect(harness.actions.at(-1)).toEqual({
        type: "INNOVATION_ERROR",
        error: "Invalid response from server",
      });
      expect(harness.saveSession).not.toHaveBeenCalled();
    });

    it("saves only after a successful innovation response has parsed", async () => {
      let resolveJson!: (value: unknown) => void;
      const innovationJson = new Promise((resolve) => {
        resolveJson = resolve;
      });

      fetchMock
        .mockResolvedValueOnce(jsonResponse(investigation))
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockReturnValue(innovationJson) });

      render(<Home />);
      await submitInvestigation();
      await screen.findByTestId("angle-selector");
      fireEvent.click(screen.getByTestId("innovate-btn"));
      expect(harness.saveSession).not.toHaveBeenCalled();

      await act(async () => {
        resolveJson({ angleResults, synthesis });
      });

      await waitFor(() => {
        expect(harness.saveSession).toHaveBeenCalledTimes(1);
      });
      expect(harness.saveSession).toHaveBeenCalledWith("test subject", angleResults, synthesis);
    });
  });

  describe("friendly error rendering", () => {
    it.each([
      {
        raw: "429 rate limit exceeded",
        title: "Too many requests",
        message: "You're sending requests too quickly. Please wait a moment and try again.",
        hint: "Rate limits reset after 60 seconds.",
      },
      {
        raw: "Request aborted",
        title: "Request timed out",
        message: "The AI took too long to respond. Try a shorter or simpler subject.",
        hint: "Complex topics may need multiple shorter sessions.",
      },
      {
        raw: "401 unauthorized token",
        title: "Authentication error",
        message: "Could not authenticate with the AI provider.",
        hint: "Run `gh auth login` and verify your Copilot subscription is active.",
      },
      {
        raw: "Model not available",
        title: "Model unavailable",
        message:
          "The requested AI model is not available. Try a different model or use the default.",
        hint: "Check INNOVATOR_DEFAULT_MODEL in your .env.local file.",
      },
      {
        raw: "ECONNREFUSED",
        title: "Network error",
        message: "Could not connect to the server. Check your internet connection.",
        hint: "If running locally, make sure the dev server is running.",
      },
    ])("preserves the $title copy", async ({ raw, title, message, hint }) => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        text: vi.fn().mockResolvedValue(raw),
      });

      render(<Home />);
      await submitInvestigation();

      expect(await screen.findByText(title)).toBeInstanceOf(HTMLElement);
      expect(screen.getByText(message)).toBeInstanceOf(HTMLElement);
      expect(screen.getByText(hint)).toBeInstanceOf(HTMLElement);
    });

    it("preserves fallback text and truncates it to 200 characters", async () => {
      const raw = "x".repeat(250);
      fetchMock.mockResolvedValueOnce({
        ok: false,
        text: vi.fn().mockResolvedValue(raw),
      });

      render(<Home />);
      await submitInvestigation();

      expect(await screen.findByText("Something went wrong")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText(`${"x".repeat(200)}…`)).toBeInstanceOf(HTMLElement);
    });
  });

  describe("reset flow", () => {
    it("returns to input stage from auto mode on reset", () => {
      render(<Home />);

      fireEvent.click(screen.getByTestId("auto-btn"));
      fireEvent.click(screen.getByTestId("auto-reset-btn"));

      expect(screen.getByTestId("subject-input")).toBeInstanceOf(HTMLElement);
      expect(harness.actions.map((action) => action.type)).toEqual(["START_AUTO", "RESET"]);
    });
  });
});
