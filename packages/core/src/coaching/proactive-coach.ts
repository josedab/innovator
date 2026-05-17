/**
 * @module coaching/proactive-coach
 *
 * Proactive coaching engine that provides context-aware recommendations
 * before, during, and after innovation sessions. Generates personalized
 * nudges, quality alerts, and targeted challenges based on user profiles.
 */

import { getInnovationProfileBuilder } from "./innovation-profile-builder.js";
import type { SessionResult } from "./innovation-profile-builder.js";

// ---- Types ----

export interface CoachingRecommendation {
  type: "pre_session" | "mid_session" | "post_session";
  priority: "low" | "medium" | "high";
  message: string;
  actionType: "try_angle" | "explore_domain" | "review_technique" | "practice_skill";
  metadata: Record<string, unknown>;
}

export interface SessionContext {
  sessionId: string;
  subject: string;
  domain?: string;
  currentAngles: string[];
  elapsedTime: number;
  ideasGenerated: number;
  qualityScores: number[];
}

export interface PostSessionAnalysis {
  qualityVsAverage: { session: number; personal: number; delta: number };
  angleEffectiveness: Array<{ angle: string; quality: number; aboveAvg: boolean }>;
  improvements: string[];
  xpEarned: number;
  achievementsUnlocked: string[];
}

export interface PersonalizedChallenge {
  id: string;
  title: string;
  description: string;
  targetAngle?: string;
  targetDomain?: string;
  durationDays: number;
  goalCount: number;
  currentProgress: number;
  createdAt: string;
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

const ANGLE_DESCRIPTIONS: Record<string, string> = {
  scamper: "SCAMPER (Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse)",
  "first-principles": "First Principles thinking",
  "cross-domain": "Cross-Domain transfer",
  constraints: "Constraint-based innovation",
  inversion: "Inversion (flip the problem)",
  perspectives: "Multiple Perspectives",
  "what-if": "What-If scenarios",
  "trend-collision": "Trend Collision",
};

const DOMAIN_PITFALLS: Record<string, string[]> = {
  healthcare: [
    "Overlooking regulatory constraints (HIPAA, FDA)",
    "Ignoring patient experience in favor of technology",
  ],
  fintech: ["Underestimating compliance requirements", "Neglecting financial inclusion angles"],
  edtech: ["Focusing on technology over pedagogy", "Not considering diverse learning styles"],
  climate: ["Ignoring scalability of solutions", "Overlooking behavioral change aspects"],
  saas: ["Feature creep without user validation", "Ignoring churn drivers"],
};

// ---- In-Memory Store ----

const activeChallenges = new Map<string, PersonalizedChallenge[]>();

// ---- ProactiveCoachingEngine ----

export class ProactiveCoachingEngine {
  private builder = getInnovationProfileBuilder();

  /** Get recommendations before starting a session. */
  getPreSessionRecommendations(userId: string, subject: string): CoachingRecommendation[] {
    const profile = this.builder.getProfile(userId);
    const recommendations: CoachingRecommendation[] = [];

    // Suggest angles based on blind spots
    if (profile) {
      const blindSpotAngles = profile.blindSpots
        .filter((b) => b.startsWith("angle:"))
        .map((b) => b.replace("angle:", ""));

      if (blindSpotAngles.length > 0) {
        const suggested = blindSpotAngles[0];
        recommendations.push({
          type: "pre_session",
          priority: "high",
          message: `Try the "${ANGLE_DESCRIPTIONS[suggested] ?? suggested}" angle — it's one of your blind spots that could reveal fresh perspectives.`,
          actionType: "try_angle",
          metadata: { angle: suggested },
        });
      }

      // Reference past successful sessions in similar domains
      const topAngle = profile.preferredAngles[0];
      if (topAngle && topAngle.timesUsed >= 3) {
        recommendations.push({
          type: "pre_session",
          priority: "medium",
          message: `Your best-performing angle is "${topAngle.angleId}" (avg quality ${topAngle.avgQuality.toFixed(1)}). Consider using it as your anchor.`,
          actionType: "try_angle",
          metadata: { angle: topAngle.angleId, avgQuality: topAngle.avgQuality },
        });
      }
    }

    // Warn about domain pitfalls
    const domain = this.detectDomain(subject);
    if (domain && DOMAIN_PITFALLS[domain]) {
      const pitfall = DOMAIN_PITFALLS[domain][0];
      recommendations.push({
        type: "pre_session",
        priority: "medium",
        message: `Common pitfall in ${domain}: ${pitfall}. Keep this in mind during your session.`,
        actionType: "review_technique",
        metadata: { domain, pitfall },
      });
    }

    // Suggest domain exploration if user hasn't explored it
    if (profile && domain && !profile.domainAffinities[domain]) {
      recommendations.push({
        type: "pre_session",
        priority: "low",
        message: `This is a new domain for you. Cross-domain innovation often produces the most novel ideas.`,
        actionType: "explore_domain",
        metadata: { domain },
      });
    }

    return recommendations;
  }

