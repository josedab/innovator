/**
 * @module team-dna
 *
 * Team Innovation DNA Profiler — analyze team members' innovation patterns,
 * identify which angles they gravitate toward or avoid, compute cognitive
 * diversity index, and detect blind spots using Shannon entropy.
 */

import { z } from "zod";
import type { AngleId } from "../types.js";

// ---- Schemas ----

/** Individual member innovation profile. */
export const MemberProfileSchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  angleUsage: z.record(z.number().min(0)),
  votingPatterns: z.record(z.number().min(0)),
  totalSessions: z.number().min(0),
  totalIdeas: z.number().min(0),
  totalVotes: z.number().min(0),
  preferredAngles: z.array(z.string().max(100)).max(10),
  avoidedAngles: z.array(z.string().max(100)).max(10),
  innovationStyle: z.enum(["explorer", "analyzer", "builder", "connector", "disruptor"]),
  lastActive: z.number(),
});

/** Blind spot detection result. */
export const BlindSpotSchema = z.object({
  angleId: z.string().max(100),
  angleName: z.string().max(200),
  teamUsageRate: z.number().min(0).max(1),
  entropyContribution: z.number().min(0),
  severity: z.enum(["low", "medium", "high", "critical"]),
  suggestion: z.string().max(500),
});

/** Team cognitive diversity result. */
export const TeamDNASchema = z.object({
  teamId: z.string().max(200),
  memberProfiles: z.array(MemberProfileSchema).max(100),
  diversityIndex: z.number().min(0).max(1),
  shannonEntropy: z.number().min(0),
  maxEntropy: z.number().min(0),
  blindSpots: z.array(BlindSpotSchema).max(20),
  teamStrengths: z.array(z.string().max(500)).max(10),
  teamWeaknesses: z.array(z.string().max(500)).max(10),
  suggestedPairings: z.array(z.object({
    member1: z.string().max(200),
    member2: z.string().max(200),
    reason: z.string().max(500),
    complementaryAngles: z.array(z.string().max(100)).max(5),
  })).max(20),
});

// ---- Types ----

export type MemberProfile = z.infer<typeof MemberProfileSchema>;
export type BlindSpot = z.infer<typeof BlindSpotSchema>;
export type TeamDNA = z.infer<typeof TeamDNASchema>;

/** Raw activity event for building profiles. */
export interface MemberActivity {
  userId: string;
  displayName: string;
  angleId: string;
  action: "used" | "voted" | "generated";
  timestamp: number;
}

// ---- In-Memory Store ----

const activityLog: MemberActivity[] = [];

// ---- Angle Metadata ----

const ANGLE_NAMES: Record<string, string> = {
  scamper: "SCAMPER", "first-principles": "First Principles",
  "cross-domain": "Cross-Domain", constraints: "Constraints",
  inversion: "Inversion", perspectives: "Perspectives",
  "what-if": "What-If", "trend-collision": "Trend Collision",
};

// ---- Core Functions ----

/**
 * Record a member activity event.
 */
export function recordActivity(activity: MemberActivity): void {
  activityLog.push(activity);
}

/**
 * Record multiple activity events.
 */
export function recordActivities(activities: MemberActivity[]): void {
  activityLog.push(...activities);
}

/**
 * Compute Shannon entropy for a probability distribution.
 */
export function shannonEntropy(probabilities: number[]): number {
  return -probabilities
    .filter((p) => p > 0)
    .reduce((sum, p) => sum + p * Math.log2(p), 0);
}

/**
 * Classify innovation style based on angle usage patterns.
 */
function classifyStyle(angleUsage: Record<string, number>): MemberProfile["innovationStyle"] {
  const total = Object.values(angleUsage).reduce((a, b) => a + b, 0);
  if (total === 0) return "explorer";

  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(angleUsage)) {
    normalized[k] = v / total;
  }

  if ((normalized["cross-domain"] ?? 0) > 0.3) return "connector";
  if ((normalized["inversion"] ?? 0) > 0.25 || (normalized["what-if"] ?? 0) > 0.25) return "disruptor";
  if ((normalized["first-principles"] ?? 0) > 0.3) return "analyzer";
  if ((normalized["constraints"] ?? 0) > 0.25) return "builder";
  return "explorer";
}

