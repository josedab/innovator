/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AngleSelector } from "../AngleSelector";

describe("AngleSelector", () => {
  it("renders without crashing", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    expect(screen.getByText("Choose Innovation Angles")).toBeDefined();
  });

  it("renders Select All and Clear buttons", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    expect(screen.getByText("Select All")).toBeDefined();
    expect(screen.getByText("Clear")).toBeDefined();
  });

  it("renders angle cards", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    expect(screen.getByText("SCAMPER")).toBeDefined();
    expect(screen.getByText("First Principles")).toBeDefined();
  });

  it("disables submit button when no angles selected", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    const submitBtn = screen.getByText(/Generate Innovations/);
    expect(submitBtn).toHaveProperty("disabled", true);
  });

  it("enables submit button after selecting an angle", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("SCAMPER"));
    const submitBtn = screen.getByText(/Generate Innovations/);
    expect(submitBtn).toHaveProperty("disabled", false);
  });

  it("toggles angle selection on and off", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    const scamperBtn = screen.getByText("SCAMPER").closest("button")!;

    fireEvent.click(scamperBtn);
    expect(screen.getByText(/Generate Innovations \(1 angle\)/)).toBeDefined();

    fireEvent.click(scamperBtn);
    expect(screen.getByText(/Generate Innovations \(0 angles\)/)).toBeDefined();
  });

  it("selects all angles when Select All is clicked", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("Select All"));
    expect(screen.getByText(/Generate Innovations \(8 angles\)/)).toBeDefined();
  });

  it("clears all selections when Clear is clicked", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("Select All"));
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText(/Generate Innovations \(0 angles\)/)).toBeDefined();
  });

  it("calls onSubmit with selected angles", () => {
    const onSubmit = vi.fn();
    render(<AngleSelector onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("SCAMPER").closest("button")!);
    fireEvent.click(screen.getByText("First Principles").closest("button")!);
    fireEvent.click(screen.getByText(/Generate Innovations/));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const args = onSubmit.mock.calls[0][0] as string[];
    expect(args).toContain("scamper");
    expect(args).toContain("first-principles");
    expect(args).toHaveLength(2);
  });

  it("does not call onSubmit when no angles selected", () => {
    const onSubmit = vi.fn();
    render(<AngleSelector onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText(/Generate Innovations/));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with all angles after Select All", () => {
    const onSubmit = vi.fn();
    render(<AngleSelector onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Select All"));
    fireEvent.click(screen.getByText(/Generate Innovations/));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toHaveLength(8);
  });

  it("shows correct count for singular angle", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("SCAMPER").closest("button")!);
    expect(screen.getByText(/1 angle\b/)).toBeDefined();
  });

  it("shows correct count for plural angles", () => {
    render(<AngleSelector onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("SCAMPER").closest("button")!);
    fireEvent.click(screen.getByText("First Principles").closest("button")!);
    expect(screen.getByText(/2 angles/)).toBeDefined();
  });
});
