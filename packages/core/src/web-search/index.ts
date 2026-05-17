/**
 * @module web-search
 *
 * Real-time web search grounding for innovation sessions.
 * Provides market validation, prior art detection, and competitor
 * monitoring by querying web search APIs during ideation.
 *
 * Supports pluggable search backends (Bing, Google, Brave, SerpAPI)
 * and synthesizes results into structured grounding data.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const SearchResultSchema = z.object({
  title: z.string().max(500),
  url: z.string().max(2000),
  snippet: z.string().max(2000),
  source: z.string().max(200),
  publishedAt: z.string().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
});

export const PriorArtSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(2000),
  url: z.string().max(2000).optional(),
  similarity: z.number().min(0).max(1),
  type: z.enum(["patent", "paper", "product", "article", "repository"]),
  date: z.string().optional(),
});

export const CompetitorSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000),
  url: z.string().max(2000).optional(),
  relevance: z.number().min(0).max(1),
  strengths: z.array(z.string().max(500)).max(10),
  gaps: z.array(z.string().max(500)).max(10),
});

export const MarketValidationSchema = z.object({
  marketSize: z.string().max(500).optional(),
  growthTrend: z.enum(["growing", "stable", "declining", "emerging", "unknown"]),
  demandSignals: z.array(z.string().max(500)).max(10),
  risks: z.array(z.string().max(500)).max(10),
  opportunities: z.array(z.string().max(500)).max(10),
  confidence: z.number().min(0).max(1),
});

export const WebSearchGroundingSchema = z.object({
  query: z.string().max(1000),
  searchResults: z.array(SearchResultSchema).max(20),
  priorArt: z.array(PriorArtSchema).max(20),
  competitors: z.array(CompetitorSchema).max(10),
  marketValidation: MarketValidationSchema,
  groundedAt: z.string(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type PriorArt = z.infer<typeof PriorArtSchema>;
export type Competitor = z.infer<typeof CompetitorSchema>;
export type MarketValidation = z.infer<typeof MarketValidationSchema>;
export type WebSearchGrounding = z.infer<typeof WebSearchGroundingSchema>;

// ---- Search Provider Interface ----

export interface WebSearchProvider {
  id: string;
  name: string;
  search(query: string, options?: { limit?: number }): Promise<SearchResult[]>;
}

// ---- Provider Registry ----

const providers = new Map<string, WebSearchProvider>();

/** Register a web search provider. */
export function registerSearchProvider(provider: WebSearchProvider): void {
  providers.set(provider.id, provider);
}

/** List registered search providers. */
export function listSearchProviders(): WebSearchProvider[] {
  return Array.from(providers.values());
}

// ---- Built-in LLM-based Search Simulation ----
// When no external search API is configured, uses LLM to synthesize
// market knowledge grounding from its training data.

/**
 * Ground an innovation idea in real-world market data.
 * Uses registered search providers when available, falls back
 * to LLM-based knowledge synthesis otherwise.
 */
export async function groundInnovation(
  subject: string,
  idea: { title: string; description: string },
  options?: { model?: string; signal?: AbortSignal; providerId?: string }
): Promise<WebSearchGrounding> {
  if (!subject || !idea?.title || !idea?.description) {
    throw new ValidationError("subject, idea.title, and idea.description are required");
  }
  const searchQuery = `${subject}: ${idea.title}`;
  let searchResults: SearchResult[] = [];

  // Try external search providers first
  const provider = options?.providerId
    ? providers.get(options.providerId)
    : providers.size > 0
      ? providers.values().next().value
      : undefined;

  if (provider) {
    try {
      searchResults = await provider.search(searchQuery, { limit: 10 });
    } catch {
      // Fall through to LLM-based grounding
    }
  }

  // Use LLM to analyze and synthesize grounding data
  const groundingPrompt = buildGroundingPrompt(subject, idea, searchResults);

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: groundingPrompt,
        model: options?.model,
        signal: options?.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return GroundingResponseSchema.parse(parsed);
    },
    { signal: options?.signal }
  );

  return {
    query: searchQuery,
    searchResults,
    priorArt: result.priorArt,
    competitors: result.competitors,
    marketValidation: result.marketValidation,
    groundedAt: new Date().toISOString(),
  };
}

/**
 * Detect prior art for an innovation idea.
 */
