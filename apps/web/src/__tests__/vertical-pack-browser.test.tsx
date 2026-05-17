/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VerticalPackBrowser } from "../components/VerticalPackBrowser";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makePack(overrides: Record<string, unknown> = {}) {
  return {
    id: "pack-1",
    name: "Healthcare Pack",
    version: "1.0.0",
    description: "Domain-specific angles for healthcare innovation",
    author: "innovator-team",
    angleCount: 5,
    complianceRuleCount: 3,
    glossaryTermCount: 10,
    metadata: { tags: ["healthcare"], icon: "🏥", color: "#22c55e" },
    installed: false,
    ...overrides,
  };
}

function makePackDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "pack-1",
    name: "Healthcare Pack",
    version: "1.0.0",
    description: "Domain-specific angles for healthcare innovation",
    author: "innovator-team",
    domainAngles: [
      {
        id: "ang-1",
        name: "Patient Safety",
        description: "Evaluate patient safety impact",
        icon: "🏥",
      },
    ],
    evaluationRubrics: [
      {
        id: "rub-1",
        name: "Healthcare Quality",
        criteria: [{ name: "Safety", description: "Patient safety", weight: 0.4 }],
        passingScore: 7,
      },
    ],
    complianceRules: [
      {
        id: "rule-1",
        name: "HIPAA Compliance",
        regulation: "HIPAA",
        severity: "critical",
        description: "Ensure PHI protection",
      },
    ],
    glossary: { PHI: "Protected Health Information", EHR: "Electronic Health Record" },
    metadata: { tags: ["healthcare"], icon: "🏥", color: "#22c55e" },
    ...overrides,
  };
}

describe("VerticalPackBrowser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders heading", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    expect(screen.getByText("Industry Vertical Packs")).toBeInstanceOf(HTMLElement);
  });

  it("renders browse and community tabs", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    expect(screen.getByText("Browse Packs")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Community")).toBeInstanceOf(HTMLElement);
  });

  it("shows loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<VerticalPackBrowser />);
    expect(screen.getByText("Loading packs...")).toBeInstanceOf(HTMLElement);
  });

  it("shows empty state when no packs match", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(screen.getByText(/No packs found/)).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders pack cards in grid", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [makePack()] }),
    });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(screen.getByText("Healthcare Pack")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText(/5 angles/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/3 rules/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/10 terms/)).toBeInstanceOf(HTMLElement);
  });

  it("shows installed badge for installed packs", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [makePack({ installed: true })] }),
    });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(screen.getByText("Installed")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders domain filter buttons", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    expect(screen.getByText("All")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Healthcare/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Fintech/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Climate/)).toBeInstanceOf(HTMLElement);
  });

  it("renders search input", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    expect(screen.getByPlaceholderText("Search packs...")).toBeInstanceOf(HTMLElement);
  });

  it("switches to community tab", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    fireEvent.click(screen.getByText("Community"));
    expect(screen.getByText(/Community Packs — Coming Soon/)).toBeInstanceOf(HTMLElement);
  });

  it("expands pack detail on click", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ packs: [makePack()] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pack: makePackDetail(), installed: false }),
      });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(screen.getByText("Healthcare Pack")).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByLabelText("View Healthcare Pack details"));

    await waitFor(() => {
      expect(screen.getByText("Patient Safety")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("HIPAA Compliance")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Install Pack")).toBeInstanceOf(HTMLElement);
  });

  it("renders glossary terms in expanded view", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ packs: [makePack()] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pack: makePackDetail(), installed: false }),
      });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(screen.getByText("Healthcare Pack")).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByLabelText("View Healthcare Pack details"));

    await waitFor(() => {
      expect(screen.getByText("PHI")).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("Protected Health Information")).toBeInstanceOf(HTMLElement);
  });

  it("installs pack via install button", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ packs: [makePack()] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pack: makePackDetail(), installed: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(screen.getByText("Healthcare Pack")).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByLabelText("View Healthcare Pack details"));
    await waitFor(() => {
      expect(screen.getByText("Install Pack")).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByText("Install Pack"));
    await waitFor(() => {
      expect(screen.getByText("✓ Installed")).toBeInstanceOf(HTMLElement);
    });
  });

  it("applies domain filter and re-fetches", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ packs: [] }),
    });
    render(<VerticalPackBrowser />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText(/Healthcare/));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondCallBody.tag).toBe("healthcare");
  });
});
