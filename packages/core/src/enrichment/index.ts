/**
 * @module enrichment
 *
 * Evidence-Based Idea Enrichment — auto-enrich innovation ideas with
 * market data from external sources (Google Trends, Crunchbase, patent
 * databases). Attaches evidence, competitive intelligence, and market
 * sizing to each generated idea. Uses LLM to synthesize enrichment data.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for a single evidence item. */
export const EvidenceItemSchema = z.object({
  source: z.string().max(200),
  type: z.enum(["trend", "competitor", "patent", "market-size", "funding", "research", "news"]),
  title: z.string().max(500),
  summary: z.string().max(2000),
  url: z.string().max(2000).optional(),
  relevanceScore: z.number().min(0).max(1),
  data: z.record(z.unknown()).optional(),
  retrievedAt: z.string(),
});

/** Schema for market sizing data. */
export const MarketSizeSchema = z.object({
  tam: z.string().max(200).describe("Total Addressable Market"),
  sam: z.string().max(200).describe("Serviceable Addressable Market"),
  som: z.string().max(200).describe("Serviceable Obtainable Market"),
  growthRate: z.string().max(100).optional(),
  source: z.string().max(200).optional(),
  confidence: z.enum(["low", "medium", "high"]),
});

/** Schema for a competitor profile. */
export const CompetitorSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000),
  stage: z.enum([
    "idea",
    "pre-seed",
    "seed",
    "series-a",
    "series-b",
    "growth",
    "public",
    "unknown",
  ]),
  funding: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  similarity: z.number().min(0).max(1),
});

/** Schema for enriched idea output. */
export const EnrichedIdeaSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  evidence: z.array(EvidenceItemSchema).max(50),
  marketSize: MarketSizeSchema.optional(),
  competitors: z.array(CompetitorSchema).max(20),
  trendScore: z.number().min(0).max(100),
  competitiveLandscape: z.enum(["blue-ocean", "emerging", "competitive", "saturated"]),
  enrichmentSummary: z.string().max(2000),
  enrichedAt: z.string(),
});

/** Schema for enrichment configuration. */
export const EnrichmentConfigSchema = z.object({
  sources: z
    .array(z.enum(["trends", "competitors", "patents", "funding", "research", "news"]))
    .default(["trends", "competitors"]),
  maxEvidencePerSource: z.number().min(1).max(20).default(5),
  includeMarketSizing: z.boolean().default(true),
  model: z.string().max(100).optional(),
});

// ---- Types ----

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type MarketSize = z.infer<typeof MarketSizeSchema>;
export type Competitor = z.infer<typeof CompetitorSchema>;
export type EnrichedIdea = z.infer<typeof EnrichedIdeaSchema>;
export type EnrichmentConfig = z.infer<typeof EnrichmentConfigSchema>;

/** Enrichment data source provider interface. */
export interface EnrichmentProvider {
  id: string;
  name: string;
  type: EvidenceItem["type"];
  fetchEvidence(query: string, limit?: number): Promise<EvidenceItem[]>;
  isAvailable(): boolean;
}

// ---- Provider Registry ----

const providers: Map<string, EnrichmentProvider> = new Map();

/** Register an enrichment data provider. */
export function registerEnrichmentProvider(provider: EnrichmentProvider): void {
  providers.set(provider.id, provider);
}

/** Unregister a provider. */
export function unregisterEnrichmentProvider(id: string): boolean {
  return providers.delete(id);
}

/** List all providers. */
export function listEnrichmentProviders(): EnrichmentProvider[] {
  return Array.from(providers.values());
}

/** Clear all providers. */
export function clearEnrichmentProviders(): void {
  providers.clear();
}

// ---- Heuristic Enrichment (no LLM required) ----

/**
 * Generate heuristic enrichment data for an idea.
 * Uses pattern matching and keyword analysis rather than external APIs.
 */
export function enrichIdeaHeuristic(ideaTitle: string, ideaDescription: string): EnrichedIdea {
  const now = new Date().toISOString();
  const keywords = extractKeywords(ideaTitle + " " + ideaDescription);
  const evidence: EvidenceItem[] = [];

  // Generate trend evidence based on keywords
  const trendKeywords = keywords.filter((k) =>
    [
      "ai",
      "ml",
      "blockchain",
      "quantum",
      "cloud",
      "iot",
      "ar",
      "vr",
      "saas",
      "api",
      "automation",
      "sustainability",
      "green",
    ].some((t) => k.toLowerCase().includes(t))
  );
  if (trendKeywords.length > 0) {
    evidence.push({
      source: "Keyword Analysis",
      type: "trend",
      title: `Trending technology keywords detected: ${trendKeywords.join(", ")}`,
      summary: `The idea references ${trendKeywords.length} trending technology terms, suggesting alignment with current market interest.`,
      relevanceScore: Math.min(1, trendKeywords.length * 0.2),
      retrievedAt: now,
    });
  }

  // Assess competitive landscape based on specificity
  const specificityScore = keywords.length / Math.max(1, ideaDescription.split(" ").length / 10);
  const competitiveLandscape: EnrichedIdea["competitiveLandscape"] =
    specificityScore > 0.5 ? "blue-ocean" : specificityScore > 0.3 ? "emerging" : "competitive";

  // Generate basic market sizing
  const marketSize: MarketSize = {
    tam: estimateMarketSize(keywords, "tam"),
    sam: estimateMarketSize(keywords, "sam"),
    som: estimateMarketSize(keywords, "som"),
    confidence: "low",
  };

  // Trend score (0-100) — weighted toward actual trending keywords
  const trendScore = Math.min(
    100,
    Math.round(trendKeywords.length * 25 + Math.min(keywords.length, 5) * 2 + specificityScore * 10)
  );

  return {
    ideaTitle,
    ideaDescription,
    evidence,
    marketSize,
    competitors: [],
    trendScore,
    competitiveLandscape,
    enrichmentSummary: `Heuristic analysis identified ${trendKeywords.length} trending keywords. Competitive landscape: ${competitiveLandscape}. Trend score: ${trendScore}/100.`,
    enrichedAt: now,
  };
}

