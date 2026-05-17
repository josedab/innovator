/**
 * @description Intersection analysis identifying opportunities across domain overlaps.
 */
export const runtime = "nodejs";

import {
  investigate,
  generateForAngle,
  ANGLES,
  generateText,
  extractJson,
  withRetry,
  indexDocument,
  findSimilarDocuments,
  clearEmbeddingsIndex,
} from "@innovator/core";
import type { Investigation, AngleResult, InnovationIdea } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS, SECURITY_HEADERS } from "@/lib/api-headers";

const HEARTBEAT_MS = 15_000;

const RequestSchema = z.object({
  subjects: z.array(z.string().min(1).max(500)).min(2).max(3),
  model: z.string().optional(),
  anglesPerSubject: z.number().int().min(1).max(4).default(2),
});

interface SubjectResult {
  subject: string;
  investigation: Investigation;
  angleResults: AngleResult[];
}

interface IntersectionOpportunity {
  title: string;
  description: string;
  subjects: string[];
  sourceIdeas: string[];
  confidence: number;
}

interface ThematicOverlap {
  idea1: { subject: string; title: string };
  idea2: { subject: string; title: string };
  similarity: number;
}

const IntersectionResponseSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        subjects: z.array(z.string().max(500)),
        confidence: z.number().min(0).max(1),
      })
    )
    .max(20),
});

async function generateIntersectionOpportunities(
  subjects: string[],
  overlaps: ThematicOverlap[],
  investigations: Map<string, Investigation>,
  model?: string,
  signal?: AbortSignal
): Promise<IntersectionOpportunity[]> {
  const overlapDesc = overlaps
    .slice(0, 15)
    .map(
      (o) =>
        `"${o.idea1.title}" (${o.idea1.subject}) ↔ "${o.idea2.title}" (${o.idea2.subject}) [${Math.round(o.similarity * 100)}% similar]`
    )
    .join("\n");

  const subjectSummaries = subjects
    .map((s) => {
      const inv = investigations.get(s);
      return `${s}: ${inv?.summary ?? "No investigation data"}`;
    })
    .join("\n\n");

  const pairLabels: string[] = [];
  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      pairLabels.push(`${subjects[i]} ∩ ${subjects[j]}`);
    }
  }
  if (subjects.length === 3) {
    pairLabels.push(`${subjects[0]} ∩ ${subjects[1]} ∩ ${subjects[2]}`);
  }

  const prompt = `You are an innovation strategist finding opportunities at the intersection of multiple subjects.

SUBJECTS:
${subjectSummaries}

THEMATIC OVERLAPS FOUND:
${overlapDesc}

INTERSECTION PAIRS TO EXPLORE: ${pairLabels.join(", ")}

Generate innovation opportunities that exist ONLY at the intersection of these subjects — ideas that wouldn't exist by studying either subject alone.

Respond with JSON only:
{
  "opportunities": [
    {
      "title": "Opportunity name",
      "description": "Why this intersection creates unique value",
      "subjects": ["subject1", "subject2"],
      "confidence": 0.85
    }
  ]
}`;

  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model, signal });
      const jsonStr = extractJson(raw);
      const parsed = IntersectionResponseSchema.parse(JSON.parse(jsonStr));
      return parsed.opportunities.map((o) => ({
        ...o,
        sourceIdeas: overlaps
          .filter((ol) => o.subjects.some((s) => ol.idea1.subject === s || ol.idea2.subject === s))
          .flatMap((ol) => [ol.idea1.title, ol.idea2.title])
          .slice(0, 5),
      }));
    },
    {
      signal,
      isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse"),
    }
  );
}

