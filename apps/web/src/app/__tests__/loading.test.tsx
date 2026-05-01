/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Loading from "../loading";

describe("Loading", () => {
  it("renders loading state", () => {
    render(<Loading />);
    expect(screen.getByText("Loading...")).toBeDefined();
    expect(screen.getByText("Preparing the Innovation Engine")).toBeDefined();
  });
});
