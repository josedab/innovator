/**
 * @module federation-dp/network
 *
 * Cross-Organization Innovation Network — org registration, opt-in topic
 * subscriptions, DP-protected trend aggregation, anonymized dashboards,
 * and cross-org innovation challenges with blind judging.
 */

import { z } from "zod";
import { laplaceMechanism, laplaceConfidenceInterval } from "./federation-dp.js";
import type { DPConfig, AnonymizedPattern } from "./types.js";

// ---- Organization Schemas ----

export const OrgRegistrationSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  adminEmail: z.string().max(300),
  status: z.enum(["active", "suspended", "pending"]),
  tier: z.enum(["community", "professional", "enterprise"]),
  optInTopics: z.array(z.string().max(200)).max(50),
  privacySettings: z.object({
    shareAngleEffectiveness: z.boolean(),
    shareTrendData: z.boolean(),
    shareAnonymizedIdeas: z.boolean(),
    minimumAggregationSize: z.number().int().min(3).max(100),
  }),
  joinedAt: z.string(),
  lastActiveAt: z.string().optional(),
});

export const TopicSubscriptionSchema = z.object({
  id: z.string().max(100),
  orgId: z.string().max(100),
  topic: z.string().max(200),
  subscribedAt: z.string(),
  notificationsEnabled: z.boolean().default(true),
});

export const TrendDataPointSchema = z.object({
  topic: z.string().max(200),
  period: z.string().max(20),
  noisedSessionCount: z.number(),
  noisedIdeaCount: z.number(),
  trendDirection: z.enum(["rising", "stable", "declining"]),
  topAngles: z.array(z.string().max(100)).max(10),
  confidenceInterval: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  contributingOrgs: z.number().int().min(0),
});

export const ChallengeSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  description: z.string().max(5000),
  createdByOrgId: z.string().max(100),
  topic: z.string().max(200),
  status: z.enum(["draft", "open", "judging", "completed", "cancelled"]),
  startDate: z.string(),
  endDate: z.string(),
  maxSubmissions: z.number().int().min(1).max(1000).default(100),
  judgingCriteria: z.array(
    z.object({
      name: z.string().max(200),
      weight: z.number().min(0).max(1),
      description: z.string().max(500),
    })
  ),
  submissions: z
    .array(
      z.object({
        id: z.string().max(100),
        orgId: z.string().max(100),
        anonymousId: z.string().max(100),
        submittedAt: z.string(),
        ideaSummary: z.string().max(2000),
        scores: z.record(z.number()).optional(),
        totalScore: z.number().optional(),
        rank: z.number().int().optional(),
      })
    )
    .default([]),
  createdAt: z.string(),
});

export type OrgRegistration = z.infer<typeof OrgRegistrationSchema>;
export type TopicSubscription = z.infer<typeof TopicSubscriptionSchema>;
export type TrendDataPoint = z.infer<typeof TrendDataPointSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;

// ---- In-Memory Stores ----

const organizations = new Map<string, OrgRegistration>();
const subscriptions: TopicSubscription[] = [];
const challenges = new Map<string, Challenge>();
const orgPatterns = new Map<string, AnonymizedPattern[]>();

// ---- Organization Management ----

