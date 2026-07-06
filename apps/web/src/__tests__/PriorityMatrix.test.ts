/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PriorityMatrix } from "../components/PriorityMatrix";

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

afterEach(cleanup);

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

function renderMatrix(scores: IdeaScoreDisplay[]) {
  return render(React.createElement(PriorityMatrix, { scores }));
}

function getDots(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".absolute.group"));
}

function getRankedTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".mt-4 .space-y-1 > div")).map(
    (row) => row.querySelector<HTMLElement>(".flex-1")?.textContent ?? ""
  );
}

describe("PriorityMatrix", () => {
  describe("empty state", () => {
    it("renders the empty state for empty scores", () => {
      renderMatrix([]);
      expect(screen.getByText("No scores available.")).toBeTruthy();
    });
  });

  describe("dot positioning", () => {
    it("feasibility=1 maps to x=0%", () => {
      const { container } = renderMatrix([makeScore({ feasibility: 1 })]);
      expect(getDots(container)[0].style.left).toBe("0%");
    });

    it("feasibility=10 maps to x=100%", () => {
      const { container } = renderMatrix([makeScore({ feasibility: 10 })]);
      expect(getDots(container)[0].style.left).toBe("100%");
    });

    it("impact=10 maps to y=0% (top)", () => {
      const { container } = renderMatrix([makeScore({ impact: 10 })]);
      expect(getDots(container)[0].style.top).toBe("0%");
    });

    it("impact=1 maps to y=100% (bottom)", () => {
      const { container } = renderMatrix([makeScore({ impact: 1 })]);
      expect(getDots(container)[0].style.top).toBe("100%");
    });

    it("renders one dot for each score", () => {
      const { container } = renderMatrix([
        makeScore({ ideaTitle: "A" }),
        makeScore({ ideaTitle: "B" }),
        makeScore({ ideaTitle: "C" }),
      ]);
      expect(getDots(container)).toHaveLength(3);
    });
  });

  describe("dot sizing based on novelty", () => {
    it("uses the 8px base size for novelty=0", () => {
      const { container } = renderMatrix([makeScore({ novelty: 0 })]);
      const dot = getDots(container)[0].firstElementChild as HTMLElement;
      expect(dot.style.width).toBe("8px");
      expect(dot.style.height).toBe("8px");
    });

    it("uses the 24px maximum size for novelty=10", () => {
      const { container } = renderMatrix([makeScore({ novelty: 10 })]);
      const dot = getDots(container)[0].firstElementChild as HTMLElement;
      expect(dot.style.width).toBe("24px");
      expect(dot.style.height).toBe("24px");
    });

    it("uses a proportional size for mid novelty", () => {
      const { container } = renderMatrix([makeScore({ novelty: 5 })]);
      const dot = getDots(container)[0].firstElementChild as HTMLElement;
      expect(dot.style.width).toBe("16px");
      expect(dot.style.height).toBe("16px");
    });
  });

  describe("ranked list", () => {
    it("sorts by weighted score (impact×0.35 + feasibility×0.3 + novelty×0.2)", () => {
      const { container } = renderMatrix([
        makeScore({ ideaTitle: "Low", impact: 1, feasibility: 1, novelty: 1 }),
        makeScore({ ideaTitle: "High", impact: 10, feasibility: 10, novelty: 10 }),
        makeScore({ ideaTitle: "Mid", impact: 5, feasibility: 5, novelty: 5 }),
      ]);
      expect(getRankedTitles(container)).toEqual(["High", "Mid", "Low"]);
    });

    it("shows top 10 when more than 10 scores", () => {
      const scores = Array.from({ length: 15 }, (_, i) =>
        makeScore({ ideaTitle: `Idea ${i}`, impact: i })
      );
      const { container } = renderMatrix(scores);
      expect(getRankedTitles(container)).toHaveLength(10);
    });
  });

  describe("legend", () => {
    it("shows colors only for present angles", () => {
      renderMatrix([makeScore({ angleId: "scamper" }), makeScore({ angleId: "inversion" })]);
      expect(screen.getByText("scamper")).toBeTruthy();
      expect(screen.getByText("inversion")).toBeTruthy();
      expect(screen.queryByText("cross-domain")).toBeNull();
    });
  });
});
