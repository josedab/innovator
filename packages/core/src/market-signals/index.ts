/**
 * @module market-signals
 *
 * Live market signal integration — connects to real-time data sources
 * (Product Hunt, Hacker News, Google Trends, arXiv, patent filings) to
 * ground investigations in current market reality. Provides a pluggable
 * provider interface for adding new data sources.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Schema for a single market signal/data point. */
export const MarketSignalSchema = z.object({
  source: z.string().max(200),
  title: z.string().max(500),
  url: z.string().max(2000).optional(),
  summary: z.string().max(2000),
  relevanceScore: z.number().min(0).max(1),
  publishedAt: z.string().optional(),
  category: z.enum(["product", "research", "trend", "patent", "news", "discussion"]),
  metadata: z.record(z.unknown()).optional(),
});

/** Schema for aggregated market signals for a topic. */
export const MarketSignalReportSchema = z.object({
  query: z.string(),
  signals: z.array(MarketSignalSchema).max(100),
  trendingSummary: z.string().max(2000),
  marketTemperature: z.enum(["cold", "warming", "hot", "saturated"]),
  topOpportunities: z.array(z.string().max(500)).max(10),
  fetchedAt: z.string(),
});

export type MarketSignal = z.infer<typeof MarketSignalSchema>;
export type MarketSignalReport = z.infer<typeof MarketSignalReportSchema>;

// ---- Provider Interface ----

/** Interface for market signal data source providers. */
export interface MarketSignalProvider {
  id: string;
  name: string;
  category: MarketSignal["category"];
  /** Fetch market signals for a given query/topic. */
  fetchSignals(query: string, limit?: number, signal?: AbortSignal): Promise<MarketSignal[]>;
  /** Check if the provider is available/configured. */
  isAvailable(): boolean;
}

// ---- Provider Registry ----

const providers: Map<string, MarketSignalProvider> = new Map();

/** Register a market signal provider. */
export function registerSignalProvider(provider: MarketSignalProvider): void {
  providers.set(provider.id, provider);
}

/** Unregister a market signal provider. */
export function unregisterSignalProvider(id: string): boolean {
  return providers.delete(id);
}

/** List all registered signal providers. */
export function listSignalProviders(): MarketSignalProvider[] {
  return Array.from(providers.values());
}

/** Get available (configured) providers only. */
export function getAvailableProviders(): MarketSignalProvider[] {
  return Array.from(providers.values()).filter((p) => p.isAvailable());
}

/** Clear all registered providers. */
export function clearSignalProviders(): void {
  providers.clear();
}

// ---- Built-in Providers (LLM-simulated) ----

/** LLM-based Product Hunt signal provider. */
export const ProductHuntProvider: MarketSignalProvider = {
  id: "product-hunt",
  name: "Product Hunt",
  category: "product",
  isAvailable: () => true,
  async fetchSignals(query, limit = 5, signal) {
    return fetchLLMSignals(query, "Product Hunt", "product", limit, signal);
  },
};

/** LLM-based Hacker News signal provider. */
export const HackerNewsProvider: MarketSignalProvider = {
  id: "hacker-news",
  name: "Hacker News",
  category: "discussion",
  isAvailable: () => true,
  async fetchSignals(query, limit = 5, signal) {
    return fetchLLMSignals(query, "Hacker News", "discussion", limit, signal);
  },
};

/** LLM-based Google Trends signal provider. */
export const GoogleTrendsProvider: MarketSignalProvider = {
  id: "google-trends",
  name: "Google Trends",
  category: "trend",
  isAvailable: () => true,
  async fetchSignals(query, limit = 5, signal) {
    return fetchLLMSignals(query, "Google Trends", "trend", limit, signal);
  },
};

/** LLM-based arXiv research signal provider. */
export const ArxivProvider: MarketSignalProvider = {
  id: "arxiv",
  name: "arXiv Research",
  category: "research",
  isAvailable: () => true,
  async fetchSignals(query, limit = 5, signal) {
    return fetchLLMSignals(query, "arXiv", "research", limit, signal);
  },
};

/** LLM-based patent filing signal provider. */
export const PatentFilingProvider: MarketSignalProvider = {
  id: "patent-filings",
  name: "Patent Filings",
  category: "patent",
  isAvailable: () => true,
  async fetchSignals(query, limit = 5, signal) {
    return fetchLLMSignals(query, "patent databases", "patent", limit, signal);
  },
};

// Register built-in providers
registerSignalProvider(ProductHuntProvider);
registerSignalProvider(HackerNewsProvider);
registerSignalProvider(GoogleTrendsProvider);
registerSignalProvider(ArxivProvider);
registerSignalProvider(PatentFilingProvider);

