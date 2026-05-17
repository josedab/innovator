import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AutonomousRun } from "./types.js";

export const ConfidenceAssessmentSchema = z.object({
  overall: z.number().min(0).max(1),
  dataQuality: z.number().min(0).max(1),
  marketFit: z.number().min(0).max(1),
  feasibility: z.number().min(0).max(1),
  reasoning: z.string().max(2000),
});
export type ConfidenceAssessment = z.infer<typeof ConfidenceAssessmentSchema>;

export const StrategyDocumentSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  objective: z.string().max(2000),
  executiveSummary: z.string().max(5000),
  sections: z
    .array(
      z.object({
        title: z.string().max(500),
        content: z.string().max(10000),
        confidence: z.number().min(0).max(1),
      })
    )
    .max(20),
  topRecommendations: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        impact: z.enum(["high", "medium", "low"]),
        effort: z.enum(["high", "medium", "low"]),
        priority: z.number().int().min(1).max(10),
      })
    )
    .max(10),
  confidenceAssessment: ConfidenceAssessmentSchema,
  generatedAt: z.string(),
});
export type StrategyDocument = z.infer<typeof StrategyDocumentSchema>;

type StrategySection = StrategyDocument["sections"][number];
type StrategyRecommendation = StrategyDocument["topRecommendations"][number];
type CandidateIdea = {
  title: string;
  description: string;
  score: number;
  feasibility: "low" | "medium" | "high";
  source: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function collectCandidateIdeas(run: AutonomousRun): CandidateIdea[] {
  const portfolioIdeas: CandidateIdea[] = (run.portfolio?.topIdeas ?? []).map((idea) => ({
    title: idea.title,
    description: idea.description,
    score: idea.score,
    feasibility: idea.feasibility as CandidateIdea["feasibility"],
    source: idea.sourceSubject,
  }));
  const branchIdeas = run.branches.flatMap((branch) =>
    branch.ideas.map((idea) => ({
      title: idea.title,
      description: idea.description,
      score: idea.score ?? 60,
      feasibility: ((idea.score ?? 60) >= 80
        ? "high"
        : (idea.score ?? 60) >= 60
          ? "medium"
          : "low") as CandidateIdea["feasibility"],
      source: branch.subject,
    }))
  );

  return [...portfolioIdeas, ...branchIdeas].filter(
    (idea, index, ideas) => ideas.findIndex((candidate) => candidate.title === idea.title) === index
  );
}

function buildRecommendations(run: AutonomousRun): StrategyRecommendation[] {
  return collectCandidateIdeas(run)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((idea, index) => ({
      title: idea.title,
      description: `${idea.description} Source: ${idea.source}.`.slice(0, 2000),
      impact: idea.score >= 80 ? "high" : idea.score >= 60 ? "medium" : "low",
      effort:
        idea.feasibility === "high" ? "low" : idea.feasibility === "medium" ? "medium" : "high",
      priority: clamp(10 - index, 1, 10),
    }));
}

export function assessConfidence(run: AutonomousRun): ConfidenceAssessment {
  const completedBranches = run.branches.filter((branch) => branch.status === "completed");
  const branchCompletionRatio =
    run.branches.length > 0 ? completedBranches.length / run.branches.length : 0;
  const scoredIdeas = collectCandidateIdeas(run).map((idea) => idea.score / 100);
  const highFeasibilityRatio = average(
    collectCandidateIdeas(run).map((idea) =>
      idea.feasibility === "high" ? 1 : idea.feasibility === "medium" ? 0.65 : 0.35
    )
  );
  const decisionDensity = run.branches.length > 0 ? run.decisions.length / run.branches.length : 0;

  const dataQuality = clamp(
    branchCompletionRatio * 0.6 + Math.min(0.4, decisionDensity * 0.1),
    0,
    1
  );
  const marketFit = clamp(
    average(scoredIdeas) * 0.7 + Math.min(0.3, (run.portfolio?.themes.length ?? 0) * 0.06),
    0,
    1
  );
  const feasibility = clamp(
    highFeasibilityRatio * 0.8 + (run.status === "completed" ? 0.2 : 0),
    0,
    1
  );
  const overall = clamp(dataQuality * 0.35 + marketFit * 0.35 + feasibility * 0.3, 0, 1);

  const reasoning = [
    `${completedBranches.length} of ${run.branches.length} branches reached completion.`,
    `${collectCandidateIdeas(run).length} distinct ideas were available for synthesis.`,
    run.portfolio
      ? `Portfolio themes (${run.portfolio.themes.length}) improved strategic cohesion.`
      : "Confidence is lower because no final portfolio was available.",
  ].join(" ");

  return ConfidenceAssessmentSchema.parse({
    overall,
    dataQuality,
    marketFit,
    feasibility,
    reasoning,
  });
}

export function generateStrategyDocument(run: AutonomousRun): StrategyDocument {
  const confidenceAssessment = assessConfidence(run);
  const candidateIdeas = collectCandidateIdeas(run);
  const topRecommendations = buildRecommendations(run);
  const sections: StrategySection[] = [
    {
      title: "Exploration Overview",
      content: `The run explored ${run.branches.length} branches under ${run.rootSubject}. ${run.branches.filter((branch) => branch.status === "completed").length} branches completed and produced ${candidateIdeas.length} distinct ideas.`,
      confidence: confidenceAssessment.dataQuality,
    },
    {
      title: "Themes and Signals",
      content: run.portfolio?.themes.length
        ? `Repeated themes included: ${run.portfolio.themes.join(", ")}. These themes surfaced across the strongest branches and should anchor follow-up experiments.`
        : "No explicit portfolio themes were available, so patterns were inferred from branch-level ideas only.",
      confidence: confidenceAssessment.marketFit,
    },
    {
      title: "Execution Guidance",
      content:
        topRecommendations.length > 0
          ? `Recommended next steps: ${topRecommendations
              .slice(0, 3)
              .map((recommendation) => recommendation.title)
              .join(", ")}. Focus first on ideas with strong scores and lower effort profiles.`
          : "No recommendations could be produced because the run did not yield durable ideas.",
      confidence: confidenceAssessment.feasibility,
    },
  ].map((section) => ({
    ...section,
    content: section.content.slice(0, 10000),
  }));

  const executiveSummary = [
    `Objective: ${run.rootSubject}.`,
    topRecommendations[0]
      ? `The top recommendation is ${topRecommendations[0].title}, which combines ${topRecommendations[0].impact} impact with ${topRecommendations[0].effort} effort.`
      : "The run needs stronger ideas before a recommendation can be actioned.",
    `Overall confidence is ${(confidenceAssessment.overall * 100).toFixed(0)}%.`,
  ].join(" ");

  return StrategyDocumentSchema.parse({
    id: `strategy-${randomUUID().slice(0, 12)}`,
    title: `Strategy Document: ${run.rootSubject}`,
    objective: run.rootSubject,
    executiveSummary,
    sections,
    topRecommendations,
    confidenceAssessment,
    generatedAt: new Date().toISOString(),
  });
}

export function strategyDocToMarkdown(doc: StrategyDocument): string {
  const lines: string[] = [
    `# ${doc.title}`,
    "",
    `**Objective:** ${doc.objective}`,
    `**Generated:** ${doc.generatedAt}`,
    "",
    "## Executive Summary",
    "",
    doc.executiveSummary,
    "",
    "## Confidence",
    "",
    `- Overall: ${(doc.confidenceAssessment.overall * 100).toFixed(0)}%`,
    `- Data Quality: ${(doc.confidenceAssessment.dataQuality * 100).toFixed(0)}%`,
    `- Market Fit: ${(doc.confidenceAssessment.marketFit * 100).toFixed(0)}%`,
    `- Feasibility: ${(doc.confidenceAssessment.feasibility * 100).toFixed(0)}%`,
    `- Reasoning: ${doc.confidenceAssessment.reasoning}`,
    "",
    "## Sections",
    "",
  ];

  for (const section of doc.sections) {
    lines.push(`### ${section.title}`);
    lines.push(`*Confidence: ${(section.confidence * 100).toFixed(0)}%*`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
  }

  lines.push("## Top Recommendations", "");
  for (const recommendation of doc.topRecommendations) {
    lines.push(
      `- **P${recommendation.priority}: ${recommendation.title}** — ${recommendation.description} (${recommendation.impact} impact / ${recommendation.effort} effort)`
    );
  }

  return lines.join("\n");
}

export function strategyDocToExecutiveBrief(doc: StrategyDocument): string {
  const topThree = doc.topRecommendations.slice(0, 3);
  return [
    `# Executive Brief: ${doc.objective}`,
    "",
    doc.executiveSummary,
    "",
    `**Confidence:** ${(doc.confidenceAssessment.overall * 100).toFixed(0)}% overall`,
    "",
    "## Immediate Priorities",
    "",
    ...topThree.map(
      (recommendation) =>
        `- P${recommendation.priority}: ${recommendation.title} (${recommendation.impact} impact / ${recommendation.effort} effort)`
    ),
    "",
    "## Watchouts",
    "",
    `- ${doc.confidenceAssessment.reasoning}`,
    `- ${doc.sections[1]?.content ?? "Pattern coverage is still emerging."}`,
  ].join("\n");
}
