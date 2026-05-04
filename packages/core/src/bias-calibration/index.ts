/**
 * @module bias-calibration
 *
 * Analyzes user investigation patterns across sessions to detect
 * 8 cognitive biases. Auto-injects counter-prompts when bias is
 * detected, shows Bias Risk indicators on results, and provides
 * a bias dashboard with team view and gamified debiasing challenges.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---- Bias Types ----

export const COGNITIVE_BIASES = [
  "confirmation",
  "anchoring",
  "availability-heuristic",
  "groupthink",
  "sunk-cost",
  "status-quo",
  "dunning-kruger",
  "framing-effect",
] as const;

export type CognitiveBiasId = (typeof COGNITIVE_BIASES)[number];

export const BiasDefinitionSchema = z.object({
  id: z.enum(COGNITIVE_BIASES),
  name: z.string().max(200),
  description: z.string().max(1000),
  detectionPattern: z.string().max(1000),
  counterPrompt: z.string().max(2000),
  debiasingSuggestions: z.array(z.string().max(500)).max(5),
});

export type BiasDefinition = z.infer<typeof BiasDefinitionSchema>;

/** Built-in definitions for all 8 tracked biases. */
export const BIAS_DEFINITIONS: Record<CognitiveBiasId, BiasDefinition> = {
  confirmation: {
    id: "confirmation",
    name: "Confirmation Bias",
    description:
      "Tendency to search for, interpret, and recall information that confirms pre-existing beliefs.",
    detectionPattern:
      "User repeatedly selects same angles, ignores contradicting evidence, searches for validating information only.",
    counterPrompt:
      "Challenge your assumptions: What evidence would DISPROVE this idea? Consider the strongest argument against your current direction.",
    debiasingSuggestions: [
      "Actively seek out dissenting perspectives",
      "Use the Red Team angle to challenge your ideas",
      "Present your idea to someone who disagrees",
    ],
  },
  anchoring: {
    id: "anchoring",
    name: "Anchoring Bias",
    description:
      "Over-reliance on the first piece of information encountered when making decisions.",
    detectionPattern:
      "User consistently scores first-generated ideas highest, rarely revises initial assessments.",
    counterPrompt:
      "Your first impression may be anchoring your judgment. Re-evaluate this idea from scratch, ignoring your initial reaction.",
    debiasingSuggestions: [
      "Score ideas before reading detailed descriptions",
      "Randomize the order you review ideas",
      "Have someone else independently score the same ideas",
    ],
  },
  "availability-heuristic": {
    id: "availability-heuristic",
    name: "Availability Heuristic",
    description: "Overweighting easily recalled or recent information when estimating probability.",
    detectionPattern:
      "User favors ideas similar to recent successes or trending topics, ignores base rates.",
    counterPrompt:
      "Are you favoring this because it's familiar or because it's actually the best option? Consider less obvious alternatives.",
    debiasingSuggestions: [
      "Review historical data, not just recent examples",
      "Consider base rates and statistical evidence",
      "Explore unfamiliar innovation angles",
    ],
  },
  groupthink: {
    id: "groupthink",
    name: "Groupthink",
    description: "Desire for conformity in a group overrides realistic appraisal of alternatives.",
    detectionPattern:
      "Team always reaches consensus quickly, no dissenting votes, ideas cluster around safe choices.",
    counterPrompt:
      "Encourage dissent: Assign someone to play devil's advocate. What would a newcomer with fresh eyes think about this direction?",
    debiasingSuggestions: [
      "Require anonymous idea scoring before discussion",
      "Assign a rotating devil's advocate role",
      "Include diverse perspectives from outside the team",
    ],
  },
  "sunk-cost": {
    id: "sunk-cost",
    name: "Sunk Cost Fallacy",
    description:
      "Continuing investment in something because of previously invested resources rather than future value.",
    detectionPattern:
      "User keeps refining same ideas despite low scores, reluctant to retire old initiatives.",
    counterPrompt:
      "Would you start this idea from scratch today? Evaluate it based on future potential, not past investment.",
    debiasingSuggestions: [
      "Set kill criteria before starting any project",
      "Regularly review pipeline with fresh eyes",
      "Ask: 'If we hadn't started this, would we start it now?'",
    ],
  },
  "status-quo": {
    id: "status-quo",
    name: "Status Quo Bias",
    description:
      "Preference for the current state of affairs, resistance to change even when beneficial.",
    detectionPattern:
      "User consistently selects incremental improvements over transformative ideas, avoids disruptive angles.",
    counterPrompt:
      "What if the current approach didn't exist? Would you build this from scratch the same way? Consider more radical alternatives.",
    debiasingSuggestions: [
      "Force-rank disruptive ideas alongside incremental ones",
      "Use the First Principles angle more often",
      "Imagine you're a competitor trying to disrupt yourself",
    ],
  },
  "dunning-kruger": {
    id: "dunning-kruger",
    name: "Dunning-Kruger Effect",
    description: "Overestimation of one's own competence in unfamiliar domains.",
    detectionPattern:
      "High confidence scores in domains with minimal investigation, rapid decisions without depth exploration.",
    counterPrompt:
      "How well do you really understand this domain? Consider consulting domain experts or doing deeper research before finalizing.",
    debiasingSuggestions: [
      "Rate your domain expertise honestly before evaluating ideas",
      "Seek expert review for unfamiliar domains",
      "Use Deep Research mode for areas outside your expertise",
    ],
  },
  "framing-effect": {
    id: "framing-effect",
    name: "Framing Effect",
    description:
      "Drawing different conclusions from the same information depending on how it's presented.",
    detectionPattern:
      "User scores depend heavily on how ideas are titled, positive framing gets higher scores than equivalent negative framing.",
    counterPrompt:
      "Try reframing this idea: What if you described the same concept focusing on risks instead of opportunities? Would your assessment change?",
    debiasingSuggestions: [
      "Evaluate ideas with different framings (positive/negative/neutral)",
      "Focus on quantitative metrics rather than qualitative descriptions",
      "Strip emotional language before scoring",
    ],
  },
};

