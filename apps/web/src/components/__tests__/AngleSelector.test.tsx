/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
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
});
