/**
 * @module coaching/innovation-profile-builder
 *
 * Builds and maintains detailed innovation profiles from session history.
 * Tracks angle preferences, domain affinities, quality trends, blind spots,
 * creativity style classification, and growth trajectories.
 */

// ---- Types ----

export interface InnovationProfileDetailed {
  userId: string;
  preferredAngles: Array<{ angleId: string; rank: number; avgQuality: number; timesUsed: number }>;
  domainAffinities: Record<string, number>;
  qualityTrends: Array<{ date: string; avgQuality: number; sessionCount: number }>;
  blindSpots: string[];
  creativityStyle: "divergent" | "convergent" | "balanced";
  totalSessions: number;
  avgQuality: number;
  streakDays: number;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  xp: number;
}

export interface ProfileMetrics {
  sessionsCount: number;
  ideasGenerated: number;
  avgFeasibility: number;
  avgNovelty: number;
  avgImpact: number;
  topAngles: string[];
  weakAngles: string[];
  domainsExplored: string[];
}

export interface SessionHistoryEntry {
  sessionId: string;
  subject: string;
  domain?: string;
  anglesUsed: string[];
  ideaCount: number;
  avgQuality: number;
  feasibility?: number;
  novelty?: number;
  impact?: number;
  duration: number;
  completedAt: string;
}

export interface SessionResult {
  sessionId: string;
  subject: string;
  domain?: string;
  anglesUsed: string[];
  ideaCount: number;
  avgQuality: number;
  feasibility?: number;
  novelty?: number;
  impact?: number;
  duration: number;
  completedAt: string;
}

export interface GrowthTrajectory {
  trend: "improving" | "declining" | "stable";
  recentAvg: number;
  overallAvg: number;
  changePercent: number;
  milestones: Array<{ date: string; description: string }>;
}

export interface TeamComparison {
  userId: string;
  teamId: string;
  strengths: string[];
  weaknesses: string[];
  rankInTeam: number;
  teamSize: number;
  percentile: number;
}

// ---- Constants ----

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

const DIVERGENT_ANGLES = ["scamper", "what-if", "cross-domain", "trend-collision"];
const CONVERGENT_ANGLES = ["first-principles", "constraints", "inversion", "perspectives"];

const LEVEL_THRESHOLDS: Record<string, number> = {
  beginner: 0,
  intermediate: 100,
  advanced: 500,
  expert: 2000,
};

// ---- In-Memory Store ----

const profiles = new Map<string, InnovationProfileDetailed>();
const historyStore = new Map<string, SessionHistoryEntry[]>();
const teamMembers = new Map<string, string[]>();

// ---- InnovationProfileBuilder ----

export class InnovationProfileBuilder {
  /** Aggregate full session history into a profile. */
  buildProfile(userId: string, sessionHistory: SessionHistoryEntry[]): InnovationProfileDetailed {
    historyStore.set(userId, [...sessionHistory]);

    const angleCounts = new Map<string, { total: number; qualitySum: number }>();
    const domainCounts = new Map<string, number>();
    let totalQuality = 0;
    let totalIdeas = 0;

    for (const session of sessionHistory) {
      totalQuality += session.avgQuality;
      totalIdeas += session.ideaCount;

      for (const angle of session.anglesUsed) {
        const existing = angleCounts.get(angle) ?? { total: 0, qualitySum: 0 };
        existing.total++;
        existing.qualitySum += session.avgQuality;
        angleCounts.set(angle, existing);
      }

      if (session.domain) {
        domainCounts.set(session.domain, (domainCounts.get(session.domain) ?? 0) + 1);
      }
    }

    const preferredAngles = Array.from(angleCounts.entries())
      .map(([angleId, data]) => ({
        angleId,
        rank: 0,
        avgQuality: data.total > 0 ? data.qualitySum / data.total : 0,
        timesUsed: data.total,
      }))
      .sort((a, b) => b.avgQuality * b.timesUsed - a.avgQuality * a.timesUsed);

    preferredAngles.forEach((a, i) => {
      a.rank = i + 1;
    });

    const domainAffinities: Record<string, number> = {};
    for (const [domain, count] of Array.from(domainCounts.entries())) {
      domainAffinities[domain] = count / Math.max(sessionHistory.length, 1);
    }

    const qualityTrends = this.computeQualityTrends(sessionHistory);
    const avgQuality = sessionHistory.length > 0 ? totalQuality / sessionHistory.length : 0;
    const xp = this.computeXP(sessionHistory);

    const profile: InnovationProfileDetailed = {
      userId,
      preferredAngles,
      domainAffinities,
      qualityTrends,
      blindSpots: [],
      creativityStyle: "balanced",
      totalSessions: sessionHistory.length,
      avgQuality,
      streakDays: this.computeStreak(sessionHistory),
      level: this.computeLevel(xp),
      xp,
    };

    profile.creativityStyle = this.assessCreativityStyle(profile);
    profile.blindSpots = this.identifyBlindSpots(profile);

    profiles.set(userId, profile);
    return profile;
  }

