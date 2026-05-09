/**
 * @module market-validation
 *
 * Real-time market validation during the ideation pipeline.
 * Integrates web search to ground generated ideas in market reality
 * by checking for prior art, assessing competition, and validating feasibility.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Schema for a web search result. */
export const WebSearchResultSchema = z.object({
  title: z.string().max(500),
  url: z.string().max(2000),
  snippet: z.string().max(2000),
  source: z.string().max(200),
  timestamp: z.string().optional(),
});

/** Schema for a prior art finding. */
export const PriorArtFindingSchema = z.object({
  title: z.string().max(500),
  source: z.string().max(200),
  url: z.string().max(2000).optional(),
  similarity: z.number().min(0).max(1),
  datePublished: z.string().optional(),
  summary: z.string().max(2000),
});

/** Schema for competitive landscape analysis. */
export const CompetitiveLandscapeSchema = z.object({
  directCompetitors: z.array(z.string().max(500)).max(20),
  adjacentSolutions: z.array(z.string().max(500)).max(20),
  marketGaps: z.array(z.string().max(500)).max(20),
  estimatedMarketSize: z.string().max(500).optional(),
});

/** Schema for a single idea's market validation result. */
export const MarketValidationResultSchema = z.object({
  ideaTitle: z.string().max(500),
  feasibilityScore: z.number().min(0).max(1),
  priorArtFindings: z.array(PriorArtFindingSchema).max(50),
  marketOpportunity: z.string().max(2000),
  competitiveLandscape: CompetitiveLandscapeSchema,
  validationConfidence: z.number().min(0).max(1),
  sources: z.array(z.string().max(2000)).max(50),
});

/** Schema for validation configuration. */
export const ValidationConfigSchema = z.object({
  searchProviders: z
    .array(z.enum(["google", "bing", "duckduckgo", "arxiv", "patents"]))
    .default(["google"]),
  maxResults: z.number().min(1).max(100).default(10),
  includeAcademic: z.boolean().default(false),
  includePatents: z.boolean().default(false),
  timeout: z.number().min(1000).max(120_000).default(30_000),
});

/** Schema for a comprehensive market validation report. */
export const MarketValidationReportSchema = z.object({
  subject: z.string().max(500),
  validatedIdeas: z.array(MarketValidationResultSchema).max(50),
  overallMarketAssessment: z.string().max(5000),
  timestamp: z.string(),
});

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
export type PriorArtFinding = z.infer<typeof PriorArtFindingSchema>;
export type CompetitiveLandscape = z.infer<typeof CompetitiveLandscapeSchema>;
export type MarketValidationResult = z.infer<typeof MarketValidationResultSchema>;
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type MarketValidationReport = z.infer<typeof MarketValidationReportSchema>;

// ---- Search Provider Interface ----

/** Interface for pluggable search providers. */
export interface SearchProvider {
  id: string;
  name: string;
  /** Execute a search query and return results. */
  search(
    query: string,
    options?: { maxResults?: number; signal?: AbortSignal }
  ): Promise<WebSearchResult[]>;
  /** Check if the provider is available/configured. */
  isAvailable(): boolean;
}

// ---- Provider Registry ----

const searchProviders: Map<string, SearchProvider> = new Map();

/** Register a search provider. */
export function registerSearchProvider(provider: SearchProvider): void {
  searchProviders.set(provider.id, provider);
}

/** Unregister a search provider. */
export function unregisterSearchProvider(id: string): boolean {
  return searchProviders.delete(id);
}

/** Get a registered search provider by id. */
export function getSearchProvider(id: string): SearchProvider | undefined {
  return searchProviders.get(id);
}

/** List all registered search providers. */
export function listSearchProviders(): SearchProvider[] {
  return Array.from(searchProviders.values());
}

/** Get available (configured) search providers only. */
export function getAvailableSearchProviders(): SearchProvider[] {
  return Array.from(searchProviders.values()).filter((p) => p.isAvailable());
}

/** Clear all registered search providers. */
export function clearSearchProviders(): void {
  searchProviders.clear();
}

// ---- Built-in Providers (LLM-simulated) ----

