/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PriorityMatrix } from "../PriorityMatrix";

interface IdeaScoreDisplay {
  ideaTitle: string;
  angleId: string;
  feasibility: number;
  impact: number;
  novelty: number;
  timeToImplement: "days" | "weeks" | "months" | "quarters" | "years";
  confidence: number;
  rationale: string;
}

function makeScore(overrides: Partial<IdeaScoreDisplay> = {}): IdeaScoreDisplay {
  return {
    ideaTitle: "Test Idea",
    angleId: "scamper",
    feasibility: 5,
    impact: 5,
    novelty: 5,
    timeToImplement: "months",
    confidence: 0.8,
    rationale: "Test rationale",
    ...overrides,
  };
}

describe("PriorityMatrix component", () => {
  it("renders empty state when scores is empty", () => {
    render(<PriorityMatrix scores={[]} />);
    expect(screen.getByText("No scores available.")).toBeInstanceOf(HTMLElement);
  });

  it("renders quadrant labels correctly", () => {
    const scores = [makeScore()];
    render(<PriorityMatrix scores={scores} />);
    expect(screen.getByText("Quick Wins ⭐")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Strategic Bets")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Reconsider")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Low-Hanging Fruit")).toBeInstanceOf(HTMLElement);
  });

  it("renders priority matrix heading", () => {
    render(<PriorityMatrix scores={[makeScore()]} />);
    expect(screen.getByText("📊 Priority Matrix")).toBeInstanceOf(HTMLElement);
  });

  it("renders ranked list section", () => {
    render(<PriorityMatrix scores={[makeScore()]} />);
    expect(screen.getByText("Ranked Ideas")).toBeInstanceOf(HTMLElement);
  });

  it("renders idea title in ranked list", () => {
    render(<PriorityMatrix scores={[makeScore({ ideaTitle: "My Great Idea" })]} />);
    // Title appears in both the dot tooltip and the ranked list
    const elements = screen.getAllByText("My Great Idea");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders dots for each score (via style positioning)", () => {
    const scores = [
      makeScore({ ideaTitle: "A", feasibility: 1, impact: 10, novelty: 5 }),
      makeScore({ ideaTitle: "B", feasibility: 10, impact: 1, novelty: 5 }),
    ];
    const { container } = render(<PriorityMatrix scores={scores} />);
    // Each score creates a positioned dot element with absolute positioning
    const dots = container.querySelectorAll(".absolute.group");
    expect(dots.length).toBe(2);
  });

  it("dot size is proportional to novelty score", () => {
    const scores = [
      makeScore({ ideaTitle: "Low Novelty", novelty: 0 }),
      makeScore({ ideaTitle: "High Novelty", novelty: 10 }),
    ];
    const { container } = render(<PriorityMatrix scores={scores} />);
    const dots = container.querySelectorAll(".rounded-full.opacity-80");
    // novelty=0: 8px, novelty=10: 24px
    const sizes = Array.from(dots).map((d) => (d as HTMLElement).style.width);
    expect(sizes).toContain("8px");
    expect(sizes).toContain("24px");
  });

  it("positions correctly for boundary values", () => {
    const scores = [
      makeScore({ ideaTitle: "TopRight", feasibility: 10, impact: 10 }),
      makeScore({ ideaTitle: "BottomLeft", feasibility: 1, impact: 1 }),
    ];
    const { container } = render(<PriorityMatrix scores={scores} />);
    const positionedDots = container.querySelectorAll(".absolute.group");
    const styles = Array.from(positionedDots).map((d) => ({
      left: (d as HTMLElement).style.left,
      top: (d as HTMLElement).style.top,
    }));
    // feasibility=10 → x=100%, impact=10 → y=0%
    expect(styles).toContainEqual({ left: "100%", top: "0%" });
    // feasibility=1 → x=0%, impact=1 → y=100%
    expect(styles).toContainEqual({ left: "0%", top: "100%" });
  });

  it("tooltip content includes idea details", () => {
    const scores = [makeScore({ ideaTitle: "Hover Me", rationale: "Because reasons" })];
    const { container } = render(<PriorityMatrix scores={scores} />);
    // Tooltip is hidden by default but present in DOM
    const tooltip = container.querySelector(".hidden.group-hover\\:block");
    expect(tooltip?.textContent).toContain("Hover Me");
    expect(tooltip?.textContent).toContain("Because reasons");
  });

  it("renders top 10 in ranked list when more than 10 scores", () => {
    const scores = Array.from({ length: 15 }, (_, i) =>
      makeScore({ ideaTitle: `Idea ${i}`, impact: i + 1 })
    );
    render(<PriorityMatrix scores={scores} />);
    // Ranked list should show items with number prefixes 1-10
    const rankedItems = screen.getAllByText(/^\d+\.$/);
    expect(rankedItems.length).toBeLessThanOrEqual(10);
  });

  it("renders legend only for present angles", () => {
    const scores = [makeScore({ angleId: "scamper" })];
    render(<PriorityMatrix scores={scores} />);
    expect(screen.getByText("scamper")).toBeInstanceOf(HTMLElement);
  });

  it("weighted scoring formula sorts correctly in ranked list", () => {
    const scores = [
      makeScore({ ideaTitle: "Low Score", impact: 1, feasibility: 1, novelty: 1 }),
      makeScore({ ideaTitle: "High Score", impact: 10, feasibility: 10, novelty: 10 }),
    ];
    const { container } = render(<PriorityMatrix scores={scores} />);
    // Get ranked list items by looking at truncated span elements
    const rankedItems = container.querySelectorAll(".flex-1.truncate");
    const titles = Array.from(rankedItems).map((el) => el.textContent);
    const highIdx = titles.indexOf("High Score");
    const lowIdx = titles.indexOf("Low Score");
    expect(highIdx).toBeLessThan(lowIdx);
  });
});
