import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  formatEstimateMarkdown,
  formatRoadmapMarkdown,
  compareEstimates,
  calibrateEstimate,
  getEffortDistribution,
  EffortEstimateSchema,
} from "../effort-estimator/index.js";

function makeEstimate(overrides: Record<string, unknown> = {}) {
  return {
    ideaTitle: "AI-powered code review",
    ideaId: "idea-1",
    totalPersonWeeks: 12,
    confidence: 0.75,
    breakdown: [
      { phase: "research", personWeeks: 2, description: "Research phase", parallelizable: false },
      { phase: "implementation", personWeeks: 8, description: "Core dev", parallelizable: true },
      { phase: "testing", personWeeks: 2, description: "QA", parallelizable: true },
    ],
    requiredSkills: [
      { skill: "Machine Learning", level: "senior", importance: "required", availability: "moderate" },
    ],
    techStack: [
      { technology: "TensorFlow", rationale: "Industry standard", category: "ml", maturity: "mature", alternatives: ["PyTorch"] },
    ],
    risks: [
      { description: "Model accuracy", probability: "medium", impact: "high", mitigation: "Iterative training" },
    ],
    assumptions: ["Team has ML experience"],
    ...overrides,
  };
}

describe("EffortEstimateSchema", () => {
  it("validates a valid effort estimate", () => {
    const estimate = makeEstimate();
    const result = EffortEstimateSchema.safeParse(estimate);
    expect(result.success).toBe(true);
  });

  it("rejects estimate with missing ideaTitle", () => {
    const estimate = makeEstimate();
    delete (estimate as Record<string, unknown>).ideaTitle;
    const result = EffortEstimateSchema.safeParse(estimate);
    expect(result.success).toBe(false);
  });
});

describe("formatEstimateMarkdown", () => {
  it("returns a markdown string with the idea title", () => {
    const estimate = makeEstimate();
    const md = formatEstimateMarkdown(estimate as never);
    expect(typeof md).toBe("string");
    expect(md).toContain("AI-powered code review");
  });

  it("includes phase information", () => {
    const estimate = makeEstimate();
    const md = formatEstimateMarkdown(estimate as never);
    expect(md).toContain("research");
  });

  it("includes risk information", () => {
    const estimate = makeEstimate();
    const md = formatEstimateMarkdown(estimate as never);
    expect(md).toContain("Model accuracy");
  });
});

describe("formatRoadmapMarkdown", () => {
  it("formats a roadmap with multiple items", () => {
    const roadmap = [
      { ideaTitle: "Idea A", startWeek: 0, endWeek: 4, totalPersonWeeks: 4, priority: 1, dependencies: [] },
      { ideaTitle: "Idea B", startWeek: 4, endWeek: 10, totalPersonWeeks: 6, priority: 2, dependencies: ["Idea A"] },
    ];
    const md = formatRoadmapMarkdown(roadmap as never[]);
    expect(typeof md).toBe("string");
    expect(md).toContain("Idea A");
    expect(md).toContain("Idea B");
  });
});

describe("compareEstimates", () => {
  it("compares multiple estimates and returns sorted results", () => {
    const estimates = [
      makeEstimate({ ideaTitle: "Small project", totalPersonWeeks: 4, confidence: 0.9 }),
      makeEstimate({ ideaTitle: "Large project", totalPersonWeeks: 20, confidence: 0.6 }),
    ];
    const result = compareEstimates(estimates as never[]);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("ideaTitle");
    expect(result[0]).toHaveProperty("totalPersonWeeks");
    expect(result[0]).toHaveProperty("score");
  });

  it("returns empty array for empty input", () => {
    const result = compareEstimates([]);
    expect(result).toEqual([]);
  });
});

describe("calibrateEstimate", () => {
  it("returns adjustment factor and calibrated estimate", () => {
    const estimate = makeEstimate({ totalPersonWeeks: 10 });
    const { adjustmentFactor, calibratedEstimate } = calibrateEstimate(estimate as never, 15);
    expect(adjustmentFactor).toBe(1.5);
    expect(calibratedEstimate.totalPersonWeeks).toBe(15);
  });

  it("adjusts phase estimates proportionally", () => {
    const estimate = makeEstimate({ totalPersonWeeks: 10 });
    const { calibratedEstimate } = calibrateEstimate(estimate as never, 20);
    const totalPhaseWeeks = calibratedEstimate.breakdown.reduce(
      (sum: number, p: { personWeeks: number }) => sum + p.personWeeks,
      0,
    );
    expect(totalPhaseWeeks).toBeGreaterThan(0);
  });
});

describe("getEffortDistribution", () => {
  it("aggregates statistics across estimates", () => {
    const estimates = [
      makeEstimate({ totalPersonWeeks: 8 }),
      makeEstimate({ totalPersonWeeks: 12 }),
      makeEstimate({ totalPersonWeeks: 16 }),
    ];
    const dist = getEffortDistribution(estimates as never[]);
    expect(dist.count).toBe(3);
    expect(dist.totalPersonWeeks).toBe(36);
    expect(dist.avgPersonWeeks).toBe(12);
    expect(dist.minPersonWeeks).toBe(8);
    expect(dist.maxPersonWeeks).toBe(16);
  });

  it("computes median correctly for odd count", () => {
    const estimates = [
      makeEstimate({ totalPersonWeeks: 5 }),
      makeEstimate({ totalPersonWeeks: 10 }),
      makeEstimate({ totalPersonWeeks: 15 }),
    ];
    const dist = getEffortDistribution(estimates as never[]);
    expect(dist.medianPersonWeeks).toBe(10);
  });

  it("returns phase distribution", () => {
    const estimates = [makeEstimate()];
    const dist = getEffortDistribution(estimates as never[]);
    expect(dist.phaseDistribution).toBeDefined();
    expect(typeof dist.phaseDistribution).toBe("object");
  });
});
