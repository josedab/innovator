/**
 * @module benchmark/problems
 *
 * Standardized benchmark problems across 5 domains with scoring rubrics,
 * reference outputs, benchmark runner, and public leaderboard support.
 */

import { z } from "zod";

// ---- Schemas ----

export const BenchmarkDomainSchema = z.enum([
  "technology",
  "healthcare",
  "sustainability",
  "education",
  "finance",
]);

export const ScoringRubricSchema = z.object({
  criterion: z.string().max(200),
  weight: z.number().min(0).max(1),
  description: z.string().max(500),
  exemplarScore10: z.string().max(500),
  exemplarScore5: z.string().max(500),
  exemplarScore1: z.string().max(500),
});

export const BenchmarkProblemSchema = z.object({
  id: z.string().max(100),
  domain: BenchmarkDomainSchema,
  title: z.string().max(300),
  description: z.string().max(2000),
  subject: z.string().max(500),
  expectedAngles: z.array(z.string().max(100)).optional(),
  rubrics: z.array(ScoringRubricSchema),
  referenceIdeas: z.array(
    z.object({
      title: z.string().max(300),
      quality: z.enum(["excellent", "good", "mediocre"]),
      scores: z.record(z.number()),
    })
  ),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string().max(100)),
});

export const BenchmarkRunResultSchema = z.object({
  problemId: z.string().max(100),
  model: z.string().max(100),
  angles: z.array(z.string().max(100)),
  scores: z.record(z.number()),
  overallScore: z.number().min(0).max(10),
  ideaCount: z.number().int().min(0),
  latencyMs: z.number().min(0),
  tokensUsed: z.number().int().min(0).optional(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1),
  model: z.string().max(100),
  configuration: z.string().max(300),
  averageScore: z.number().min(0).max(10),
  problemsCompleted: z.number().int().min(0),
  totalLatencyMs: z.number().min(0),
  submittedAt: z.string(),
  submittedBy: z.string().max(200).optional(),
});

export type BenchmarkDomain = z.infer<typeof BenchmarkDomainSchema>;
export type ScoringRubric = z.infer<typeof ScoringRubricSchema>;
export type BenchmarkProblem = z.infer<typeof BenchmarkProblemSchema>;
export type BenchmarkRunResult = z.infer<typeof BenchmarkRunResultSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

// ---- Default Scoring Rubrics ----

const DEFAULT_RUBRICS: ScoringRubric[] = [
  {
    criterion: "novelty",
    weight: 0.25,
    description: "How original and non-obvious are the ideas?",
    exemplarScore10: "Completely novel approach never seen before in this domain",
    exemplarScore5: "Interesting twist on existing approaches",
    exemplarScore1: "Obvious rehash of well-known solutions",
  },
  {
    criterion: "feasibility",
    weight: 0.25,
    description: "How realistic and implementable are the ideas?",
    exemplarScore10: "Can be built with existing technology and reasonable resources",
    exemplarScore5: "Requires some R&D but fundamentally achievable",
    exemplarScore1: "Requires technology that doesn't exist yet",
  },
  {
    criterion: "impact",
    weight: 0.25,
    description: "What is the potential impact if implemented?",
    exemplarScore10: "Could transform the entire industry/domain",
    exemplarScore5: "Meaningful improvement for significant user base",
    exemplarScore1: "Negligible impact, marginal improvement",
  },
  {
    criterion: "specificity",
    weight: 0.25,
    description: "How concrete and actionable are the ideas?",
    exemplarScore10: "Includes specific implementation steps, metrics, and timeline",
    exemplarScore5: "Clear concept with some implementation details",
    exemplarScore1: "Vague platitudes without actionable direction",
  },
];

// ---- Standardized Problems (20 across 5 domains) ----