/**
 * Enrich an idea using registered providers (async, with optional LLM).
 */
export async function enrichIdea(
  ideaTitle: string,
  ideaDescription: string,
  config?: Partial<EnrichmentConfig>,
  signal?: AbortSignal
): Promise<EnrichedIdea> {
  const enrichConfig = EnrichmentConfigSchema.parse(config ?? {});
  const now = new Date().toISOString();
  const evidence: EvidenceItem[] = [];
  const competitors: Competitor[] = [];

  const query = `${ideaTitle} ${ideaDescription}`.slice(0, 500);
  const available = Array.from(providers.values()).filter((p) => p.isAvailable());

  // Fetch evidence from each registered provider
  for (const provider of available) {
    if (signal?.aborted) break;
    try {
      const items = await provider.fetchEvidence(query, enrichConfig.maxEvidencePerSource);
      evidence.push(...items);
    } catch {
      // Skip failed providers
    }
  }

  // If no providers available, fall back to heuristic enrichment
  if (available.length === 0) {
    return enrichIdeaHeuristic(ideaTitle, ideaDescription);
  }

  // Sort evidence by relevance
  evidence.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Extract competitors from evidence
  for (const item of evidence.filter((e) => e.type === "competitor")) {
    competitors.push({
      name: item.title,
      description: item.summary,
      stage: "unknown",
      similarity: item.relevanceScore,
    });
  }

  // Compute trend score
  const trendEvidence = evidence.filter((e) => e.type === "trend");
  const trendScore = Math.min(
    100,
    Math.round(trendEvidence.reduce((sum, e) => sum + e.relevanceScore * 20, 0))
  );

  // Determine competitive landscape
  const competitiveLandscape: EnrichedIdea["competitiveLandscape"] =
    competitors.length === 0
      ? "blue-ocean"
      : competitors.length <= 2
        ? "emerging"
        : competitors.length <= 5
          ? "competitive"
          : "saturated";

  // Market sizing (heuristic)
  const keywords = extractKeywords(query);
  const marketSize: MarketSize = {
    tam: estimateMarketSize(keywords, "tam"),
    sam: estimateMarketSize(keywords, "sam"),
    som: estimateMarketSize(keywords, "som"),
    confidence: evidence.length > 10 ? "high" : evidence.length > 5 ? "medium" : "low",
  };

  return {
    ideaTitle,
    ideaDescription,
    evidence: evidence.slice(0, 50),
    marketSize: enrichConfig.includeMarketSizing ? marketSize : undefined,
    competitors: competitors.slice(0, 20),
    trendScore,
    competitiveLandscape,
    enrichmentSummary: `Enriched with ${evidence.length} evidence items from ${available.length} sources. ${competitors.length} competitors identified. Landscape: ${competitiveLandscape}.`,
    enrichedAt: now,
  };
}

/**
 * Batch-enrich multiple ideas.
 */
export async function enrichIdeas(
  ideas: Array<{ title: string; description: string }>,
  config?: Partial<EnrichmentConfig>,
  signal?: AbortSignal
): Promise<EnrichedIdea[]> {
  const results: EnrichedIdea[] = [];
  for (const idea of ideas) {
    if (signal?.aborted) break;
    const enriched = await enrichIdea(idea.title, idea.description, config, signal);
    results.push(enriched);
  }
  return results;
}

/**
 * Export enrichment as markdown.
 */
export function enrichmentToMarkdown(enriched: EnrichedIdea): string {
  const lines: string[] = [
    `# Enrichment Report: ${enriched.ideaTitle}`,
    "",
    enriched.enrichmentSummary,
    "",
    `**Trend Score:** ${enriched.trendScore}/100`,
    `**Competitive Landscape:** ${enriched.competitiveLandscape}`,
    "",
  ];

  if (enriched.marketSize) {
    lines.push("## Market Size", "");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| TAM | ${enriched.marketSize.tam} |`);
    lines.push(`| SAM | ${enriched.marketSize.sam} |`);
    lines.push(`| SOM | ${enriched.marketSize.som} |`);
    lines.push("");
  }

  if (enriched.evidence.length > 0) {
    lines.push("## Evidence", "");
    for (const e of enriched.evidence.slice(0, 10)) {
      lines.push(
        `- **[${e.source}]** ${e.title} (relevance: ${(e.relevanceScore * 100).toFixed(0)}%)`
      );
    }
    lines.push("");
  }

  if (enriched.competitors.length > 0) {
    lines.push("## Competitors", "");
    for (const c of enriched.competitors) {
      lines.push(`- **${c.name}** — ${c.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---- Helpers ----

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "and",
    "but",
    "or",
    "nor",
    "not",
    "so",
    "yet",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "as",
    "into",
    "about",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 20);
}

function estimateMarketSize(keywords: string[], tier: "tam" | "sam" | "som"): string {
  // Simple heuristic: larger scope keywords get bigger estimates
  const techMultiplier = keywords.some((k) => ["ai", "cloud", "saas", "platform"].includes(k))
    ? 10
    : 1;
  const base = { tam: 100, sam: 20, som: 5 }[tier];
  const estimate = base * techMultiplier;
  if (estimate >= 100) return `$${estimate}B+`;
  if (estimate >= 10) return `$${estimate}B`;
  return `$${estimate}B`;
}
