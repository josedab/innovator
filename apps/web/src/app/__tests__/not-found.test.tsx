/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NotFound from "../not-found";

describe("NotFound", () => {
  it("renders not found page with link home", () => {
    render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeDefined();
    const link = screen.getByText("Back to home");
    expect(link.getAttribute("href")).toBe("/");
  });
});