/**
 * Build a member profile from activity history.
 */
export function buildMemberProfile(userId: string): MemberProfile {
  const activities = activityLog.filter((a) => a.userId === userId);
  if (activities.length === 0) {
    return {
      userId,
      displayName: userId,
      angleUsage: {},
      votingPatterns: {},
      totalSessions: 0,
      totalIdeas: 0,
      totalVotes: 0,
      preferredAngles: [],
      avoidedAngles: [],
      innovationStyle: "explorer",
      lastActive: 0,
    };
  }

  const displayName = activities[activities.length - 1].displayName;
  const angleUsage: Record<string, number> = {};
  const votingPatterns: Record<string, number> = {};
  let totalIdeas = 0;
  let totalVotes = 0;

  for (const act of activities) {
    if (act.action === "used" || act.action === "generated") {
      angleUsage[act.angleId] = (angleUsage[act.angleId] ?? 0) + 1;
      totalIdeas++;
    } else if (act.action === "voted") {
      votingPatterns[act.angleId] = (votingPatterns[act.angleId] ?? 0) + 1;
      totalVotes++;
    }
  }

  const sortedAngles = Object.entries(angleUsage).sort(([, a], [, b]) => b - a);
  const preferredAngles = sortedAngles.slice(0, 3).map(([k]) => k);

  const allAngles = Object.keys(ANGLE_NAMES);
  const avoidedAngles = allAngles.filter(
    (a) => !angleUsage[a] || angleUsage[a] === 0
  );

  const sessions = new Set(activities.map((a) =>
    `${a.userId}-${new Date(a.timestamp).toISOString().slice(0, 10)}`
  ));

  return {
    userId,
    displayName,
    angleUsage,
    votingPatterns,
    totalSessions: sessions.size,
    totalIdeas,
    totalVotes,
    preferredAngles,
    avoidedAngles,
    innovationStyle: classifyStyle(angleUsage),
    lastActive: Math.max(...activities.map((a) => a.timestamp)),
  };
}

/**
 * Analyze team innovation DNA with blind spot detection.
 *
 * @param teamId - Team identifier
 * @param memberIds - List of member user IDs to include
 */
