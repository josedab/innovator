// @ts-nocheck — test mocks use simplified types
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the types import
vi.mock("@innovator/core/types", () => ({}));

import CollaborativeCanvas from "../CollaborativeCanvas";

const defaultProps = {
  sessionId: "session-1",
  userId: "user-1",
  displayName: "Alice",
};

const testNodes = [
  {
    id: "idea-1",
    type: "idea",
    title: "First Idea",
    description: "Description 1",
    position: { x: 100, y: 100 },
    size: { width: 200, height: 120 },
    color: "#3b82f6",
    metadata: { createdBy: "user-1" },
  },
  {
    id: "idea-2",
    type: "idea",
    title: "Second Idea",
    description: "Description 2",
    position: { x: 400, y: 200 },
    size: { width: 200, height: 120 },
    color: "#ef4444",
    metadata: { createdBy: "user-2" },
  },
];

describe("CollaborativeCanvas", () => {
  it("renders empty canvas with SVG and zero ideas", () => {
    render(<CollaborativeCanvas {...defaultProps} />);
    expect(screen.getByRole("img")).toBeDefined();
    expect(screen.getByText(/0 ideas/)).toBeDefined();
  });

  it("renders with initial nodes", () => {
    render(<CollaborativeCanvas {...defaultProps} initialNodes={testNodes} />);
    expect(screen.getByText(/2 ideas/)).toBeDefined();
    expect(screen.getByText("First Idea")).toBeDefined();
    expect(screen.getByText("Second Idea")).toBeDefined();
  });

  it("shows toolbar buttons in edit mode", () => {
    render(<CollaborativeCanvas {...defaultProps} />);
    expect(screen.getByText("+ Idea")).toBeDefined();
    expect(screen.getByText("📝 Note")).toBeDefined();
    expect(screen.getByText("🔗 Connect")).toBeDefined();
    expect(screen.getByText("🔥 Heat Map")).toBeDefined();
    expect(screen.getByText("🤖 AI Clusters")).toBeDefined();
  });

  it("hides action buttons in readOnly mode", () => {
    render(<CollaborativeCanvas {...defaultProps} readOnly />);
    expect(screen.queryByText("+ Idea")).toBeNull();
  });

  it("adds an idea card when clicking + Idea", () => {
    render(<CollaborativeCanvas {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Idea"));
    expect(screen.getByText(/1 ideas/)).toBeDefined();
  });

  it("shows participant indicator with user initial", () => {
    render(<CollaborativeCanvas {...defaultProps} displayName="Alice" />);
    expect(screen.getByText("A")).toBeDefined();
  });

  it("has correct aria-label on canvas SVG", () => {
    render(<CollaborativeCanvas {...defaultProps} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Collaborative innovation canvas"
    );
  });

  it("shows note mode indicator when Note button is clicked", () => {
    render(<CollaborativeCanvas {...defaultProps} />);
    fireEvent.click(screen.getByText("📝 Note"));
    expect(screen.getByText("Click on the canvas to place a sticky note.")).toBeDefined();
  });
});
