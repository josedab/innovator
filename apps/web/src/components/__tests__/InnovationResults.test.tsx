/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InnovationResults } from "../InnovationResults";
import type { AngleResult, Synthesis } from "@innovator/core/types";

const mockAngleResults: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Test Idea 1",
        description: "Description of idea 1",
        potentialImpact: "High impact",
        implementationHint: "Start here",
      },
    ],
    reasoning: "Applied SCAMPER methodology",
  },
];

const mockSynthesis: Synthesis = {
  topIdeas: [
    {
      title: "Top Idea",
      description: "Best idea overall",
      sourceAngle: "SCAMPER",
      potentialImpact: "Very high",
      feasibility: "high",
    },
  ],
  themes: ["Innovation theme 1"],
  recommendation: "Focus on this area",
};

describe("InnovationResults", () => {
  it("renders without crashing with no synthesis", () => {
    render(<InnovationResults angleResults={mockAngleResults} synthesis={null} />);
    expect(screen.getByText(/Results by Angle/)).toBeInstanceOf(HTMLElement);
  });

  it("renders angle results", () => {
    render(<InnovationResults angleResults={mockAngleResults} synthesis={null} />);
    expect(screen.getByText("SCAMPER")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("1 ideas generated")).toBeInstanceOf(HTMLElement);
  });

  it("renders synthesis when provided", () => {
    render(<InnovationResults angleResults={mockAngleResults} synthesis={mockSynthesis} />);
    expect(screen.getByText(/Synthesis & Top Ideas/)).toBeInstanceOf(HTMLElement);
  });

  it("shows angle details when expanded", async () => {
    render(<InnovationResults angleResults={mockAngleResults} synthesis={null} />);
    const angleButton = screen.getByRole("button", { name: /SCAMPER/i });
    expect(screen.queryByText("Applied SCAMPER methodology")).toBeNull();

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(angleButton);

    expect(screen.getByText("Applied SCAMPER methodology")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Test Idea 1")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Description of idea 1")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("High impact")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Start here")).toBeInstanceOf(HTMLElement);
  });
});