  /** Incrementally update profile after a single session. */
  updateProfile(userId: string, sessionResult: SessionResult): InnovationProfileDetailed {
    const history = historyStore.get(userId) ?? [];
    history.push(sessionResult);
    if (history.length > 500) history.splice(0, history.length - 500);
    historyStore.set(userId, history);
    return this.buildProfile(userId, history);
  }

  /** Classify creativity style based on angle preferences and quality patterns. */
  assessCreativityStyle(
    profile: InnovationProfileDetailed
  ): "divergent" | "convergent" | "balanced" {
    const usedAngles = new Set(profile.preferredAngles.map((a) => a.angleId));
    let divergentScore = 0;
    let convergentScore = 0;

    for (const a of profile.preferredAngles) {
      const weight = a.timesUsed * a.avgQuality;
      if (DIVERGENT_ANGLES.includes(a.angleId)) {
        divergentScore += weight;
      } else if (CONVERGENT_ANGLES.includes(a.angleId)) {
        convergentScore += weight;
      }
    }

    const total = divergentScore + convergentScore;
    if (total === 0) return "balanced";

    const ratio = divergentScore / total;
    if (ratio > 0.6) return "divergent";
    if (ratio < 0.4) return "convergent";
    return "balanced";
  }

  /** Find underused angles and unexplored domains. */
  identifyBlindSpots(profile: InnovationProfileDetailed): string[] {
    const usedAngles = new Set(profile.preferredAngles.map((a) => a.angleId));
    const blindSpots: string[] = [];

    // Angles never used
    for (const angle of ALL_ANGLES) {
      if (!usedAngles.has(angle)) {
        blindSpots.push(`angle:${angle}`);
      }
    }

    // Angles used fewer than 2 times
    for (const a of profile.preferredAngles) {
      if (a.timesUsed < 2 && !blindSpots.includes(`angle:${a.angleId}`)) {
        blindSpots.push(`angle:${a.angleId}`);
      }
    }

    // Underexplored domains
    const domains = Object.entries(profile.domainAffinities);
    if (domains.length > 0) {
      const avgAffinity = domains.reduce((s, [, v]) => s + v, 0) / domains.length;
      for (const [domain, strength] of domains) {
        if (strength < avgAffinity * 0.3) {
          blindSpots.push(`domain:${domain}`);
        }
      }
    }

    return blindSpots;
  }

  /** Analyze quality trend over time. */
  getGrowthTrajectory(profile: InnovationProfileDetailed): GrowthTrajectory {
    const trends = profile.qualityTrends;
    if (trends.length < 2) {
      return {
        trend: "stable",
        recentAvg: profile.avgQuality,
        overallAvg: profile.avgQuality,
        changePercent: 0,
        milestones: [],
      };
    }

    const recentWindow = trends.slice(-5);
    const olderWindow = trends.slice(0, Math.max(trends.length - 5, 1));

    const recentAvg =
      recentWindow.reduce((s, t) => s + t.avgQuality, 0) / recentWindow.length;
    const olderAvg =
      olderWindow.reduce((s, t) => s + t.avgQuality, 0) / olderWindow.length;

    const changePercent =
      olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    let trend: GrowthTrajectory["trend"] = "stable";
    if (changePercent > 10) trend = "improving";
    else if (changePercent < -10) trend = "declining";

    const milestones: GrowthTrajectory["milestones"] = [];
    if (profile.totalSessions === 1) {
      milestones.push({ date: trends[0].date, description: "First session completed" });
    }
    if (profile.totalSessions >= 10) {
      milestones.push({
        date: trends[Math.min(9, trends.length - 1)].date,
        description: "10 sessions milestone",
      });
    }
    if (profile.avgQuality >= 8) {
      milestones.push({
        date: trends[trends.length - 1].date,
        description: "Average quality above 8",
      });
    }

    return { trend, recentAvg, overallAvg: profile.avgQuality, changePercent, milestones };
  }

  /** Compare a user's profile against their team. */
  compareToTeam(userId: string, teamId: string): TeamComparison {
    const memberIds = teamMembers.get(teamId) ?? [];
    const userProfile = profiles.get(userId);

    const teamProfiles = memberIds
      .map((id) => profiles.get(id))
      .filter((p): p is InnovationProfileDetailed => p !== undefined);

    if (!userProfile || teamProfiles.length === 0) {
      return {
        userId,
        teamId,
        strengths: [],
        weaknesses: [],
        rankInTeam: 0,
        teamSize: memberIds.length,
        percentile: 50,
      };
    }

    const teamAvgQuality =
      teamProfiles.reduce((s, p) => s + p.avgQuality, 0) / teamProfiles.length;
    const teamAvgSessions =
      teamProfiles.reduce((s, p) => s + p.totalSessions, 0) / teamProfiles.length;

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (userProfile.avgQuality > teamAvgQuality * 1.1) {
      strengths.push("Above-average idea quality");
    } else if (userProfile.avgQuality < teamAvgQuality * 0.9) {
      weaknesses.push("Below-average idea quality");
    }

    if (userProfile.totalSessions > teamAvgSessions * 1.2) {
      strengths.push("High session frequency");
    } else if (userProfile.totalSessions < teamAvgSessions * 0.5) {
      weaknesses.push("Low session frequency");
    }

    if (userProfile.blindSpots.length < 3) {
      strengths.push("Well-rounded angle usage");
    } else if (userProfile.blindSpots.length > 5) {
      weaknesses.push("Many unexplored angles");
    }

    const sorted = [...teamProfiles].sort((a, b) => b.xp - a.xp);
    const rankInTeam = sorted.findIndex((p) => p.userId === userId) + 1;
    const percentile =
      teamProfiles.length > 1
        ? Math.round(((teamProfiles.length - rankInTeam) / (teamProfiles.length - 1)) * 100)
        : 50;

    return {
      userId,
      teamId,
      strengths,
      weaknesses,
      rankInTeam: rankInTeam || teamProfiles.length,
      teamSize: teamProfiles.length,
      percentile,
    };
  }

