/**
 * @description Side-by-side session comparison and diff analysis.
 */
export const runtime = "nodejs";

import {
  getSession,
  indexDocument,
  findSimilarDocuments,
  clearEmbeddingsIndex,
} from "@innovator/core";
import type { SessionRecord, InnovationIdea } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  sessionIds: z.array(z.string().max(200)).min(2).max(5),
});

interface IdeaOverlap {
  idea1: { sessionId: string; title: string; description: string };
  idea2: { sessionId: string; title: string; description: string };
  similarity: number;
}

interface SessionSummary {
  id: string;
  subject: string;
  createdAt: string;
  angleCount: number;
  ideaCount: number;
  themes: string[];
}

interface SessionComparisonResult {
  sessions: SessionSummary[];
  sharedThemes: string[];
  uniqueThemes: Record<string, string[]>;
  ideaOverlaps: IdeaOverlap[];
  angleComparison: Record<string, string[]>;
  scoreDelta: Array<{
    sessionId: string;
    subject: string;
    avgFeasibility: string;
    ideaCount: number;
  }>;
  timeline: Array<{
    sessionId: string;
    subject: string;
    createdAt: string;
  }>;
}

function getAllIdeas(session: SessionRecord): Array<InnovationIdea & { angleId: string }> {
  const ideas: Array<InnovationIdea & { angleId: string }> = [];
  for (const ar of session.angleResults) {
    for (const idea of ar.ideas) {
      ideas.push({ ...idea, angleId: ar.angleId });
    }
  }
  return ideas;
}

function computeIdeaOverlaps(sessions: SessionRecord[]): IdeaOverlap[] {
  clearEmbeddingsIndex();

  try {
    const docMap = new Map<string, { sessionId: string; idea: InnovationIdea }>();

    for (const session of sessions) {
      const ideas = getAllIdeas(session);
      for (const idea of ideas) {
        const doc = indexDocument({
          type: "idea",
          title: idea.title,
          content: `${idea.title}. ${idea.description}. ${idea.potentialImpact}`,
          metadata: { sessionId: session.id, angleId: idea.angleId },
          sessionId: session.id,
        });
        docMap.set(doc.id, { sessionId: session.id, idea });
      }
    }

    const overlaps: IdeaOverlap[] = [];
    const seen = new Set<string>();

    for (const [docId, { sessionId, idea }] of docMap) {
      const similar = findSimilarDocuments(docId, 10);
      for (const match of similar) {
        const other = docMap.get(match.document.id);
        if (!other || other.sessionId === sessionId) continue;

        const pairKey = [docId, match.document.id].sort().join(":");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        if (match.score >= 0.15) {
          overlaps.push({
            idea1: { sessionId, title: idea.title, description: idea.description },
            idea2: { sessionId: other.sessionId, title: other.idea.title, description: other.idea.description },
            similarity: match.score,
          });
        }
      }
    }

    return overlaps.sort((a, b) => b.similarity - a.similarity).slice(0, 30);
  } finally {
    clearEmbeddingsIndex();
  }
}

/**
 * Compare 2-5 completed innovation sessions side-by-side.
 * Returns shared/unique themes, idea overlaps via embedding cosine similarity,
 * angle coverage comparison, score deltas, and chronological timeline.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Provide 2-5 session IDs to compare." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { sessionIds } = parsed.data;

    const sessions: SessionRecord[] = [];
    for (const id of sessionIds) {
      const session = getSession(id);
      if (!session) {
        return new Response(
          JSON.stringify({ error: `Session not found: ${id}` }),
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      sessions.push(session);
    }

    // Shared vs unique themes
    const themeSets = sessions.map((s) => new Set(s.synthesis?.themes ?? []));
    const allThemes = [...new Set(sessions.flatMap((s) => s.synthesis?.themes ?? []))];
    const sharedThemes = allThemes.filter((t) => themeSets.every((set) => set.has(t)));

    const uniqueThemes: Record<string, string[]> = {};
    for (const session of sessions) {
      const mine = new Set(session.synthesis?.themes ?? []);
      const others = new Set(
        sessions.filter((s) => s.id !== session.id).flatMap((s) => s.synthesis?.themes ?? [])
      );
      uniqueThemes[session.id] = [...mine].filter((t) => !others.has(t));
    }

    // Angle comparison
    const allAngles = new Set(sessions.flatMap((s) => s.angleResults.map((a) => a.angleId)));
    const angleComparison: Record<string, string[]> = {};
    for (const angle of allAngles) {
      angleComparison[angle] = sessions
        .filter((s) => s.angleResults.some((a) => a.angleId === angle))
        .map((s) => s.id);
    }

    // Idea overlaps via embeddings
    const ideaOverlaps = computeIdeaOverlaps(sessions);

    // Score deltas (uses synthesis topIdeas which have feasibility)
    const scoreDelta = sessions.map((s) => {
      const ideas = getAllIdeas(s);
      const topIdeas = s.synthesis?.topIdeas ?? [];
      const counts = { high: 0, medium: 0, low: 0 };
      for (const ti of topIdeas) {
        const f = ti.feasibility as keyof typeof counts;
        if (f in counts) counts[f]++;
      }
      const dominant = counts.high >= counts.medium && counts.high >= counts.low
        ? "high" : counts.medium >= counts.low ? "medium" : "low";
      return { sessionId: s.id, subject: s.subject, avgFeasibility: dominant, ideaCount: ideas.length };
    });

    // Chronological timeline
    const timeline = sessions
      .map((s) => ({ sessionId: s.id, subject: s.subject, createdAt: s.createdAt }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const result: SessionComparisonResult = {
      sessions: sessions.map((s) => ({
        id: s.id,
        subject: s.subject,
        createdAt: s.createdAt,
        angleCount: s.angleResults.length,
        ideaCount: getAllIdeas(s).length,
        themes: s.synthesis?.themes ?? [],
      })),
      sharedThemes,
      uniqueThemes,
      ideaOverlaps,
      angleComparison,
      scoreDelta,
      timeline,
    };

    logger.info("Session comparison completed", {
      route: "/api/session-compare",
      requestId,
      sessionCount: sessions.length,
      overlaps: ideaOverlaps.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Session comparison error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/session-compare",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Session comparison failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
