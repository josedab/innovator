/**
 * @module novelty-oracle/pipeline-enrichment
 *
 * Pipeline enrichment for the Novelty Oracle.
 * Adds novelty scores to synthesis results during the pipeline.
 */

import type { Synthesis, AngleResult } from "../types.js";
import { assessNovelty } from "./novelty-oracle.js";

export interface NoveltyEnrichedIdea {
  title: string;
  description: string;
  sourceAngle: string;
  potentialImpact: string;
  feasibility: "low" | "medium" | "high";
  noveltyScore: number;
  noveltyAssessment: "highly-novel" | "partially-novel" | "similar-prior-art-exists" | "derivative";
  patentCandidate: boolean;
  differentiators: string[];
}

export interface NoveltyEnrichedSynthesis extends Omit<Synthesis, "topIdeas"> {
  topIdeas: NoveltyEnrichedIdea[];
  noveltyStats: {
    averageNovelty: number;
    highlyNovel: number;
    patentCandidates: number;
  };
}

/** Enrich synthesis results with novelty scores. */
export function enrichSynthesisWithNovelty(
  synthesis: Synthesis,
  options: { domain?: string; threshold?: number } = {}
): NoveltyEnrichedSynthesis {
  const enrichedIdeas: NoveltyEnrichedIdea[] = synthesis.topIdeas.map((idea) => {
    const assessment = assessNovelty(idea.title, idea.description, options);
    return {
      ...idea,
      noveltyScore: assessment.noveltyScore,
      noveltyAssessment: assessment.assessment,
      patentCandidate: assessment.patentCandidate,
      differentiators: assessment.differentiators,
    };
  });

  const totalNovelty = enrichedIdeas.reduce((sum, i) => sum + i.noveltyScore, 0);

  return {
    ...synthesis,
    topIdeas: enrichedIdeas,
    noveltyStats: {
      averageNovelty:
        enrichedIdeas.length > 0 ? Math.round(totalNovelty / enrichedIdeas.length) : 0,
      highlyNovel: enrichedIdeas.filter((i) => i.noveltyAssessment === "highly-novel").length,
      patentCandidates: enrichedIdeas.filter((i) => i.patentCandidate).length,
    },
  };
}

/** Enrich all angle results with novelty scores for each idea. */
export function enrichAngleResultsWithNovelty(
  angleResults: AngleResult[],
  options: { domain?: string; threshold?: number } = {}
): Array<AngleResult & { ideaNoveltyScores: number[] }> {
  return angleResults.map((result) => {
    const scores = result.ideas.map((idea) => {
      const assessment = assessNovelty(idea.title, idea.description, options);
      return assessment.noveltyScore;
    });
    return { ...result, ideaNoveltyScores: scores };
  });
}