export const BENCHMARK_PROBLEMS: BenchmarkProblem[] = [
  // Technology (4 problems)
  {
    id: "tech-01",
    domain: "technology",
    difficulty: "easy",
    title: "Developer Productivity Tools",
    description:
      "Generate innovative ideas for improving software developer productivity through new tools, workflows, or AI-assisted development.",
    subject: "improving software developer productivity",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "AI pair programmer with contextual code understanding",
        quality: "excellent",
        scores: { novelty: 8, feasibility: 9, impact: 9, specificity: 8 },
      },
      {
        title: "Better IDE plugins",
        quality: "mediocre",
        scores: { novelty: 2, feasibility: 9, impact: 3, specificity: 2 },
      },
    ],
    tags: ["software", "tools", "AI"],
  },
  {
    id: "tech-02",
    domain: "technology",
    difficulty: "medium",
    title: "Edge Computing Applications",
    description:
      "Explore innovative applications of edge computing for IoT, autonomous vehicles, and real-time processing.",
    subject: "novel applications of edge computing beyond current use cases",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Distributed ML inference mesh for autonomous drone swarms",
        quality: "excellent",
        scores: { novelty: 9, feasibility: 6, impact: 8, specificity: 7 },
      },
      {
        title: "Run apps closer to users",
        quality: "mediocre",
        scores: { novelty: 1, feasibility: 9, impact: 3, specificity: 1 },
      },
    ],
    tags: ["edge", "IoT", "distributed"],
  },
  {
    id: "tech-03",
    domain: "technology",
    difficulty: "hard",
    title: "Post-Quantum Cryptography Transition",
    description:
      "Innovate on strategies and tools to help organizations transition to post-quantum cryptographic standards.",
    subject: "managing the transition to post-quantum cryptography in enterprise systems",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Automated crypto-agility framework with hybrid key negotiation",
        quality: "excellent",
        scores: { novelty: 8, feasibility: 7, impact: 9, specificity: 9 },
      },
    ],
    tags: ["security", "cryptography", "quantum"],
  },
  {
    id: "tech-04",
    domain: "technology",
    difficulty: "medium",
    title: "API Design Innovation",
    description: "Rethink how APIs are designed, documented, versioned, and consumed.",
    subject: "next-generation API design patterns and developer experience",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Intent-based APIs that accept natural language queries",
        quality: "excellent",
        scores: { novelty: 9, feasibility: 6, impact: 8, specificity: 7 },
      },
    ],
    tags: ["API", "DX", "design"],
  },
  // Healthcare (4 problems)
  {
    id: "health-01",
    domain: "healthcare",
    difficulty: "easy",
    title: "Mental Health Support Technology",
    description:
      "Innovate on technology-based solutions for mental health support and early intervention.",
    subject: "technology solutions for mental health support and early intervention",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Passive mood tracking via smartphone sensor fusion",
        quality: "excellent",
        scores: { novelty: 7, feasibility: 8, impact: 9, specificity: 8 },
      },
    ],
    tags: ["mental-health", "mobile", "AI"],
  },
  {
    id: "health-02",
    domain: "healthcare",
    difficulty: "medium",
    title: "Clinical Trial Recruitment",
    description:
      "Improve clinical trial recruitment, matching, and retention using innovative approaches.",
    subject: "accelerating clinical trial recruitment and improving participant diversity",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Federated patient matching across health systems with privacy preservation",
        quality: "excellent",
        scores: { novelty: 8, feasibility: 6, impact: 9, specificity: 7 },
      },
    ],
    tags: ["clinical-trials", "recruitment", "diversity"],
  },
  {
    id: "health-03",
    domain: "healthcare",
    difficulty: "hard",
    title: "Personalized Medicine Pipeline",
    description:
      "Design innovative approaches to personalized medicine using genomics, proteomics, and AI.",
    subject: "end-to-end personalized medicine pipelines from diagnosis to treatment",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["genomics", "personalized", "AI"],
  },
  {
    id: "health-04",
    domain: "healthcare",
    difficulty: "medium",
    title: "Hospital Operations Optimization",
    description:
      "Optimize hospital operations including scheduling, resource allocation, and patient flow.",
    subject: "hospital operations optimization using AI and real-time data",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["operations", "scheduling", "optimization"],
  },
  // Sustainability (4 problems)
  {
    id: "sustain-01",
    domain: "sustainability",
    difficulty: "easy",
    title: "Circular Economy in Tech",
    description:
      "Innovate on circular economy principles applied to technology hardware and software.",
    subject: "applying circular economy principles to consumer technology products",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Component-level repairability scoring and marketplace for modular parts",
        quality: "excellent",
        scores: { novelty: 7, feasibility: 8, impact: 8, specificity: 8 },
      },
    ],
    tags: ["circular-economy", "hardware", "waste"],
  },
  {
    id: "sustain-02",
    domain: "sustainability",
    difficulty: "medium",
    title: "Carbon Capture Innovation",
    description: "Explore novel approaches to carbon capture, storage, and utilization.",
    subject: "affordable and scalable carbon capture solutions for small businesses",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["carbon", "climate", "engineering"],
  },
  {
    id: "sustain-03",
    domain: "sustainability",
    difficulty: "hard",
    title: "Biodiversity Monitoring at Scale",
    description:
      "Design technology solutions for real-time biodiversity monitoring and conservation.",
    subject: "scalable biodiversity monitoring using AI, drones, and environmental DNA",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["biodiversity", "monitoring", "conservation"],
  },
  {
    id: "sustain-04",
    domain: "sustainability",
    difficulty: "medium",
    title: "Sustainable Supply Chain",
    description: "Innovate on supply chain transparency and sustainability verification.",
    subject: "end-to-end supply chain sustainability tracking and verification",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["supply-chain", "transparency", "verification"],
  },
  // Education (4 problems)
  {
    id: "edu-01",
    domain: "education",
    difficulty: "easy",
    title: "Adaptive Learning Systems",
    description:
      "Innovate on personalized, adaptive learning experiences for K-12 and higher education.",
    subject: "adaptive learning systems that personalize education at scale",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Knowledge graph-based learning paths with mastery detection",
        quality: "excellent",
        scores: { novelty: 7, feasibility: 8, impact: 9, specificity: 8 },
      },
    ],
    tags: ["adaptive", "personalization", "K-12"],
  },
  {
    id: "edu-02",
    domain: "education",
    difficulty: "medium",
    title: "Skills Assessment Innovation",
    description: "Rethink how skills and competencies are assessed, verified, and communicated.",
    subject: "next-generation skills assessment and credentialing beyond traditional grades",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["assessment", "credentials", "skills"],
  },
  {
    id: "edu-03",
    domain: "education",
    difficulty: "hard",
    title: "Lifelong Learning Infrastructure",
    description: "Design systems that support continuous learning throughout a person's career.",
    subject:
      "infrastructure for lifelong learning with employer-education institution partnerships",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["lifelong-learning", "career", "partnerships"],
  },
  {
    id: "edu-04",
    domain: "education",
    difficulty: "medium",
    title: "Peer Learning at Scale",
    description: "Innovate on peer-to-peer learning models that work at massive scale.",
    subject: "peer learning platforms that maintain quality at scale",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["peer-learning", "scale", "collaboration"],
  },
  // Finance (4 problems)
  {
    id: "fin-01",
    domain: "finance",
    difficulty: "easy",
    title: "Financial Literacy Tools",
    description: "Create innovative tools for improving financial literacy across demographics.",
    subject: "gamified financial literacy tools for young adults",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [
      {
        title: "Social investing simulator with real market data and peer challenges",
        quality: "excellent",
        scores: { novelty: 7, feasibility: 9, impact: 8, specificity: 9 },
      },
    ],
    tags: ["financial-literacy", "gamification", "education"],
  },
  {
    id: "fin-02",
    domain: "finance",
    difficulty: "medium",
    title: "RegTech Innovation",
    description: "Innovate on regulatory technology for compliance automation and risk management.",
    subject: "AI-powered regulatory compliance automation for fintech startups",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["regtech", "compliance", "automation"],
  },
  {
    id: "fin-03",
    domain: "finance",
    difficulty: "hard",
    title: "Decentralized Finance Risk Management",
    description: "Design risk management solutions for DeFi protocols and cross-chain operations.",
    subject: "risk assessment and management tools for decentralized finance protocols",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["DeFi", "risk", "blockchain"],
  },
  {
    id: "fin-04",
    domain: "finance",
    difficulty: "medium",
    title: "Inclusive Banking Innovation",
    description: "Create solutions for financial inclusion in underbanked communities.",
    subject: "banking services innovation for underbanked and unbanked populations",
    rubrics: DEFAULT_RUBRICS,
    referenceIdeas: [],
    tags: ["inclusion", "underbanked", "access"],
  },
];