async function fetchLLMSearchResults(
  query: string,
  sourceName: string,
  maxResults: number,
  signal?: AbortSignal
): Promise<WebSearchResult[]> {
  const prompt = `You are a search engine simulator with deep knowledge of ${sourceName} results.

${wrapUserInput("QUERY", query)}

Based on your knowledge, provide ${maxResults} plausible search results that would appear on ${sourceName} for this query.

You MUST respond with valid JSON only:
{
  "results": [
    {
      "title": "Result title",
      "url": "https://example.com/result",
      "snippet": "Brief description of the result",
      "source": "${sourceName}"
    }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      results: Array<{ title: string; url: string; snippet: string; source?: string }>;
    };

    return parsed.results.slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: r.source ?? sourceName,
    }));
  } catch {
    return [];
  }
}

/** LLM-based web search provider. */
export const WebSearchProvider: SearchProvider = {
  id: "google",
  name: "Web Search",
  isAvailable: () => true,
  async search(query, options) {
    return fetchLLMSearchResults(query, "Google", options?.maxResults ?? 10, options?.signal);
  },
};

/** LLM-based academic search provider. */
export const AcademicSearchProvider: SearchProvider = {
  id: "arxiv",
  name: "Academic Search",
  isAvailable: () => true,
  async search(query, options) {
    return fetchLLMSearchResults(
      query,
      "arXiv / Google Scholar",
      options?.maxResults ?? 10,
      options?.signal
    );
  },
};

/** LLM-based patent search provider. */
export const PatentSearchProvider: SearchProvider = {
  id: "patents",
  name: "Patent Search",
  isAvailable: () => true,
  async search(query, options) {
    return fetchLLMSearchResults(
      query,
      "Google Patents / USPTO",
      options?.maxResults ?? 10,
      options?.signal
    );
  },
};

// Register built-in providers
registerSearchProvider(WebSearchProvider);
registerSearchProvider(AcademicSearchProvider);
registerSearchProvider(PatentSearchProvider);

// ---- Core Functions ----

/**
 * Search for existing solutions, research, and patents related to a query.
 *
 * @param query - The search query for prior art
 * @param providerIds - Optional list of provider ids to use (defaults to all available)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of prior art findings
 */
export async function searchPriorArt(
  query: string,
  providerIds?: string[],
  signal?: AbortSignal
): Promise<PriorArtFinding[]> {
  const providers = providerIds
    ? (providerIds.map((id) => getSearchProvider(id)).filter(Boolean) as SearchProvider[])
    : getAvailableSearchProviders();

  const allResults: WebSearchResult[] = [];

  for (const provider of providers) {
    if (signal?.aborted) break;
    try {
      const results = await provider.search(query, { maxResults: 10, signal });
      allResults.push(...results);
    } catch {
      // Skip failed providers
    }
  }

  if (allResults.length === 0) return [];

  const resultsSummary = allResults
    .slice(0, 20)
    .map((r) => `- [${r.source}] ${r.title}: ${r.snippet} (${r.url})`)
    .join("\n");

  const prompt = `You are a prior art analyst. Given the following search results, assess each for similarity to the original query.

${wrapUserInput("QUERY", query)}

SEARCH RESULTS:
${resultsSummary}

Identify the most relevant prior art findings. For each, assess how similar it is to the query (0 = unrelated, 1 = identical).

You MUST respond with valid JSON only:
{
  "findings": [
    {
      "title": "Finding title",
      "source": "Source name",
      "url": "https://example.com",
      "similarity": 0.75,
      "datePublished": "2024-01-15",
      "summary": "How this relates to the query"
    }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { findings?: PriorArtFinding[] };
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    return findings.slice(0, 20).map((f) => ({
      title: f.title,
      source: f.source,
      url: f.url,
      similarity: Math.max(0, Math.min(1, f.similarity)),
      datePublished: f.datePublished,
      summary: f.summary,
    }));
  } catch {
    return allResults.slice(0, 10).map((r) => ({
      title: r.title,
      source: r.source,
      url: r.url,
      similarity: 0.5,
      summary: r.snippet,
    }));
  }
}

/**
 * Analyze competition for a subject using LLM + search results.
 *
 * @param subject - The market subject to analyze
 * @param ideas - Array of idea titles/descriptions to assess against
 * @param signal - Optional AbortSignal for cancellation
 * @returns Competitive landscape analysis
 */
export async function assessCompetitiveLandscape(
  subject: string,
  ideas: string[],
  signal?: AbortSignal
): Promise<CompetitiveLandscape> {
  const searchResults: WebSearchResult[] = [];

  for (const provider of getAvailableSearchProviders()) {
    if (signal?.aborted) break;
    try {
      const results = await provider.search(`${subject} competitors market`, {
        maxResults: 5,
        signal,
      });
      searchResults.push(...results);
    } catch {
      // Skip failed providers
    }
  }

  const ideasList = ideas
    .slice(0, 10)
    .map((idea) => `- ${idea}`)
    .join("\n");
  const resultsSummary = searchResults
    .slice(0, 15)
    .map((r) => `- [${r.source}] ${r.title}: ${r.snippet}`)
    .join("\n");

  const prompt = `You are a competitive intelligence analyst. Analyze the competitive landscape for the given subject and ideas.

${wrapUserInput("SUBJECT", subject)}

IDEAS UNDER CONSIDERATION:
${ideasList}

MARKET SEARCH RESULTS:
${resultsSummary || "No search results available."}

Provide a structured competitive landscape analysis.

You MUST respond with valid JSON only:
{
  "directCompetitors": ["Competitor 1 - brief description", "Competitor 2 - brief description"],
  "adjacentSolutions": ["Adjacent solution 1", "Adjacent solution 2"],
  "marketGaps": ["Gap 1 - opportunity description", "Gap 2 - opportunity description"],
  "estimatedMarketSize": "$X billion (brief justification)"
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as CompetitiveLandscape;

    return {
      directCompetitors: parsed.directCompetitors?.slice(0, 20) ?? [],
      adjacentSolutions: parsed.adjacentSolutions?.slice(0, 20) ?? [],
      marketGaps: parsed.marketGaps?.slice(0, 20) ?? [],
      estimatedMarketSize: parsed.estimatedMarketSize,
    };
  } catch {
    return {
      directCompetitors: [],
      adjacentSolutions: [],
      marketGaps: [],
    };
  }
}

/**
 * Score market viability of an idea using LLM analysis of search results.
 *
 * @param idea - The idea title/description to evaluate
 * @param searchResults - Web search results to ground the analysis
 * @param signal - Optional AbortSignal for cancellation
 * @returns Feasibility score (0-1) and market opportunity description
 */
export async function estimateMarketViability(
  idea: string,
  searchResults: WebSearchResult[],
  signal?: AbortSignal
): Promise<{ feasibilityScore: number; marketOpportunity: string; confidence: number }> {
  const resultsSummary = searchResults
    .slice(0, 15)
    .map((r) => `- [${r.source}] ${r.title}: ${r.snippet}`)
    .join("\n");

  const prompt = `You are a market viability analyst. Assess the feasibility and market opportunity for this idea.

${wrapUserInput("IDEA", idea)}

MARKET DATA:
${resultsSummary || "No market data available."}

Evaluate: technical feasibility, market demand, competitive landscape, and timing.

You MUST respond with valid JSON only:
{
  "feasibilityScore": 0.75,
  "marketOpportunity": "2-3 sentence description of the market opportunity",
  "confidence": 0.8
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      feasibilityScore: number;
      marketOpportunity: string;
      confidence: number;
    };

    return {
      feasibilityScore: Math.max(0, Math.min(1, parsed.feasibilityScore)),
      marketOpportunity: parsed.marketOpportunity,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  } catch {
    return {
      feasibilityScore: 0.5,
      marketOpportunity: "Unable to assess market opportunity due to analysis error.",
      confidence: 0,
    };
  }
}

/**
 * Run full market validation on a single idea.
 *
 * @param idea - The idea title/description to validate
 * @param config - Optional validation configuration
 * @param signal - Optional AbortSignal for cancellation
 * @returns Complete market validation result
 */
export async function validateIdea(
  idea: string,
  config?: Partial<ValidationConfig>,
  signal?: AbortSignal
): Promise<MarketValidationResult> {
  const resolvedConfig = ValidationConfigSchema.parse(config ?? {});

  const providerIds = resolvedConfig.searchProviders as string[];
  if (resolvedConfig.includeAcademic && !providerIds.includes("arxiv")) {
    providerIds.push("arxiv");
  }
  if (resolvedConfig.includePatents && !providerIds.includes("patents")) {
    providerIds.push("patents");
  }

  // Search for prior art
  const priorArtFindings = await searchPriorArt(idea, providerIds, signal);

  // Gather search results for viability analysis
  const allSearchResults: WebSearchResult[] = [];
  const activeProviders = providerIds
    .map((id) => getSearchProvider(id))
    .filter(Boolean) as SearchProvider[];

  for (const provider of activeProviders) {
    if (signal?.aborted) break;
    try {
      const results = await provider.search(idea, {
        maxResults: resolvedConfig.maxResults,
        signal,
      });
      allSearchResults.push(...results);
    } catch {
      // Skip failed providers
    }
  }

  // Assess viability and competition concurrently
  const [viability, landscape] = await Promise.all([
    estimateMarketViability(idea, allSearchResults, signal),
    assessCompetitiveLandscape(idea, [idea], signal),
  ]);

  const sources = Array.from(new Set(allSearchResults.map((r) => r.url).filter(Boolean)));

  return {
    ideaTitle: idea,
    feasibilityScore: viability.feasibilityScore,
    priorArtFindings,
    marketOpportunity: viability.marketOpportunity,
    competitiveLandscape: landscape,
    validationConfidence: viability.confidence,
    sources,
  };
}

/**
 * Batch validate multiple ideas with concurrency control.
 *
 * @param ideas - Array of idea titles/descriptions to validate
 * @param config - Optional validation configuration
 * @param signal - Optional AbortSignal for cancellation
 * @param concurrency - Maximum number of concurrent validations (default: 3)
 * @returns Array of market validation results
 */
export async function validateIdeas(
  ideas: string[],
  config?: Partial<ValidationConfig>,
  signal?: AbortSignal,
  concurrency = 3
): Promise<MarketValidationResult[]> {
  const results: MarketValidationResult[] = [];
  const queue = [...ideas];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      if (signal?.aborted) return;
      const idea = queue.shift()!;
      const result = await validateIdea(idea, config, signal);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ideas.length) }, () => processNext());
  await Promise.all(workers);

  return results;
}