export function analyzeTeamDNA(teamId: string, memberIds: string[]): TeamDNA {
  const profiles = memberIds.map((id) => buildMemberProfile(id));

  // Aggregate angle usage across team
  const teamAngleUsage: Record<string, number> = {};
  for (const p of profiles) {
    for (const [angle, count] of Object.entries(p.angleUsage)) {
      teamAngleUsage[angle] = (teamAngleUsage[angle] ?? 0) + count;
    }
  }

  const totalUsage = Object.values(teamAngleUsage).reduce((a, b) => a + b, 0) || 1;
  const allAngles = Object.keys(ANGLE_NAMES);

  // Compute Shannon entropy
  const probs = allAngles.map((a) => (teamAngleUsage[a] ?? 0) / totalUsage);
  const entropy = shannonEntropy(probs);
  const maxEnt = Math.log2(allAngles.length);
  const diversityIndex = maxEnt > 0 ? entropy / maxEnt : 0;

  // Detect blind spots
  const blindSpots: BlindSpot[] = [];
  for (const angle of allAngles) {
    const usage = (teamAngleUsage[angle] ?? 0) / totalUsage;
    const expectedUsage = 1 / allAngles.length;
    const deficit = expectedUsage - usage;

    if (deficit > 0.05) {
      const severity: BlindSpot["severity"] = deficit > 0.1 ? "critical" : deficit > 0.07 ? "high" : deficit > 0.05 ? "medium" : "low";
      blindSpots.push({
        angleId: angle,
        angleName: ANGLE_NAMES[angle] ?? angle,
        teamUsageRate: usage,
        entropyContribution: usage > 0 ? -usage * Math.log2(usage) : 0,
        severity,
        suggestion: `Increase usage of "${ANGLE_NAMES[angle] ?? angle}" angle — currently at ${(usage * 100).toFixed(1)}% vs expected ${(expectedUsage * 100).toFixed(1)}%`,
      });
    }
  }

  // Identify team strengths and weaknesses
  const sortedUsage = Object.entries(teamAngleUsage).sort(([, a], [, b]) => b - a);
  const teamStrengths = sortedUsage.slice(0, 3).map(([angle]) =>
    `Strong in "${ANGLE_NAMES[angle] ?? angle}" thinking`
  );
  const teamWeaknesses = blindSpots.slice(0, 3).map((bs) =>
    `Underutilizes "${bs.angleName}" perspective`
  );

  // Suggest complementary pairings
  const suggestedPairings: TeamDNA["suggestedPairings"] = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const p1 = profiles[i];
      const p2 = profiles[j];
      const complementary = p1.preferredAngles.filter(
        (a) => p2.avoidedAngles.includes(a)
      ).concat(p2.preferredAngles.filter((a) => p1.avoidedAngles.includes(a)));

      if (complementary.length >= 2) {
        suggestedPairings.push({
          member1: p1.displayName,
          member2: p2.displayName,
          reason: `Complementary thinking styles: ${p1.innovationStyle} + ${p2.innovationStyle}`,
          complementaryAngles: complementary.slice(0, 5),
        });
      }
    }
  }

  return {
    teamId,
    memberProfiles: profiles,
    diversityIndex,
    shannonEntropy: entropy,
    maxEntropy: maxEnt,
    blindSpots: blindSpots.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    }),
    teamStrengths,
    teamWeaknesses,
    suggestedPairings: suggestedPairings.slice(0, 10),
  };
}

/**
 * Format team DNA analysis as Markdown.
 */
export function teamDNAToMarkdown(dna: TeamDNA): string {
  const lines: string[] = [
    `# 🧬 Team Innovation DNA: ${dna.teamId}`,
    "",
    `**Cognitive Diversity Index:** ${(dna.diversityIndex * 100).toFixed(1)}%`,
    `**Shannon Entropy:** ${dna.shannonEntropy.toFixed(2)} / ${dna.maxEntropy.toFixed(2)}`,
    `**Team Size:** ${dna.memberProfiles.length} members`,
    "",
  ];

  if (dna.teamStrengths.length) {
    lines.push("## Strengths", "");
    for (const s of dna.teamStrengths) lines.push(`- ✅ ${s}`);
    lines.push("");
  }

  if (dna.teamWeaknesses.length) {
    lines.push("## Weaknesses", "");
    for (const w of dna.teamWeaknesses) lines.push(`- ⚠️ ${w}`);
    lines.push("");
  }

  if (dna.blindSpots.length) {
    lines.push("## Blind Spots", "");
    for (const bs of dna.blindSpots) {
      lines.push(`- **${bs.angleName}** [${bs.severity}]: ${bs.suggestion}`);
    }
    lines.push("");
  }

  lines.push("## Member Profiles", "");
  for (const p of dna.memberProfiles) {
    lines.push(`### ${p.displayName} (${p.innovationStyle})`);
    lines.push(`- Sessions: ${p.totalSessions} | Ideas: ${p.totalIdeas} | Votes: ${p.totalVotes}`);
    if (p.preferredAngles.length) lines.push(`- Preferred: ${p.preferredAngles.join(", ")}`);
    if (p.avoidedAngles.length) lines.push(`- Avoided: ${p.avoidedAngles.join(", ")}`);
    lines.push("");
  }

  if (dna.suggestedPairings.length) {
    lines.push("## Suggested Pairings", "");
    for (const p of dna.suggestedPairings) {
      lines.push(`- **${p.member1} + ${p.member2}**: ${p.reason}`);
    }
  }

  return lines.join("\n");
}

/**
 * Clear all activity data (for testing).
 */
export function clearTeamDNAData(): void {
  activityLog.length = 0;
}
