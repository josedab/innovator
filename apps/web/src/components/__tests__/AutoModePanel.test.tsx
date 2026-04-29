/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoModePanel } from "../AutoModePanel";

// Mock fetch to prevent actual API calls
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("test error"),
    })
  );
});

describe("AutoModePanel", () => {
  it("renders without crashing", () => {
    render(<AutoModePanel subject="test subject" onComplete={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText("🚀 Auto Mode")).toBeDefined();
  });

  it("displays the subject", () => {
    render(<AutoModePanel subject="code review" onComplete={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/code review/)).toBeDefined();
  });
});