  /** Register team members for comparison. */
  registerTeam(teamId: string, memberIds: string[]): void {
    teamMembers.set(teamId, memberIds);
  }

  /** Get stored profile. */
  getProfile(userId: string): InnovationProfileDetailed | undefined {
    return profiles.get(userId);
  }

  /** Get stored metrics for a user. */
  getMetrics(userId: string): ProfileMetrics {
    const history = historyStore.get(userId) ?? [];
    const profile = profiles.get(userId);

    let totalIdeas = 0;
    let feasSum = 0;
    let novSum = 0;
    let impSum = 0;
    let feasCount = 0;
    let novCount = 0;
    let impCount = 0;
    const domainsSet = new Set<string>();

    for (const s of history) {
      totalIdeas += s.ideaCount;
      if (s.feasibility !== undefined) { feasSum += s.feasibility; feasCount++; }
      if (s.novelty !== undefined) { novSum += s.novelty; novCount++; }
      if (s.impact !== undefined) { impSum += s.impact; impCount++; }
      if (s.domain) domainsSet.add(s.domain);
    }

    const topAngles = (profile?.preferredAngles ?? []).slice(0, 3).map((a) => a.angleId);
    const weakAngles = (profile?.blindSpots ?? [])
      .filter((b) => b.startsWith("angle:"))
      .map((b) => b.replace("angle:", ""));

    return {
      sessionsCount: history.length,
      ideasGenerated: totalIdeas,
      avgFeasibility: feasCount > 0 ? feasSum / feasCount : 0,
      avgNovelty: novCount > 0 ? novSum / novCount : 0,
      avgImpact: impCount > 0 ? impSum / impCount : 0,
      topAngles,
      weakAngles,
      domainsExplored: Array.from(domainsSet),
    };
  }

  // ---- Private Helpers ----

  private computeQualityTrends(
    history: SessionHistoryEntry[]
  ): InnovationProfileDetailed["qualityTrends"] {
    const byDate = new Map<string, { qualitySum: number; count: number }>();
    for (const s of history) {
      const date = s.completedAt.slice(0, 10);
      const existing = byDate.get(date) ?? { qualitySum: 0, count: 0 };
      existing.qualitySum += s.avgQuality;
      existing.count++;
      byDate.set(date, existing);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        avgQuality: data.count > 0 ? data.qualitySum / data.count : 0,
        sessionCount: data.count,
      }));
  }

  private computeStreak(history: SessionHistoryEntry[]): number {
    if (history.length === 0) return 0;

    const dates = Array.from(
      new Set(history.map((s) => s.completedAt.slice(0, 10)))
    ).sort((a, b) => b.localeCompare(a));

    const today = new Date().toISOString().slice(0, 10);
    if (dates[0] !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (dates[0] !== yesterday) return 0;
    }

    let streak = 1;
    for (let i = 0; i < dates.length - 1; i++) {
      const curr = new Date(dates[i]).getTime();
      const prev = new Date(dates[i + 1]).getTime();
      if (curr - prev <= 86400000 * 1.5) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  private computeXP(history: SessionHistoryEntry[]): number {
    let xp = 0;
    for (const s of history) {
      xp += 10 + s.anglesUsed.length * 5 + Math.round(s.avgQuality * 2);
    }
    return xp;
  }

  private computeLevel(
    xp: number
  ): "beginner" | "intermediate" | "advanced" | "expert" {
    if (xp >= LEVEL_THRESHOLDS.expert) return "expert";
    if (xp >= LEVEL_THRESHOLDS.advanced) return "advanced";
    if (xp >= LEVEL_THRESHOLDS.intermediate) return "intermediate";
    return "beginner";
  }
}

// ---- Singleton ----

let instance: InnovationProfileBuilder | undefined;

/** Get the singleton InnovationProfileBuilder instance. */
export function getInnovationProfileBuilder(): InnovationProfileBuilder {
  if (!instance) {
    instance = new InnovationProfileBuilder();
  }
  return instance;
}

/** Clear all stored profile data (for testing). */
export function clearProfileBuilderData(): void {
  profiles.clear();
  historyStore.clear();
  teamMembers.clear();
}