// ---- Session Activity Tracking ----

export const UserActivitySchema = z.object({
  userId: z.string().max(100),
  sessionId: z.string().max(100),
  timestamp: z.string(),
  action: z.enum([
    "investigate",
    "select-angle",
    "score-idea",
    "refine-idea",
    "dismiss-idea",
    "vote",
    "search",
    "filter",
    "compare",
    "export",
  ]),
  data: z.record(z.string().max(100), z.unknown()).optional(),
});

export type UserActivity = z.infer<typeof UserActivitySchema>;

// ---- Bias Detection Results ----

export const BiasDetectionSchema = z.object({
  biasId: z.enum(COGNITIVE_BIASES),
  biasName: z.string().max(200),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(500)).max(10),
  counterPrompt: z.string().max(2000),
  severity: z.enum(["low", "medium", "high"]),
});

export type BiasDetection = z.infer<typeof BiasDetectionSchema>;

export const BiasAnalysisSchema = z.object({
  userId: z.string().max(100),
  analyzedAt: z.string(),
  sessionCount: z.number().int().min(0),
  activityCount: z.number().int().min(0),
  detectedBiases: z.array(BiasDetectionSchema).max(8),
  overallBiasRisk: z.number().min(0).max(100),
  riskLevel: z.enum(["low", "moderate", "high", "critical"]),
  recommendations: z.array(z.string().max(500)).max(10),
});

export type BiasAnalysis = z.infer<typeof BiasAnalysisSchema>;

// ---- Debiasing Challenges ----

export const DebiasingChallengeSchema = z.object({
  id: z.string().max(100),
  biasId: z.enum(COGNITIVE_BIASES),
  title: z.string().max(300),
  description: z.string().max(1000),
  task: z.string().max(2000),
  points: z.number().int().min(0).max(1000),
  status: z.enum(["available", "in-progress", "completed"]),
  completedAt: z.string().optional(),
});

export type DebiasingChallenge = z.infer<typeof DebiasingChallengeSchema>;

// ---- Team Bias Dashboard ----

export const TeamBiasDashboardSchema = z.object({
  teamId: z.string().max(100),
  generatedAt: z.string(),
  memberAnalyses: z
    .array(
      z.object({
        userId: z.string().max(100),
        overallBiasRisk: z.number().min(0).max(100),
        topBiases: z.array(z.enum(COGNITIVE_BIASES)).max(3),
        challengesCompleted: z.number().int().min(0),
      })
    )
    .max(100),
  teamBiasProfile: z
    .array(
      z.object({
        biasId: z.enum(COGNITIVE_BIASES),
        prevalence: z.number().min(0).max(1),
        avgConfidence: z.number().min(0).max(1),
      })
    )
    .max(8),
  teamRiskScore: z.number().min(0).max(100),
  teamRecommendations: z.array(z.string().max(500)).max(10),
});

export type TeamBiasDashboard = z.infer<typeof TeamBiasDashboardSchema>;

// ---- In-Memory Store ----

const activityLog = new Map<string, UserActivity[]>();
const analyses = new Map<string, BiasAnalysis>();
const challenges = new Map<string, DebiasingChallenge[]>();

// ---- Functions ----

