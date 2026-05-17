import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { CANONICAL_FAILURE_PATTERNS } from "./patterns.js";
import {
  FailureMatchSchema,
  type FailurePattern,
  type FailureMatch,
  type FailureAnalysisResult,
  type FailureLibraryConfig,
  type UserReportedFailure,
} from "./types.js";

const userReportedPatterns: FailurePattern[] = [];

/** Simple TF-IDF-like term similarity between two texts. */
function computeTermSimilarity(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap++;
  }

  return overlap / Math.sqrt(tokensA.size * tokensB.size);
}

/** Get all patterns including user-reported ones converted to standard patterns. */
export function getAllPatterns(): FailurePattern[] {
  return [...CANONICAL_FAILURE_PATTERNS, ...userReportedPatterns];
}

/** Find failure patterns matching a given idea description using term similarity. */
export function findSimilarPatterns(
  ideaDescription: string,
  config: FailureLibraryConfig = {}
): FailureMatch[] {
  const maxMatches = config.maxMatches ?? 5;
  const minSimilarity = config.minSimilarity ?? 0.1;
  const patterns = getAllPatterns();
  const categoryFilter = config.categories;

  const scored = patterns
    .filter((p) => !categoryFilter || categoryFilter.includes(p.category))
    .map((pattern) => {
      const patternText = [
        pattern.title,
        pattern.description,
        ...pattern.symptoms,
        pattern.rootCause,
        ...pattern.tags,
      ].join(" ");

      const score = computeTermSimilarity(ideaDescription, patternText);

      const matchedSymptoms = pattern.symptoms.filter(
        (s) => computeTermSimilarity(ideaDescription, s) > 0.05
      );

      return {
        pattern,
        similarityScore: score,
        matchedSymptoms,
        riskLevel: (score > 0.3
          ? "critical"
          : score > 0.2
            ? "high"
            : score > 0.1
              ? "medium"
              : "low") as "low" | "medium" | "high" | "critical",
        mitigationAdvice: pattern.preventionStrategies.join("; "),
      };
    })
    .filter((m) => m.similarityScore >= minSimilarity)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, maxMatches);

  return scored;
}

/** Analyze an idea against the failure library using LLM-enhanced matching. */
export async function analyzeFailureRisk(
  ideaTitle: string,
  ideaDescription: string,
  config: FailureLibraryConfig = {}
): Promise<FailureAnalysisResult> {
  // First pass: term-based matching
  const termMatches = findSimilarPatterns(`${ideaTitle} ${ideaDescription}`, config);

  // Second pass: LLM-enhanced analysis
  const topPatterns = termMatches.slice(0, 10);
  const patternSummaries = topPatterns
    .map((m) => `- "${m.pattern.title}" (${m.pattern.category}): ${m.pattern.description}`)
    .join("\n");

  const prompt = `Analyze this innovation idea for failure risks:
Title: ${ideaTitle}
Description: ${ideaDescription}

Potentially relevant failure patterns from our library:
${patternSummaries}

For each relevant pattern, score the match (0-1), identify matched symptoms, assess risk level, and provide specific mitigation advice for THIS idea.
Also provide an overall risk score (0-1) and summary.

Respond in JSON:
{
  "matches": [
    {
      "patternTitle": "...",
      "similarityScore": 0.0-1.0,
      "matchedSymptoms": ["..."],
      "riskLevel": "low" | "medium" | "high" | "critical",
      "mitigationAdvice": "specific advice for this idea"
    }
  ],
  "overallRiskScore": 0.0-1.0,
  "riskSummary": "...",
  "recommendations": ["..."]
}`;

  const llmResult = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      return JSON.parse(extractJson(raw));
    },
    { signal: config.signal }
  );

  const enhancedMatches: FailureMatch[] = (llmResult.matches ?? [])
    .map(
      (m: {
        patternTitle?: string;
        similarityScore?: number;
        matchedSymptoms?: string[];
        riskLevel?: string;
        mitigationAdvice?: string;
      }) => {
        const matchedPattern =
          topPatterns.find(
            (tp) => tp.pattern.title.toLowerCase() === (m.patternTitle ?? "").toLowerCase()
          )?.pattern ?? topPatterns[0]?.pattern;

        if (!matchedPattern) return null;

        return FailureMatchSchema.parse({
          pattern: matchedPattern,
          similarityScore: m.similarityScore ?? 0,
          matchedSymptoms: m.matchedSymptoms ?? [],
          riskLevel: m.riskLevel ?? "low",
          mitigationAdvice: m.mitigationAdvice ?? "",
        });
      }
    )
    .filter(Boolean) as FailureMatch[];

  return {
    ideaTitle,
    matches: enhancedMatches,
    overallRiskScore: llmResult.overallRiskScore ?? 0,
    riskSummary: llmResult.riskSummary ?? "",
    recommendations: llmResult.recommendations ?? [],
  };
}

/** Report a user-experienced failure to add to the learning library. */
export function reportFailure(failure: UserReportedFailure): FailurePattern {
  const pattern: FailurePattern = {
    id: `user-${failure.id}`,
    title: failure.title,
    category: failure.category,
    description: failure.description,
    symptoms: failure.lessonsLearned,
    rootCause: "User-reported: see description",
    realWorldExamples: [],
    preventionStrategies: failure.lessonsLearned,
    severity: "medium",
    frequency: "occasional",
    tags: ["user-reported", failure.category],
  };

  userReportedPatterns.push(pattern);
  return pattern;
}

/** Get failure patterns by category. */
export function getPatternsByCategory(category: string): FailurePattern[] {
  return getAllPatterns().filter((p) => p.category === category);
}

/** Convert a failure analysis result to markdown. */
export function failureAnalysisToMarkdown(result: FailureAnalysisResult): string {
  const lines: string[] = [
    "# Failure Risk Analysis",
    "",
    `**Idea:** ${result.ideaTitle}`,
    `**Overall Risk Score:** ${(result.overallRiskScore * 100).toFixed(0)}%`,
    "",
    "## Risk Summary",
    "",
    result.riskSummary,
    "",
  ];

  if (result.matches.length > 0) {
    lines.push("## Matched Failure Patterns", "");
    for (const match of result.matches) {
      lines.push(`### ${match.pattern.title} (${match.riskLevel})`);
      lines.push(
        `**Similarity:** ${(match.similarityScore * 100).toFixed(0)}% | **Category:** ${match.pattern.category}`
      );
      lines.push(`**Description:** ${match.pattern.description}`);
      if (match.matchedSymptoms.length > 0) {
        lines.push(`**Matched Symptoms:** ${match.matchedSymptoms.join("; ")}`);
      }
      lines.push(`**Mitigation:** ${match.mitigationAdvice}`);
      lines.push("");
    }
  }

  if (result.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    result.recommendations.forEach((r) => lines.push(`- ${r}`));
  }

  return lines.join("\n");
}
