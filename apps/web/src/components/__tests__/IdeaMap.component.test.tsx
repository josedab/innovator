/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IdeaMap } from "../IdeaMap";
import type { AngleResult } from "@innovator/core/types";

function makeAngleResult(
  angleId: string,
  angleName: string,
  ideas: Array<{ title: string; description: string }>
): AngleResult {
  return {
    angleId,
    angleName,
    ideas: ideas.map((i) => ({
      ...i,
      potentialImpact: "High impact",
      implementationHint: "Start here",
    })),
    reasoning: "Test reasoning",
  };
}

const sampleAngleResults: AngleResult[] = [
  makeAngleResult("scamper", "SCAMPER", [
    { title: "Solar Paint", description: "Paint that generates electricity from sunlight" },
    { title: "Modular Panels", description: "Modular solar panels for easy installation" },
  ]),
  makeAngleResult("first-principles", "First Principles", [
    { title: "Quantum Cells", description: "Quantum dot solar cells for higher efficiency" },
  ]),
];

describe("IdeaMap Component", () => {
  it("renders with sample angleResults producing SVG with nodes", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // Should have circle elements for each idea (3 total)
    const circles = svg!.querySelectorAll("circle");
    expect(circles.length).toBe(3);
  });

  it("node count matches total ideas", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);
    const circles = container.querySelectorAll("circle");
    const totalIdeas = sampleAngleResults.reduce((sum, a) => sum + a.ideas.length, 0);
    expect(circles.length).toBe(totalIdeas);
  });

  it("displays idea labels as text elements", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);
    const texts = container.querySelectorAll("text");
    // Each node has a text label
    expect(texts.length).toBe(3);
  });

  it("renders empty state with zero ideas", () => {
    const { container } = render(<IdeaMap angleResults={[]} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(0);
    // Should still show the info text
    expect(screen.getByText(/0 ideas/)).not.toBeNull();
  });

  it("renders with single angle and single idea", () => {
    const singleAngle = [
      makeAngleResult("scamper", "SCAMPER", [{ title: "Only Idea", description: "The sole idea" }]),
    ];
    const { container } = render(<IdeaMap angleResults={singleAngle} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });

  it("shows details panel when a node is clicked", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);
    const firstG = container.querySelector("g.cursor-pointer");
    expect(firstG).not.toBeNull();

    fireEvent.click(firstG!);

    // Should show the details panel with idea info
    const detailsPanel = container.querySelector(".font-semibold");
    expect(detailsPanel).not.toBeNull();
  });

  it("hides details panel when clicking selected node again", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);
    const firstG = container.querySelector("g.cursor-pointer");

    // Click to select
    fireEvent.click(firstG!);
    expect(container.querySelector(".font-semibold")).not.toBeNull();

    // Click again to deselect
    fireEvent.click(firstG!);
    // The panel should be gone
    const panels = container.querySelectorAll(".font-semibold");
    // Only the header h3 should remain
    expect(panels.length).toBeLessThanOrEqual(1);
  });

  it("angle filter buttons are rendered for each unique angle", () => {
    render(<IdeaMap angleResults={sampleAngleResults} />);
    // "All" button + one per unique angle
    expect(screen.getByText("All")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("scamper")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("first-principles")).toBeInstanceOf(HTMLElement);
  });

  it("clicking angle filter shows only that angle's ideas", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);

    // Click the first-principles filter
    fireEvent.click(screen.getByText("first-principles"));

    // Should show only 1 idea (Quantum Cells)
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });

  it("clicking All filter shows all ideas again", () => {
    const { container } = render(<IdeaMap angleResults={sampleAngleResults} />);

    // Filter to one angle
    fireEvent.click(screen.getByText("first-principles"));
    expect(container.querySelectorAll("circle").length).toBe(1);

    // Click All
    fireEvent.click(screen.getByText("All"));
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  it("truncates long titles in SVG text", () => {
    const longTitleAngle = [
      makeAngleResult("scamper", "SCAMPER", [
        {
          title: "A Very Long Title That Exceeds Twenty Five Characters Easily",
          description: "Description",
        },
      ]),
    ];
    const { container } = render(<IdeaMap angleResults={longTitleAngle} />);
    const text = container.querySelector("text");
    expect(text?.textContent).toContain("...");
  });

  it("renders many ideas without crashing", () => {
    const manyIdeas = Array.from({ length: 50 }, (_, i) => ({
      title: `Idea ${i}`,
      description: `Description for idea ${i} with some unique keywords like innovation_${i}`,
    }));
    const bigAngle = [makeAngleResult("scamper", "SCAMPER", manyIdeas)];

    const { container } = render(<IdeaMap angleResults={bigAngle} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(50);
  });

  it("shows connection count in footer", () => {
    render(<IdeaMap angleResults={sampleAngleResults} />);
    // The footer shows "X ideas • Y connections"
    const footer = screen.getByText(/ideas.*connections/);
    expect(footer).toBeInstanceOf(HTMLElement);
  });
});
