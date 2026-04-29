/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SubjectInput } from "../SubjectInput";

describe("SubjectInput", () => {
  it("renders without crashing", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    expect(screen.getByPlaceholderText(/code review/i)).toBeDefined();
  });

  it("renders Investigate and Auto Mode buttons", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Investigate/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Auto Mode/ })).toBeDefined();
  });

  it("disables buttons when input is empty", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toHaveProperty("disabled", true);
    });
  });
});
