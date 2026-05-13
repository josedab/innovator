import { describe, it, expect, vi, beforeEach } from "vitest";
import { USPTOProvider, SemanticScholarProvider, CompositeProvider, createDefaultProviders } from "../providers.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("USPTOProvider", () => {
  const provider = new USPTOProvider();

  it("has correct name and source", () => {
    expect(provider.name).toBe("USPTO PatentsView");
    expect(provider.source).toBe("patent");
  });

  it("returns parsed patents on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        patents: [
          {
            patent_number: "10234567",
            patent_title: "AI Solar Optimization",
            patent_abstract: "A system for optimizing solar panel angles using machine learning",
            patent_date: "2023-01-15",
            inventors: [{ inventor_first_name: "Jane", inventor_last_name: "Doe" }],
          },
          {
            patent_number: "10234568",
            patent_title: "Smart Grid Controller",
            patent_abstract: "Controller for smart grid energy distribution",
            patent_date: "2023-06-20",
            inventors: [],
          },
        ],
      }),
    });

    const results = await provider.search("solar panel optimization");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("uspto-10234567");
    expect(results[0].source).toBe("patent");
    expect(results[0].title).toBe("AI Solar Optimization");
    expect(results[0].patentNumber).toBe("US10234567");
    expect(results[0].url).toContain("patents.google.com");
    expect(results[0].authors).toEqual(["Jane Doe"]);
  });

  it("returns empty array on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const results = await provider.search("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const results = await provider.search("test query");
    expect(results).toEqual([]);
  });

  it("returns empty for queries with no meaningful keywords", async () => {
    const results = await provider.search("a an the");
    expect(results).toEqual([]);
  });

  it("handles empty patents array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ patents: [] }),
    });
    const results = await provider.search("quantum computing");
    expect(results).toEqual([]);
  });

  it("handles missing patents field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const results = await provider.search("quantum computing");
    expect(results).toEqual([]);
  });
});

describe("SemanticScholarProvider", () => {
  const provider = new SemanticScholarProvider();

  it("has correct name and source", () => {
    expect(provider.name).toBe("Semantic Scholar");
    expect(provider.source).toBe("academic");
  });

  it("returns parsed papers on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            paperId: "abc123",
            title: "Deep Learning for Solar Forecasting",
            abstract: "A novel deep learning approach for solar energy forecasting",
            year: 2024,
            authors: [{ name: "Alice Smith" }, { name: "Bob Jones" }],
            externalIds: { DOI: "10.1234/solar.2024.001" },
            url: "https://www.semanticscholar.org/paper/abc123",
            citationCount: 42,
          },
        ],
      }),
    });

    const results = await provider.search("solar forecasting deep learning");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("s2-abc123");
    expect(results[0].source).toBe("academic");
    expect(results[0].title).toBe("Deep Learning for Solar Forecasting");
    expect(results[0].doi).toBe("10.1234/solar.2024.001");
    expect(results[0].authors).toEqual(["Alice Smith", "Bob Jones"]);
    expect(results[0].publicationDate).toBe("2024-01-01");
  });

  it("returns empty on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Timeout"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("returns empty on non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("handles null abstract", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{
          paperId: "xyz",
          title: "Some Paper",
          abstract: null,
          year: null,
          authors: [],
          url: "https://example.com",
          citationCount: 0,
        }],
      }),
    });
    const results = await provider.search("test");
    expect(results[0].description).toBe("No abstract available");
    expect(results[0].publicationDate).toBeUndefined();
  });
});

describe("CompositeProvider", () => {
  it("merges results from multiple providers", async () => {
    // First call for USPTO
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        patents: [{ patent_number: "111", patent_title: "Patent A", patent_abstract: "Desc A", patent_date: "2024-01-01" }],
      }),
    });
    // Second call for Semantic Scholar
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ paperId: "p1", title: "Paper B", abstract: "Desc B", year: 2024, authors: [], url: "https://example.com", citationCount: 5 }],
      }),
    });

    const composite = createDefaultProviders();
    const results = await composite.search("solar energy optimization", { maxResults: 10 });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("handles partial provider failures gracefully", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("USPTO down"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ paperId: "p1", title: "Paper", abstract: "Desc", year: 2024, authors: [], url: "https://example.com", citationCount: 0 }],
        }),
      });

    const composite = createDefaultProviders();
    const results = await composite.search("test");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("respects maxResults limit", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          patents: Array.from({ length: 5 }, (_, i) => ({
            patent_number: `${i}`, patent_title: `P${i}`, patent_abstract: `D${i}`, patent_date: "2024-01-01",
          })),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 5 }, (_, i) => ({
            paperId: `s${i}`, title: `Paper ${i}`, abstract: `A${i}`, year: 2024, authors: [], url: "https://example.com", citationCount: 0,
          })),
        }),
      });

    const composite = createDefaultProviders();
    const results = await composite.search("test", { maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
