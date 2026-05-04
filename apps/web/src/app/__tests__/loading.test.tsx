/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Loading from "../loading";

describe("Loading", () => {
  it("renders loading state with correct text", () => {
    render(<Loading />);
    expect(screen.getByText("Loading...")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Preparing the Innovation Engine")).toBeInstanceOf(HTMLElement);
  });

  it("renders heading and subtitle elements", () => {
    render(<Loading />);
    const heading = screen.getByText("Loading...");
    const subtitle = screen.getByText("Preparing the Innovation Engine");
    expect(heading.tagName).toBeTruthy();
    expect(subtitle.tagName).toBeTruthy();
  });
});
