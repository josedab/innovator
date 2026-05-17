/**
 * @module maturity-assessment/learning-paths
 *
 * Learning paths and coaching prompts — maps maturity gaps to specific
 * Innovator features, generates personalized coaching, and tracks
 * skill development progress.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const LearningPathStepSchema = z.object({
  id: z.string(),
  title: z.string().max(300),
  description: z.string().max(1000),
  feature: z.string().max(200),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().min(5).max(120),
  completed: z.boolean().default(false),
  completedAt: z.string().optional(),
});
export type LearningPathStep = z.infer<typeof LearningPathStepSchema>;

export const LearningPathSchema = z.object({
  id: z.string(),
  dimension: z.string().max(200),
  currentLevel: z.number().int().min(1).max(5),
  targetLevel: z.number().int().min(1).max(5),
  steps: z.array(LearningPathStepSchema).max(20),
  progress: z.number().min(0).max(1),
  createdAt: z.string(),
});
export type LearningPath = z.infer<typeof LearningPathSchema>;

export const CoachingPromptSchema = z.object({
  id: z.string(),
  dimension: z.string().max(200),
  level: z.number().int().min(1).max(5),
  prompt: z.string().max(2000),
  context: z.string().max(1000),
  suggestedAction: z.string().max(500),
  feature: z.string().max(200),
});
export type CoachingPrompt = z.infer<typeof CoachingPromptSchema>;

export const FeatureGapMappingSchema = z.object({
  dimension: z.string().max(200),
  gap: z.number().min(0),
  features: z.array(
    z.object({
      feature: z.string().max(200),
      description: z.string().max(500),
      impact: z.enum(["high", "medium", "low"]),
      module: z.string().max(200),
    })
  ),
});
export type FeatureGapMapping = z.infer<typeof FeatureGapMappingSchema>;

// ---- Feature Map ----

const FEATURE_GAP_MAP: Record<
  string,
  Array<{
    feature: string;
    description: string;
    impact: "high" | "medium" | "low";
    module: string;
    minLevel: number;
  }>
> = {
  strategy: [
    {
      feature: "Portfolio Intelligence",
      description: "Use balanced scorecard to align innovation with strategy",
      impact: "high",
      module: "portfolio",
      minLevel: 2,
    },
    {
      feature: "Strategic Alignment",
      description: "Score ideas against strategic goals",
      impact: "high",
      module: "portfolio/strategic-intelligence",
      minLevel: 3,
    },
    {
      feature: "Monte Carlo Simulation",
      description: "Simulate portfolio risk for strategic planning",
      impact: "medium",
      module: "portfolio-optimizer",
      minLevel: 4,
    },
  ],
  process: [
    {
      feature: "Auto Pipeline",
      description: "Automate investigation → ideation → synthesis flow",
      impact: "high",
      module: "innovation",
      minLevel: 2,
    },
    {
      feature: "Sentinel Automation",
      description: "Set up automated signal monitoring and actions",
      impact: "medium",
      module: "sentinel",
      minLevel: 3,
    },
    {
      feature: "Workflow Builder",
      description: "Create custom innovation workflows",
      impact: "medium",
      module: "workflow",
      minLevel: 4,
    },
  ],
  culture: [
    {
      feature: "War Room Sessions",
      description: "Run collaborative innovation sessions",
      impact: "high",
      module: "realtime",
      minLevel: 2,
    },
    {
      feature: "Gamification",
      description: "Drive engagement with innovation challenges",
      impact: "medium",
      module: "gamification",
      minLevel: 3,
    },
    {
      feature: "Team DNA Profiling",
      description: "Understand team innovation strengths",
      impact: "medium",
      module: "team-dna",
      minLevel: 4,
    },
  ],
  resources: [
    {
      feature: "ROI Calculator",
      description: "Quantify innovation investment returns",
      impact: "high",
      module: "roi-calculator",
      minLevel: 2,
    },
    {
      feature: "Cost Optimizer",
      description: "Optimize LLM spend across innovation activities",
      impact: "medium",
      module: "cost-optimizer",
      minLevel: 3,
    },
    {
      feature: "Metering Dashboard",
      description: "Track API and resource consumption",
      impact: "low",
      module: "metering",
      minLevel: 3,
    },
  ],
  metrics: [
    {
      feature: "Analytics Dashboard",
      description: "Track innovation KPIs and trends",
      impact: "high",
      module: "analytics",
      minLevel: 2,
    },
    {
      feature: "Outcome Tracking",
      description: "Track idea → impact lifecycle",
      impact: "high",
      module: "outcome-tracking",
      minLevel: 3,
    },
    {
      feature: "Executive Reports",
      description: "Generate board-ready innovation summaries",
      impact: "medium",
      module: "analytics/executive-report",
      minLevel: 4,
    },
  ],
  tools: [
    {
      feature: "Multi-Modal Input",
      description: "Use images, PDFs, audio as innovation inputs",
      impact: "medium",
      module: "multi-modal",
      minLevel: 2,
    },
    {
      feature: "Knowledge Lake",
      description: "Build searchable knowledge base across sessions",
      impact: "high",
      module: "knowledge-lake",
      minLevel: 3,
    },
    {
      feature: "RAG Pipeline",
      description: "Leverage past sessions for smarter results",
      impact: "medium",
      module: "rag",
      minLevel: 4,
    },
  ],
  knowledge: [
    {
      feature: "Session History",
      description: "Review and learn from past innovation sessions",
      impact: "high",
      module: "history",
      minLevel: 1,
    },
    {
      feature: "Temporal Memory",
      description: "Track concept evolution over time",
      impact: "medium",
      module: "temporal-memory",
      minLevel: 3,
    },
    {
      feature: "Cross-Session Intelligence",
      description: "Detect patterns across sessions",
      impact: "high",
      module: "knowledge-lake",
      minLevel: 4,
    },
  ],
  ecosystem: [
    {
      feature: "API Economy",
      description: "Share innovation capabilities via API",
      impact: "medium",
      module: "api-economy",
      minLevel: 3,
    },
    {
      feature: "Marketplace",
      description: "Discover and share custom angles",
      impact: "medium",
      module: "marketplace",
      minLevel: 3,
    },
    {
      feature: "Federation",
      description: "Cross-org anonymous benchmarking",
      impact: "low",
      module: "federation-dp",
      minLevel: 4,
    },
  ],
};

// ---- Coaching Prompt Generation ----

const COACHING_TEMPLATES: Record<number, string> = {
  1: "You're at the beginning of your {dimension} journey. Start by {action}. This will help you build a foundation for more sophisticated innovation practices.",
  2: "You've made initial progress in {dimension}. Next, focus on {action}. This will move you from ad-hoc to structured approaches.",
  3: "You have solid {dimension} practices. To reach the next level, {action}. This will help you scale and optimize your innovation engine.",
  4: "Your {dimension} maturity is strong. To achieve excellence, {action}. Focus on advanced patterns and cross-cutting optimization.",
  5: "You're at peak {dimension} maturity. Maintain excellence by {action}. Share your practices with others and continue innovating on your process.",
};

/** Generate coaching prompts for a given dimension and level. */
export function generateCoachingPrompts(dimension: string, currentLevel: number): CoachingPrompt[] {
  const features = FEATURE_GAP_MAP[dimension] ?? [];
  const relevantFeatures = features.filter((f) => f.minLevel <= currentLevel + 1);

  return relevantFeatures.map((feature) => {
    const template = COACHING_TEMPLATES[currentLevel] ?? COACHING_TEMPLATES[1];
    const prompt = template
      .replace("{dimension}", dimension)
      .replace("{action}", feature.description.toLowerCase());

    return {
      id: randomUUID(),
      dimension,
      level: currentLevel,
      prompt,
      context: `Current level: ${currentLevel}/5. Target feature: ${feature.feature}`,
      suggestedAction: feature.description,
      feature: feature.feature,
    };
  });
}

