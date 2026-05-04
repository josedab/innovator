/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SubjectInput } from "../SubjectInput";

describe("SubjectInput", () => {
  it("renders input with placeholder text", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    const input = screen.getByPlaceholderText(/code review/i);
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("renders Investigate and Auto Mode buttons with correct text", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    const investigateBtn = screen.getByRole("button", { name: /Investigate subject/ });
    const autoBtn = screen.getByRole("button", { name: /auto mode on subject/ });
    expect(investigateBtn).toBeInstanceOf(HTMLButtonElement);
    expect(autoBtn).toBeInstanceOf(HTMLButtonElement);
  });

  it("disables buttons when input is empty", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toHaveProperty("disabled", true);
    });
  });

  it("enables buttons when input has text", () => {
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={vi.fn()} />);
    const input = screen.getByPlaceholderText(/code review/i);
    fireEvent.change(input, { target: { value: "test subject" } });

    const investigateBtn = screen.getByRole("button", { name: /Investigate subject/ });
    const autoBtn = screen.getByRole("button", { name: /auto mode on subject/ });
    expect(investigateBtn).toHaveProperty("disabled", false);
    expect(autoBtn).toHaveProperty("disabled", false);
  });

  it("calls onSubmit with trimmed value on form submit", () => {
    const onSubmit = vi.fn();
    render(<SubjectInput onSubmit={onSubmit} onAutoMode={vi.fn()} />);
    const input = screen.getByPlaceholderText(/code review/i);
    fireEvent.change(input, { target: { value: "  test subject  " } });
    fireEvent.submit(screen.getByRole("button", { name: /Investigate subject/ }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith("test subject");
  });

  it("does not call onSubmit when input is empty", () => {
    const onSubmit = vi.fn();
    render(<SubjectInput onSubmit={onSubmit} onAutoMode={vi.fn()} />);
    fireEvent.submit(screen.getByRole("button", { name: /Investigate subject/ }).closest("form")!);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when input is only whitespace", () => {
    const onSubmit = vi.fn();
    render(<SubjectInput onSubmit={onSubmit} onAutoMode={vi.fn()} />);
    const input = screen.getByPlaceholderText(/code review/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: /Investigate subject/ }).closest("form")!);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onAutoMode with trimmed value when Auto Mode button clicked", () => {
    const onAutoMode = vi.fn();
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={onAutoMode} />);
    const input = screen.getByPlaceholderText(/code review/i);
    fireEvent.change(input, { target: { value: "  auto test  " } });
    fireEvent.click(screen.getByRole("button", { name: /auto mode on subject/ }));

    expect(onAutoMode).toHaveBeenCalledWith("auto test");
  });

  it("does not call onAutoMode when input is empty", () => {
    const onAutoMode = vi.fn();
    render(<SubjectInput onSubmit={vi.fn()} onAutoMode={onAutoMode} />);
    fireEvent.click(screen.getByRole("button", { name: /auto mode on subject/ }));

    expect(onAutoMode).not.toHaveBeenCalled();
  });
});
