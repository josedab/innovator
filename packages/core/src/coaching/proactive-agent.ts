/**
 * @module coaching/proactive-agent
 *
 * Proactive coaching agent that learns team patterns,
 * suggests angles based on past successes, identifies blind spots,
 * and recommends next experiments. Provides context-aware suggestions
 * before, during, and after innovation sessions.
 */

import { randomUUID } from "node:crypto";
import type { InnovationProfile, ProactiveCoachingSuggestion } from "./innovation-profile.js";
import { getInnovationProfile, getSessionHistory } from "./innovation-profile.js";

// ---- Team Profile ----

export interface TeamInnovationProfile {
  teamId: string;
  name: string;
  memberIds: string[];
  aggregatedProfile: {
    totalSessions: number;
    avgIdeaQuality: number;
    mostUsedAngles: Array<{ angleId: string; count: number; avgQuality: number }>;
    leastUsedAngles: string[];
    topTopics: Array<{ topic: string; count: number }>;
    innovationVelocity: number;
    diversityScore: number;
    collaborationRate: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{
    type: "team-exercise" | "skill-gap" | "process-improvement" | "experiment";
    suggestion: string;
    reason: string;
    priority: "low" | "medium" | "high";
  }>;
  lastUpdated: string;
}

export interface CoachingInsight {
  id: string;
  type: "pattern" | "trend" | "anomaly" | "opportunity";
  title: string;
  description: string;
  evidence: string[];
  actionable: boolean;
  suggestedAction?: string;
  confidence: number;
  createdAt: string;
}

// ---- In-Memory Store ----

const teamProfiles = new Map<string, TeamInnovationProfile>();

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

// ---- Team Profile Management ----

/** Build or update a team innovation profile from member profiles. */
export function buildTeamProfile(
  teamId: string,
  teamName: string,
  memberIds: string[]
): TeamInnovationProfile {
  const memberProfiles: InnovationProfile[] = memberIds.map((id) => getInnovationProfile(id));

  const allAngleHistory = new Map<string, { count: number; qualitySum: number }>();
  let totalSessions = 0;
  let qualitySum = 0;
  let sessionCount = 0;
  const allTopics = new Map<string, number>();

  for (const profile of memberProfiles) {
    totalSessions += profile.totalSessions;
    for (const ah of profile.angleHistory) {
      const existing = allAngleHistory.get(ah.angleId) ?? { count: 0, qualitySum: 0 };
      existing.count += ah.timesUsed;
      existing.qualitySum += ah.avgIdeaQuality * ah.timesUsed;
      allAngleHistory.set(ah.angleId, existing);
      sessionCount += ah.timesUsed;
      qualitySum += ah.avgIdeaQuality * ah.timesUsed;
    }
    for (const ta of profile.topicAffinity) {
      allTopics.set(ta.topic, (allTopics.get(ta.topic) ?? 0) + ta.count);
    }
  }

  const mostUsedAngles = [...allAngleHistory.entries()]
    .map(([angleId, data]) => ({
      angleId,
      count: data.count,
      avgQuality: data.count > 0 ? data.qualitySum / data.count : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const usedAngleIds = new Set(allAngleHistory.keys());
  const leastUsedAngles = ALL_ANGLES.filter(
    (a) => !usedAngleIds.has(a) || (allAngleHistory.get(a)?.count ?? 0) < 2
  );

  const topTopics = [...allTopics.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const diversityScore = usedAngleIds.size / ALL_ANGLES.length;
  const avgQuality = sessionCount > 0 ? qualitySum / sessionCount : 0;

  // Calculate collaboration rate
  const membersWithSessions = memberProfiles.filter((p) => p.totalSessions > 0).length;
  const collaborationRate = memberIds.length > 0 ? membersWithSessions / memberIds.length : 0;

  // Innovation velocity (sessions per member per month, estimated)
  const innovationVelocity = memberIds.length > 0 ? totalSessions / memberIds.length : 0;

  // Identify strengths and weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (diversityScore > 0.7) strengths.push("High angle diversity across team");
  if (diversityScore < 0.3)
    weaknesses.push("Limited angle diversity — team uses few innovation angles");
  if (avgQuality > 7) strengths.push("Consistently high idea quality");
  if (avgQuality < 4) weaknesses.push("Below-average idea quality — consider coaching sessions");
  if (collaborationRate > 0.8) strengths.push("High team engagement");
  if (collaborationRate < 0.3) weaknesses.push("Low team participation — most members inactive");
  if (mostUsedAngles.length > 0 && mostUsedAngles[0].avgQuality > 7) {
    strengths.push(`Strong in ${mostUsedAngles[0].angleId} angle`);
  }
  if (leastUsedAngles.length > 4) weaknesses.push("Many unexplored angles — blind spots likely");

  // Generate recommendations
  const recommendations: TeamInnovationProfile["recommendations"] = [];

  if (leastUsedAngles.length > 0) {
    recommendations.push({
      type: "experiment",
      suggestion: `Team workshop using "${leastUsedAngles[0]}" angle`,
      reason: `This angle is underused by the team. A workshop could unlock new perspectives.`,
      priority: "high",
    });
  }

  if (collaborationRate < 0.5) {
    recommendations.push({
      type: "team-exercise",
      suggestion: "Run a collaborative innovation sprint",
      reason: `Only ${Math.round(collaborationRate * 100)}% of team members are active. A group session could boost engagement.`,
      priority: "high",
    });
  }

  if (diversityScore < 0.5) {
    recommendations.push({
      type: "skill-gap",
      suggestion: "Angle diversity training",
      reason:
        "The team relies on a narrow set of innovation angles. Training on new methods would broaden capabilities.",
      priority: "medium",
    });
  }

  const profile: TeamInnovationProfile = {
    teamId,
    name: teamName,
    memberIds,
    aggregatedProfile: {
      totalSessions,
      avgIdeaQuality: avgQuality,
      mostUsedAngles,
      leastUsedAngles,
      topTopics,
      innovationVelocity,
      diversityScore,
      collaborationRate,
    },
    strengths,
    weaknesses,
    recommendations,
    lastUpdated: new Date().toISOString(),
  };

  teamProfiles.set(teamId, profile);
  return profile;
}

/** Get team profile. */
export function getTeamProfile(teamId: string): TeamInnovationProfile | undefined {
  return teamProfiles.get(teamId);
}

// ---- Proactive Coaching Agent ----

/** Generate context-aware coaching suggestions for a session that's about to start. */
export function getPreSessionCoaching(
  userId: string,
  subject: string,
  teamId?: string
): ProactiveCoachingSuggestion[] {
  const profile = getInnovationProfile(userId);
  const history = getSessionHistory(userId);
  const suggestions: ProactiveCoachingSuggestion[] = [];

  // Check if this subject is similar to past sessions
  const subjectWords = new Set(
    subject
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const similarSessions = history.filter((s) => {
    const words = s.subject.toLowerCase().split(/\s+/);
    return words.filter((w) => subjectWords.has(w)).length > 0;
  });

  if (similarSessions.length > 0) {
    const bestSession = similarSessions.sort((a, b) => b.avgQuality - a.avgQuality)[0];
    suggestions.push({
      id: randomUUID(),
      type: "angle-recommendation",
      title: "Based on past success",
      message: `A similar session "${bestSession.subject.slice(0, 80)}" worked best with ${bestSession.anglesUsed.join(", ")}. Consider starting there.`,
      actionLabel: `Use ${bestSession.anglesUsed[0]}`,
      actionData: { angles: bestSession.anglesUsed },
      priority: "high",
      dismissable: true,
    });
  } else if (profile.blindSpots.length > 0) {
    // New territory — suggest exploring blind spots
    suggestions.push({
      id: randomUUID(),
      type: "experiment-nudge",
      title: "New territory detected!",
      message: `This seems like a new topic for you. Try "${profile.blindSpots[0]}" angle — it's one you haven't explored much.`,
      actionLabel: `Try ${profile.blindSpots[0]}`,
      actionData: { angle: profile.blindSpots[0] },
      priority: "medium",
      dismissable: true,
    });
  }

  // Team-level insights
  if (teamId) {
    const team = teamProfiles.get(teamId);
    if (team && team.aggregatedProfile.leastUsedAngles.length > 0) {
      suggestions.push({
        id: randomUUID(),
        type: "blind-spot-alert",
        title: "Team blind spot opportunity",
        message: `Your team rarely uses "${team.aggregatedProfile.leastUsedAngles[0]}". Being the first to explore it could bring unique value.`,
        priority: "medium",
        dismissable: true,
      });
    }
  }

  // Check for patterns in timing
  if (history.length >= 5) {
    const recentQuality = history.slice(-5).reduce((s, h) => s + h.avgQuality, 0) / 5;
    const overallQuality = history.reduce((s, h) => s + h.avgQuality, 0) / history.length;
    if (recentQuality < overallQuality * 0.8) {
      suggestions.push({
        id: randomUUID(),
        type: "bias-warning",
        title: "Quality trend alert",
        message: `Your recent idea quality (${recentQuality.toFixed(1)}) is below your average (${overallQuality.toFixed(1)}). Consider using a different approach or taking a fresh angle.`,
        priority: "high",
        dismissable: true,
      });
    }
  }

  return suggestions;
}

/** Generate insights from session history patterns. */
export function generateCoachingInsights(userId: string): CoachingInsight[] {
  const profile = getInnovationProfile(userId);
  const history = getSessionHistory(userId);
  const insights: CoachingInsight[] = [];

  if (history.length < 3) return insights;

  // Detect angle effectiveness patterns
  for (const ah of profile.angleHistory) {
    if (ah.timesUsed >= 3 && ah.avgIdeaQuality >= 7) {
      insights.push({
        id: randomUUID(),
        type: "pattern",
        title: `Strong with "${ah.angleId}"`,
        description: `You consistently produce high-quality ideas (avg ${ah.avgIdeaQuality.toFixed(1)}/10) with the "${ah.angleId}" angle.`,
        evidence: [`Used ${ah.timesUsed} times`, `Avg quality: ${ah.avgIdeaQuality.toFixed(1)}`],
        actionable: true,
        suggestedAction: `Combine "${ah.angleId}" with a complementary angle for even stronger results.`,
        confidence: 0.8,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Detect declining quality trend
  if (history.length >= 10) {
    const recent = history.slice(-5);
    const older = history.slice(-10, -5);
    const recentAvg = recent.reduce((s, h) => s + h.avgQuality, 0) / 5;
    const olderAvg = older.reduce((s, h) => s + h.avgQuality, 0) / 5;

    if (recentAvg < olderAvg * 0.75) {
      insights.push({
        id: randomUUID(),
        type: "trend",
        title: "Declining idea quality",
        description: `Your recent sessions average ${recentAvg.toFixed(1)}/10, down from ${olderAvg.toFixed(1)}/10 in earlier sessions.`,
        evidence: [`Recent avg: ${recentAvg.toFixed(1)}`, `Previous avg: ${olderAvg.toFixed(1)}`],
        actionable: true,
        suggestedAction:
          "Try a completely different subject domain or use an angle you haven't tried before.",
        confidence: 0.7,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Detect topic clustering (possible tunnel vision)
  if (profile.topicAffinity.length > 0) {
    const topTopic = profile.topicAffinity[0];
    const totalTopicUses = profile.topicAffinity.reduce((s, t) => s + t.count, 0);
    if (topTopic.count / totalTopicUses > 0.4 && totalTopicUses > 5) {
      insights.push({
        id: randomUUID(),
        type: "anomaly",
        title: "Topic tunnel vision",
        description: `${Math.round((topTopic.count / totalTopicUses) * 100)}% of your sessions focus on "${topTopic.topic}". Broadening your scope could spark unexpected innovations.`,
        evidence: [
          `"${topTopic.topic}" used ${topTopic.count} times`,
          `Total sessions: ${totalTopicUses}`,
        ],
        actionable: true,
        suggestedAction: "Try investigating a topic from a completely different industry.",
        confidence: 0.75,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return insights;
}

export function clearTeamProfiles(): void {
  teamProfiles.clear();
}
