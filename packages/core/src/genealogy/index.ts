/**
 * @module genealogy
 *
 * Idea Genealogy — Evolution Tracking. Compares new investigation runs
 * against previous ones and classifies ideas as net-new, evolved,
 * converged, or extinct.
 */

import { z } from "zod";
import { generateEmbedding, cosineSimilarity } from "../rag/embeddings.js";
import { listSessions } from "../history/index.js";
import type { SessionRecord, AngleResult, InnovationIdea } from "../types.js";

// ---- Schemas ----

export const IdeaStatusSchema = z.enum([
  "net-new",
  "evolved",
  "converged",
  "extinct",
]);

export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;

export const IdeaEvolutionSchema = z.object({
  ideaTitle: z.string().max(500),
  status: IdeaStatusSchema,
  description: z.string().max(2000),
  similarity: z.number().min(0).max(1).optional(),
  previousTitle: z.string().max(500).optional().describe("Title from previous run if evolved/converged"),
  previousAngle: z.string().max(200).optional(),
  currentAngle: z.string().max(200),
  diff: z.string().max(2000).optional().describe("What changed for evolved ideas"),
});

export type IdeaEvolution = z.infer<typeof IdeaEvolutionSchema>;

export const GenealogyResultSchema = z.object({
  currentSubject: z.string().max(500),
  previousSubject: z.string().max(500),
  previousSessionId: z.string(),
  evolutions: z.array(IdeaEvolutionSchema).max(200),
  summary: z.object({
    netNew: z.number().int().min(0),
    evolved: z.number().int().min(0),
    converged: z.number().int().min(0),
    extinct: z.number().int().min(0),
  }),
  isReInvestigation: z.boolean(),
});

export type GenealogyResult = z.infer<typeof GenealogyResultSchema>;

// ---- Helpers ----

function ideaToText(idea: InnovationIdea): string {
  return `${idea.title} ${idea.description} ${idea.potentialImpact}`;
}

function embedIdea(idea: InnovationIdea): number[] {
  return generateEmbedding(ideaToText(idea));
}

/** Detect if a subject has been investigated before. */
export function findPreviousInvestigation(
  subject: string,
  threshold: number = 0.5
): SessionRecord | undefined {
  const sessions = listSessions();
  const subjectEmbedding = generateEmbedding(subject.toLowerCase());

  let bestMatch: SessionRecord | undefined;
  let bestSimilarity = threshold;

  for (const session of sessions) {
    const sessionEmbedding = generateEmbedding(session.subject.toLowerCase());
    const similarity = cosineSimilarity(subjectEmbedding, sessionEmbedding);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = session;
    }
  }

  return bestMatch;
}

/**
 * Compare ideas from two investigation runs and classify their evolution.
 *
 * @param currentResults - Current angle results
 * @param previousResults - Previous angle results
 * @param currentSubject - Current investigation subject
 * @param previousSession - Previous session record
 * @returns GenealogyResult with classified idea evolution
 */
export function compareInvestigationRuns(
  currentResults: AngleResult[],
  previousResults: AngleResult[],
  currentSubject: string,
  previousSession: SessionRecord
): GenealogyResult {
  const currentIdeas = currentResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({
      idea,
      angleId: ar.angleId,
      angleName: ar.angleName,
      embedding: embedIdea(idea),
    }))
  );

  const previousIdeas = previousResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({
      idea,
      angleId: ar.angleId,
      angleName: ar.angleName,
      embedding: embedIdea(idea),
    }))
  );

  const evolutions: IdeaEvolution[] = [];
  const matchedPrevious = new Set<number>();

  // Classify current ideas
  for (const current of currentIdeas) {
    let bestMatch = -1;
    let bestSimilarity = 0;

    for (let j = 0; j < previousIdeas.length; j++) {
      const similarity = cosineSimilarity(
        current.embedding,
        previousIdeas[j].embedding
      );
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = j;
      }
    }

    if (bestSimilarity >= 0.85) {
      // High similarity = evolved (same idea, possibly updated)
      matchedPrevious.add(bestMatch);
      const prev = previousIdeas[bestMatch];

      // Check if multiple current angles produced similar ideas = converged
      const similarCurrentCount = currentIdeas.filter(
        (c) =>
          c !== current &&
          cosineSimilarity(c.embedding, current.embedding) >= 0.7
      ).length;

      if (similarCurrentCount > 0) {
        evolutions.push({
          ideaTitle: current.idea.title,
          status: "converged",
          description: current.idea.description,
          similarity: bestSimilarity,
          previousTitle: prev.idea.title,
          previousAngle: prev.angleName,
          currentAngle: current.angleName,
          diff: `Multiple angles now converge on this idea (previously from ${prev.angleName})`,
        });
      } else {
        const diff =
          current.idea.description !== prev.idea.description
            ? `Description updated from previous run`
            : `Idea remains consistent across runs`;

        evolutions.push({
          ideaTitle: current.idea.title,
          status: "evolved",
          description: current.idea.description,
          similarity: bestSimilarity,
          previousTitle: prev.idea.title,
          previousAngle: prev.angleName,
          currentAngle: current.angleName,
          diff,
        });
      }
    } else if (bestSimilarity >= 0.5) {
      // Medium similarity = evolved with significant changes
      matchedPrevious.add(bestMatch);
      const prev = previousIdeas[bestMatch];
      evolutions.push({
        ideaTitle: current.idea.title,
        status: "evolved",
        description: current.idea.description,
        similarity: bestSimilarity,
        previousTitle: prev.idea.title,
        previousAngle: prev.angleName,
        currentAngle: current.angleName,
        diff: `Significantly evolved from "${prev.idea.title}"`,
      });
    } else {
      // Low similarity = net-new
      evolutions.push({
        ideaTitle: current.idea.title,
        status: "net-new",
        description: current.idea.description,
        similarity: bestSimilarity,
        currentAngle: current.angleName,
      });
    }
  }

  // Mark unmatched previous ideas as extinct
  for (let j = 0; j < previousIdeas.length; j++) {
    if (!matchedPrevious.has(j)) {
      evolutions.push({
        ideaTitle: previousIdeas[j].idea.title,
        status: "extinct",
        description: `Previously generated by ${previousIdeas[j].angleName} but no longer appears`,
        previousTitle: previousIdeas[j].idea.title,
        previousAngle: previousIdeas[j].angleName,
        currentAngle: "n/a",
      });
    }
  }

  const summary = {
    netNew: evolutions.filter((e) => e.status === "net-new").length,
    evolved: evolutions.filter((e) => e.status === "evolved").length,
    converged: evolutions.filter((e) => e.status === "converged").length,
    extinct: evolutions.filter((e) => e.status === "extinct").length,
  };

  return {
    currentSubject,
    previousSubject: previousSession.subject,
    previousSessionId: previousSession.id,
    evolutions,
    summary,
    isReInvestigation: true,
  };
}
