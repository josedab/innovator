/**
 * @description Idea Genome Sequencer — decompose ideas into traits,
 * find similar ideas, and generate recombinant ideas.
 */
export const runtime = "nodejs";

import {
  sequenceIdea,
  findSimilarGenomes,
  recombineGenomes,
  getAllGenomes,
  getGenome,
  searchGenomes,
  genomeToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const SequenceSchema = z.object({
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    potentialImpact: z.string().max(2000).default(""),
    implementationHint: z.string().max(2000).default(""),
  }),
  sessionId: z.string().max(200).optional(),
  angleId: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
});

const SimilarSchema = z.object({
  action: z.literal("similar"),
  genomeId: z.string().min(1).max(200),
  topN: z.number().int().min(1).max(20).default(5),
});

const RecombineSchema = z.object({
  action: z.literal("recombine"),
  genomeIdA: z.string().min(1).max(200),
  genomeIdB: z.string().min(1).max(200),
  model: z.string().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const q = searchParams.get("q");

    if (id) {
      const genome = getGenome(id);
      if (!genome) {
        return Response.json(
          { error: "Genome not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      if (searchParams.get("format") === "markdown") {
        return new Response(genomeToMarkdown(genome), {
          status: 200,
          headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
        });
      }
      return Response.json(genome, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (q) {
      const results = searchGenomes(q);
      return Response.json(
        { genomes: results, count: results.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    const genomes = getAllGenomes();
    return Response.json(
      {
        genomes: genomes.map((g) => ({
          id: g.id,
          title: g.ideaTitle,
          sequencedAt: g.sequencedAt,
          traitCount: g.traits.length,
        })),
        count: genomes.length,
      },
      { status: 200, headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Genome query failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "similar") {
      const parsed = SimilarSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid request", details: parsed.error.issues },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const genome = getGenome(parsed.data.genomeId);
      if (!genome) {
        return Response.json(
          { error: "Genome not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      const similar = findSimilarGenomes(genome, parsed.data.topN);
      return Response.json({ similar }, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (body.action === "recombine") {
      const parsed = RecombineSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid request", details: parsed.error.issues },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const genomeA = getGenome(parsed.data.genomeIdA);
      const genomeB = getGenome(parsed.data.genomeIdB);
      if (!genomeA || !genomeB) {
        return Response.json(
          { error: "One or both genomes not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      const result = await recombineGenomes(genomeA, genomeB, { model: parsed.data.model });
      return Response.json(result, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    // Default: sequence
    const parsed = SequenceSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    const genome = await sequenceIdea(parsed.data.idea, {
      sessionId: parsed.data.sessionId,
      angleId: parsed.data.angleId,
      model: parsed.data.model,
    });
    return Response.json(genome, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Genome operation failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