/** Register a new organization in the federation network. */
export function registerOrganization(
  name: string,
  adminEmail: string,
  tier: OrgRegistration["tier"] = "community"
): OrgRegistration {
  const id = `org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 100);

  const org: OrgRegistration = {
    id,
    name,
    slug,
    adminEmail,
    status: "active",
    tier,
    optInTopics: [],
    privacySettings: {
      shareAngleEffectiveness: true,
      shareTrendData: true,
      shareAnonymizedIdeas: false,
      minimumAggregationSize: 5,
    },
    joinedAt: new Date().toISOString(),
  };

  organizations.set(id, org);
  return org;
}

/** Get an organization by ID. */
export function getOrganization(orgId: string): OrgRegistration | undefined {
  return organizations.get(orgId);
}

/** List all active organizations. */
export function listOrganizations(): OrgRegistration[] {
  return Array.from(organizations.values()).filter((o) => o.status === "active");
}

/** Update org privacy settings. */
export function updatePrivacySettings(
  orgId: string,
  settings: Partial<OrgRegistration["privacySettings"]>
): boolean {
  const org = organizations.get(orgId);
  if (!org) return false;
  Object.assign(org.privacySettings, settings);
  return true;
}

/** Suspend an organization. */
export function suspendOrganization(orgId: string): boolean {
  const org = organizations.get(orgId);
  if (!org) return false;
  org.status = "suspended";
  return true;
}

// ---- Topic Subscriptions ----

/** Subscribe an org to a topic for trend notifications. */
export function subscribeToTopic(orgId: string, topic: string): TopicSubscription {
  const existing = subscriptions.find((s) => s.orgId === orgId && s.topic === topic);
  if (existing) return existing;

  const sub: TopicSubscription = {
    id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    topic,
    subscribedAt: new Date().toISOString(),
    notificationsEnabled: true,
  };

  subscriptions.push(sub);

  // Also add to org's opt-in topics
  const org = organizations.get(orgId);
  if (org && !org.optInTopics.includes(topic)) {
    org.optInTopics.push(topic);
  }

  return sub;
}

/** Unsubscribe from a topic. */
export function unsubscribeFromTopic(orgId: string, topic: string): boolean {
  const idx = subscriptions.findIndex((s) => s.orgId === orgId && s.topic === topic);
  if (idx === -1) return false;
  subscriptions.splice(idx, 1);

  const org = organizations.get(orgId);
  if (org) {
    org.optInTopics = org.optInTopics.filter((t) => t !== topic);
  }

  return true;
}

/** List subscriptions for an org. */
export function listSubscriptions(orgId: string): TopicSubscription[] {
  return subscriptions.filter((s) => s.orgId === orgId);
}

// ---- Pattern Contribution ----

/** Submit anonymized patterns from an org (already DP-protected). */
export function contributePatterns(orgId: string, patterns: AnonymizedPattern[]): boolean {
  const org = organizations.get(orgId);
  if (!org || org.status !== "active") return false;
  if (!org.privacySettings.shareAngleEffectiveness) return false;

  const existing = orgPatterns.get(orgId) ?? [];
  existing.push(...patterns);
  orgPatterns.set(orgId, existing);

  org.lastActiveAt = new Date().toISOString();
  return true;
}

// ---- DP-Protected Trend Aggregation ----

/**
 * Aggregate trends across organizations with differential privacy.
 * Only produces aggregates when enough orgs contribute (minimum aggregation size).
 */
export function aggregateTrends(
  topic: string,
  dpConfig: DPConfig = { epsilon: 1.0, sensitivity: 1, maxBudgetSpent: 10 }
): TrendDataPoint | null {
  // Collect patterns matching the topic from all contributing orgs
  const matchingOrgs: string[] = [];
  let totalSessions = 0;
  let totalIdeas = 0;
  const angleFrequency = new Map<string, number>();

  for (const [orgId, patterns] of orgPatterns.entries()) {
    const org = organizations.get(orgId);
    if (!org || !org.privacySettings.shareTrendData) continue;

    const topicPatterns = patterns.filter((p) =>
      p.topicCategory.toLowerCase().includes(topic.toLowerCase())
    );

    if (topicPatterns.length === 0) continue;

    matchingOrgs.push(orgId);
    for (const p of topicPatterns) {
      totalSessions += p.sampleSize;
      totalIdeas += Math.round(p.noisedValue * p.sampleSize);
      const angleId = p.angleId ?? "unknown";
      angleFrequency.set(angleId, (angleFrequency.get(angleId) ?? 0) + 1);
    }
  }

  // Check minimum aggregation threshold
  const minOrgs = Math.min(
    ...Array.from(organizations.values())
      .filter((o) => o.status === "active")
      .map((o) => o.privacySettings.minimumAggregationSize),
    5
  );

  if (matchingOrgs.length < minOrgs) {
    return null; // Not enough contributing orgs
  }

  // Apply DP noise to aggregated counts
  const { noisedValue: noisedSessions } = laplaceMechanism(
    totalSessions,
    dpConfig.sensitivity,
    dpConfig.epsilon
  );
  const { noisedValue: noisedIdeas } = laplaceMechanism(
    totalIdeas,
    dpConfig.sensitivity,
    dpConfig.epsilon
  );
  const ci = laplaceConfidenceInterval(noisedSessions, dpConfig.sensitivity, dpConfig.epsilon);

  // Top angles
  const sortedAngles = Array.from(angleFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([angle]) => angle);

  // Simple trend direction heuristic
  const period = new Date().toISOString().slice(0, 7);
  const trendDirection: TrendDataPoint["trendDirection"] =
    noisedSessions > 10 ? "rising" : noisedSessions > 3 ? "stable" : "declining";

  return {
    topic,
    period,
    noisedSessionCount: Math.max(0, Math.round(noisedSessions)),
    noisedIdeaCount: Math.max(0, Math.round(noisedIdeas)),
    trendDirection,
    topAngles: sortedAngles,
    confidenceInterval: {
      lower: Math.max(0, Math.round(ci.lower)),
      upper: Math.max(0, Math.round(ci.upper)),
    },
    contributingOrgs: matchingOrgs.length,
  };
}

/** Get trends for all topics with sufficient data. */
export function getNetworkTrends(dpConfig?: DPConfig): TrendDataPoint[] {
  // Collect all unique topics
  const allTopics = new Set<string>();
  for (const patterns of orgPatterns.values()) {
    for (const p of patterns) {
      allTopics.add(p.topicCategory);
    }
  }

  const trends: TrendDataPoint[] = [];
  for (const topic of allTopics) {
    const trend = aggregateTrends(topic, dpConfig);
    if (trend) trends.push(trend);
  }

  return trends.sort((a, b) => b.noisedSessionCount - a.noisedSessionCount);
}

// ---- Cross-Org Innovation Challenges ----

/** Create a cross-org innovation challenge. */
export function createChallenge(
  orgId: string,
  title: string,
  description: string,
  topic: string,
  endDate: string,
  judgingCriteria: Challenge["judgingCriteria"]
): Challenge {
  const org = organizations.get(orgId);
  if (!org || org.status !== "active") {
    throw new Error("Organization not found or not active");
  }

  const challenge: Challenge = {
    id: `challenge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    createdByOrgId: orgId,
    topic,
    status: "open",
    startDate: new Date().toISOString(),
    endDate,
    maxSubmissions: 100,
    judgingCriteria,
    submissions: [],
    createdAt: new Date().toISOString(),
  };

  challenges.set(challenge.id, challenge);
  return challenge;
}