// ---- Benchmark Runner ----

const benchmarkResults: BenchmarkRunResult[] = [];
const leaderboard: LeaderboardEntry[] = [];

/** Get all benchmark problems. */
export function getBenchmarkProblems(): BenchmarkProblem[] {
  return [...BENCHMARK_PROBLEMS];
}

/** Get problems filtered by domain or difficulty. */
export function filterBenchmarkProblems(options: {
  domain?: BenchmarkDomain;
  difficulty?: BenchmarkProblem["difficulty"];
  tags?: string[];
}): BenchmarkProblem[] {
  return BENCHMARK_PROBLEMS.filter((p) => {
    if (options.domain && p.domain !== options.domain) return false;
    if (options.difficulty && p.difficulty !== options.difficulty) return false;
    if (options.tags && !options.tags.some((t) => p.tags.includes(t))) return false;
    return true;
  });
}

/** Get a benchmark problem by ID. */
export function getBenchmarkProblem(id: string): BenchmarkProblem | undefined {
  return BENCHMARK_PROBLEMS.find((p) => p.id === id);
}

/** Record a benchmark run result with validation. */
export function recordBenchmarkResult(result: BenchmarkRunResult): void {
  BenchmarkRunResultSchema.parse(result);
  benchmarkResults.push(result);
}

