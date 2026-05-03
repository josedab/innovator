/**
 * @module serendipity
 *
 * Cross-Session Serendipity Engine — analyzes past investigations
 * and surfaces unexpected connections between sessions using
 * embedding-based similarity and LLM explanation generation.
 */

import { z } from "zod";
import { generateEmbedding, cosineSimilarity } from "../rag/embeddings.js";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import { listSessions } from "../history/index.js";
import type { SessionRecord } from "../types.js";

// ---- Schemas ----

export const SerendipitousConnectionSchema = z.object({
  sessionIdA: z.string(),
  sessionIdB: z.string(),
  subjectA: z.string().max(500),
  subjectB: z.string().max(500),
  similarityScore: z.number().min(0).max(1),
  sharedPatterns: z.array(z.string().max(500)).max(10),
  explanation: z.string().max(2000),
  potentialInsight: z.string().max(1000).optional(),
});

export type SerendipitousConnection = z.infer<typeof SerendipitousConnectionSchema>;

export const SerendipityResultSchema = z.object({
  connections: z.array(SerendipitousConnectionSchema).max(50),
  totalSessionsAnalyzed: z.number().int().min(0),
  generatedAt: z.string(),
});

export type SerendipityResult = z.infer<typeof SerendipityResultSchema>;

// ---- Embedding Generation ----

/** Build a text representation of a session for embedding. */
function sessionToText(session: SessionRecord): string {
  const parts = [session.subject];

  if (session.investigation) {
    parts.push(session.investigation.summary);
    parts.push(...session.investigation.challenges);
    parts.push(...session.investigation.opportunities);
  }

  for (const ar of session.angleResults) {
    parts.push(ar.reasoning);
    for (const idea of ar.ideas) {
      parts.push(idea.title);
      parts.push(idea.description);
    }
  }

  if (session.synthesis) {
    parts.push(...session.synthesis.themes);
    parts.push(session.synthesis.recommendation);
  }

  return parts.join(" ").slice(0, 10000);
}

/** Generate an embedding for a session. */
export function embedSession(session: SessionRecord): number[] {
  return generateEmbedding(sessionToText(session));
}

// ---- Connection Finding ----

/**
 * Find serendipitous connections across all past sessions.
 *
 * @param minSimilarity - Minimum cosine similarity threshold (default: 0.3)
 * @param maxConnections - Maximum connections to return (default: 10)
 * @param model - Optional LLM model for explanation generation
 * @param signal - Optional AbortSignal
 * @returns SerendipityResult with unexpected connections
 */
export async function findSerendipitousConnections(
  minSimilarity: number = 0.3,
  maxConnections: number = 10,
  model?: string,
  signal?: AbortSignal
): Promise<SerendipityResult> {
  const sessions = listSessions();

  if (sessions.length < 2) {
    return {
      connections: [],
      totalSessionsAnalyzed: sessions.length,
      generatedAt: new Date().toISOString(),
    };
  }

  // Generate embeddings for all sessions
  const embeddings = sessions.map((s) => ({
    session: s,
    embedding: embedSession(s),
  }));

  // Find pairs with similarity above threshold (excluding near-duplicates)
  const candidates: {
    sessionA: SessionRecord;
    sessionB: SessionRecord;
    similarity: number;
  }[] = [];

  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const similarity = cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding);

      // Filter: above minimum similarity but below 0.95 to exclude
      // near-duplicate sessions that would produce trivial connections
      if (similarity >= minSimilarity && similarity < 0.95) {
        candidates.push({
          sessionA: embeddings[i].session,
          sessionB: embeddings[j].session,
          similarity,
        });
      }
    }
  }

  // Sort by descending similarity so the strongest connections appear first
  candidates.sort((a, b) => b.similarity - a.similarity);
  const topCandidates = candidates.slice(0, maxConnections);

  if (topCandidates.length === 0) {
    return {
      connections: [],
      totalSessionsAnalyzed: sessions.length,
      generatedAt: new Date().toISOString(),
    };
  }

  // Generate explanations for connections using LLM
  const connections: SerendipitousConnection[] = [];

  for (const candidate of topCandidates) {
    if (signal?.aborted) break;

    try {
      const explanation = await generateConnectionExplanation(
        candidate.sessionA,
        candidate.sessionB,
        candidate.similarity,
        model,
        signal
      );
      connections.push(explanation);
    } catch {
      // If LLM explanation fails, add basic connection
      connections.push({
        sessionIdA: candidate.sessionA.id,
        sessionIdB: candidate.sessionB.id,
        subjectA: candidate.sessionA.subject,
        subjectB: candidate.sessionB.subject,
        similarityScore: candidate.similarity,
        sharedPatterns: [],
        explanation: `These investigations share structural similarities (${(candidate.similarity * 100).toFixed(0)}% match).`,
      });
    }
  }

  return {
    connections,
    totalSessionsAnalyzed: sessions.length,
    generatedAt: new Date().toISOString(),
  };
}

async function generateConnectionExplanation(
  sessionA: SessionRecord,
  sessionB: SessionRecord,
  similarity: number,
  model?: string,
  signal?: AbortSignal
): Promise<SerendipitousConnection> {
  const prompt = `You are an innovation pattern analyst. Two seemingly different investigations share unexpected structural similarities.

INVESTIGATION A: "${sessionA.subject}"
${sessionA.investigation ? `Summary: ${sessionA.investigation.summary.slice(0, 500)}` : ""}
${sessionA.synthesis ? `Themes: ${sessionA.synthesis.themes.join(", ")}` : ""}

INVESTIGATION B: "${sessionB.subject}"
${sessionB.investigation ? `Summary: ${sessionB.investigation.summary.slice(0, 500)}` : ""}
${sessionB.synthesis ? `Themes: ${sessionB.synthesis.themes.join(", ")}` : ""}

Similarity score: ${(similarity * 100).toFixed(0)}%

Identify shared structural patterns, unexpected connections, and potential cross-pollination insights.

You MUST respond with valid JSON only.

{
  "sharedPatterns": ["Pattern 1", "Pattern 2"],
  "explanation": "Why these investigations are surprisingly connected",
  "potentialInsight": "A novel insight from combining these domains"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse connection explanation: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  const result = z
    .object({
      sharedPatterns: z.array(z.string().max(500)).max(10),
      explanation: z.string().max(2000),
      potentialInsight: z.string().max(1000).optional(),
    })
    .parse(parsed);

  return {
    sessionIdA: sessionA.id,
    sessionIdB: sessionB.id,
    subjectA: sessionA.subject,
    subjectB: sessionB.subject,
    similarityScore: similarity,
    ...result,
  };
}
