/**
 * @module novelty-oracle/novelty-oracle
 *
 * Prior Art & Novelty Oracle — assesses the novelty of innovation ideas
 * against patent databases, academic literature, and known innovation patterns.
 * Returns novelty scores, similar prior art references, and patent-filing recommendations.
 */

import { randomUUID } from "node:crypto";
import type { NoveltyAssessment, NoveltyReport, PriorArtEntry, PriorArtProvider } from "./types.js";

// ---- Built-in Keyword Similarity Engine ----

/** Extract significant keywords from text for similarity comparison. */
function extractKeywords(text: string): Set<string> {
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
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "out",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "and",
    "but",
    "or",
    "nor",
    "not",
    "so",
    "yet",
    "both",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "only",
    "own",
    "same",
    "than",
    "too",
    "very",
    "just",
    "because",
    "that",
    "this",
    "these",
    "those",
    "which",
    "who",
    "whom",
    "what",
    "where",
    "when",
    "how",
    "all",
    "any",
    "new",
    "use",
    "using",
    "based",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );
}

/** Compute Jaccard similarity between two keyword sets. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((w) => b.has(w));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

/** N-gram extraction for more nuanced similarity. */
function extractBigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]}_${words[i + 1]}`);
  }
  return bigrams;
}

/** Combined similarity using keywords and bigrams. */
function computeSimilarity(textA: string, textB: string): number {
  const kwSim = jaccardSimilarity(extractKeywords(textA), extractKeywords(textB));
  const bgSim = jaccardSimilarity(extractBigrams(textA), extractBigrams(textB));
  return kwSim * 0.6 + bgSim * 0.4;
}

// ---- In-Memory Prior Art Store ----

const priorArtStore: PriorArtEntry[] = [];
const providers: PriorArtProvider[] = [];

/** Register a prior art provider (patent DB, academic search, etc.) */
export function registerPriorArtProvider(provider: PriorArtProvider): void {
  providers.push(provider);
}

/** Add entries to the local prior art store. */
export function addPriorArt(entries: PriorArtEntry[]): void {
  priorArtStore.push(...entries);
}

/** Clear the local prior art store. */
export function clearPriorArt(): void {
  priorArtStore.length = 0;
}

/** Get the count of prior art entries. */
export function getPriorArtCount(): {
  patents: number;
  papers: number;
  products: number;
  patterns: number;
  total: number;
} {
  return {
    patents: priorArtStore.filter((e) => e.source === "patent").length,
    papers: priorArtStore.filter((e) => e.source === "academic").length,
    products: priorArtStore.filter((e) => e.source === "product").length,
    patterns: priorArtStore.filter((e) => e.source === "pattern").length,
    total: priorArtStore.length,
  };
}

// ---- Novelty Assessment Engine ----

/** Assess the novelty of a single idea against known prior art. */
export function assessNovelty(
  ideaTitle: string,
  ideaDescription: string,
  options: { domain?: string; threshold?: number } = {}
): NoveltyAssessment {
  const threshold = options.threshold ?? 0.15;
  const ideaText = `${ideaTitle} ${ideaDescription}`;
  const matches: PriorArtEntry[] = [];

  for (const entry of priorArtStore) {
    const entryText = `${entry.title} ${entry.description}`;
    const similarity = computeSimilarity(ideaText, entryText);

    if (similarity >= threshold) {
      matches.push({ ...entry, similarity: Math.round(similarity * 1000) / 1000 });
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.similarity - a.similarity);
  const topMatches = matches.slice(0, 10);

  const maxSimilarity = topMatches.length > 0 ? topMatches[0].similarity : 0;
  const noveltyScore = Math.round((1 - maxSimilarity) * 100);

  const assessment: NoveltyAssessment["assessment"] =
    noveltyScore >= 80
      ? "highly-novel"
      : noveltyScore >= 60
        ? "partially-novel"
        : noveltyScore >= 30
          ? "similar-prior-art-exists"
          : "derivative";

  const patentCandidate = noveltyScore >= 75 && topMatches.every((m) => m.similarity < 0.3);

  // Extract differentiators — keywords in idea but not in top matches
  const ideaKw = extractKeywords(ideaText);
  const matchKw = new Set(
    topMatches.flatMap((m) => [...extractKeywords(`${m.title} ${m.description}`)])
  );
  const differentiators = [...ideaKw].filter((w) => !matchKw.has(w)).slice(0, 10);

  // Risk factors
  const riskFactors: string[] = [];
  if (noveltyScore < 50)
    riskFactors.push("High similarity to existing prior art may limit patentability");
  if (topMatches.some((m) => m.source === "patent" && m.similarity > 0.4))
    riskFactors.push("Closely related patents exist — review for infringement risk");
  if (topMatches.length === 0)
    riskFactors.push("No prior art found — verify against broader databases before filing");

  const recommendation =
    assessment === "highly-novel"
      ? `Strong candidate for further development and potential IP protection. No closely matching prior art found in ${priorArtStore.length} entries.`
      : assessment === "partially-novel"
        ? `Promising idea with some overlap with existing work. ${topMatches.length} similar entries found. Consider differentiating further before IP filing.`
        : assessment === "similar-prior-art-exists"
          ? `Similar approaches exist in prior art (${topMatches.length} matches). Review the most similar entries and identify clear differentiators before investing.`
          : `Highly derivative of existing work. ${topMatches.length} close matches found. Major differentiation needed to add value.`;

  return {
    ideaTitle,
    ideaDescription,
    noveltyScore,
    assessment,
    priorArt: topMatches,
    recommendation,
    patentCandidate,
    differentiators,
    riskFactors,
  };
}

/** Generate a full novelty report for multiple ideas. */
export function generateNoveltyReport(
  ideas: Array<{ title: string; description: string }>,
  options: { domain?: string; threshold?: number } = {}
): NoveltyReport {
  const assessments = ideas.map((idea) => assessNovelty(idea.title, idea.description, options));

  const counts = getPriorArtCount();

  return {
    id: randomUUID(),
    domain: options.domain ?? "general",
    timestamp: new Date().toISOString(),
    assessments,
    summary: {
      totalIdeas: assessments.length,
      highlyNovel: assessments.filter((a) => a.assessment === "highly-novel").length,
      partiallyNovel: assessments.filter((a) => a.assessment === "partially-novel").length,
      derivative: assessments.filter(
        (a) => a.assessment === "derivative" || a.assessment === "similar-prior-art-exists"
      ).length,
      patentCandidates: assessments.filter((a) => a.patentCandidate).length,
      averageNovelty:
        assessments.length > 0
          ? Math.round(assessments.reduce((sum, a) => sum + a.noveltyScore, 0) / assessments.length)
          : 0,
    },
    sourcesSearched: {
      patents: counts.patents,
      papers: counts.papers,
      products: counts.products,
      patterns: counts.patterns,
    },
  };
}

/** Format a novelty report as markdown. */
export function noveltyReportToMarkdown(report: NoveltyReport): string {
  const lines = [
    "# Novelty Oracle Report",
    "",
    `**Domain:** ${report.domain}`,
    `**Date:** ${report.timestamp}`,
    `**Ideas Assessed:** ${report.summary.totalIdeas}`,
    `**Average Novelty:** ${report.summary.averageNovelty}/100`,
    `**Patent Candidates:** ${report.summary.patentCandidates}`,
    "",
    "## Summary",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Highly Novel (80+) | ${report.summary.highlyNovel} |`,
    `| Partially Novel (60-79) | ${report.summary.partiallyNovel} |`,
    `| Similar Prior Art / Derivative | ${report.summary.derivative} |`,
    `| Patent Candidates | ${report.summary.patentCandidates} |`,
    "",
    `**Sources searched:** ${report.sourcesSearched.patents} patents, ${report.sourcesSearched.papers} papers, ${report.sourcesSearched.products} products, ${report.sourcesSearched.patterns} patterns`,
    "",
    "## Assessments",
    "",
  ];

  for (const a of report.assessments) {
    const badge =
      a.assessment === "highly-novel"
        ? "🆕"
        : a.assessment === "partially-novel"
          ? "🔶"
          : a.assessment === "similar-prior-art-exists"
            ? "⚠️"
            : "🔴";

    lines.push(`### ${badge} ${a.ideaTitle} — Novelty: ${a.noveltyScore}/100`);
    lines.push("");
    lines.push(
      `**Assessment:** ${a.assessment}${a.patentCandidate ? " | 📋 Patent Candidate" : ""}`
    );
    lines.push("");
    lines.push(a.recommendation);
    lines.push("");

    if (a.priorArt.length > 0) {
      lines.push("**Similar Prior Art:**");
      for (const pa of a.priorArt.slice(0, 5)) {
        const sourceIcon = pa.source === "patent" ? "📄" : pa.source === "academic" ? "📚" : "🔗";
        lines.push(
          `- ${sourceIcon} **${pa.title}** (similarity: ${Math.round(pa.similarity * 100)}%)${pa.url ? ` — [link](${pa.url})` : ""}${pa.patentNumber ? ` [${pa.patentNumber}]` : ""}`
        );
      }
      lines.push("");
    }

    if (a.differentiators.length > 0) {
      lines.push(`**Differentiators:** ${a.differentiators.join(", ")}`);
      lines.push("");
    }

    if (a.riskFactors.length > 0) {
      lines.push("**Risks:**");
      for (const r of a.riskFactors) lines.push(`- ⚠️ ${r}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
