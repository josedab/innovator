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
    expect(screen.getByText("No consensus data available.").textContent).toBe(
      "No consensus data available."
    );
  });

  // --- Agreement summary ---

  it("renders agreement summary with correct percentage and alpha", () => {
    const report = makeReport({ overallAgreement: 0.82, krippendorffAlpha: 0.75 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Agreement Summary").textContent).toBe("Agreement Summary");
    expect(screen.getByText("82%").textContent).toBe("82%");
    expect(screen.getByText("0.750").textContent).toBe("0.750");
  });

  // --- Alpha value formatting ---

  it("formats alpha with 3 decimal places", () => {
    const report = makeReport({ krippendorffAlpha: 0.12345 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0.123").textContent).toBe("0.123");
  });

  // --- Alpha threshold styling ---

  it("shows 'Strong' label for alpha > 0.8", () => {
    const report = makeReport({ krippendorffAlpha: 0.85 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Strong").textContent).toBe("Strong");
  });

  it("shows 'Moderate' label for alpha between 0.6 and 0.8", () => {
    const report = makeReport({ krippendorffAlpha: 0.7 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Moderate").textContent).toBe("Moderate");
  });

  it("shows 'Weak' label for alpha <= 0.6", () => {
    const report = makeReport({ krippendorffAlpha: 0.4 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Weak").textContent).toBe("Weak");
  });

  // --- Alpha edge values ---

  it("handles alpha = 0", () => {
    const report = makeReport({ krippendorffAlpha: 0 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0.000").textContent).toBe("0.000");
    expect(screen.getByText("Weak").textContent).toBe("Weak");
  });

  it("handles alpha = 1", () => {
    const report = makeReport({ krippendorffAlpha: 1 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("1.000").textContent).toBe("1.000");
    expect(screen.getByText("Strong").textContent).toBe("Strong");
  });

  it("alpha = 0.8 exactly maps to Moderate (boundary)", () => {
    const report = makeReport({ krippendorffAlpha: 0.8 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0.800").textContent).toBe("0.800");
    // alphaLabel uses > 0.8 for Strong, so 0.8 exactly is Moderate
    expect(screen.getByText("Moderate").textContent).toBe("Moderate");
  });

  it("alpha = 0.6 exactly maps to Weak (boundary)", () => {
    const report = makeReport({ krippendorffAlpha: 0.6 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0.600").textContent).toBe("0.600");
    // alphaLabel uses > 0.6 for Moderate, so 0.6 exactly is Weak
    expect(screen.getByText("Weak").textContent).toBe("Weak");
  });

  // --- Overall agreement produces correct percentage ---

  it("overallAgreement 0.00 renders 0%", () => {
    const report = makeReport({ overallAgreement: 0.0 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("0%").textContent).toBe("0%");
  });

  it("overallAgreement 1.0 renders 100%", () => {
    const report = makeReport({ overallAgreement: 1.0 });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("100%").textContent).toBe("100%");
  });

  // --- Model reliability metrics ---

  it("renders model reliability table with correct percentages", () => {
    const report = makeReport({ modelReliability: { "gpt-4": 0.92, "claude-3": 0.78 } });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Model Reliability").textContent).toBe("Model Reliability");
    expect(screen.getByText("gpt-4").textContent).toBe("gpt-4");
    expect(screen.getByText("claude-3").textContent).toBe("claude-3");
    expect(screen.getByText("92%").textContent).toBe("92%");
    expect(screen.getByText("78%").textContent).toBe("78%");
  });

  // --- Idea verdicts ---

  it("renders verdict cards with specific scores and confidence value", () => {
    const report = makeReport({
      verdicts: [makeVerdict({ ideaTitle: "AI Bot", confidence: 0.91 })],
    });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("Idea Verdicts").textContent).toBe("Idea Verdicts");
    expect(screen.getByText("AI Bot").textContent).toBe("AI Bot");
    const confBadge = screen.getByLabelText("Confidence 91%");
    expect(confBadge.textContent).toContain("91%");
    expect(confBadge.textContent).toContain("conf");
  });

  it("renders outlier model badges with model name", () => {
    const report = makeReport({
      verdicts: [makeVerdict({ outlierModels: ["llama-3"] })],
    });
    render(<ConsensusDivergenceView report={report} />);
    const badge = screen.getByLabelText("Outlier model: llama-3");
    expect(badge.textContent).toContain("llama-3");
  });

  // --- Divergence highlights ---

  it("renders divergence highlights with dimension and spread", () => {
    const divergences = [makeDivergence({ spread: 5, dimension: "novelty" })];
    render(<ConsensusDivergenceView divergences={divergences} />);
    expect(screen.getByText("Divergence Highlights").textContent).toBe("Divergence Highlights");
    expect(screen.getByText("novelty").textContent).toBe("novelty");
    expect(screen.getByText("spread: 5").textContent).toBe("spread: 5");
  });

  it("applies red styling for high spread (>= 6)", () => {
    const divergences = [makeDivergence({ spread: 7 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    const div = container.querySelector('[class*="bg-red-100"]');
    expect(div).not.toBeNull();
    expect(div!.className).toContain("border-red-400");
  });

  it("applies amber styling for medium spread (4-5)", () => {
    const divergences = [makeDivergence({ spread: 4 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    const div = container.querySelector('[class*="bg-amber-100"]');
    expect(div).not.toBeNull();
    expect(div!.className).toContain("border-amber-400");
  });

  it("applies yellow styling for low spread (< 4)", () => {
    const divergences = [makeDivergence({ spread: 2 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    const div = container.querySelector('[class*="bg-yellow-50"]');
    expect(div).not.toBeNull();
    expect(div!.className).toContain("border-yellow-300");
  });

  it("spread = 6 exactly maps to red", () => {
    const divergences = [makeDivergence({ spread: 6 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    expect(container.querySelector('[class*="bg-red-100"]')).not.toBeNull();
  });

  it("spread = 3 exactly maps to yellow", () => {
    const divergences = [makeDivergence({ spread: 3 })];
    const { container } = render(<ConsensusDivergenceView divergences={divergences} />);
    expect(container.querySelector('[class*="bg-yellow-50"]')).not.toBeNull();
  });

  // --- Single model consensus ---

  it("renders with single model reliability showing correct value", () => {
    const report = makeReport({ modelReliability: { "gpt-4": 0.95 } });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByText("gpt-4").textContent).toBe("gpt-4");
    expect(screen.getByText("95%").textContent).toBe("95%");
  });

  // --- 0 verdicts for empty state ---

  it("does not render Idea Verdicts section when verdicts are empty", () => {
    const report = makeReport({ verdicts: [] });
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.queryByText("Idea Verdicts")).toBeNull();
  });

  // --- Consensus results section ---

  it("renders consensus results with correct score, agreements and divergences", () => {
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
    expect(screen.getByText("Tech Angle").textContent).toBe("Tech Angle");
    expect(screen.getByText("Consensus Score: 85%").textContent).toBe("Consensus Score: 85%");
    expect(screen.getByText("Agreed Idea").textContent).toBe("Agreed Idea");
    expect(screen.getByText("Diverged Idea").textContent).toBe("Diverged Idea");
    expect(screen.getByText("Novel").textContent).toBe("Novel");
  });

  // --- aria labels ---

  it("has proper aria labels for main sections", () => {
    const report = makeReport();
    render(<ConsensusDivergenceView report={report} />);
    expect(screen.getByLabelText("Consensus and divergence analysis").tagName).toBe("DIV");
    expect(screen.getByLabelText("Agreement summary").tagName).toBe("SECTION");
  });
});
