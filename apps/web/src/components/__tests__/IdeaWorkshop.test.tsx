/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock dnd-kit to avoid drag-and-drop complexity in unit tests
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

import { IdeaWorkshop } from "../IdeaWorkshop";
import type { AngleResult } from "@innovator/core/types";

const sampleAngleResults: AngleResult[] = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [
      {
        title: "Idea A",
        description: "Description A",
        potentialImpact: "High",
        implementationHint: "Start now",
      },
      {
        title: "Idea B",
        description: "Description B",
        potentialImpact: "Medium",
        implementationHint: "Plan first",
      },
    ],
    reasoning: "Applied SCAMPER",
  },
  {
    angleId: "first-principles",
    angleName: "First Principles",
    ideas: [
      {
        title: "Idea C",
        description: "Description C",
        potentialImpact: "Breakthrough",
        implementationHint: "Research",
      },
    ],
    reasoning: "Decomposed fundamentals",
  },
];

describe("IdeaWorkshop", () => {
  it("renders 4 columns (Backlog, Exploring, Planned, Building)", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    expect(screen.getByText(/Backlog/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Exploring/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Planned/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Building/)).toBeInstanceOf(HTMLElement);
  });

  it("renders idea cards in backlog column by default", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    expect(screen.getByText("Idea A")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Idea B")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Idea C")).toBeInstanceOf(HTMLElement);
  });

  it("renders with empty ideas array without crash", () => {
    const { container } = render(<IdeaWorkshop angleResults={[]} subject="Test" />);
    // All 4 columns should still render
    expect(container.textContent).toContain("Backlog");
    expect(container.textContent).toContain("Exploring");
  });

  it("renders idea descriptions", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    expect(screen.getByText("Description A")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Description C")).toBeInstanceOf(HTMLElement);
  });

  it("renders source angle badges", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    expect(screen.getAllByText("SCAMPER")).toHaveLength(2);
    expect(screen.getByText("First Principles")).toBeInstanceOf(HTMLElement);
  });

  it("renders workshop title", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    expect(screen.getByText(/Idea Workshop/)).toBeInstanceOf(HTMLElement);
  });

  it("renders export markdown button", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    expect(screen.getByText(/Export MD/)).toBeInstanceOf(HTMLElement);
  });

  it("shows checkbox for selecting ideas", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3); // 3 ideas
  });

  it("clicking checkbox toggles selection", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkboxes[0]);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
  });

  it("shows Notes and Split buttons for each idea", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    const notesButtons = screen.getAllByText(/Notes/);
    const splitButtons = screen.getAllByText(/Split/);
    expect(notesButtons.length).toBe(3);
    expect(splitButtons.length).toBe(3);
  });

  it("shows column counts", () => {
    render(<IdeaWorkshop angleResults={sampleAngleResults} subject="Test" />);
    // Backlog should show (3) since all ideas start there
    expect(screen.getByText("(3)")).toBeInstanceOf(HTMLElement);
  });
});