  /** Get nudges during an active session. */
  getMidSessionNudges(userId: string, context: SessionContext): CoachingRecommendation[] {
    const profile = this.builder.getProfile(userId);
    const nudges: CoachingRecommendation[] = [];

    // Convergence warning: spent too long investigating
    if (context.elapsedTime > 15 && context.ideasGenerated === 0) {
      nudges.push({
        type: "mid_session",
        priority: "high",
        message: `You've been investigating for ${context.elapsedTime} minutes without generating ideas. Consider switching to idea generation now.`,
        actionType: "review_technique",
        metadata: { elapsedTime: context.elapsedTime },
      });
    }

    // Diversity nudge: check if only using one type of angle
    const divergentAngles = ["scamper", "what-if", "cross-domain", "trend-collision"];
    const convergentAngles = ["first-principles", "constraints", "inversion", "perspectives"];

    const usingDivergent = context.currentAngles.some((a) => divergentAngles.includes(a));
    const usingConvergent = context.currentAngles.some((a) => convergentAngles.includes(a));

    if (context.currentAngles.length >= 2 && usingConvergent && !usingDivergent) {
      nudges.push({
        type: "mid_session",
        priority: "medium",
        message: `You've only used convergent angles. Try a divergent approach like SCAMPER or What-If to broaden your thinking.`,
        actionType: "try_angle",
        metadata: { suggestedAngles: divergentAngles },
      });
    } else if (context.currentAngles.length >= 2 && usingDivergent && !usingConvergent) {
      nudges.push({
        type: "mid_session",
        priority: "medium",
        message: `You've been diverging well! Consider adding a convergent angle like First Principles or Constraints to sharpen your ideas.`,
        actionType: "try_angle",
        metadata: { suggestedAngles: convergentAngles },
      });
    }

    // Quality alert: recent ideas below personal average
    if (profile && context.qualityScores.length >= 3) {
      const recentAvg = context.qualityScores.slice(-3).reduce((s, v) => s + v, 0) / 3;
      if (recentAvg < profile.avgQuality * 0.75) {
        nudges.push({
          type: "mid_session",
          priority: "high",
          message: `Recent ideas scoring ${recentAvg.toFixed(1)} — below your average of ${profile.avgQuality.toFixed(1)}. Consider re-investigating or trying a different angle.`,
          actionType: "review_technique",
          metadata: { recentAvg, personalAvg: profile.avgQuality },
        });
      }
    }

    // Time check for long sessions
    if (context.elapsedTime > 45 && context.ideasGenerated > 0) {
      nudges.push({
        type: "mid_session",
        priority: "low",
        message: `You've been at it for ${context.elapsedTime} minutes. Consider synthesizing your best ideas before fatigue sets in.`,
        actionType: "review_technique",
        metadata: { elapsedTime: context.elapsedTime },
      });
    }

    return nudges;
  }