/** Record a user activity for bias tracking. */
export function recordBiasActivity(activity: UserActivity): void {
  UserActivitySchema.parse(activity);
  const existing = activityLog.get(activity.userId) ?? [];
  existing.push(activity);
  // Bounded store: keep last 5000 activities per user
  if (existing.length > 5000) existing.splice(0, existing.length - 5000);
  activityLog.set(activity.userId, existing);
}

/** Record multiple activities at once. */
export function recordBiasActivities(activities: UserActivity[]): void {
  for (const activity of activities) {
    recordBiasActivity(activity);
  }
}

/** Get all recorded activities for a user. */
export function getUserActivities(userId: string): UserActivity[] {
  return activityLog.get(userId) ?? [];
}

/** Analyze a user's activity history for cognitive biases using LLM. */
export async function analyzeBiases(
  userId: string,
  model?: string,
  signal?: AbortSignal
): Promise<BiasAnalysis> {
  const activities = activityLog.get(userId) ?? [];
  if (activities.length === 0) {
    return {
      userId,
      analyzedAt: new Date().toISOString(),
      sessionCount: 0,
      activityCount: 0,
      detectedBiases: [],
      overallBiasRisk: 0,
      riskLevel: "low",
      recommendations: ["Insufficient data. Continue using Innovator to enable bias analysis."],
    };
  }

  const sessions = new Set(activities.map((a) => a.sessionId));
  const actionCounts: Record<string, number> = {};
  for (const a of activities) {
    actionCounts[a.action] = (actionCounts[a.action] ?? 0) + 1;
  }

  // Summarize patterns for LLM analysis
  const angleCounts: Record<string, number> = {};
  const scoringPatterns: { order: number; score: number }[] = [];
  for (const a of activities) {
    if (a.action === "select-angle" && a.data?.angleId) {
      const aId = String(a.data.angleId);
      angleCounts[aId] = (angleCounts[aId] ?? 0) + 1;
    }
    if (a.action === "score-idea" && a.data?.score !== undefined) {
      scoringPatterns.push({
        order: a.data.order ? Number(a.data.order) : scoringPatterns.length,
        score: Number(a.data.score),
      });
    }
  }

  const prompt = `You are a cognitive bias analyst. Analyze these user behavior patterns from an innovation platform and detect any of these 8 biases: confirmation, anchoring, availability-heuristic, groupthink, sunk-cost, status-quo, dunning-kruger, framing-effect.

## User Activity Summary
- Total activities: ${activities.length}
- Sessions: ${sessions.size}
- Action breakdown: ${JSON.stringify(actionCounts)}
- Angle selection frequency: ${JSON.stringify(angleCounts)}
- Scoring patterns (order→score): ${JSON.stringify(scoringPatterns.slice(0, 20))}
- Dismiss rate: ${(((actionCounts["dismiss-idea"] ?? 0) / Math.max(actionCounts["score-idea"] ?? 1, 1)) * 100).toFixed(0)}%
- Refine rate: ${(((actionCounts["refine-idea"] ?? 0) / Math.max(actionCounts["score-idea"] ?? 1, 1)) * 100).toFixed(0)}%

For each detected bias, provide confidence (0-1), evidence, and severity.

Respond in JSON:
{
  "detectedBiases": [{ "biasId": "string", "biasName": "string", "confidence": 0-1, "evidence": ["string"], "severity": "low|medium|high" }],
  "overallBiasRisk": 0-100,
  "recommendations": ["string"]
}`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));

  const detectedBiases: BiasDetection[] = (parsed.detectedBiases ?? []).map(
    (b: {
      biasId: CognitiveBiasId;
      biasName: string;
      confidence: number;
      evidence: string[];
      severity: string;
    }) => ({
      biasId: b.biasId,
      biasName: b.biasName ?? BIAS_DEFINITIONS[b.biasId]?.name ?? b.biasId,
      confidence: b.confidence ?? 0.5,
      evidence: b.evidence ?? [],
      counterPrompt:
        BIAS_DEFINITIONS[b.biasId]?.counterPrompt ?? "Consider alternative viewpoints.",
      severity: b.severity ?? "medium",
    })
  );

  const riskScore = parsed.overallBiasRisk ?? 0;
  const analysis: BiasAnalysis = {
    userId,
    analyzedAt: new Date().toISOString(),
    sessionCount: sessions.size,
    activityCount: activities.length,
    detectedBiases,
    overallBiasRisk: riskScore,
    riskLevel:
      riskScore >= 75
        ? "critical"
        : riskScore >= 50
          ? "high"
          : riskScore >= 25
            ? "moderate"
            : "low",
    recommendations: parsed.recommendations ?? [],
  };

  const validated = BiasAnalysisSchema.parse(analysis);
  analyses.set(userId, validated);
  return validated;
}

/** Get the most recent bias analysis for a user. */
export function getBiasAnalysis(userId: string): BiasAnalysis | undefined {
  return analyses.get(userId);
}

