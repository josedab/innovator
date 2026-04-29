/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InvestigationView } from "../InvestigationView";
import type { Investigation } from "@innovator/core/types";

const mockInvestigation: Investigation = {
  summary: "Test summary of the investigation",
  keyAspects: [
    { title: "Aspect 1", description: "Description of aspect 1" },
    { title: "Aspect 2", description: "Description of aspect 2" },
  ],
  currentState: "Current state of the art",
  challenges: ["Challenge 1", "Challenge 2"],
  opportunities: ["Opportunity 1", "Opportunity 2"],
};

describe("InvestigationView", () => {
  it("renders without crashing", () => {
    render(<InvestigationView investigation={mockInvestigation} />);
    expect(screen.getByText("Test summary of the investigation")).toBeDefined();
  });

  it("displays key aspects", () => {
    render(<InvestigationView investigation={mockInvestigation} />);
    expect(screen.getByText("Aspect 1")).toBeDefined();
    expect(screen.getByText("Aspect 2")).toBeDefined();
  });

  it("displays challenges and opportunities", () => {
    render(<InvestigationView investigation={mockInvestigation} />);
    expect(screen.getByText("Challenge 1")).toBeDefined();
    expect(screen.getByText("Opportunity 1")).toBeDefined();
  });
});
