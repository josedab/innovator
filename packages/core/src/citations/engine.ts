/**
 * Citation extraction, verification, and source management engine.
 */
import type { CitationSource, Citation, CitationContext, GroundedIdea } from "./types.js";

const sessionContexts = new Map<string, CitationContext>();

/** Get or create a citation context for a session. */
export function getCitationContext(sessionId: string): CitationContext {
  let ctx = sessionContexts.get(sessionId);
  if (!ctx) {
    ctx = {
      sessionId,
      sources: [],
      citations: [],
      stats: { totalCitations: 0, verified: 0, unverified: 0, contradicted: 0 },
    };
    sessionContexts.set(sessionId, ctx);
  }
  return ctx;
}

/** Add a source document to a session's citation context. */
export function addSource(
  sessionId: string,
  source: Omit<CitationSource, "id" | "addedAt">
): CitationSource {
  const ctx = getCitationContext(sessionId);
  const doc: CitationSource = {
    ...source,
    id: crypto.randomUUID(),
    addedAt: new Date().toISOString(),
  };
  ctx.sources.push(doc);
  return doc;
}

/** Remove a source from a session. */
export function removeSource(sessionId: string, sourceId: string): boolean {
  const ctx = getCitationContext(sessionId);
  const idx = ctx.sources.findIndex((s) => s.id === sourceId);
  if (idx === -1) return false;
  ctx.sources.splice(idx, 1);
  ctx.citations = ctx.citations.filter((c) => c.sourceId !== sourceId);
  updateStats(ctx);
  return true;
}

/** Extract citations from LLM output text by matching claims against sources. */
export function extractCitations(sessionId: string, text: string, _ideaId: string): Citation[] {
  const ctx = getCitationContext(sessionId);
  if (ctx.sources.length === 0) return [];

  const citations: Citation[] = [];
  // Split text into sentences for claim extraction
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  for (const sentence of sentences) {
    const claim = sentence.trim();
    // Match claim against sources using keyword overlap
    for (const source of ctx.sources) {
      const similarity = computeTextSimilarity(claim, source.content);
      if (similarity > 0.15) {
        const excerpt = findRelevantExcerpt(claim, source.content);
        const citation: Citation = {
          id: crypto.randomUUID(),
          sourceId: source.id,
          claim,
          sourceTitle: source.title,
          sourceUrl: source.url,
          status: similarity > 0.4 ? "verified" : "unverified",
          confidence: Math.round(similarity * 100) / 100,
          excerpt,
        };
        citations.push(citation);
        ctx.citations.push(citation);
      }
    }
  }

  updateStats(ctx);
  return citations;
}

/** Verify a specific citation by re-checking against its source. */
export function verifyCitation(sessionId: string, citationId: string): Citation | null {
  const ctx = getCitationContext(sessionId);
  const citation = ctx.citations.find((c) => c.id === citationId);
  if (!citation) return null;

  const source = ctx.sources.find((s) => s.id === citation.sourceId);
  if (!source) {
    citation.status = "unverified";
    citation.verifiedAt = new Date().toISOString();
    updateStats(ctx);
    return citation;
  }

  const similarity = computeTextSimilarity(citation.claim, source.content);
  if (similarity > 0.4) {
    citation.status = "verified";
    citation.confidence = Math.round(similarity * 100) / 100;
  } else if (similarity < 0.1) {
    citation.status = "contradicted";
    citation.confidence = Math.round(similarity * 100) / 100;
  } else {
    citation.status = "unverified";
    citation.confidence = Math.round(similarity * 100) / 100;
  }
  citation.verifiedAt = new Date().toISOString();
  citation.excerpt = findRelevantExcerpt(citation.claim, source.content);

  updateStats(ctx);
  return citation;
}

/** Ground ideas with citations from session sources. */
export function groundIdeas(
  sessionId: string,
  ideas: Array<{ id: string; title: string; description: string }>
): GroundedIdea[] {
  return ideas.map((idea) => {
    const citations = extractCitations(sessionId, idea.description, idea.id);
    const avgConfidence =
      citations.length > 0
        ? citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length
        : 0;
    return {
      ideaId: idea.id,
      title: idea.title,
      description: idea.description,
      citations,
      overallConfidence: Math.round(avgConfidence * 100) / 100,
    };
  });
}

/** Reset citation context for a session. */
export function resetCitationContext(sessionId: string): void {
  sessionContexts.delete(sessionId);
}

/** List all session IDs with citation contexts. */
export function listCitationSessions(): string[] {
  return Array.from(sessionContexts.keys());
}

// --- Internal helpers ---

function computeTextSimilarity(text1: string, text2: string): number {
  const words1 = tokenize(text1);
  const words2 = new Set(tokenize(text2));
  if (words1.length === 0 || words2.size === 0) return 0;

  let matchCount = 0;
  for (const word of words1) {
    if (words2.has(word)) matchCount++;
  }
  return matchCount / Math.max(words1.length, 1);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function findRelevantExcerpt(claim: string, source: string): string {
  const claimWords = new Set(tokenize(claim));
  const sentences = source.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  let bestSentence = "";
  let bestScore = 0;

  for (const sentence of sentences) {
    const words = tokenize(sentence);
    let score = 0;
    for (const w of words) {
      if (claimWords.has(w)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence.trim();
    }
  }

  return bestSentence.length > 300 ? bestSentence.slice(0, 300) + "..." : bestSentence;
}

function updateStats(ctx: CitationContext): void {
  ctx.stats = {
    totalCitations: ctx.citations.length,
    verified: ctx.citations.filter((c) => c.status === "verified").length,
    unverified: ctx.citations.filter((c) => c.status === "unverified").length,
    contradicted: ctx.citations.filter((c) => c.status === "contradicted").length,
  };
}