/** Get the counter-prompt for a detected bias (for auto-injection into results). */
export function getCounterPrompt(biasId: CognitiveBiasId): string {
  return BIAS_DEFINITIONS[biasId]?.counterPrompt ?? "Consider alternative perspectives.";
}

/** Generate debiasing challenges for a user based on their bias profile. */
export function generateDebiasingChallenges(userId: string): DebiasingChallenge[] {
  const analysis = analyses.get(userId);
  if (!analysis || analysis.detectedBiases.length === 0) return [];

  let challengeId = 0;
  const userChallenges: DebiasingChallenge[] = analysis.detectedBiases.flatMap((bias) => {
    const def = BIAS_DEFINITIONS[bias.biasId];
    if (!def) return [];
    return def.debiasingSuggestions.map((suggestion, i) => ({
      id: `debiasing-${userId}-${bias.biasId}-${++challengeId}`,
      biasId: bias.biasId,
      title: `${def.name} Challenge ${i + 1}`,
      description: `Overcome ${def.name.toLowerCase()} tendency`,
      task: suggestion,
      points: bias.severity === "high" ? 100 : bias.severity === "medium" ? 50 : 25,
      status: "available" as const,
    }));
  });

  challenges.set(userId, userChallenges);
  return userChallenges;
}

/** Complete a debiasing challenge. */
export function completeDebiasingChallenge(
  userId: string,
  challengeId: string
): DebiasingChallenge | undefined {
  const userChallenges = challenges.get(userId);
  if (!userChallenges) return undefined;

  const challenge = userChallenges.find((c) => c.id === challengeId);
  if (!challenge || challenge.status === "completed") return undefined;

  challenge.status = "completed";
  challenge.completedAt = new Date().toISOString();
  return challenge;
}

/** Build a team bias dashboard from individual analyses. */
export function buildTeamBiasDashboard(teamId: string, memberIds: string[]): TeamBiasDashboard {
  const memberAnalyses = memberIds.map((userId) => {
    const analysis = analyses.get(userId);
    const userChallenges = challenges.get(userId) ?? [];
    return {
      userId,
      overallBiasRisk: analysis?.overallBiasRisk ?? 0,
      topBiases: (analysis?.detectedBiases ?? [])
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map((b) => b.biasId),
      challengesCompleted: userChallenges.filter((c) => c.status === "completed").length,
    };
  });

  // Aggregate team bias profile
  const biasAccumulator: Record<CognitiveBiasId, { count: number; totalConfidence: number }> =
    {} as Record<CognitiveBiasId, { count: number; totalConfidence: number }>;
  for (const bias of COGNITIVE_BIASES) {
    biasAccumulator[bias] = { count: 0, totalConfidence: 0 };
  }

  for (const userId of memberIds) {
    const analysis = analyses.get(userId);
    if (!analysis) continue;
    for (const detected of analysis.detectedBiases) {
      biasAccumulator[detected.biasId].count++;
      biasAccumulator[detected.biasId].totalConfidence += detected.confidence;
    }
  }

  const teamBiasProfile = COGNITIVE_BIASES.map((biasId) => ({
    biasId,
    prevalence: memberIds.length > 0 ? biasAccumulator[biasId].count / memberIds.length : 0,
    avgConfidence:
      biasAccumulator[biasId].count > 0
        ? biasAccumulator[biasId].totalConfidence / biasAccumulator[biasId].count
        : 0,
  }));

  const teamRiskScore =
    memberAnalyses.length > 0
      ? Math.round(
          memberAnalyses.reduce((s, m) => s + m.overallBiasRisk, 0) / memberAnalyses.length
        )
      : 0;

  const topTeamBiases = teamBiasProfile
    .filter((b) => b.prevalence > 0.3)
    .sort((a, b) => b.prevalence - a.prevalence);

  const teamRecommendations: string[] = [];
  if (topTeamBiases.length > 0) {
    teamRecommendations.push(
      `Team shows high prevalence of ${topTeamBiases.map((b) => BIAS_DEFINITIONS[b.biasId].name).join(", ")}. Consider team-wide debiasing exercises.`
    );
  }
  if (teamRiskScore > 50) {
    teamRecommendations.push(
      "Implement mandatory counter-perspective reviews before finalizing decisions."
    );
  }

  return TeamBiasDashboardSchema.parse({
    teamId,
    generatedAt: new Date().toISOString(),
    memberAnalyses,
    teamBiasProfile,
    teamRiskScore,
    teamRecommendations,
  });
}

/** Clear all bias calibration data. */
export function clearBiasCalibrationData(): void {
  activityLog.clear();
  analyses.clear();
  challenges.clear();
}