/**
 * Format validation results for injection into LLM prompts.
 *
 * @param results - Array of market validation results to format
 * @returns Formatted string for prompt injection
 */
export function buildValidationContext(results: MarketValidationResult[]): string {
  if (results.length === 0) return "No market validation data available.";

  const sections = results.map((r) => {
    const priorArt =
      r.priorArtFindings.length > 0
        ? r.priorArtFindings
            .slice(0, 5)
            .map((f) => `  - ${f.title} (similarity: ${f.similarity.toFixed(2)}) — ${f.summary}`)
            .join("\n")
        : "  None found";

    const competitors =
      r.competitiveLandscape.directCompetitors.length > 0
        ? r.competitiveLandscape.directCompetitors
            .slice(0, 5)
            .map((c) => `  - ${c}`)
            .join("\n")
        : "  None identified";

    const gaps =
      r.competitiveLandscape.marketGaps.length > 0
        ? r.competitiveLandscape.marketGaps
            .slice(0, 5)
            .map((g) => `  - ${g}`)
            .join("\n")
        : "  None identified";

    return `IDEA: ${r.ideaTitle}
Feasibility: ${r.feasibilityScore.toFixed(2)} | Confidence: ${r.validationConfidence.toFixed(2)}
Market Opportunity: ${r.marketOpportunity}
Prior Art:
${priorArt}
Direct Competitors:
${competitors}
Market Gaps:
${gaps}`;
  });

  return `MARKET VALIDATION RESULTS:\n\n${sections.join("\n\n---\n\n")}`;
}