// ---- Learning Path Generation ----

/** Generate a learning path for a maturity dimension gap. */
export function generateLearningPath(
  dimension: string,
  currentLevel: number,
  targetLevel: number = Math.min(currentLevel + 1, 5)
): LearningPath {
  const features = FEATURE_GAP_MAP[dimension] ?? [];
  const relevantFeatures = features.filter(
    (f) => f.minLevel > currentLevel && f.minLevel <= targetLevel
  );

  const steps: LearningPathStep[] = relevantFeatures.map((feature, _index) => ({
    id: randomUUID(),
    title: `Learn ${feature.feature}`,
    description: feature.description,
    feature: feature.feature,
    difficulty:
      feature.minLevel <= 2 ? "beginner" : feature.minLevel <= 3 ? "intermediate" : "advanced",
    estimatedMinutes: feature.impact === "high" ? 30 : feature.impact === "medium" ? 20 : 15,
    completed: false,
  }));

  // Add general steps if no specific features
  if (steps.length === 0) {
    steps.push({
      id: randomUUID(),
      title: `Explore ${dimension} capabilities`,
      description: `Review available features related to ${dimension} and run a pilot session`,
      feature: "General",
      difficulty: "beginner",
      estimatedMinutes: 15,
      completed: false,
    });
  }

  return {
    id: randomUUID(),
    dimension,
    currentLevel,
    targetLevel,
    steps,
    progress: 0,
    createdAt: new Date().toISOString(),
  };
}

