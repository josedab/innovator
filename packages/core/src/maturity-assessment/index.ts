/**
 * @module maturity-assessment
 *
 * Innovation Maturity Assessment — self-service organizational innovation
 * maturity assessment based on ISO 56002 standard covering strategy,
 * leadership, culture, processes, tools, and metrics across 5 maturity
 * levels. Includes benchmarking, improvement roadmap generation, and
 * longitudinal progress tracking.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Maturity levels (ISO 56002 inspired). */
export const MaturityLevelSchema = z.enum([
  "ad-hoc",
  "managed",
  "defined",
  "measured",
  "optimizing",
]);
export type MaturityLevel = z.infer<typeof MaturityLevelSchema>;

/** Assessment dimensions based on ISO 56002. */
export const AssessmentDimensionSchema = z.enum([
  "strategy",
  "leadership",
  "culture",
  "processes",
  "tools",
  "metrics",
]);
export type AssessmentDimension = z.infer<typeof AssessmentDimensionSchema>;

/** A single questionnaire question. */
export const QuestionSchema = z.object({
  id: z.string().max(200),
  dimension: AssessmentDimensionSchema,
  text: z.string().max(1000),
  description: z.string().max(2000).optional(),
  options: z
    .array(
      z.object({
        value: z.number().int().min(1).max(5),
        label: z.string().max(200),
        maturityLevel: MaturityLevelSchema,
      })
    )
    .length(5),
});
export type Question = z.infer<typeof QuestionSchema>;

/** A response to a question. */
export const QuestionResponseSchema = z.object({
  questionId: z.string().max(200),
  value: z.number().int().min(1).max(5),
  notes: z.string().max(1000).optional(),
});
export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;