  /** Analyze a completed session. */
  getPostSessionAnalysis(userId: string, sessionResult: SessionResult): PostSessionAnalysis {
    const profile = this.builder.getProfile(userId);
    const personalAvg = profile?.avgQuality ?? 5;
    const delta = sessionResult.avgQuality - personalAvg;

    // Angle effectiveness
    const angleEffectiveness = sessionResult.anglesUsed.map((angle) => {
      const profileAngle = profile?.preferredAngles.find((a) => a.angleId === angle);
      return {
        angle,
        quality: sessionResult.avgQuality,
        aboveAvg: profileAngle ? sessionResult.avgQuality > profileAngle.avgQuality : true,
      };
    });

    // Generate improvement suggestions
    const improvements: string[] = [];
    if (delta < -1) {
      improvements.push(
        "This session scored below your average. Consider spending more time on investigation before generating ideas."
      );
    }
    if (sessionResult.anglesUsed.length < 3) {
      improvements.push("Try using more angles (3+) for greater perspective diversity.");
    }
    if (sessionResult.duration < 10) {
      improvements.push(
        "Longer sessions tend to produce higher-quality ideas. Aim for 15+ minutes."
      );
    }

    const unusedAngles = ALL_ANGLES.filter((a) => !sessionResult.anglesUsed.includes(a));
    if (unusedAngles.length > 4) {
      improvements.push(
        `Consider trying: ${unusedAngles.slice(0, 2).join(", ")} in your next session.`
      );
    }

    if (delta > 1) {
      improvements.push(
        "Great session! Your quality is above your average — keep doing what worked here."
      );
    }

    // XP calculation
    const xpEarned =
      10 +
      sessionResult.anglesUsed.length * 5 +
      Math.round(sessionResult.avgQuality * 2) +
      (delta > 0 ? 10 : 0);

    return {
      qualityVsAverage: {
        session: sessionResult.avgQuality,
        personal: personalAvg,
        delta,
      },
      angleEffectiveness,
      improvements,
      xpEarned,
      achievementsUnlocked: [],
    };
  }

  /** Generate a personalized challenge based on blind spots. */
  generateChallenge(userId: string): PersonalizedChallenge {
    const profile = this.builder.getProfile(userId);
    const blindSpotAngles = (profile?.blindSpots ?? [])
      .filter((b) => b.startsWith("angle:"))
      .map((b) => b.replace("angle:", ""));

    let targetAngle: string | undefined;
    let title: string;
    let description: string;
    let goalCount = 3;

    if (blindSpotAngles.length > 0) {
      targetAngle = blindSpotAngles[0];
      const angleName = ANGLE_DESCRIPTIONS[targetAngle] ?? targetAngle;
      title = `Master the ${angleName} angle`;
      description = `Use the "${targetAngle}" angle in ${goalCount} sessions this week. This is one of your underexplored angles that could unlock new perspectives.`;
    } else if (profile && profile.avgQuality < 7) {
      title = "Quality Champion";
      description = `Achieve an average quality score of 8+ in your next ${goalCount} sessions. Focus on depth over breadth.`;
    } else {
      title = "Cross-Domain Explorer";
      description = `Apply innovation angles to ${goalCount} different domains this week. Stretch your thinking beyond your comfort zone.`;
      goalCount = 3;
    }

    const challenge: PersonalizedChallenge = {
      id: `challenge-${userId}-${Date.now()}`,
      title,
      description,
      targetAngle,
      durationDays: 7,
      goalCount,
      currentProgress: 0,
      createdAt: new Date().toISOString(),
    };

    const userChallenges = activeChallenges.get(userId) ?? [];
    userChallenges.push(challenge);
    if (userChallenges.length > 10) userChallenges.splice(0, userChallenges.length - 10);
    activeChallenges.set(userId, userChallenges);

    return challenge;
  }

  /** Get active challenges for a user. */
  getActiveChallenges(userId: string): PersonalizedChallenge[] {
    return activeChallenges.get(userId) ?? [];
  }

  // ---- Private Helpers ----

  private detectDomain(subject: string): string | undefined {
    const lower = subject.toLowerCase();
    const domainKeywords: Record<string, string[]> = {
      healthcare: ["health", "medical", "clinical", "patient", "hospital"],
      fintech: ["finance", "banking", "payment", "fintech", "trading"],
      edtech: ["education", "learning", "teaching", "student", "school"],
      climate: ["climate", "sustainability", "carbon", "renewable", "green"],
      saas: ["saas", "subscription", "platform", "b2b", "enterprise"],
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((k) => lower.includes(k))) return domain;
    }
    return undefined;
  }
}

// ---- Singleton ----

let instance: ProactiveCoachingEngine | undefined;

/** Get the singleton ProactiveCoachingEngine instance. */
export function getProactiveCoachingEngine(): ProactiveCoachingEngine {
  if (!instance) {
    instance = new ProactiveCoachingEngine();
  }
  return instance;
}

/** Clear all proactive coaching data (for testing). */
export function clearProactiveCoachData(): void {
  activeChallenges.clear();
}
