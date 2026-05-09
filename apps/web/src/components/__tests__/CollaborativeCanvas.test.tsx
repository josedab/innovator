/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CollaborativeCanvas from "../CollaborativeCanvas";
import type { CanvasNode } from "@innovator/core/types";

function makeNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: `idea-${Date.now()}`,
    type: "idea",
    title: "Test Idea",
    description: "A test idea description",
    position: { x: 100, y: 100 },
    size: { width: 200, height: 120 },
    color: "#3b82f6",
    metadata: { createdBy: "user-1" },
    ...overrides,
  };
}

const defaultProps = {
  sessionId: "session-1",
  userId: "user-1",
  displayName: "Alice",
};

describe("CollaborativeCanvas", () => {
  it("renders canvas with toolbar and SVG", () => {
    const { container } = render(<CollaborativeCanvas {...defaultProps} />);
    const toolbar = screen.getByText(/Canvas · 0 ideas/);
    expect(toolbar).toBeTruthy();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-label")).toBe("Collaborative innovation canvas");
  });

  it("renders initial nodes", () => {
    const nodes = [
      makeNode({ id: "idea-1", title: "First Idea" }),
      makeNode({ id: "idea-2", title: "Second Idea" }),
    ];
    const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
    expect(screen.getByText(/Canvas · 2 ideas/)).toBeTruthy();
    // SVG text nodes
    const texts = container.querySelectorAll("text");
    const textContents = Array.from(texts).map((t) => t.textContent);
    expect(textContents).toContain("First Idea");
    expect(textContents).toContain("Second Idea");
  });

  it("adds new idea card when + Idea button is clicked", () => {
    const { container } = render(<CollaborativeCanvas {...defaultProps} />);
    const addBtn = screen.getByText("+ Idea");
    fireEvent.click(addBtn);
    expect(screen.getByText(/Canvas · 1 ideas/)).toBeTruthy();
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("New Idea");
  });

  it("does not show action buttons in readOnly mode", () => {
    render(<CollaborativeCanvas {...defaultProps} readOnly />);
    expect(screen.queryByText("+ Idea")).toBeNull();
    expect(screen.queryByText("📝 Note")).toBeNull();
    expect(screen.queryByText("🔗 Connect")).toBeNull();
  });

  it("displays participant avatar with first letter of display name", () => {
    render(<CollaborativeCanvas {...defaultProps} displayName="Bob" />);
    const avatar = screen.getByTitle("Bob");
    expect(avatar).toBeTruthy();
    expect(avatar.textContent).toBe("B");
  });

  describe("voting", () => {
    it("renders vote buttons on nodes", () => {
      const nodes = [makeNode({ id: "idea-1", title: "Votable" })];
      const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(texts.some((t) => t?.includes("👍 0"))).toBe(true);
      expect(texts.some((t) => t?.includes("👎 0"))).toBe(true);
    });

    it("increments upvote count when 👍 is clicked", () => {
      const nodes = [makeNode({ id: "idea-1", title: "Vote Test" })];
      const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
      const upBtn = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.includes("👍 0")
      )!;
      fireEvent.click(upBtn);
      const updatedTexts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(updatedTexts.some((t) => t?.includes("👍 1"))).toBe(true);
    });

    it("increments downvote count when 👎 is clicked", () => {
      const nodes = [makeNode({ id: "idea-1", title: "Down Test" })];
      const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
      const downBtn = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.includes("👎 0")
      )!;
      fireEvent.click(downBtn);
      const updatedTexts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(updatedTexts.some((t) => t?.includes("👎 1"))).toBe(true);
    });

    it("does not show vote buttons in readOnly mode", () => {
      const nodes = [makeNode({ id: "idea-1", title: "ReadOnly" })];
      const { container } = render(
        <CollaborativeCanvas {...defaultProps} readOnly initialNodes={nodes} />
      );
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
      expect(texts.some((t) => t?.includes("👍"))).toBe(false);
    });
  });

  describe("sticky notes", () => {
    it("toggles note mode indicator when Note button clicked", () => {
      render(<CollaborativeCanvas {...defaultProps} />);
      expect(screen.queryByText(/Click on the canvas to place a sticky note/)).toBeNull();
      fireEvent.click(screen.getByText("📝 Note"));
      expect(screen.getByText(/Click on the canvas to place a sticky note/)).toBeTruthy();
    });
  });

  describe("connection mode", () => {
    it("shows connect button disabled when no node is selected", () => {
      render(<CollaborativeCanvas {...defaultProps} />);
      const connectBtn = screen.getByText("🔗 Connect");
      expect(connectBtn).toHaveProperty("disabled", true);
    });
  });

  describe("drag behavior", () => {
    it("handles mouse up on canvas (stops drag)", () => {
      const nodes = [makeNode({ id: "idea-1", title: "Drag Test" })];
      const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
      const svg = container.querySelector("svg")!;
      fireEvent.mouseUp(svg);
      expect(svg).not.toBeNull();
    });
  });

  it("truncates long titles at 24 characters", () => {
    const nodes = [
      makeNode({ id: "idea-1", title: "This is a very long idea title that exceeds limit" }),
    ];
    const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts.some((t) => t === "This is a very long idea…")).toBe(true);
  });

  it("renders no edges initially", () => {
    const nodes = [
      makeNode({ id: "idea-1", title: "Source" }),
      makeNode({ id: "idea-2", title: "Target", position: { x: 400, y: 100 } }),
    ];
    const { container } = render(<CollaborativeCanvas {...defaultProps} initialNodes={nodes} />);
    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(0);
  });
});
