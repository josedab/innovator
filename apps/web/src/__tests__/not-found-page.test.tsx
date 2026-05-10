/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NotFound from "../app/not-found";

describe("NotFound page", () => {
  it("renders page not found message", () => {
    render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeInstanceOf(HTMLElement);
  });

  it("renders back to home link", () => {
    render(<NotFound />);
    const link = screen.getByText("Back to home");
    expect(link).toBeInstanceOf(HTMLElement);
    expect(link.closest("a")?.getAttribute("href")).toBe("/");
  });
});
