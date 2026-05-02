import { describe, it, expect, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  getIndicator,
  sustainabilityToMarkdown,
  TrafficLightSchema,
} from "../sustainability/index.js";
import type { SustainabilityScorecard } from "../sustainability/index.js";

describe("sustainability", () => {
  it("returns correct traffic light indicators", () => {
    expect(getIndicator(8)).toBe("green");
    expect(getIndicator(7)).toBe("green");
    expect(getIndicator(5)).toBe("yellow");
    expect(getIndicator(4)).toBe("yellow");
    expect(getIndicator(3)).toBe("red");
    expect(getIndicator(0)).toBe("red");
  });

  it("validates traffic light schema", () => {
    expect(TrafficLightSchema.parse("green")).toBe("green");
    expect(TrafficLightSchema.parse("yellow")).toBe("yellow");
    expect(TrafficLightSchema.parse("red")).toBe("red");
    expect(() => TrafficLightSchema.parse("blue")).toThrow();
  });

  it("exports scorecard as markdown", () => {
    const scorecard: SustainabilityScorecard = {
      ideaTitle: "Green AI",
      environmental: {
        carbonImpact: 8,
        wasteGeneration: 7,
        resourceUse: 6,
        overallScore: 7,
        indicator: "green",
        details: "Low carbon footprint",
      },
      social: {
        accessibility: 8,
        inclusion: 7,
        displacement: 5,
        overallScore: 6.7,
        indicator: "yellow",
        details: "Generally inclusive",
      },
      governance: {
        transparency: 6,
        accountability: 7,
        overallScore: 6.5,
        indicator: "yellow",
        details: "Good governance",
      },
      overallScore: 6.7,
      overallIndicator: "yellow",
      riskFlags: [
        {
          dimension: "social",
          severity: "medium",
          description: "May displace some workers",
          mitigation: "Provide retraining programs",
        },
      ],
      improvements: [
        {
          dimension: "environmental",
          suggestion: "Use renewable energy",
          effort: "low",
          impact: "high",
        },
      ],
      summary: "Overall positive sustainability profile with room for improvement",
    };

    const md = sustainabilityToMarkdown(scorecard);
    expect(md).toContain("# Sustainability Assessment: Green AI");
    expect(md).toContain("Environmental");
    expect(md).toContain("Social");
    expect(md).toContain("Governance");
    expect(md).toContain("Risk Flags");
    expect(md).toContain("Improvement Suggestions");
    expect(md).toContain("renewable energy");
  });
});