export async function detectPriorArt(
  idea: { title: string; description: string },
  options?: { model?: string; signal?: AbortSignal }
): Promise<PriorArt[]> {
  const prompt = `Analyze this innovation idea and identify any known prior art, similar existing solutions, patents, or research papers:

Title: ${idea.title}
Description: ${idea.description}

Respond in JSON:
{
  "priorArt": [
    {
      "title": "...",
      "description": "How it relates to the proposed idea",
      "similarity": 0.0-1.0,
      "type": "patent" | "paper" | "product" | "article" | "repository",
      "date": "approximate date if known"
    }
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: options?.model,
        signal: options?.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return z.object({ priorArt: z.array(PriorArtSchema).max(20) }).parse(parsed);
    },
    { signal: options?.signal }
  );

  return result.priorArt;
}

/**
 * Monitor competitive landscape for a subject.
 */
export async function monitorCompetitors(
  subject: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<Competitor[]> {
  const prompt = `Analyze the competitive landscape for innovations in "${subject}".
Identify key competitors, their strengths, and market gaps.

Respond in JSON:
{
  "competitors": [
    {
      "name": "Company or product name",
      "description": "What they do in this space",
      "relevance": 0.0-1.0,
      "strengths": ["strength1", "strength2"],
      "gaps": ["gap1", "gap2"]
    }
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: options?.model,
        signal: options?.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return z.object({ competitors: z.array(CompetitorSchema).max(10) }).parse(parsed);
    },
    { signal: options?.signal }
  );

  return result.competitors;
}

/**
 * Export grounding data as markdown.
 */
export function groundingToMarkdown(grounding: WebSearchGrounding): string {
  const lines: string[] = [];

  lines.push("# Web Search Grounding Report");
  lines.push("");
  lines.push(`**Query:** ${grounding.query}`);
  lines.push(`**Grounded at:** ${grounding.groundedAt}`);
  lines.push("");

  // Market Validation
  const mv = grounding.marketValidation;
  lines.push("## Market Validation");
  lines.push("");
  lines.push(`**Growth Trend:** ${mv.growthTrend}`);
  if (mv.marketSize) lines.push(`**Market Size:** ${mv.marketSize}`);
  lines.push(`**Confidence:** ${(mv.confidence * 100).toFixed(0)}%`);
  lines.push("");

  if (mv.demandSignals.length > 0) {
    lines.push("### Demand Signals");
    mv.demandSignals.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }

  if (mv.opportunities.length > 0) {
    lines.push("### Opportunities");
    mv.opportunities.forEach((o) => lines.push(`- ${o}`));
    lines.push("");
  }

  if (mv.risks.length > 0) {
    lines.push("### Risks");
    mv.risks.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  // Prior Art
  if (grounding.priorArt.length > 0) {
    lines.push("## Prior Art");
    lines.push("");
    for (const pa of grounding.priorArt) {
      lines.push(`### ${pa.title} (${pa.type})`);
      lines.push(`Similarity: ${(pa.similarity * 100).toFixed(0)}%`);
      lines.push(pa.description);
      if (pa.url) lines.push(`[Link](${pa.url})`);
      lines.push("");
    }
  }

  // Competitors
  if (grounding.competitors.length > 0) {
    lines.push("## Competitive Landscape");
    lines.push("");
    for (const comp of grounding.competitors) {
      lines.push(`### ${comp.name}`);
      lines.push(comp.description);
      lines.push(`**Relevance:** ${(comp.relevance * 100).toFixed(0)}%`);
      if (comp.strengths.length > 0) {
        lines.push("**Strengths:**");
        comp.strengths.forEach((s) => lines.push(`- ${s}`));
      }
      if (comp.gaps.length > 0) {
        lines.push("**Gaps:**");
        comp.gaps.forEach((g) => lines.push(`- ${g}`));
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Clear all registered providers (for testing). */
export function clearSearchProviders(): void {
  providers.clear();
}

// ---- Internal ----

const GroundingResponseSchema = z.object({
  priorArt: z.array(PriorArtSchema).max(20),
  competitors: z.array(CompetitorSchema).max(10),
  marketValidation: MarketValidationSchema,
});

function buildGroundingPrompt(
  subject: string,
  idea: { title: string; description: string },
  searchResults: SearchResult[]
): string {
  const searchContext =
    searchResults.length > 0
      ? `\nSearch results for context:\n${searchResults.map((r) => `- ${r.title}: ${r.snippet}`).join("\n")}`
      : "";

  return `Analyze this innovation idea for market grounding:

Subject: ${subject}
Idea: ${idea.title}
Description: ${idea.description}
${searchContext}

Provide:
1. Prior art — similar existing solutions, patents, research
2. Competitors — who's working in this space
3. Market validation — size, trends, demand signals, risks

Respond in JSON:
{
  "priorArt": [
    {"title": "...", "description": "...", "similarity": 0.0-1.0, "type": "patent|paper|product|article|repository"}
  ],
  "competitors": [
    {"name": "...", "description": "...", "relevance": 0.0-1.0, "strengths": ["..."], "gaps": ["..."]}
  ],
  "marketValidation": {
    "growthTrend": "growing|stable|declining|emerging|unknown",
    "demandSignals": ["..."],
    "risks": ["..."],
    "opportunities": ["..."],
    "confidence": 0.0-1.0
  }
}`;
}
