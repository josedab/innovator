/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ErrorPage from "../error";

describe("ErrorPage", () => {
  it("renders error message and try again button", () => {
    const reset = vi.fn();
    const error = new globalThis.Error("Something broke") as globalThis.Error & { digest?: string };
    render(<ErrorPage error={error} reset={reset} />);
    expect(screen.getByText("Something broke")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Try again")).toBeInstanceOf(HTMLElement);
  });

  it("calls reset when button is clicked", () => {
    const reset = vi.fn();
    const error = new globalThis.Error("fail") as globalThis.Error & { digest?: string };
    render(<ErrorPage error={error} reset={reset} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledOnce();
  });
});
