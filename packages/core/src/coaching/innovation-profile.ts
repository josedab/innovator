/**
 * @module coaching/innovation-profile
 *
 * Persistent user innovation profile that learns from session history.
 * Tracks patterns, suggests angles based on past successes,
 * identifies blind spots, and provides contextual methodology guidance.
 */

import { randomUUID } from "node:crypto";

// ---- Types ----

export interface InnovationProfile {
  userId: string;
  displayName: string;
  /** Total sessions completed */
  totalSessions: number;
  /** Breakdown of angle usage with success metrics */
  angleHistory: Array<{
    angleId: string;
    timesUsed: number;
    avgIdeaQuality: number;
    lastUsed: string;
    bestIdea?: string;
  }>;
  /** Topics the user explores most */
  topicAffinity: Array<{
    topic: string;
    count: number;
    lastExplored: string;
  }>;
  /** Innovation style indicators */
  style: {
    explorationBreadth: number; // 0-1: low = specialist, high = generalist
    riskTolerance: number; // 0-1: low = conservative, high = radical
    collaborationScore: number; // 0-1: solo vs team preference
    iterationDepth: number; // 0-1: quick vs deep
  };
  /** Identified blind spots (angles/topics rarely explored) */
  blindSpots: string[];
  /** Suggested next experiments */
  recommendations: Array<{
    type: "angle" | "topic" | "method" | "collaboration";
    suggestion: string;
    reason: string;
    priority: "low" | "medium" | "high";
  }>;
  /** Learning path progress */
  learningPath: {
    level: "beginner" | "intermediate" | "advanced" | "expert";
    xp: number;
    nextLevelXp: number;
    completedModules: string[];
    currentModule?: string;
  };
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  sessionId: string;
  subject: string;
  anglesUsed: string[];
  ideaCount: number;
  avgQuality: number;
  duration: number;
  completedAt: string;
  exported: boolean;
}

export interface ProactiveCoachingSuggestion {
  id: string;
  type:
    | "angle-recommendation"
    | "blind-spot-alert"
    | "bias-warning"
    | "experiment-nudge"
    | "methodology-tip";
  title: string;
  message: string;
  actionLabel?: string;
  actionData?: Record<string, unknown>;
  priority: "low" | "medium" | "high";
  dismissable: boolean;
}

// ---- In-Memory Store ----

const profiles = new Map<string, InnovationProfile>();
const sessionHistory = new Map<string, SessionRecord[]>();

// XP thresholds
const LEVEL_THRESHOLDS = {
  beginner: 0,
  intermediate: 100,
  advanced: 500,
  expert: 2000,
};

const LEARNING_MODULES = [
  "intro-investigation",
  "mastering-scamper",
  "first-principles-thinking",
  "cross-domain-innovation",
  "red-teaming-ideas",
  "structured-debate",
  "synthesis-techniques",
  "advanced-workflows",
  "team-collaboration",
  "innovation-portfolio",
];

const ALL_ANGLES = [
  "scamper",
  "first-principles",
  "cross-domain",
  "constraints",
  "inversion",
  "perspectives",
  "what-if",
  "trend-collision",
];

// ---- Profile Management ----

