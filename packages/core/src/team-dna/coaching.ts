/**
 * @module team-dna/coaching
 *
 * Coaching recommendations and team composition optimization.
 * Analyzes team DNA to provide actionable coaching advice and
 * suggests optimal team composition for balanced innovation.
 */

import { z } from "zod";
import type { TeamDNA, MemberProfile, BlindSpot } from "./index.js";

// ---- Coaching Schemas ----

export const CoachingRecommendationSchema = z.object({
  targetMember: z.string().max(200).optional(),
  targetTeam: z.boolean().default(false),
  category: z.enum([
    "skill_development",
    "angle_exploration",
    "collaboration",
    "facilitation",
    "habit_formation",
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  title: z.string().max(300),
  description: z.string().max(2000),
  actionItems: z.array(z.string().max(500)).max(5),
  expectedImpact: z.string().max(500),
  timeframeWeeks: z.number().int().min(1).max(52).optional(),
});
export type CoachingRecommendation = z.infer<typeof CoachingRecommendationSchema>;

export const CompositionScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  diversityScore: z.number().min(0).max(100),
  coverageScore: z.number().min(0).max(100),
  balanceScore: z.number().min(0).max(100),
  styleDistribution: z.record(z.number()),
  missingStyles: z.array(z.string().max(100)),
  overrepresentedStyles: z.array(z.string().max(100)),
});
export type CompositionScore = z.infer<typeof CompositionScoreSchema>;

export const CompositionRecommendationSchema = z.object({
  score: CompositionScoreSchema,
  recommendations: z.array(CoachingRecommendationSchema),
  optimalAdditions: z.array(
    z.object({
      style: z.string().max(100),
      reason: z.string().max(500),
      expectedImpact: z.number().min(0).max(100),
    })
  ),
  riskFactors: z.array(
    z.object({
      factor: z.string().max(300),
      severity: z.enum(["low", "medium", "high"]),
      mitigation: z.string().max(500),
    })
  ),
});
export type CompositionRecommendation = z.infer<typeof CompositionRecommendationSchema>;

// ---- Style Definitions ----

const ALL_STYLES = ["explorer", "analyzer", "builder", "connector", "disruptor"] as const;

const STYLE_DESCRIPTIONS: Record<string, string> = {
  explorer: "Explores broadly, tries many angles, drives discovery",
  analyzer: "Deep first-principles thinking, identifies root causes",
  builder: "Focuses on constraints and feasibility, turns ideas into reality",
  connector: "Cross-domain thinking, finds unexpected connections",
  disruptor: "Challenges assumptions through inversion and what-if scenarios",
};

// ---- Coaching Engine ----

/**
 * Generate coaching recommendations for a team based on its DNA analysis.
 */
export function generateCoachingRecommendations(dna: TeamDNA): CoachingRecommendation[] {
  const recommendations: CoachingRecommendation[] = [];

  // Team-level: blind spot coaching
  for (const blindSpot of dna.blindSpots) {
    recommendations.push(buildBlindSpotCoaching(blindSpot, dna));
  }

  // Team-level: diversity coaching
  if (dna.diversityIndex < 0.5) {
    recommendations.push({
      targetTeam: true,
      category: "facilitation",
      priority: "high",
      title: "Increase Cognitive Diversity",
      description: `Team diversity index is ${(dna.diversityIndex * 100).toFixed(0)}%. Below 50% indicates significant groupthink risk. The team gravitates toward the same thinking patterns.`,
      actionItems: [
        "Assign different angles to different team members each session",
        "Rotate the session facilitator role weekly",
        "Introduce mandatory 'devil's advocate' rounds",
      ],
      expectedImpact: "15-25% increase in idea diversity within 4 weeks",
      timeframeWeeks: 4,
    });
  }

  // Member-level coaching
  for (const member of dna.memberProfiles) {
    recommendations.push(...buildMemberCoaching(member, dna));
  }

  // Collaboration coaching based on pairings
  if (dna.suggestedPairings.length > 0) {
    const topPairing = dna.suggestedPairings[0];
    recommendations.push({
      targetTeam: true,
      category: "collaboration",
      priority: "medium",
      title: `Pair ${topPairing.member1} with ${topPairing.member2}`,
      description: topPairing.reason,
      actionItems: [
        `Schedule a joint brainstorming session for ${topPairing.member1} and ${topPairing.member2}`,
        `Focus on ${topPairing.complementaryAngles.join(", ")} angles`,
        "Document insights from the paired session for the team",
      ],
      expectedImpact: "Cross-pollination of thinking styles leads to more robust ideas",
      timeframeWeeks: 2,
    });
  }

  return recommendations.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });
}

