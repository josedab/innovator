/**
 * @module quality-gate
 *
 * LLM Output Quality Gate — automatic quality checks on LLM responses
 * before presenting to users. Checks for hallucinated statistics,
 * self-contradictions, vague platitudes, and cross-angle duplication.
 */

import { z } from "zod";
import { generateEmbedding, cosineSimilarity } from "../rag/embeddings.js";
import type { AngleResult, InnovationIdea } from "../types.js";

// ---- Schemas ----

export const QualityCheckTypeSchema = z.enum([
  "hallucinated-statistic",
  "self-contradiction",
  "vague-platitude",
  "cross-angle-duplicate",
]);

export type QualityCheckType = z.infer<typeof QualityCheckTypeSchema>;

export const QualityIssueSchema = z.object({
  type: QualityCheckTypeSchema,
  severity: z.enum(["low", "medium", "high"]),
  ideaTitle: z.string().max(500),
  angleId: z.string().max(100),
  detail: z.string().max(1000),
  suggestion: z.string().max(500).optional(),
});

export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const QualityReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  issues: z.array(QualityIssueSchema).max(200),
  passesGate: z.boolean(),
  checkedIdeas: z.number().int().min(0),
  summary: z.string().max(1000),
});

export type QualityReport = z.infer<typeof QualityReportSchema>;

export interface QualityGateConfig {
  /** Minimum quality score to pass (default: 60) */
  minScore?: number;
  /** Enable hallucinated statistics check (default: true) */
  checkHallucinations?: boolean;
  /** Enable vagueness check (default: true) */
  checkVagueness?: boolean;
  /** Enable cross-angle duplication check (default: true) */
  checkDuplication?: boolean;
  /** Enable self-contradiction check (default: true) */
  checkContradictions?: boolean;
  /** Similarity threshold for duplicate detection (default: 0.85) */
  duplicateThreshold?: number;
}

// ---- Detectors ----

/** Patterns that suggest hallucinated statistics. */
const HALLUCINATED_STAT_PATTERNS = [
  /\b\d{1,3}%\s+of\s+(all|most|many|some)/i,
  /\bstudies\s+show\s+that\s+\d/i,
  /\baccording\s+to\s+(recent\s+)?research,?\s+\d/i,
  /\b(approximately|roughly|about)\s+\d+\s+(billion|million|trillion)/i,
  /\bmarket\s+(size|value)\s+(of|is|was|will\s+be)\s+\$\d/i,
  /\b\d{1,3}\.\d+%/i, // Suspiciously precise percentages
  /\bby\s+20\d{2},?\s+\d+%/i, // Future predictions with specific %
];

/** Common vague platitudes that add no value. */
const PLATITUDE_PHRASES = [
  "leverage synergies",
  "think outside the box",
  "paradigm shift",
  "game changer",
  "low-hanging fruit",
  "move the needle",
  "best practices",
  "value proposition",
  "cutting edge",
  "state of the art",
  "world-class",
  "next generation",
  "innovative solution",
  "revolutionary approach",
  "holistic approach",
  "seamless integration",
  "actionable insights",
  "drive engagement",
  "optimize performance",
  "maximize value",
  "strategic alignment",
  "digital transformation",
  "empower stakeholders",
  "scalable solution",
  "end-to-end",
  "mission-critical",
];

/**
 * Check for hallucinated statistics in idea text.
 */
export function checkHallucinatedStatistics(idea: InnovationIdea, angleId: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const fullText = `${idea.description} ${idea.potentialImpact} ${idea.implementationHint}`;

  for (const pattern of HALLUCINATED_STAT_PATTERNS) {
    const match = fullText.match(pattern);
    if (match) {
      issues.push({
        type: "hallucinated-statistic",
        severity: "high",
        ideaTitle: idea.title,
        angleId,
        detail: `Potentially fabricated statistic: "${match[0]}"`,
        suggestion: "Remove or replace with verifiable data",
      });
    }
  }

  return issues;
}

/**
 * Check for vague platitudes in idea text.
 */
export function checkVaguePlatitudes(idea: InnovationIdea, angleId: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const fullText = `${idea.title} ${idea.description} ${idea.potentialImpact}`.toLowerCase();

  let platitudeCount = 0;
  const found: string[] = [];

  for (const phrase of PLATITUDE_PHRASES) {
    if (fullText.includes(phrase)) {
      platitudeCount++;
      found.push(phrase);
    }
  }

  if (platitudeCount >= 3) {
    issues.push({
      type: "vague-platitude",
      severity: "medium",
      ideaTitle: idea.title,
      angleId,
      detail: `Contains ${platitudeCount} vague platitudes: ${found.slice(0, 5).join(", ")}`,
      suggestion: "Replace generic language with specific, actionable details",
    });
  } else if (platitudeCount >= 1) {
    issues.push({
      type: "vague-platitude",
      severity: "low",
      ideaTitle: idea.title,
      angleId,
      detail: `Contains platitude(s): ${found.join(", ")}`,
    });
  }

  return issues;
}

