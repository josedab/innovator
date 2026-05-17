/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ErrorPage from "../app/error";

describe("Error page", () => {
  it("renders error message", () => {
    const error = new Error("Something broke");
    render(<ErrorPage error={error} reset={vi.fn()} />);
    expect(screen.getByText("Something broke")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Something went wrong")).toBeInstanceOf(HTMLElement);
  });

  it("renders fallback message when error has no message", () => {
    const error = new Error("");
    render(<ErrorPage error={error} reset={vi.fn()} />);
    expect(screen.getByText("An unexpected error occurred. Please try again.")).toBeInstanceOf(
      HTMLElement
    );
  });

  it("calls reset on Try again click", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("fail")} reset={reset} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