/** Get results for a specific problem. */
export function getBenchmarkResults(problemId: string): BenchmarkRunResult[] {
  return benchmarkResults.filter((r) => r.problemId === problemId);
}

/** Get all benchmark results. */
export function getAllBenchmarkResults(): BenchmarkRunResult[] {
  return [...benchmarkResults];
}

/**
 * Score a benchmark run against the problem's rubrics.
 */
export function scoreBenchmarkRun(
  problemId: string,
  scores: Record<string, number>
): { overallScore: number; weightedScores: Record<string, number> } {
  const problem = BENCHMARK_PROBLEMS.find((p) => p.id === problemId);
  if (!problem) throw new Error(`Problem not found: ${problemId}`);

  const weightedScores: Record<string, number> = {};
  let overallScore = 0;

  for (const rubric of problem.rubrics) {
    const score = scores[rubric.criterion] ?? 0;
    const weighted = score * rubric.weight;
    weightedScores[rubric.criterion] = Math.round(weighted * 100) / 100;
    overallScore += weighted;
  }

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    weightedScores,
  };
}

// ---- Leaderboard ----

/** Submit to the leaderboard. */
export function submitToLeaderboard(
  model: string,
  configuration: string,
  results: BenchmarkRunResult[],
  submittedBy?: string
): LeaderboardEntry {
  const avgScore =
    results.length > 0 ? results.reduce((s, r) => s + r.overallScore, 0) / results.length : 0;
  const totalLatency = results.reduce((s, r) => s + r.latencyMs, 0);

  const entry: LeaderboardEntry = {
    rank: 0,
    model,
    configuration,
    averageScore: Math.round(avgScore * 100) / 100,
    problemsCompleted: results.length,
    totalLatencyMs: totalLatency,
    submittedAt: new Date().toISOString(),
    submittedBy,
  };

  leaderboard.push(entry);

  // Re-rank
  leaderboard.sort((a, b) => b.averageScore - a.averageScore);
  leaderboard.forEach((e, i) => {
    e.rank = i + 1;
  });

  return entry;
}

/** Get the leaderboard. */
export function getLeaderboardEntries(limit: number = 50): LeaderboardEntry[] {
  return leaderboard.slice(0, limit);
}

/** Generate a benchmark comparison report. */
export function benchmarkComparisonReport(results: BenchmarkRunResult[]): string {
  const lines: string[] = ["# Benchmark Comparison Report", ""];

  const byModel = new Map<string, BenchmarkRunResult[]>();
  for (const r of results) {
    const existing = byModel.get(r.model) ?? [];
    existing.push(r);
    byModel.set(r.model, existing);
  }

  lines.push("| Model | Problems | Avg Score | Avg Latency |");
  lines.push("|-------|----------|-----------|-------------|");

  for (const [model, modelResults] of byModel) {
    const avgScore = modelResults.reduce((s, r) => s + r.overallScore, 0) / modelResults.length;
    const avgLatency = modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length;
    lines.push(
      `| ${model} | ${modelResults.length} | ${avgScore.toFixed(2)} | ${avgLatency.toFixed(0)}ms |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

/** Clear all benchmark state (for testing). */
export function clearBenchmarkState(): void {
  benchmarkResults.length = 0;
  leaderboard.length = 0;
}
