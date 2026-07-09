/**
 * @module novelty-oracle/providers
 *
 * External prior art search providers for the Novelty Oracle.
 * Connectors for USPTO PatentsView API and Semantic Scholar API.
 * These providers search real databases and return structured prior art entries.
 */

import type { PriorArtEntry, PriorArtProvider } from "./types.js";

// ---- USPTO PatentsView Provider ----

/** Search USPTO patents via the PatentsView API (free, no key required). */
export class USPTOProvider implements PriorArtProvider {
  readonly name = "USPTO PatentsView";
  readonly source = "patent" as const;

  async search(
    query: string,
    options: { maxResults?: number; domain?: string } = {}
  ): Promise<PriorArtEntry[]> {
    const maxResults = options.maxResults ?? 10;
    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) return [];

    const _searchQuery = keywords.map((kw) => `_text_any:[${kw}]`).join(" AND ");

    try {
      const url = new URL("https://api.patentsview.org/patents/query");
      const body = {
        q: { _text_any: { patent_abstract: query.slice(0, 200) } },
        f: [
          "patent_number",
          "patent_title",
          "patent_abstract",
          "patent_date",
          "inventor_first_name",
          "inventor_last_name",
        ],
        o: { per_page: maxResults },
      };

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return [];

      const data = (await response.json()) as {
        patents?: Array<{
          patent_number: string;
          patent_title: string;
          patent_abstract: string;
          patent_date: string;
          inventors?: Array<{ inventor_first_name: string; inventor_last_name: string }>;
        }>;
      };

      return (data.patents ?? []).map((patent) => ({
        id: `uspto-${patent.patent_number}`,
        source: "patent" as const,
        title: patent.patent_title ?? "Untitled Patent",
        description: (patent.patent_abstract ?? "").slice(0, 2000),
        url: `https://patents.google.com/patent/US${patent.patent_number}`,
        similarity: 0,
        patentNumber: `US${patent.patent_number}`,
        publicationDate: patent.patent_date,
        authors: patent.inventors?.map((i) => `${i.inventor_first_name} ${i.inventor_last_name}`),
      }));
    } catch {
      // Network failure — return empty silently
      return [];
    }
  }
}

// ---- Semantic Scholar Provider ----

/** Search academic papers via the Semantic Scholar API (free, no key required for basic use). */
export class SemanticScholarProvider implements PriorArtProvider {
  readonly name = "Semantic Scholar";
  readonly source = "academic" as const;

  async search(
    query: string,
    options: { maxResults?: number; domain?: string } = {}
  ): Promise<PriorArtEntry[]> {
    const maxResults = Math.min(options.maxResults ?? 10, 100);

    try {
      const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
      url.searchParams.set("query", query.slice(0, 200));
      url.searchParams.set("limit", String(maxResults));
      url.searchParams.set("fields", "title,abstract,year,authors,externalIds,url,citationCount");

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return [];

      const data = (await response.json()) as {
        data?: Array<{
          paperId: string;
          title: string;
          abstract: string | null;
          year: number | null;
          authors: Array<{ name: string }>;
          externalIds?: { DOI?: string };
          url: string;
          citationCount: number;
        }>;
      };

      return (data.data ?? []).map((paper) => ({
        id: `s2-${paper.paperId}`,
        source: "academic" as const,
        title: paper.title ?? "Untitled Paper",
        description: (paper.abstract ?? "No abstract available").slice(0, 2000),
        url: paper.url,
        similarity: 0,
        doi: paper.externalIds?.DOI,
        publicationDate: paper.year ? `${paper.year}-01-01` : undefined,
        authors: paper.authors?.map((a) => a.name).slice(0, 10),
      }));
    } catch {
      return [];
    }
  }
}

// ---- Composite Provider ----

/** Searches multiple providers in parallel and merges results. */
export class CompositeProvider implements PriorArtProvider {
  readonly name = "Composite";
  readonly source = "patent" as const;
  private providers: PriorArtProvider[];

  constructor(providers: PriorArtProvider[]) {
    this.providers = providers;
  }

  async search(
    query: string,
    options: { maxResults?: number; domain?: string } = {}
  ): Promise<PriorArtEntry[]> {
    const perProvider = Math.ceil((options.maxResults ?? 10) / this.providers.length);
    const results = await Promise.allSettled(
      this.providers.map((p) => p.search(query, { ...options, maxResults: perProvider }))
    );

    const entries: PriorArtEntry[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        entries.push(...result.value);
      }
    }

    return entries.slice(0, options.maxResults ?? 10);
  }
}

/** Create a default composite provider with USPTO + Semantic Scholar. */
export function createDefaultProviders(): CompositeProvider {
  return new CompositeProvider([new USPTOProvider(), new SemanticScholarProvider()]);
}
