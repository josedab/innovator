/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ConsensusDivergenceView from "../ConsensusDivergenceView";
import type {
  JuryReport,
  JuryVerdict,
  DivergenceDetail,
  ConsensusResult,
} from "@innovator/core/types";

function makeReport(overrides: Partial<JuryReport> = {}): JuryReport {
  return {
    verdicts: [],
    krippendorffAlpha: 0.75,
    modelReliability: { "gpt-4": 0.9, "claude-3": 0.85 },
    overallAgreement: 0.82,
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<JuryVerdict> = {}): JuryVerdict {
  return {
    ideaTitle: "Test Idea",
    finalScores: { feasibility: 7, novelty: 8, impact: 6 },
    confidence: 0.88,
    outlierModels: [],
    divergenceNotes: "",
    ...overrides,
  };
}

function makeDivergence(overrides: Partial<DivergenceDetail> = {}): DivergenceDetail {
  return {
    ideaTitle: "Test Idea",
    dimension: "feasibility",
    scores: { "gpt-4": 8, "claude-3": 3 },
    spread: 5,
    explanation: "Models disagree on feasibility",
    ...overrides,
  };
}

function makeConsensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    angleId: "angle-1",
    angleName: "Tech Innovation",
    modelResults: [],
    agreements: [],
    divergences: [],
    recommendations: [],
    consensusScore: 0.78,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ConsensusDivergenceView", () => {
  // --- Empty state ---

  it("shows empty state when no data provided", () => {
    render(<ConsensusDivergenceView />);
    expect(screen.getByText("No consensus data available.")).toBeTruthy();
  });

  // --- Agreement summary ---

  it("renders agreement summary with correct values", () => {
    const report = makeReport({ overallAgreement: 0.82, krippendorffAlpha: 0.75 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Agreement Summary")).toBeTruthy();
    expect(screen.getByText("82%")).toBeTruthy();
    expect(screen.getByText("0.750")).toBeTruthy();
  });

  // --- Alpha value formatting ---

  it("formats alpha with 3 decimal places", () => {
    const report = makeReport({ krippendorffAlpha: 0.12345 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0.123")).toBeTruthy();
  });

  // --- Alpha threshold styling ---

  it("shows 'Strong' label for alpha > 0.8", () => {
    const report = makeReport({ krippendorffAlpha: 0.85 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Strong")).toBeTruthy();
  });

  it("shows 'Moderate' label for alpha between 0.6 and 0.8", () => {
    const report = makeReport({ krippendorffAlpha: 0.7 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Moderate")).toBeTruthy();
  });

  it("shows 'Weak' label for alpha <= 0.6", () => {
    const report = makeReport({ krippendorffAlpha: 0.4 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Weak")).toBeTruthy();
  });

  // --- Alpha edge values ---

  it("handles alpha = 0", () => {
    const report = makeReport({ krippendorffAlpha: 0 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0.000")).toBeTruthy();
    expect(screen.getByText("Weak")).toBeTruthy();
  });

  it("handles alpha = 1", () => {
    const report = makeReport({ krippendorffAlpha: 1 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("1.000")).toBeTruthy();
    expect(screen.getByText("Strong")).toBeTruthy();
  });

  // --- Model reliability metrics ---

  it("renders model reliability bars", () => {
    const report = makeReport({ modelReliability: { "gpt-4": 0.92, "claude-3": 0.78 } });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Model Reliability")).toBeTruthy();
    expect(screen.getByText("gpt-4")).toBeTruthy();
    expect(screen.getByText("claude-3")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByText("78%")).toBeTruthy();
  });

  // --- Idea verdicts ---

  it("renders verdict cards with scores and confidence", () => {
    const report = makeReport({
      verdicts: [makeVerdict({ ideaTitle: "AI Bot", confidence: 0.91 })],
    });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Idea Verdicts")).toBeTruthy();
    expect(screen.getByText("AI Bot")).toBeTruthy();
    expect(screen.getByLabelText("Confidence 91%")).toBeTruthy();
  });

  it("renders outlier model badges", () => {
    const report = makeReport({
      verdicts: [makeVerdict({ outlierModels: ["llama-3"] })],
    });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByLabelText("Outlier model: llama-3")).toBeTruthy();
  });

  // --- Divergence highlights ---

  it("renders divergence highlights with spread indicator", () => {
    const divergences = [makeDivergence({ spread: 5, dimension: "novelty" })];
    render(<ConsensusDivergenceView divergences={divergences} />);
    expect(screen.getByText("Divergence Highlights")).toBeTruthy();
    expect(screen.getByText("novelty")).toBeTruthy();
    expect(screen.getByText("spread: 5")).toBeTruthy();
  });

  it("applies red styling for high spread (>= 6)", () => {
    const divergences = [makeDivergence({ spread: 7 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    const div = container.querySelector('[class*="bg-red-100"]');
    expect(div).not.toBeNull();
  });

  it("applies amber styling for medium spread (4-5)", () => {
    const divergences = [makeDivergence({ spread: 4 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    const div = container.querySelector('[class*="bg-amber-100"]');
    expect(div).not.toBeNull();
  });

  it("applies yellow styling for low spread (< 4)", () => {
    const divergences = [makeDivergence({ spread: 2 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    const div = container.querySelector('[class*="bg-yellow-50"]');
    expect(div).not.toBeNull();
  });

  // --- Single model consensus ---

  it("renders with single model reliability", () => {
    const report = makeReport({ modelReliability: { "gpt-4": 0.95 } });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("gpt-4")).toBeTruthy();
    expect(screen.getByText("95%")).toBeTruthy();
  });

  // --- Consensus results section ---

  it("renders consensus results with agreements and divergences", () => {
    const consensusResult = makeConsensusResult({
      angleName: "Tech Angle",
      consensusScore: 0.85,
      agreements: [
        {
          title: "Agreed Idea",
          description: "Desc",
          potentialImpact: "High",
          sources: ["gpt-4"],
          confidence: 0.9,
          isNovel: false,
        },
      ],
      divergences: [
        {
          title: "Diverged Idea",
          description: "Desc",
          potentialImpact: "Medium",
          sources: ["claude-3"],
          confidence: 0.6,
          isNovel: true,
        },
      ],
    });
    render(<ConsensusDivergenceView consensusResult={consensusResult} />);
    expect(screen.getByText("Tech Angle")).toBeTruthy();
    expect(screen.getByText("Consensus Score: 85%")).toBeTruthy();
    expect(screen.getByText("Agreed Idea")).toBeTruthy();
    expect(screen.getByText("Diverged Idea")).toBeTruthy();
    expect(screen.getByText("Novel")).toBeTruthy();
  });

  // --- aria labels ---

  it("has proper aria labels", () => {
    const report = makeReport();
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByLabelText("Consensus and divergence analysis")).toBeTruthy();
    expect(screen.getByLabelText("Agreement summary")).toBeTruthy();
  });
});