/** Map maturity gaps to Innovator features. */
export function mapGapsToFeatures(
  dimensionScores: Array<{ dimension: string; score: number; benchmark: number }>
): FeatureGapMapping[] {
  return dimensionScores
    .filter((d) => d.score < d.benchmark)
    .map((d) => {
      const gap = d.benchmark - d.score;
      const features = (FEATURE_GAP_MAP[d.dimension] ?? [])
        .filter((f) => f.minLevel <= Math.ceil(d.benchmark))
        .map((f) => ({
          feature: f.feature,
          description: f.description,
          impact: f.impact,
          module: f.module,
        }));

      return {
        dimension: d.dimension,
        gap: +gap.toFixed(2),
        features,
      };
    })
    .sort((a, b) => b.gap - a.gap);
}

/** Complete a learning path step. */
export function completeStep(path: LearningPath, stepId: string): LearningPath {
  const step = path.steps.find((s) => s.id === stepId);
  if (step && !step.completed) {
    step.completed = true;
    step.completedAt = new Date().toISOString();
    const completedCount = path.steps.filter((s) => s.completed).length;
    path.progress = +(completedCount / path.steps.length).toFixed(3);
  }
  return path;
}

// ---- Evidence-Based Validation ----

export const EvidenceTypeSchema = z.enum([
  "session_count",
  "idea_count",
  "shipped_count",
  "feature_usage",
  "team_participation",
  "documentation",
  "process_adoption",
  "tool_integration",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string(),
  dimension: z.string().max(200),
  type: EvidenceTypeSchema,
  description: z.string().max(500),
  value: z.number(),
  threshold: z.number(),
  met: z.boolean(),
  collectedAt: z.string(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EvidenceValidationResultSchema = z.object({
  dimension: z.string(),
  claimedLevel: z.number().int().min(1).max(5),
  evidenceItems: z.array(EvidenceItemSchema),
  validatedLevel: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  gaps: z.array(z.string().max(300)),
});
export type EvidenceValidationResult = z.infer<typeof EvidenceValidationResultSchema>;

// Dimension-level evidence requirements
const EVIDENCE_REQUIREMENTS: Record<
  string,
  Array<{
    type: EvidenceType;
    description: string;
    thresholds: Record<number, number>; // level -> minimum value
  }>
> = {
  strategy: [
    {
      type: "documentation",
      description: "Innovation strategy documented",
      thresholds: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 },
    },
    {
      type: "session_count",
      description: "Strategic planning sessions",
      thresholds: { 1: 0, 2: 2, 3: 5, 4: 10, 5: 20 },
    },
  ],
  process: [
    {
      type: "session_count",
      description: "Innovation sessions conducted",
      thresholds: { 1: 0, 2: 5, 3: 15, 4: 30, 5: 50 },
    },
    {
      type: "feature_usage",
      description: "Pipeline features used",
      thresholds: { 1: 0, 2: 2, 3: 5, 4: 8, 5: 12 },
    },
  ],
  culture: [
    {
      type: "team_participation",
      description: "Team members participating",
      thresholds: { 1: 1, 2: 3, 3: 5, 4: 10, 5: 20 },
    },
    {
      type: "idea_count",
      description: "Ideas generated by team",
      thresholds: { 1: 0, 2: 10, 3: 30, 4: 80, 5: 200 },
    },
  ],
  metrics: [
    {
      type: "feature_usage",
      description: "Analytics features in use",
      thresholds: { 1: 0, 2: 1, 3: 3, 4: 5, 5: 8 },
    },
    {
      type: "shipped_count",
      description: "Ideas tracked to outcome",
      thresholds: { 1: 0, 2: 2, 3: 5, 4: 15, 5: 30 },
    },
  ],
  tools: [
    {
      type: "tool_integration",
      description: "External tool integrations",
      thresholds: { 1: 0, 2: 1, 3: 2, 4: 4, 5: 6 },
    },
    {
      type: "feature_usage",
      description: "Advanced features adopted",
      thresholds: { 1: 0, 2: 2, 3: 5, 4: 10, 5: 15 },
    },
  ],
  knowledge: [
    {
      type: "session_count",
      description: "Knowledge sessions recorded",
      thresholds: { 1: 0, 2: 5, 3: 15, 4: 30, 5: 60 },
    },
    {
      type: "process_adoption",
      description: "Knowledge management processes",
      thresholds: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 5 },
    },
  ],
  resources: [
    {
      type: "documentation",
      description: "Resource allocation documented",
      thresholds: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 },
    },
    {
      type: "feature_usage",
      description: "Cost/ROI features used",
      thresholds: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 5 },
    },
  ],
  ecosystem: [
    {
      type: "tool_integration",
      description: "Ecosystem connections",
      thresholds: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 5 },
    },
    {
      type: "team_participation",
      description: "Cross-team collaboration",
      thresholds: { 1: 1, 2: 2, 3: 4, 4: 8, 5: 15 },
    },
  ],
};