/**
 * Check for cross-angle idea duplication.
 */
export function checkCrossAngleDuplication(
  angleResults: AngleResult[],
  threshold: number = 0.85
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const allIdeas: {
    idea: InnovationIdea;
    angleId: string;
    embedding: number[];
  }[] = [];

  for (const ar of angleResults) {
    for (const idea of ar.ideas) {
      allIdeas.push({
        idea,
        angleId: ar.angleId,
        embedding: generateEmbedding(`${idea.title} ${idea.description}`),
      });
    }
  }

  for (let i = 0; i < allIdeas.length; i++) {
    for (let j = i + 1; j < allIdeas.length; j++) {
      // Only flag cross-angle duplicates
      if (allIdeas[i].angleId === allIdeas[j].angleId) continue;

      const similarity = cosineSimilarity(allIdeas[i].embedding, allIdeas[j].embedding);

      if (similarity >= threshold) {
        issues.push({
          type: "cross-angle-duplicate",
          severity: "medium",
          ideaTitle: allIdeas[i].idea.title,
          angleId: allIdeas[i].angleId,
          detail: `${(similarity * 100).toFixed(0)}% similar to "${allIdeas[j].idea.title}" from ${allIdeas[j].angleId}`,
          suggestion: "Consider merging or differentiating these ideas",
        });
      }
    }
  }

  return issues;
}

/**
 * Check for self-contradictions within an angle's ideas.
 */
export function checkSelfContradictions(angleResult: AngleResult): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const ideas = angleResult.ideas;

  // Simple heuristic: look for opposing sentiment in similar ideas
  const contradictionPairs = [
    ["increase", "decrease"],
    ["more", "less"],
    ["expand", "reduce"],
    ["centralize", "decentralize"],
    ["automate", "manual"],
    ["simplify", "complex"],
    ["open", "restrict"],
    ["free", "paid"],
  ];

  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const textA = `${ideas[i].title} ${ideas[i].description}`.toLowerCase();
      const textB = `${ideas[j].title} ${ideas[j].description}`.toLowerCase();

      for (const [termA, termB] of contradictionPairs) {
        if (
          (textA.includes(termA) && textB.includes(termB)) ||
          (textA.includes(termB) && textB.includes(termA))
        ) {
          // Check if they're about the same topic
          const similarity = cosineSimilarity(generateEmbedding(textA), generateEmbedding(textB));

          if (similarity >= 0.5) {
            issues.push({
              type: "self-contradiction",
              severity: "medium",
              ideaTitle: ideas[i].title,
              angleId: angleResult.angleId,
              detail: `"${ideas[i].title}" suggests "${termA}" while "${ideas[j].title}" suggests "${termB}" on a similar topic`,
              suggestion: "Reconcile these opposing approaches or clarify different contexts",
            });
            break;
          }
        }
      }
    }
  }

  return issues;
}

// ---- Main Quality Gate ----

/**
 * Run all quality checks on angle results.
 *
 * @param angleResults - Results to check
 * @param config - Quality gate configuration
 * @returns QualityReport with all issues and overall score
 */
export function runQualityGate(
  angleResults: AngleResult[],
  config: QualityGateConfig = {}
): QualityReport {
  const {
    minScore = 60,
    checkHallucinations = true,
    checkVagueness = true,
    checkDuplication = true,
    checkContradictions = true,
    duplicateThreshold = 0.85,
  } = config;

  const issues: QualityIssue[] = [];
  let totalIdeas = 0;

  for (const ar of angleResults) {
    for (const idea of ar.ideas) {
      totalIdeas++;

      if (checkHallucinations) {
        issues.push(...checkHallucinatedStatistics(idea, ar.angleId));
      }

      if (checkVagueness) {
        issues.push(...checkVaguePlatitudes(idea, ar.angleId));
      }
    }

    if (checkContradictions) {
      issues.push(...checkSelfContradictions(ar));
    }
  }

  if (checkDuplication) {
    issues.push(...checkCrossAngleDuplication(angleResults, duplicateThreshold));
  }

  // Calculate score: start at 100, deduct per issue based on severity.
  // High-severity issues (hallucinations, contradictions) cost 15 points,
  // medium (vagueness) costs 8, and low (minor style) costs 3.
  const deductions = issues.reduce((sum, issue) => {
    switch (issue.severity) {
      case "high":
        return sum + 15;
      case "medium":
        return sum + 8;
      case "low":
        return sum + 3;
      default:
        return sum;
    }
  }, 0);

  const overallScore = Math.max(0, Math.min(100, 100 - deductions));
  const passesGate = overallScore >= minScore;

  const highCount = issues.filter((i) => i.severity === "high").length;
  const medCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  const summary =
    issues.length === 0
      ? `All ${totalIdeas} ideas passed quality checks.`
      : `Found ${issues.length} issue(s) across ${totalIdeas} ideas: ${highCount} high, ${medCount} medium, ${lowCount} low severity.`;

  return {
    overallScore,
    issues,
    passesGate,
    checkedIdeas: totalIdeas,
    summary,
  };
}
