/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be before component import
const fetchMock = vi.fn();
global.fetch = fetchMock;

import AnalyticsPage from "../app/analytics/page";

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    totalPipelines: 10,
    totalIdeas: 50,
    totalAnglesUsed: 5,
    successRate: 0.8,
    averageDurationMs: 3000,
    ideasOverTime: [
      { date: "2025-01-01", count: 5 },
      { date: "2025-01-02", count: 10 },
    ],
    angleUsage: [
      { angleId: "scamper", count: 8, successRate: 0.9 },
      { angleId: "contrarian", count: 5, successRate: 0.7 },
    ],
    subjectWordCloud: [
      { word: "AI", count: 10 },
      { word: "web", count: 5 },
    ],
    sessionFrequency: [
      { date: "2025-01-01", count: 3 },
      { date: "2025-01-02", count: 5 },
    ],
    topModels: [{ model: "gpt-4", count: 20 }],
    ...overrides,
  };
}

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading state initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AnalyticsPage />);
    expect(screen.getByText("Loading analytics...")).toBeInstanceOf(HTMLElement);
  });

  it("renders error state on fetch failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load analytics")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders with empty summary (null summary)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: null, insights: [] }),
    });
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("No analytics data available")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders full dataset with KPI cards", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: makeSummary(), insights: [] }),
    });
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("📊 Innovation Analytics")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("Pipelines")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Ideas Generated")).toBeInstanceOf(HTMLElement);
  });

  it("renders tab navigation", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: makeSummary(), insights: [] }),
    });
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("📊 Innovation Analytics")).toBeInstanceOf(HTMLElement);
    });
    // Check tabs are present
    expect(screen.getByText(/Overview/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Trends/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Quality/)).toBeInstanceOf(HTMLElement);
  });

  it("time range selector is rendered", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: makeSummary(), insights: [] }),
    });
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("📊 Innovation Analytics")).toBeInstanceOf(HTMLElement);
    });
    const select = screen.getByLabelText("Time range");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect((select as HTMLSelectElement).value).toBe("30d");
  });

  it("changes time range on selection", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: makeSummary(), insights: [] }),
    });
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("📊 Innovation Analytics")).toBeInstanceOf(HTMLElement);
    });
    const select = screen.getByLabelText("Time range");
    fireEvent.change(select, { target: { value: "7d" } });
    expect((select as HTMLSelectElement).value).toBe("7d");
  });
});
