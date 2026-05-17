/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InnovationMemoryPanel from "../components/InnovationMemoryPanel";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponses(
  overrides: {
    effectiveness?: unknown;
    bias?: unknown;
    recommendations?: unknown;
  } = {}
) {
  const effectivenessRes = overrides.effectiveness ?? { effectiveness: [] };
  const biasRes = overrides.bias ?? { bias: [] };
  const recommendationsRes = overrides.recommendations ?? { recommendations: null };

  mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : {};
    let data: unknown = {};
    if (body.action === "effectiveness") data = effectivenessRes;
    if (body.action === "bias") data = biasRes;
    if (body.action === "recommendations") data = recommendationsRes;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  });
}

describe("InnovationMemoryPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchResponses();
  });

  it("renders heading and description", async () => {
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Innovation Memory/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText(/Track angle effectiveness/)).toBeInstanceOf(HTMLElement);
  });

  it("renders all three tabs", async () => {
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Recommendations/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText(/Effectiveness/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Bias Analysis/)).toBeInstanceOf(HTMLElement);
  });

  it("shows loading state initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<InnovationMemoryPanel />);
    expect(screen.getByText(/Loading memory data/)).toBeInstanceOf(HTMLElement);
  });

  it("shows empty recommendations message when no data", async () => {
    mockFetchResponses({
      recommendations: {
        recommendations: { suggestedAngles: [], pastInsights: [], avoidAngles: [] },
      },
    });
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText(/No angle recommendations yet/)).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders suggested angles when data is returned", async () => {
    mockFetchResponses({
      recommendations: {
        recommendations: {
          suggestedAngles: [{ angleId: "test-angle", reason: "High quality", score: 0.85 }],
          pastInsights: [],
          avoidAngles: [],
        },
      },
    });
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.getByText("test-angle")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("High quality")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("85%")).toBeInstanceOf(HTMLElement);
  });

  it("switches to effectiveness tab and shows empty state", async () => {
    mockFetchResponses();
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading memory data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Effectiveness/));
    expect(screen.getByText(/No effectiveness data yet/)).toBeInstanceOf(HTMLElement);
  });

  it("renders effectiveness heatmap data", async () => {
    mockFetchResponses({
      effectiveness: {
        effectiveness: [
          { angleId: "angle-a", domain: "fintech", averageQuality: 8.5, sampleCount: 3 },
        ],
      },
    });
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading memory data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Effectiveness/));
    expect(screen.getByText("angle-a")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("fintech")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("8.5")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("3 samples")).toBeInstanceOf(HTMLElement);
  });

  it("switches to bias tab and shows empty state", async () => {
    mockFetchResponses();
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading memory data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Bias Analysis/));
    expect(screen.getByText(/No usage data yet/)).toBeInstanceOf(HTMLElement);
  });

  it("renders bias entries with progress bars", async () => {
    mockFetchResponses({
      bias: {
        bias: [
          { angleId: "overused-angle", count: 15, percentage: 50 },
          { angleId: "normal-angle", count: 5, percentage: 20 },
        ],
      },
    });
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading memory data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Bias Analysis/));
    expect(screen.getByText(/overused-angle/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/normal-angle/)).toBeInstanceOf(HTMLElement);
    // Overused warning
    expect(screen.getByText(/over-relying/)).toBeInstanceOf(HTMLElement);
  });

  it("has a domain input that defaults to general", async () => {
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading memory data/)).toBeNull();
    });
    const input = screen.getByPlaceholderText(/fintech, healthcare/) as HTMLInputElement;
    expect(input.value).toBe("general");
  });

  it("fetches data on mount", async () => {
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    // 3 parallel fetches: effectiveness, bias, recommendations
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("handles fetch failures gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<InnovationMemoryPanel />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading memory data/)).toBeNull();
    });
    // Should still render without crashing
    expect(screen.getByText(/Innovation Memory/)).toBeInstanceOf(HTMLElement);
  });
});