/**
 * Validate a self-assessed maturity level against evidence.
 * Collects evidence from usage data and determines if the claimed level is justified.
 */
export function validateMaturityLevel(
  dimension: string,
  claimedLevel: number,
  evidence: Array<{ type: EvidenceType; value: number }>
): EvidenceValidationResult {
  const requirements = EVIDENCE_REQUIREMENTS[dimension] ?? [];
  const evidenceItems: EvidenceItem[] = [];
  const gaps: string[] = [];

  let metCount = 0;
  let totalChecks = 0;

  for (const req of requirements) {
    const threshold = req.thresholds[claimedLevel] ?? 0;
    const provided = evidence.find((e) => e.type === req.type);
    const value = provided?.value ?? 0;
    const met = value >= threshold;

    if (met) metCount++;
    totalChecks++;

    evidenceItems.push({
      id: randomUUID(),
      dimension,
      type: req.type,
      description: req.description,
      value,
      threshold,
      met,
      collectedAt: new Date().toISOString(),
    });

    if (!met) {
      gaps.push(`${req.description}: have ${value}, need ${threshold} for level ${claimedLevel}`);
    }
  }

  const confidence = totalChecks > 0 ? +(metCount / totalChecks).toFixed(3) : 0;

  // Determine validated level: highest level where all evidence is met
  let validatedLevel = 1;
  for (let level = claimedLevel; level >= 1; level--) {
    const allMet = requirements.every((req) => {
      const threshold = req.thresholds[level] ?? 0;
      const val = evidence.find((e) => e.type === req.type)?.value ?? 0;
      return val >= threshold;
    });
    if (allMet) {
      validatedLevel = level;
      break;
    }
  }

  return {
    dimension,
    claimedLevel,
    evidenceItems,
    validatedLevel,
    confidence,
    gaps,
  };
}

// ---- Completion Analytics ----

export interface CompletionAnalytics {
  totalPaths: number;
  completedPaths: number;
  averageProgress: number;
  totalSteps: number;
  completedSteps: number;
  stepCompletionRate: number;
  timeToCompletionDays: number | null;
  byDimension: Array<{
    dimension: string;
    progress: number;
    stepsCompleted: number;
    totalSteps: number;
  }>;
}

/** Compute completion analytics across multiple learning paths. */
export function computeCompletionAnalytics(paths: LearningPath[]): CompletionAnalytics {
  if (paths.length === 0) {
    return {
      totalPaths: 0,
      completedPaths: 0,
      averageProgress: 0,
      totalSteps: 0,
      completedSteps: 0,
      stepCompletionRate: 0,
      timeToCompletionDays: null,
      byDimension: [],
    };
  }

  const totalSteps = paths.reduce((s, p) => s + p.steps.length, 0);
  const completedSteps = paths.reduce((s, p) => s + p.steps.filter((st) => st.completed).length, 0);
  const completedPaths = paths.filter((p) => p.progress >= 1).length;
  const avgProgress = paths.reduce((s, p) => s + p.progress, 0) / paths.length;

  // Estimate time to completion from completed steps
  const completedWithTime = paths.flatMap((p) =>
    p.steps.filter((s) => s.completed && s.completedAt)
  );
  let avgDays: number | null = null;
  if (completedWithTime.length > 0) {
    const firstStep = completedWithTime.sort((a, b) =>
      a.completedAt!.localeCompare(b.completedAt!)
    )[0];
    const lastStep = completedWithTime.sort((a, b) =>
      b.completedAt!.localeCompare(a.completedAt!)
    )[0];
    if (firstStep && lastStep) {
      const elapsed =
        new Date(lastStep.completedAt!).getTime() - new Date(firstStep.completedAt!).getTime();
      avgDays = elapsed > 0 ? Math.round(elapsed / 86400000) : 0;
    }
  }

  const byDimension = paths.map((p) => ({
    dimension: p.dimension,
    progress: p.progress,
    stepsCompleted: p.steps.filter((s) => s.completed).length,
    totalSteps: p.steps.length,
  }));

  return {
    totalPaths: paths.length,
    completedPaths,
    averageProgress: +avgProgress.toFixed(3),
    totalSteps,
    completedSteps,
    stepCompletionRate: totalSteps > 0 ? +(completedSteps / totalSteps).toFixed(3) : 0,
    timeToCompletionDays: avgDays,
    byDimension,
  };
}