async function fetchLLMSignals(
  query: string,
  sourceName: string,
  category: MarketSignal["category"],
  limit: number,
  signal?: AbortSignal
): Promise<MarketSignal[]> {
  const prompt = `You are a market intelligence analyst with deep knowledge of ${sourceName}.

${wrapUserInput("TOPIC", query)}

Based on your knowledge of recent ${sourceName} activity, provide ${limit} relevant signals for this topic.
Consider: trending products, popular discussions, emerging trends, recent research, or notable patent filings related to this topic.

You MUST respond with valid JSON only:
{
  "signals": [
    {
      "title": "Signal title",
      "summary": "Brief description of the signal and its relevance",
      "relevanceScore": 0.85,
      "category": "${category}"
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
    const parsed = JSON.parse(raw) as { signals: Array<{ title: string; summary: string; relevanceScore: number; category?: string }> };

    return parsed.signals.slice(0, limit).map((s) => ({
      source: sourceName,
      title: s.title,
      summary: s.summary,
      relevanceScore: Math.max(0, Math.min(1, s.relevanceScore)),
      category,
    }));
  } catch {
    return [];
  }
}

// ---- Core Functions ----

/**
 * Fetch market signals from all available providers for a given topic.
 *
 * @param query - The topic to search for
 * @param limit - Maximum signals per provider
 * @param model - Optional LLM model override
 * @param signal - Optional AbortSignal for cancellation
 * @returns A MarketSignalReport with aggregated signals and analysis
 */
export async function fetchMarketSignals(
  query: string,
  limit = 5,
  model?: string,
  signal?: AbortSignal
): Promise<MarketSignalReport> {
  const available = getAvailableProviders();
  const allSignals: MarketSignal[] = [];

  for (const provider of available) {
    if (signal?.aborted) break;
    try {
      const signals = await provider.fetchSignals(query, limit, signal);
      allSignals.push(...signals);
    } catch {
      // Skip failed providers
    }
  }

  // Sort by relevance
  allSignals.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Generate summary analysis
  const analysis = await analyzeSignals(query, allSignals, model, signal);

  return {
    query,
    signals: allSignals,
    trendingSummary: analysis.summary,
    marketTemperature: analysis.temperature,
    topOpportunities: analysis.opportunities,
    fetchedAt: new Date().toISOString(),
  };
}

async function analyzeSignals(
  query: string,
  signals: MarketSignal[],
  model?: string,
  signal?: AbortSignal
): Promise<{ summary: string; temperature: MarketSignalReport["marketTemperature"]; opportunities: string[] }> {
  if (signals.length === 0) {
    return {
      summary: "No market signals available for analysis.",
      temperature: "cold",
      opportunities: [],
    };
  }

  const signalsSummary = signals.slice(0, 20).map((s) => `[${s.source}] ${s.title}: ${s.summary}`).join("\n");

  const prompt = `You are a market analyst. Based on the following market signals, provide a summary analysis.

${wrapUserInput("TOPIC", query)}

SIGNALS:
${signalsSummary}

You MUST respond with valid JSON only:
{
  "summary": "2-3 sentence summary of market signals and trends",
  "temperature": "cold|warming|hot|saturated",
  "opportunities": ["Opportunity 1", "Opportunity 2"]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { summary: string; temperature: string; opportunities: string[] };
    return {
      summary: parsed.summary,
      temperature: (["cold", "warming", "hot", "saturated"].includes(parsed.temperature)
        ? parsed.temperature
        : "warming") as MarketSignalReport["marketTemperature"],
      opportunities: parsed.opportunities?.slice(0, 10) ?? [],
    };
  } catch {
    return {
      summary: `Found ${signals.length} market signals across ${new Set(signals.map((s) => s.source)).size} sources.`,
      temperature: "warming",
      opportunities: [],
    };
  }
}

/**
 * Build market signal context for injection into investigation prompts.
 *
 * @param report - A MarketSignalReport to format as prompt context
 * @returns A formatted string for prompt injection
 */
export function buildMarketSignalContext(report: MarketSignalReport): string {
  const topSignals = report.signals
    .slice(0, 10)
    .map((s) => `- [${s.source}] ${s.title}: ${s.summary}`)
    .join("\n");

  return `LIVE MARKET SIGNALS (${report.fetchedAt}):
Market Temperature: ${report.marketTemperature}
${report.trendingSummary}

Top Signals:
${topSignals}

${report.topOpportunities.length > 0 ? `Opportunities:\n${report.topOpportunities.map((o) => `- ${o}`).join("\n")}` : ""}`;
}