/** Get or create an innovation profile for a user. */
export function getInnovationProfile(userId: string, displayName?: string): InnovationProfile {
  const existing = profiles.get(userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const profile: InnovationProfile = {
    userId,
    displayName: displayName ?? userId,
    totalSessions: 0,
    angleHistory: [],
    topicAffinity: [],
    style: {
      explorationBreadth: 0.5,
      riskTolerance: 0.5,
      collaborationScore: 0.3,
      iterationDepth: 0.5,
    },
    blindSpots: [...ALL_ANGLES],
    recommendations: [],
    learningPath: {
      level: "beginner",
      xp: 0,
      nextLevelXp: LEVEL_THRESHOLDS.intermediate,
      completedModules: [],
      currentModule: LEARNING_MODULES[0],
    },
    createdAt: now,
    updatedAt: now,
  };

  profiles.set(userId, profile);
  return profile;
}

/** Record a completed session and update the profile. */
export function recordSession(userId: string, record: SessionRecord): InnovationProfile {
  const profile = getInnovationProfile(userId);
  const history = sessionHistory.get(userId) ?? [];
  history.push(record);
  if (history.length > 200) history.splice(0, history.length - 200);
  sessionHistory.set(userId, history);

  profile.totalSessions++;
  profile.updatedAt = new Date().toISOString();

  // Update angle history
  for (const angleId of record.anglesUsed) {
    const existing = profile.angleHistory.find((a) => a.angleId === angleId);
    if (existing) {
      existing.timesUsed++;
      existing.avgIdeaQuality =
        (existing.avgIdeaQuality * (existing.timesUsed - 1) + record.avgQuality) /
        existing.timesUsed;
      existing.lastUsed = record.completedAt;
    } else {
      profile.angleHistory.push({
        angleId,
        timesUsed: 1,
        avgIdeaQuality: record.avgQuality,
        lastUsed: record.completedAt,
      });
    }
  }

  // Update topic affinity
  const words = record.subject
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  for (const word of words.slice(0, 5)) {
    const existing = profile.topicAffinity.find((t) => t.topic === word);
    if (existing) {
      existing.count++;
      existing.lastExplored = record.completedAt;
    } else {
      profile.topicAffinity.push({
        topic: word,
        count: 1,
        lastExplored: record.completedAt,
      });
    }
  }
  profile.topicAffinity.sort((a, b) => b.count - a.count);
  if (profile.topicAffinity.length > 30) {
    profile.topicAffinity = profile.topicAffinity.slice(0, 30);
  }

  // Update style indicators
  const usedAngles = new Set(profile.angleHistory.map((a) => a.angleId));
  profile.style.explorationBreadth = usedAngles.size / ALL_ANGLES.length;

  const avgQuality =
    profile.angleHistory.reduce((sum, a) => sum + a.avgIdeaQuality * a.timesUsed, 0) /
    Math.max(profile.totalSessions, 1);
  profile.style.riskTolerance = Math.min(1, avgQuality / 8);

  profile.style.iterationDepth = Math.min(1, record.anglesUsed.length / ALL_ANGLES.length);

  // Update blind spots
  profile.blindSpots = ALL_ANGLES.filter(
    (a) =>
      !usedAngles.has(a) || (profile.angleHistory.find((h) => h.angleId === a)?.timesUsed ?? 0) < 2
  );

  // Update XP and level
  const xpGained = 10 + record.anglesUsed.length * 5 + (record.exported ? 15 : 0);
  profile.learningPath.xp += xpGained;

  if (profile.learningPath.xp >= LEVEL_THRESHOLDS.expert) {
    profile.learningPath.level = "expert";
    profile.learningPath.nextLevelXp = -1;
  } else if (profile.learningPath.xp >= LEVEL_THRESHOLDS.advanced) {
    profile.learningPath.level = "advanced";
    profile.learningPath.nextLevelXp = LEVEL_THRESHOLDS.expert;
  } else if (profile.learningPath.xp >= LEVEL_THRESHOLDS.intermediate) {
    profile.learningPath.level = "intermediate";
    profile.learningPath.nextLevelXp = LEVEL_THRESHOLDS.advanced;
  }

  // Update learning path
  const moduleIndex = Math.min(Math.floor(profile.totalSessions / 3), LEARNING_MODULES.length - 1);
  if (
    moduleIndex > 0 &&
    !profile.learningPath.completedModules.includes(LEARNING_MODULES[moduleIndex - 1])
  ) {
    profile.learningPath.completedModules.push(LEARNING_MODULES[moduleIndex - 1]);
  }
  profile.learningPath.currentModule = LEARNING_MODULES[moduleIndex];

  // Generate recommendations
  profile.recommendations = generateRecommendations(profile, history);

  return profile;
}

function generateRecommendations(
  profile: InnovationProfile,
  history: SessionRecord[]
): InnovationProfile["recommendations"] {
  const recommendations: InnovationProfile["recommendations"] = [];

  // Suggest unexplored angles
  if (profile.blindSpots.length > 0) {
    const topBlindSpot = profile.blindSpots[0];
    recommendations.push({
      type: "angle",
      suggestion: `Try the "${topBlindSpot}" angle`,
      reason: `You haven't explored this angle yet. It could reveal perspectives you're missing.`,
      priority: "high",
    });
  }

  // Suggest based on past successes
  const bestAngle = [...profile.angleHistory].sort(
    (a, b) => b.avgIdeaQuality - a.avgIdeaQuality
  )[0];
  if (bestAngle && bestAngle.timesUsed >= 3) {
    recommendations.push({
      type: "method",
      suggestion: `Double down on "${bestAngle.angleId}"`,
      reason: `This is your highest-quality angle (avg ${bestAngle.avgIdeaQuality.toFixed(1)}/10). Consider combining it with a complementary angle.`,
      priority: "medium",
    });
  }

  // Suggest cross-domain exploration
  if (profile.topicAffinity.length > 3) {
    const topTopic = profile.topicAffinity[0];
    const lessExplored = profile.topicAffinity
      .slice(-3)
      .map((t) => t.topic)
      .join(", ");
    recommendations.push({
      type: "topic",
      suggestion: `Cross-pollinate "${topTopic.topic}" with lesser-explored topics`,
      reason: `You frequently explore "${topTopic.topic}". Combining it with ${lessExplored} could spark novel connections.`,
      priority: "medium",
    });
  }

  // Collaboration suggestion
  if (profile.style.collaborationScore < 0.3 && profile.totalSessions > 5) {
    recommendations.push({
      type: "collaboration",
      suggestion: "Try a collaborative innovation session",
      reason:
        "You tend to work solo. Team sessions often surface perspectives you might miss individually.",
      priority: "low",
    });
  }

  return recommendations.slice(0, 5);
}

// ---- Proactive Coaching ----

/** Generate proactive coaching suggestions based on the current context. */
export function getProactiveCoaching(
  userId: string,
  currentSubject?: string
): ProactiveCoachingSuggestion[] {
  const profile = getInnovationProfile(userId);
  const history = sessionHistory.get(userId) ?? [];
  const suggestions: ProactiveCoachingSuggestion[] = [];

  // Angle recommendation based on subject similarity
  if (currentSubject && history.length > 0) {
    const subjectWords = new Set(
      currentSubject
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
    const similarSessions = history.filter((s) => {
      const sessionWords = s.subject.toLowerCase().split(/\s+/);
      return sessionWords.some((w) => subjectWords.has(w));
    });

    if (similarSessions.length > 0) {
      const bestAngles = new Map<string, number>();
      for (const s of similarSessions) {
        for (const a of s.anglesUsed) {
          bestAngles.set(a, (bestAngles.get(a) ?? 0) + s.avgQuality);
        }
      }
      const topAngle = [...bestAngles.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topAngle) {
        suggestions.push({
          id: randomUUID(),
          type: "angle-recommendation",
          title: "Recommended angle",
          message: `Based on similar past sessions, "${topAngle[0]}" produced the best results for this type of subject.`,
          actionLabel: `Use ${topAngle[0]}`,
          actionData: { angle: topAngle[0] },
          priority: "high",
          dismissable: true,
        });
      }
    }
  }

  // Blind spot alert
  if (profile.blindSpots.length > 3 && profile.totalSessions > 5) {
    suggestions.push({
      id: randomUUID(),
      type: "blind-spot-alert",
      title: "Innovation blind spots detected",
      message: `You haven't explored these angles: ${profile.blindSpots.slice(0, 3).join(", ")}. Try one of them to broaden your perspective.`,
      priority: "medium",
      dismissable: true,
    });
  }

  // Bias warning
  if (profile.angleHistory.length > 2) {
    const mostUsed = [...profile.angleHistory].sort((a, b) => b.timesUsed - a.timesUsed)[0];
    const totalUses = profile.angleHistory.reduce((sum, a) => sum + a.timesUsed, 0);
    if (mostUsed && mostUsed.timesUsed / totalUses > 0.5) {
      suggestions.push({
        id: randomUUID(),
        type: "bias-warning",
        title: "Angle bias detected",
        message: `You use "${mostUsed.angleId}" in ${Math.round((mostUsed.timesUsed / totalUses) * 100)}% of sessions. Diversifying could improve idea novelty.`,
        priority: "medium",
        dismissable: true,
      });
    }
  }

  // Methodology tip
  if (profile.learningPath.currentModule) {
    suggestions.push({
      id: randomUUID(),
      type: "methodology-tip",
      title: `Learning: ${profile.learningPath.currentModule.replace(/-/g, " ")}`,
      message: `You're on the "${profile.learningPath.level}" path. Complete more sessions to unlock advanced techniques.`,
      priority: "low",
      dismissable: true,
    });
  }

  return suggestions;
}

/** Get session history for a user. */
export function getSessionHistory(userId: string): SessionRecord[] {
  return sessionHistory.get(userId) ?? [];
}

/** Clear all coaching data (testing). */
export function clearCoachingProfiles(): void {
  profiles.clear();
  sessionHistory.clear();
}