/**
 * Multi-subject intersection analysis via SSE.
 * Investigates 2-3 subjects in parallel, finds thematic overlaps via embeddings,
 * and generates intersection opportunities via LLM.
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
        JSON.stringify({ error: "Provide 2-3 subjects for intersection analysis." }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { subjects, model, anglesPerSubject } = parsed.data;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    const encoder = new TextEncoder();
    let streamClosed = false;
    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });

    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            streamClosed = true;
          }
        }, HEARTBEAT_MS);

        const send = (event: Record<string, unknown>) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            streamClosed = true;
          }
        };

        try {
          send({ stage: "investigating", subjects });

          // Phase 1: Parallel investigations
          const investigations = new Map<string, Investigation>();
          const investigationResults = await Promise.all(
            subjects.map(async (subject) => {
              const inv = await investigate(subject, model, abortController.signal);
              investigations.set(subject, inv);
              send({ stage: "investigated", subject, summary: inv.summary });
              return { subject, investigation: inv };
            })
          );

          // Phase 2: Generate ideas for each subject
          send({ stage: "generating", subjects });
          const subjectResults: SubjectResult[] = [];
          const selectedAngles = ANGLES.slice(0, anglesPerSubject);

          for (const { subject, investigation } of investigationResults) {
            const angleResults: AngleResult[] = [];
            for (const angle of selectedAngles) {
              if (abortController.signal.aborted) break;
              send({ stage: "generating", subject, angle: angle.id });
              const result = await generateForAngle(
                subject,
                investigation,
                angle.id,
                model,
                abortController.signal
              );
              angleResults.push(result);
            }
            subjectResults.push({ subject, investigation, angleResults });
          }

          // Phase 3: Find thematic overlaps via embeddings
          send({ stage: "analyzing_overlaps" });
          clearEmbeddingsIndex();

          const docMap = new Map<string, { subject: string; idea: InnovationIdea }>();
          for (const sr of subjectResults) {
            for (const ar of sr.angleResults) {
              for (const idea of ar.ideas) {
                const doc = indexDocument({
                  type: "idea",
                  title: idea.title,
                  content: `${idea.title}. ${idea.description}. ${idea.potentialImpact}`,
                  metadata: { subject: sr.subject },
                  sessionId: sr.subject,
                });
                docMap.set(doc.id, { subject: sr.subject, idea });
              }
            }
          }

          const overlaps: ThematicOverlap[] = [];
          const seen = new Set<string>();
          for (const [docId, { subject, idea }] of docMap) {
            const similar = findSimilarDocuments(docId, 8);
            for (const match of similar) {
              const other = docMap.get(match.document.id);
              if (!other || other.subject === subject) continue;
              const key = [docId, match.document.id].sort().join(":");
              if (seen.has(key)) continue;
              seen.add(key);
              if (match.score >= 0.1) {
                overlaps.push({
                  idea1: { subject, title: idea.title },
                  idea2: { subject: other.subject, title: other.idea.title },
                  similarity: match.score,
                });
              }
            }
          }
          overlaps.sort((a, b) => b.similarity - a.similarity);
          clearEmbeddingsIndex();

          send({
            stage: "overlaps_found",
            count: overlaps.length,
            overlaps: overlaps.slice(0, 10),
          });

          // Phase 4: Generate intersection opportunities via LLM
          send({ stage: "generating_intersections" });
          const opportunities = await generateIntersectionOpportunities(
            subjects,
            overlaps,
            investigations,
            model,
            abortController.signal
          );

          // Final result
          send({
            stage: "complete",
            subjectResults: subjectResults.map((sr) => ({
              subject: sr.subject,
              investigationSummary: sr.investigation.summary,
              ideaCount: sr.angleResults.reduce((sum, ar) => sum + ar.ideas.length, 0),
              angleResults: sr.angleResults,
            })),
            overlaps,
            opportunities,
          });

          logger.info("Intersection analysis completed", {
            route: "/api/intersection",
            requestId,
            subjectCount: subjects.length,
            overlaps: overlaps.length,
            opportunities: opportunities.length,
            durationMs: Date.now() - startTime,
          });
        } catch (err) {
          logger.error("Intersection analysis error", {
            error: err instanceof Error ? err.message : String(err),
            route: "/api/intersection",
            requestId,
          });
          send({
            stage: "error",
            error: "Intersection analysis failed. Please try again.",
          });
        } finally {
          clearEmbeddingsIndex();
          request.signal.removeEventListener("abort", onRequestAbort);
          clearInterval(heartbeat);
          if (!streamClosed) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
          streamClosed = true;
        }
      },
      cancel() {
        streamClosed = true;
        abortController.abort();
        request.signal.removeEventListener("abort", onRequestAbort);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...SECURITY_HEADERS,
      },
    });
  } catch (err) {
    logger.error("Intersection analysis error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/intersection",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Intersection analysis failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