/** Dimension score result. */
export const DimensionScoreSchema = z.object({
  dimension: AssessmentDimensionSchema,
  score: z.number().min(1).max(5),
  level: MaturityLevelSchema,
  questionCount: z.number().int(),
  strengths: z.array(z.string().max(500)).max(5),
  gaps: z.array(z.string().max(500)).max(5),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

/** Full assessment result. */
export const AssessmentResultSchema = z.object({
  id: z.string(),
  organizationId: z.string().max(200),
  overallScore: z.number().min(1).max(5),
  overallLevel: MaturityLevelSchema,
  dimensionScores: z.array(DimensionScoreSchema).length(6),
  responses: z.array(QuestionResponseSchema),
  completedAt: z.string(),
});
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;

/** Benchmark comparison against aggregate data. */
export const BenchmarkDataSchema = z.object({
  dimension: AssessmentDimensionSchema,
  yourScore: z.number().min(1).max(5),
  industryAverage: z.number().min(1).max(5),
  topQuartile: z.number().min(1).max(5),
  percentile: z.number().min(0).max(100),
});
export type BenchmarkData = z.infer<typeof BenchmarkDataSchema>;

/** Improvement recommendation. */
export const ImprovementRecommendationSchema = z.object({
  id: z.string().max(200),
  dimension: AssessmentDimensionSchema,
  currentLevel: MaturityLevelSchema,
  targetLevel: MaturityLevelSchema,
  title: z.string().max(300),
  description: z.string().max(2000),
  innovatorFeatures: z.array(z.string().max(200)).max(10),
  priority: z.enum(["critical", "high", "medium", "low"]),
  effortLevel: z.enum(["low", "medium", "high"]),
});
export type ImprovementRecommendation = z.infer<typeof ImprovementRecommendationSchema>;

/** Improvement roadmap. */
export const RoadmapSchema = z.object({
  assessmentId: z.string(),
  generatedAt: z.string(),
  recommendations: z.array(ImprovementRecommendationSchema).max(30),
  quickWins: z.array(z.string().max(200)).max(10),
  longTermGoals: z.array(z.string().max(200)).max(10),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

/** Progress tracking entry. */
export const ProgressEntrySchema = z.object({
  assessmentId: z.string(),
  overallScore: z.number().min(1).max(5),
  dimensionScores: z.record(z.number()),
  completedAt: z.string(),
});
export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

// ---- Built-in Questionnaire ----

const MATURITY_LEVELS_ORDERED: MaturityLevel[] = [
  "ad-hoc",
  "managed",
  "defined",
  "measured",
  "optimizing",
];

function levelForValue(value: number): MaturityLevel {
  return MATURITY_LEVELS_ORDERED[value - 1] ?? "ad-hoc";
}

export const ASSESSMENT_QUESTIONS: Question[] = [
  // Strategy
  {
    id: "s1",
    dimension: "strategy",
    text: "How well-defined is your organization's innovation strategy?",
    options: [
      { value: 1, label: "No formal innovation strategy exists", maturityLevel: "ad-hoc" },
      { value: 2, label: "Basic innovation goals are documented", maturityLevel: "managed" },
      {
        value: 3,
        label: "Innovation strategy is aligned with business strategy",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "Innovation KPIs are tracked and reviewed regularly",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Strategy continuously adapts based on innovation outcomes",
        maturityLevel: "optimizing",
      },
    ],
  },
  {
    id: "s2",
    dimension: "strategy",
    text: "How does innovation fit into resource allocation?",
    options: [
      { value: 1, label: "No dedicated innovation budget", maturityLevel: "ad-hoc" },
      { value: 2, label: "Ad-hoc innovation funding on project basis", maturityLevel: "managed" },
      {
        value: 3,
        label: "Dedicated innovation budget with approval process",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "Portfolio-based investment with ROI tracking",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Dynamic reallocation based on innovation pipeline metrics",
        maturityLevel: "optimizing",
      },
    ],
  },
  // Leadership
  {
    id: "l1",
    dimension: "leadership",
    text: "How actively does leadership champion innovation?",
    options: [
      { value: 1, label: "Leadership rarely discusses innovation", maturityLevel: "ad-hoc" },
      { value: 2, label: "Leaders verbally support innovation", maturityLevel: "managed" },
      {
        value: 3,
        label: "Leaders actively participate in innovation activities",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "Leaders model innovative behavior and remove barriers",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Innovation is a core leadership competency with accountability",
        maturityLevel: "optimizing",
      },
    ],
  },
  {
    id: "l2",
    dimension: "leadership",
    text: "How does leadership handle innovation failures?",
    options: [
      { value: 1, label: "Failures are punished or blamed", maturityLevel: "ad-hoc" },
      { value: 2, label: "Failures are tolerated but not discussed", maturityLevel: "managed" },
      { value: 3, label: "Failures are analyzed for lessons learned", maturityLevel: "defined" },
      {
        value: 4,
        label: "Failures are celebrated as learning opportunities",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Systematic failure analysis drives process improvement",
        maturityLevel: "optimizing",
      },
    ],
  },
  // Culture
  {
    id: "c1",
    dimension: "culture",
    text: "How does your organization encourage creative thinking?",
    options: [
      { value: 1, label: "Creative thinking is not actively encouraged", maturityLevel: "ad-hoc" },
      { value: 2, label: "Occasional brainstorming sessions", maturityLevel: "managed" },
      {
        value: 3,
        label: "Regular innovation time/hackathons are scheduled",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "Cross-functional collaboration is standard practice",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Innovation is embedded in daily work with dedicated time",
        maturityLevel: "optimizing",
      },
    ],
  },
  {
    id: "c2",
    dimension: "culture",
    text: "How diverse are the perspectives in innovation activities?",
    options: [
      { value: 1, label: "Innovation comes from a small group", maturityLevel: "ad-hoc" },
      { value: 2, label: "Multiple departments contribute occasionally", maturityLevel: "managed" },
      {
        value: 3,
        label: "Cross-functional teams are standard for innovation",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "External perspectives (customers, partners) are included",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Systematic diversity of thought with structured inclusion",
        maturityLevel: "optimizing",
      },
    ],
  },
  // Processes
  {
    id: "p1",
    dimension: "processes",
    text: "How structured is your innovation process?",
    options: [
      { value: 1, label: "No formal innovation process", maturityLevel: "ad-hoc" },
      { value: 2, label: "Basic idea collection exists", maturityLevel: "managed" },
      {
        value: 3,
        label: "Defined stages from ideation to implementation",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "Stage-gate process with metrics at each stage",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Continuously optimized process with feedback loops",
        maturityLevel: "optimizing",
      },
    ],
  },
  {
    id: "p2",
    dimension: "processes",
    text: "How are innovation ideas evaluated and prioritized?",
    options: [
      { value: 1, label: "HiPPO (highest paid person's opinion)", maturityLevel: "ad-hoc" },
      { value: 2, label: "Informal peer review", maturityLevel: "managed" },
      { value: 3, label: "Structured evaluation criteria are defined", maturityLevel: "defined" },
      {
        value: 4,
        label: "Multi-dimensional scoring with data-driven decisions",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "AI-assisted scoring with continuous calibration",
        maturityLevel: "optimizing",
      },
    ],
  },
  // Tools
  {
    id: "t1",
    dimension: "tools",
    text: "What tools support your innovation process?",
    options: [
      { value: 1, label: "Spreadsheets and email", maturityLevel: "ad-hoc" },
      { value: 2, label: "Basic project management tools", maturityLevel: "managed" },
      { value: 3, label: "Dedicated innovation management platform", maturityLevel: "defined" },
      {
        value: 4,
        label: "Integrated tools with analytics and AI assistance",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Adaptive toolset that evolves with innovation maturity",
        maturityLevel: "optimizing",
      },
    ],
  },
  {
    id: "t2",
    dimension: "tools",
    text: "How do you capture and share innovation knowledge?",
    options: [
      { value: 1, label: "Knowledge lives in individuals' heads", maturityLevel: "ad-hoc" },
      { value: 2, label: "Shared documents and wikis", maturityLevel: "managed" },
      { value: 3, label: "Structured knowledge base with search", maturityLevel: "defined" },
      { value: 4, label: "Knowledge graph with cross-referencing", maturityLevel: "measured" },
      {
        value: 5,
        label: "AI-powered knowledge discovery and recommendation",
        maturityLevel: "optimizing",
      },
    ],
  },
  // Metrics
  {
    id: "m1",
    dimension: "metrics",
    text: "How do you measure innovation success?",
    options: [
      { value: 1, label: "No innovation metrics", maturityLevel: "ad-hoc" },
      { value: 2, label: "Count of ideas generated", maturityLevel: "managed" },
      {
        value: 3,
        label: "Pipeline metrics (ideas → prototypes → launches)",
        maturityLevel: "defined",
      },
      {
        value: 4,
        label: "Impact metrics (revenue, efficiency, NPS from innovations)",
        maturityLevel: "measured",
      },
      {
        value: 5,
        label: "Innovation accounting with portfolio-level ROI",
        maturityLevel: "optimizing",
      },
    ],
  },
  {
    id: "m2",
    dimension: "metrics",
    text: "How frequently are innovation metrics reviewed?",
    options: [
      { value: 1, label: "Never or annually at best", maturityLevel: "ad-hoc" },
      { value: 2, label: "Quarterly reviews", maturityLevel: "managed" },
      { value: 3, label: "Monthly innovation reviews", maturityLevel: "defined" },
      { value: 4, label: "Weekly dashboards with automated reporting", maturityLevel: "measured" },
      {
        value: 5,
        label: "Real-time dashboards with predictive analytics",
        maturityLevel: "optimizing",
      },
    ],
  },
];

// ---- In-Memory Stores ----

const assessments = new Map<string, AssessmentResult>();
const roadmaps = new Map<string, Roadmap>();
// Simulated aggregate data for benchmarking
const INDUSTRY_BENCHMARKS: Record<AssessmentDimension, { average: number; topQuartile: number }> = {
  strategy: { average: 2.5, topQuartile: 3.8 },
  leadership: { average: 2.3, topQuartile: 3.5 },
  culture: { average: 2.4, topQuartile: 3.6 },
  processes: { average: 2.2, topQuartile: 3.4 },
  tools: { average: 2.1, topQuartile: 3.3 },
  metrics: { average: 1.9, topQuartile: 3.0 },
};

// ---- Questionnaire ----

/** Get the full assessment questionnaire. */
export function getAssessmentQuestions(): Question[] {
  return [...ASSESSMENT_QUESTIONS];
}

/** Get questions for a specific dimension. */
export function getQuestionsByDimension(dimension: AssessmentDimension): Question[] {
  return ASSESSMENT_QUESTIONS.filter((q) => q.dimension === dimension);
}

// ---- Assessment Scoring ----

/** Score an assessment from responses. */
export function scoreAssessment(
  organizationId: string,
  responses: QuestionResponse[]
): AssessmentResult {
  if (responses.length === 0) throw new Error("No responses provided");

  const dimensions: AssessmentDimension[] = [
    "strategy",
    "leadership",
    "culture",
    "processes",
    "tools",
    "metrics",
  ];
  const dimensionScores: DimensionScore[] = [];

  for (const dimension of dimensions) {
    const dimQuestions = ASSESSMENT_QUESTIONS.filter((q) => q.dimension === dimension);
    const dimResponses = responses.filter((r) => dimQuestions.some((q) => q.id === r.questionId));

    if (dimResponses.length === 0) {
      dimensionScores.push({
        dimension,
        score: 1,
        level: "ad-hoc",
        questionCount: 0,
        strengths: [],
        gaps: ["No responses for this dimension"],
      });
      continue;
    }

    const avgScore = dimResponses.reduce((sum, r) => sum + r.value, 0) / dimResponses.length;
    const level = levelForValue(Math.round(avgScore));

    const strengths: string[] = [];
    const gaps: string[] = [];

    for (const response of dimResponses) {
      const question = dimQuestions.find((q) => q.id === response.questionId);
      if (!question) continue;

      if (response.value >= 4) {
        strengths.push(question.text);
      } else if (response.value <= 2) {
        gaps.push(question.text);
      }
    }

    dimensionScores.push({
      dimension,
      score: Math.round(avgScore * 10) / 10,
      level,
      questionCount: dimResponses.length,
      strengths: strengths.slice(0, 5),
      gaps: gaps.slice(0, 5),
    });
  }

  const overallScore =
    dimensionScores.reduce((sum, ds) => sum + ds.score, 0) / dimensionScores.length;
  const overallLevel = levelForValue(Math.round(overallScore));

  const result: AssessmentResult = {
    id: randomUUID(),
    organizationId,
    overallScore: Math.round(overallScore * 10) / 10,
    overallLevel,
    dimensionScores,
    responses,
    completedAt: new Date().toISOString(),
  };

  assessments.set(result.id, result);
  return result;
}

// ---- Benchmarking ----

/** Benchmark assessment results against industry aggregates. */
export function benchmarkAssessment(assessmentId: string): BenchmarkData[] {
  const assessment = assessments.get(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

  return assessment.dimensionScores.map((ds) => {
    const benchmark = INDUSTRY_BENCHMARKS[ds.dimension];
    const percentile = Math.min(100, Math.max(0, ((ds.score - 1) / 4) * 100));

    return {
      dimension: ds.dimension,
      yourScore: ds.score,
      industryAverage: benchmark.average,
      topQuartile: benchmark.topQuartile,
      percentile: Math.round(percentile),
    };
  });
}

// ---- Roadmap Generation ----

/** Feature mapping: which Innovator features help at each maturity level. */
const FEATURE_MAP: Record<AssessmentDimension, Record<MaturityLevel, string[]>> = {
  strategy: {
    "ad-hoc": ["Innovation Pipeline", "Presets"],
    managed: ["Portfolio Manager", "Scoring Engine"],
    defined: ["ROI Calculator", "Business Case Generator"],
    measured: ["Analytics Dashboard", "Outcome Tracking"],
    optimizing: ["Adaptive Model Router", "Trend Radar"],
  },
  leadership: {
    "ad-hoc": ["Innovation Digest", "Sharing"],
    managed: ["Collaboration Sessions", "Sprint Automation"],
    defined: ["Debate Engine", "Peer Review Network"],
    measured: ["Gamification", "Leaderboards"],
    optimizing: ["Cross-Org Benchmarking", "Team DNA"],
  },
  culture: {
    "ad-hoc": ["Playground", "Quick Sprint"],
    managed: ["Angle Studio", "Custom Angles"],
    defined: ["Innovation Sprints", "Hackathon Templates"],
    measured: ["Serendipity Engine", "Cross-Domain Transfer"],
    optimizing: ["Curriculum", "Coaching Module"],
  },
  processes: {
    "ad-hoc": ["Auto Pipeline", "Pipeline Builder"],
    managed: ["Workflow Orchestration", "Chaining"],
    defined: ["Quality Gates", "Validation"],
    measured: ["Process Mining", "Outcome Prediction"],
    optimizing: ["Self-Healing Pipeline", "Continuous Improvement"],
  },
  tools: {
    "ad-hoc": ["CLI Tool", "Web Interface"],
    managed: ["MCP Server", "Plugin System"],
    defined: ["Data Connectors", "Knowledge Graph"],
    measured: ["Embeddings", "RAG Module"],
    optimizing: ["Multi-Modal Input", "Vision Module"],
  },
  metrics: {
    "ad-hoc": ["Basic Analytics", "Event Tracking"],
    managed: ["Scoring Engine", "Priority Matrix"],
    defined: ["Reports Module", "Digest"],
    measured: ["Trend Radar", "Observatory"],
    optimizing: ["Outcome Prediction", "Innovation Accounting"],
  },
};

/** Generate an improvement roadmap based on assessment results. */
export async function generateRoadmap(
  assessmentId: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<Roadmap> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

  const recommendations: ImprovementRecommendation[] = [];

  for (const ds of assessment.dimensionScores) {
    const currentIndex = MATURITY_LEVELS_ORDERED.indexOf(ds.level);
    if (currentIndex >= 4) continue; // Already at optimizing

    const targetLevel = MATURITY_LEVELS_ORDERED[currentIndex + 1];
    const features = FEATURE_MAP[ds.dimension]?.[targetLevel] ?? [];

    const priority =
      currentIndex === 0
        ? "critical"
        : currentIndex === 1
          ? "high"
          : currentIndex === 2
            ? "medium"
            : "low";
    const effort = currentIndex <= 1 ? "low" : currentIndex <= 2 ? "medium" : "high";

    for (const gap of ds.gaps) {
      recommendations.push({
        id: `rec-${ds.dimension}-${randomUUID().slice(0, 8)}`,
        dimension: ds.dimension,
        currentLevel: ds.level,
        targetLevel,
        title: `Address: ${gap.slice(0, 100)}`,
        description: `Improve from ${ds.level} to ${targetLevel} by addressing: ${gap}`,
        innovatorFeatures: features,
        priority,
        effortLevel: effort,
      });
    }

    // Add a general recommendation if no specific gaps
    if (ds.gaps.length === 0) {
      recommendations.push({
        id: `rec-${ds.dimension}-general`,
        dimension: ds.dimension,
        currentLevel: ds.level,
        targetLevel,
        title: `Advance ${ds.dimension} to ${targetLevel}`,
        description: `General improvement path for ${ds.dimension} dimension.`,
        innovatorFeatures: features,
        priority,
        effortLevel: effort,
      });
    }
  }

  // LLM-enhanced roadmap insights
  let quickWins: string[] = [];
  let longTermGoals: string[] = [];

  try {
    const prompt = `You are an innovation maturity consultant. Based on this assessment:

Overall Level: ${assessment.overallLevel} (${assessment.overallScore}/5)
${assessment.dimensionScores.map((ds) => `${ds.dimension}: ${ds.level} (${ds.score}/5)`).join("\n")}

Provide JSON: { "quickWins": ["3-5 immediate actions"], "longTermGoals": ["3-5 strategic goals"] }`;

    const raw = await withRetry(() =>
      generateText({
        prompt: sanitizeLlmOutput(prompt),
        model: options?.model,
        signal: options?.signal,
      })
    );

    const parsed = (() => {
      try {
        return JSON.parse(extractJson(raw)) as { quickWins: string[]; longTermGoals: string[] };
      } catch {
        return undefined;
      }
    })();
    if (parsed) {
      quickWins = parsed.quickWins?.slice(0, 10) ?? [];
      longTermGoals = parsed.longTermGoals?.slice(0, 10) ?? [];
    }
  } catch {
    quickWins = ["Start using structured innovation pipeline"];
    longTermGoals = ["Achieve measured maturity across all dimensions"];
  }

  const roadmap: Roadmap = {
    assessmentId,
    generatedAt: new Date().toISOString(),
    recommendations: recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    quickWins,
    longTermGoals,
  };

  roadmaps.set(assessmentId, roadmap);
  return roadmap;
}

// ---- Progress Tracking ----

/** Get assessment history for an organization (for longitudinal tracking). */
export function getAssessmentHistory(organizationId: string): ProgressEntry[] {
  return [...assessments.values()]
    .filter((a) => a.organizationId === organizationId)
    .map((a) => ({
      assessmentId: a.id,
      overallScore: a.overallScore,
      dimensionScores: Object.fromEntries(a.dimensionScores.map((ds) => [ds.dimension, ds.score])),
      completedAt: a.completedAt,
    }))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

/** Check if a re-assessment is due (quarterly). */
export function isReassessmentDue(organizationId: string): boolean {
  const history = getAssessmentHistory(organizationId);
  if (history.length === 0) return true;
  const lastAssessment = history[history.length - 1];
  const daysSinceLastAssessment =
    (Date.now() - new Date(lastAssessment.completedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLastAssessment >= 90; // 90 days = quarterly
}

/** Get an assessment result. */
export function getAssessmentResult(assessmentId: string): AssessmentResult | undefined {
  return assessments.get(assessmentId);
}

/** Get a roadmap. */
export function getRoadmap(assessmentId: string): Roadmap | undefined {
  return roadmaps.get(assessmentId);
}

// ---- Store Management ----

/** Clear all maturity assessment data (for testing). */
export function clearMaturityAssessmentData(): void {
  assessments.clear();
  roadmaps.clear();
}