/** Submit an idea to a challenge (anonymized). */
export function submitToChallenge(
  challengeId: string,
  orgId: string,
  ideaSummary: string
): { submissionId: string; anonymousId: string } | null {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== "open") return null;

  const org = organizations.get(orgId);
  if (!org || org.status !== "active") return null;

  if (challenge.submissions.length >= challenge.maxSubmissions) return null;

  // Generate anonymous ID to decouple from org identity during judging
  const anonymousId = `anon-${Math.random().toString(36).slice(2, 10)}`;
  const submissionId = `csub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  challenge.submissions.push({
    id: submissionId,
    orgId,
    anonymousId,
    submittedAt: new Date().toISOString(),
    ideaSummary,
  });

  return { submissionId, anonymousId };
}

/** Score a submission (blind judging — judges only see anonymousId). */
export function scoreSubmission(
  challengeId: string,
  anonymousId: string,
  scores: Record<string, number>
): boolean {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== "judging") return false;

  const submission = challenge.submissions.find((s) => s.anonymousId === anonymousId);
  if (!submission) return false;

  submission.scores = scores;

  // Calculate weighted total score
  let totalScore = 0;
  for (const criterion of challenge.judgingCriteria) {
    const score = scores[criterion.name] ?? 0;
    totalScore += score * criterion.weight;
  }
  submission.totalScore = Math.round(totalScore * 100) / 100;

  return true;
}

/** Close submissions and begin judging phase. */
export function startJudging(challengeId: string): boolean {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== "open") return false;
  challenge.status = "judging";
  return true;
}

/** Finalize judging and rank submissions. */
export function finalizeChallenge(challengeId: string): Challenge | null {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== "judging") return null;

  // Rank by total score
  const scored = challenge.submissions
    .filter((s) => s.totalScore != null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));

  scored.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  challenge.status = "completed";
  return challenge;
}

/** Get a challenge by ID. */
export function getChallenge(challengeId: string): Challenge | undefined {
  return challenges.get(challengeId);
}

/** List challenges, optionally filtered by topic or status. */
export function listChallenges(options?: {
  topic?: string;
  status?: Challenge["status"];
}): Challenge[] {
  let result = Array.from(challenges.values());
  if (options?.topic) {
    result = result.filter((c) => c.topic.toLowerCase().includes(options.topic!.toLowerCase()));
  }
  if (options?.status) {
    result = result.filter((c) => c.status === options.status);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Clear all cross-org network state (for testing). */
export function clearNetworkState(): void {
  organizations.clear();
  subscriptions.length = 0;
  challenges.clear();
  orgPatterns.clear();
}