function buildBlindSpotCoaching(blindSpot: BlindSpot, _dna: TeamDNA): CoachingRecommendation {
  return {
    targetTeam: true,
    category: "angle_exploration",
    priority:
      blindSpot.severity === "critical"
        ? "critical"
        : blindSpot.severity === "high"
          ? "high"
          : "medium",
    title: `Address "${blindSpot.angleName}" Blind Spot`,
    description: `The team uses ${blindSpot.angleName} at only ${(blindSpot.teamUsageRate * 100).toFixed(1)}% of sessions. ${blindSpot.suggestion}`,
    actionItems: [
      `Dedicate the next team session to ${blindSpot.angleName} thinking`,
      `Assign a team member as the ${blindSpot.angleName} champion for the month`,
      `Add ${blindSpot.angleName} as a mandatory angle in the next 3 innovation sessions`,
    ],
    expectedImpact: `Improved coverage of ${blindSpot.angleName} perspective, reducing innovation blind spots`,
    timeframeWeeks: 3,
  };
}

function buildMemberCoaching(member: MemberProfile, dna: TeamDNA): CoachingRecommendation[] {
  const recs: CoachingRecommendation[] = [];

  // Low activity coaching
  if (member.totalSessions < 3 && dna.memberProfiles.length > 1) {
    const avgSessions =
      dna.memberProfiles.reduce((s, p) => s + p.totalSessions, 0) / dna.memberProfiles.length;
    if (member.totalSessions < avgSessions * 0.5) {
      recs.push({
        targetMember: member.displayName,
        targetTeam: false,
        category: "habit_formation",
        priority: "medium",
        title: `Increase ${member.displayName}'s Participation`,
        description: `${member.displayName} has ${member.totalSessions} sessions vs team average of ${avgSessions.toFixed(0)}.`,
        actionItems: [
          "Invite to upcoming innovation sessions with a specific role",
          "Pair with a more active team member as a mentor",
          "Set a personal goal of 1 session per week",
        ],
        expectedImpact: "More diverse input from all team members",
        timeframeWeeks: 4,
      });
    }
  }

  // Narrow style coaching
  if (member.avoidedAngles.length > 4) {
    recs.push({
      targetMember: member.displayName,
      targetTeam: false,
      category: "skill_development",
      priority: "medium",
      title: `Broaden ${member.displayName}'s Innovation Toolkit`,
      description: `${member.displayName} (${member.innovationStyle}) avoids ${member.avoidedAngles.length} angles. Expanding would strengthen versatility.`,
      actionItems: [
        `Try the "${member.avoidedAngles[0]}" angle in the next session`,
        `Read about ${member.avoidedAngles.slice(0, 2).join(" and ")} methodologies`,
        "Practice one new angle per week for a month",
      ],
      expectedImpact: "Broader thinking toolkit, more adaptable innovation contributor",
      timeframeWeeks: 4,
    });
  }

  return recs;
}

// ---- Composition Optimization ----

/**
 * Analyze team composition and suggest optimal changes.
 */
export function analyzeComposition(dna: TeamDNA): CompositionRecommendation {
  const score = computeCompositionScore(dna);
  const recommendations = generateCoachingRecommendations(dna);
  const optimalAdditions = computeOptimalAdditions(dna);
  const riskFactors = identifyRiskFactors(dna);

  return CompositionRecommendationSchema.parse({
    score,
    recommendations: recommendations.slice(0, 10),
    optimalAdditions,
    riskFactors,
  });
}

function computeCompositionScore(dna: TeamDNA): CompositionScore {
  const profiles = dna.memberProfiles;

  // Style distribution
  const styleDistribution: Record<string, number> = {};
  for (const style of ALL_STYLES) {
    styleDistribution[style] = profiles.filter((p) => p.innovationStyle === style).length;
  }

  // Coverage: how many of 5 styles are represented?
  const representedStyles = ALL_STYLES.filter((s) => (styleDistribution[s] ?? 0) > 0);
  const coverageScore = (representedStyles.length / ALL_STYLES.length) * 100;

  // Balance: how evenly distributed are styles?
  const total = profiles.length || 1;
  const idealProportion = 1 / ALL_STYLES.length;
  const balanceDeviation = ALL_STYLES.reduce((sum, style) => {
    const proportion = (styleDistribution[style] ?? 0) / total;
    return sum + Math.abs(proportion - idealProportion);
  }, 0);
  const maxDeviation = 2 * (1 - idealProportion);
  const balanceScore = Math.max(0, (1 - balanceDeviation / maxDeviation) * 100);

  const diversityScore = dna.diversityIndex * 100;

  const overall = Math.round(diversityScore * 0.3 + coverageScore * 0.4 + balanceScore * 0.3);

  const missingStyles = ALL_STYLES.filter((s) => (styleDistribution[s] ?? 0) === 0);
  const overrepresented = ALL_STYLES.filter((s) => (styleDistribution[s] ?? 0) / total > 0.4);

  return {
    overall,
    diversityScore: Math.round(diversityScore),
    coverageScore: Math.round(coverageScore),
    balanceScore: Math.round(balanceScore),
    styleDistribution,
    missingStyles: [...missingStyles],
    overrepresentedStyles: [...overrepresented],
  };
}