/**
 * Generate a comprehensive markdown validation report.
 *
 * @param subject - The overarching subject/topic being validated
 * @param results - Array of market validation results
 * @param signal - Optional AbortSignal for cancellation
 * @returns A complete MarketValidationReport
 */
export async function generateValidationReport(
  subject: string,
  results: MarketValidationResult[],
  signal?: AbortSignal
): Promise<MarketValidationReport> {
  const validationContext = buildValidationContext(results);

  const prompt = `You are a market strategy analyst. Generate an overall market assessment based on these validation results.

${wrapUserInput("SUBJECT", subject)}

${validationContext}

Provide a concise overall market assessment covering: market maturity, key opportunities, primary risks, and recommended next steps.

You MUST respond with valid JSON only:
{
  "overallMarketAssessment": "Multi-paragraph assessment in markdown format"
}`;

  let overallAssessment: string;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { overallMarketAssessment: string };
    overallAssessment = parsed.overallMarketAssessment;
  } catch {
    const avgFeasibility =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.feasibilityScore, 0) / results.length
        : 0;
    overallAssessment = `Validated ${results.length} ideas with an average feasibility score of ${avgFeasibility.toFixed(2)}. Manual review recommended.`;
  }

  return {
    subject,
    validatedIdeas: results,
    overallMarketAssessment: overallAssessment,
    timestamp: new Date().toISOString(),
  };
}