function computeOptimalAdditions(
  dna: TeamDNA
): Array<{ style: string; reason: string; expectedImpact: number }> {
  const additions: Array<{ style: string; reason: string; expectedImpact: number }> = [];
  const profiles = dna.memberProfiles;
  const total = profiles.length || 1;

  const styleCounts: Record<string, number> = {};
  for (const style of ALL_STYLES) {
    styleCounts[style] = profiles.filter((p) => p.innovationStyle === style).length;
  }

  for (const style of ALL_STYLES) {
    const count = styleCounts[style] ?? 0;
    const proportion = count / total;
    const idealProportion = 1 / ALL_STYLES.length;

    if (proportion < idealProportion * 0.5) {
      const impact = Math.min(100, Math.round((idealProportion - proportion) * 500));
      additions.push({
        style,
        reason:
          count === 0
            ? `No ${style}s on the team. ${STYLE_DESCRIPTIONS[style]}. Adding one would fill a critical gap.`
            : `Only ${count} ${style}(s) (${(proportion * 100).toFixed(0)}%). Below optimal level.`,
        expectedImpact: impact,
      });
    }
  }

  return additions.sort((a, b) => b.expectedImpact - a.expectedImpact);
}

function identifyRiskFactors(
  dna: TeamDNA
): Array<{ factor: string; severity: "low" | "medium" | "high"; mitigation: string }> {
  const risks: Array<{ factor: string; severity: "low" | "medium" | "high"; mitigation: string }> =
    [];

  if (dna.diversityIndex < 0.3) {
    risks.push({
      factor: "Severe groupthink risk — diversity index below 30%",
      severity: "high",
      mitigation: "Introduce mandatory angle rotation and external innovation workshops",
    });
  }

  if (dna.blindSpots.filter((b) => b.severity === "critical").length >= 2) {
    risks.push({
      factor: "Multiple critical blind spots limit innovation coverage",
      severity: "high",
      mitigation: "Assign blind spot champions and track improvement monthly",
    });
  }

  const singleContributor = dna.memberProfiles.filter(
    (p) => p.totalIdeas > dna.memberProfiles.reduce((s, m) => s + m.totalIdeas, 0) * 0.5
  );
  if (singleContributor.length > 0 && dna.memberProfiles.length > 2) {
    risks.push({
      factor: `Key-person dependency: ${singleContributor[0].displayName} generates >50% of ideas`,
      severity: "medium",
      mitigation: "Distribute idea generation responsibility, encourage quieter members",
    });
  }

  if (dna.memberProfiles.length < 3) {
    risks.push({
      factor: "Team too small for effective cognitive diversity",
      severity: "medium",
      mitigation: "Consider adding 2-3 members with different innovation styles",
    });
  }

  return risks;
}

// ---- Markdown Export ----

/** Export composition analysis as markdown. */
export function compositionToMarkdown(result: CompositionRecommendation): string {
  const { score } = result;
  const lines: string[] = [
    "# Team Composition Analysis",
    "",
    `**Overall Score:** ${score.overall}/100`,
    `**Diversity:** ${score.diversityScore}/100 | **Coverage:** ${score.coverageScore}/100 | **Balance:** ${score.balanceScore}/100`,
    "",
    "## Style Distribution",
    "",
    "| Style | Count |",
    "|-------|-------|",
    ...Object.entries(score.styleDistribution).map(([style, count]) => `| ${style} | ${count} |`),
    "",
  ];

  if (score.missingStyles.length > 0) {
    lines.push(`**Missing Styles:** ${score.missingStyles.join(", ")}`);
    lines.push("");
  }

  if (result.optimalAdditions.length > 0) {
    lines.push("## Recommended Additions");
    lines.push("");
    for (const add of result.optimalAdditions) {
      lines.push(`- **${add.style}** (impact: ${add.expectedImpact}%): ${add.reason}`);
    }
    lines.push("");
  }

  if (result.riskFactors.length > 0) {
    lines.push("## Risk Factors");
    lines.push("");
    for (const risk of result.riskFactors) {
      lines.push(`- **[${risk.severity.toUpperCase()}]** ${risk.factor}`);
      lines.push(`  *Mitigation: ${risk.mitigation}*`);
    }
    lines.push("");
  }

  if (result.recommendations.length > 0) {
    lines.push("## Coaching Recommendations");
    lines.push("");
    for (const rec of result.recommendations.slice(0, 5)) {
      const target = rec.targetMember ?? "Team";
      lines.push(`### [${rec.priority.toUpperCase()}] ${rec.title} (${target})`);
      lines.push("");
      lines.push(rec.description);
      lines.push("");
      for (const action of rec.actionItems) {
        lines.push(`- ${action}`);
      }
      lines.push(`*Expected impact: ${rec.expectedImpact}*`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
