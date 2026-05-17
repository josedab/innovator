/**
 * @module gamification/challenges
 *
 * Community Innovation Challenges — public or private challenge boards
 * where organizations post innovation challenges, community members submit
 * investigations, and results are ranked/voted on. Includes leaderboards,
 * badges, and reputation system.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const ChallengeStatusSchema = z.enum(["draft", "open", "judging", "closed", "archived"]);

export const CommunitySubmissionSchema = z.object({
  id: z.string(),
  challengeId: z.string(),
  authorId: z.string(),
  authorName: z.string().max(200),
  title: z.string().max(500),
  description: z.string().max(10000),
  angleIds: z.array(z.string().max(100)).max(8),
  attachments: z
    .array(
      z.object({
        name: z.string().max(500),
        url: z.string().max(2000),
        type: z.string().max(100),
      })
    )
    .max(10)
    .optional(),
  votes: z.number().default(0),
  voterIds: z.array(z.string()).max(1000),
  score: z.number().min(0).max(100).optional(),
  feedback: z.string().max(5000).optional(),
  submittedAt: z.string(),
  updatedAt: z.string(),
});

export const CommunityChallengeSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(10000),
  organizerId: z.string(),
  organizerName: z.string().max(200),
  status: ChallengeStatusSchema,
  isPublic: z.boolean().default(true),
  category: z.string().max(200).optional(),
  prize: z.string().max(1000).optional(),
  judgingCriteria: z
    .array(
      z.object({
        name: z.string().max(200),
        weight: z.number().min(0).max(1),
        description: z.string().max(500),
      })
    )
    .max(10),
  submissions: z.array(CommunitySubmissionSchema).max(500),
  maxSubmissions: z.number().default(100),
  deadline: z.string().optional(),
  suggestedAngles: z.array(z.string().max(100)).max(8).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
});

export const BadgeSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(500),
  icon: z.string().max(10),
  category: z.enum(["participation", "quality", "community", "streak", "special"]),
  earnedAt: z.string(),
  challengeId: z.string().optional(),
});

export const CommunityLeaderboardEntrySchema = z.object({
  userId: z.string(),
  userName: z.string().max(200),
  totalPoints: z.number(),
  submissionsCount: z.number(),
  winsCount: z.number(),
  votesReceived: z.number(),
  badges: z.array(BadgeSchema).max(50),
  rank: z.number(),
});

// ---- Types ----

export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;
export type CommunitySubmission = z.infer<typeof CommunitySubmissionSchema>;
export type CommunityChallenge = z.infer<typeof CommunityChallengeSchema>;
export type Badge = z.infer<typeof BadgeSchema>;
export type CommunityLeaderboardEntry = z.infer<typeof CommunityLeaderboardEntrySchema>;

// ---- In-Memory Stores ----

const challenges = new Map<string, CommunityChallenge>();
const userBadges = new Map<string, Badge[]>();
const userPoints = new Map<string, number>();

// ---- Core Functions ----

/** Create a new community challenge. */
export function createCommunityChallenge(params: {
  title: string;
  description: string;
  organizerId: string;
  organizerName: string;
  isPublic?: boolean;
  category?: string;
  prize?: string;
  judgingCriteria: Array<{ name: string; weight: number; description: string }>;
  maxSubmissions?: number;
  deadline?: string;
  suggestedAngles?: string[];
  tags?: string[];
}): CommunityChallenge {
  const id = randomUUID();
  const now = new Date().toISOString();
  const challenge: CommunityChallenge = {
    id,
    title: params.title,
    description: params.description,
    organizerId: params.organizerId,
    organizerName: params.organizerName,
    status: "draft",
    isPublic: params.isPublic ?? true,
    category: params.category,
    prize: params.prize,
    judgingCriteria: params.judgingCriteria,
    submissions: [],
    maxSubmissions: params.maxSubmissions ?? 100,
    deadline: params.deadline,
    suggestedAngles: params.suggestedAngles,
    tags: params.tags,
    createdAt: now,
    updatedAt: now,
  };
  challenges.set(id, challenge);
  return challenge;
}

/** Get a community challenge by ID. */
export function getCommunityChallenge(id: string): CommunityChallenge | undefined {
  return challenges.get(id);
}

/** List community challenges with optional filters. */
export function listCommunityChallenges(filter?: {
  status?: ChallengeStatus;
  isPublic?: boolean;
  category?: string;
}): CommunityChallenge[] {
  let list = Array.from(challenges.values());
  if (filter?.status) list = list.filter((c) => c.status === filter.status);
  if (filter?.isPublic !== undefined) list = list.filter((c) => c.isPublic === filter.isPublic);
  if (filter?.category) list = list.filter((c) => c.category === filter.category);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Submit an entry to a challenge. */
export function submitEntry(
  challengeId: string,
  params: {
    authorId: string;
    authorName: string;
    title: string;
    description: string;
    angleIds?: string[];
    attachments?: Array<{ name: string; url: string; type: string }>;
  }
): CommunitySubmission | undefined {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== "open") return undefined;
  if (challenge.submissions.length >= challenge.maxSubmissions) return undefined;

  // Check deadline
  if (challenge.deadline && new Date(challenge.deadline) < new Date()) return undefined;

  // Check for duplicate submission from same author
  if (challenge.submissions.some((s) => s.authorId === params.authorId)) return undefined;

  const now = new Date().toISOString();
  const submission: CommunitySubmission = {
    id: randomUUID(),
    challengeId,
    authorId: params.authorId,
    authorName: params.authorName,
    title: params.title,
    description: params.description,
    angleIds: params.angleIds ?? [],
    attachments: params.attachments,
    votes: 0,
    voterIds: [],
    submittedAt: now,
    updatedAt: now,
  };

  challenge.submissions.push(submission);
  challenge.updatedAt = now;
  challenges.set(challengeId, challenge);

  // Award points for submission
  const currentPoints = userPoints.get(params.authorId) ?? 0;
  userPoints.set(params.authorId, currentPoints + 10);

  // Award badge for first submission
  const badges = userBadges.get(params.authorId) ?? [];
  if (!badges.some((b) => b.id === "first-submission")) {
    badges.push({
      id: "first-submission",
      name: "First Submission",
      description: "Submitted your first challenge entry",
      icon: "🎯",
      category: "participation",
      earnedAt: now,
      challengeId,
    });
    userBadges.set(params.authorId, badges);
  }

  return submission;
}

/** Vote for a submission. */
export function voteForEntry(challengeId: string, submissionId: string, voterId: string): boolean {
  const challenge = challenges.get(challengeId);
  if (!challenge || (challenge.status !== "open" && challenge.status !== "judging")) return false;

  const submission = challenge.submissions.find((s) => s.id === submissionId);
  if (!submission) return false;

  // Prevent self-voting and duplicate voting
  if (submission.authorId === voterId) return false;
  if (submission.voterIds.includes(voterId)) return false;

  submission.votes++;
  submission.voterIds.push(voterId);
  submission.updatedAt = new Date().toISOString();
  challenge.updatedAt = new Date().toISOString();
  challenges.set(challengeId, challenge);

  // Award points to the submission author
  const authorPoints = userPoints.get(submission.authorId) ?? 0;
  userPoints.set(submission.authorId, authorPoints + 2);

  return true;
}

/** Get ranked submissions for a challenge. */
export function getEntryRankings(challengeId: string): CommunitySubmission[] {
  const challenge = challenges.get(challengeId);
  if (!challenge) return [];

  return [...challenge.submissions].sort((a, b) => {
    // Sort by score first (if judged), then by votes
    if (a.score !== undefined && b.score !== undefined) {
      return b.score - a.score;
    }
    return b.votes - a.votes;
  });
}

/** Award a badge to a user. */
export function awardBadge(
  userId: string,
  badge: {
    name: string;
    description: string;
    icon: string;
    category: "participation" | "quality" | "community" | "streak" | "special";
    challengeId?: string;
  }
): Badge {
  const newBadge: Badge = {
    id: randomUUID(),
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    category: badge.category,
    earnedAt: new Date().toISOString(),
    challengeId: badge.challengeId,
  };

  const badges = userBadges.get(userId) ?? [];
  badges.push(newBadge);
  userBadges.set(userId, badges);

  // Award points for earning a badge
  const currentPoints = userPoints.get(userId) ?? 0;
  userPoints.set(userId, currentPoints + 5);

  return newBadge;
}

/** Get all badges for a user. */
export function getUserBadges(userId: string): Badge[] {
  return userBadges.get(userId) ?? [];
}

/** Get the community leaderboard. */
export function getCommunityLeaderboard(limit: number = 20): CommunityLeaderboardEntry[] {
  const userStats = new Map<
    string,
    {
      userName: string;
      submissionsCount: number;
      winsCount: number;
      votesReceived: number;
    }
  >();

  // Aggregate stats from all challenges
  for (const challenge of challenges.values()) {
    const ranked = getEntryRankings(challenge.id);
    for (let i = 0; i < ranked.length; i++) {
      const sub = ranked[i];
      const stats = userStats.get(sub.authorId) ?? {
        userName: sub.authorName,
        submissionsCount: 0,
        winsCount: 0,
        votesReceived: 0,
      };
      stats.submissionsCount++;
      stats.votesReceived += sub.votes;
      if (i === 0 && challenge.status === "closed") {
        stats.winsCount++;
      }
      userStats.set(sub.authorId, stats);
    }
  }

  // Build leaderboard entries
  const entries: CommunityLeaderboardEntry[] = Array.from(userStats.entries())
    .map(([userId, stats]) => ({
      userId,
      userName: stats.userName,
      totalPoints: userPoints.get(userId) ?? 0,
      submissionsCount: stats.submissionsCount,
      winsCount: stats.winsCount,
      votesReceived: stats.votesReceived,
      badges: userBadges.get(userId) ?? [],
      rank: 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign ranks
  entries.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  return entries.slice(0, limit);
}

/** Close a challenge and determine winners. */
export function closeCommunityChallenge(challengeId: string): CommunityChallenge | undefined {
  const challenge = challenges.get(challengeId);
  if (!challenge) return undefined;

  const now = new Date().toISOString();
  challenge.status = "closed";
  challenge.closedAt = now;
  challenge.updatedAt = now;

  // Award winner badge
  const ranked = getEntryRankings(challengeId);
  if (ranked.length > 0) {
    const winner = ranked[0];
    awardBadge(winner.authorId, {
      name: "Challenge Winner",
      description: `Won the challenge: ${challenge.title}`,
      icon: "🏆",
      category: "quality",
      challengeId,
    });

    // Bonus points for winner
    const winnerPoints = userPoints.get(winner.authorId) ?? 0;
    userPoints.set(winner.authorId, winnerPoints + 50);
  }

  challenges.set(challengeId, challenge);
  return challenge;
}

/** Clear all community challenge data (for testing). */
export function clearCommunityChallenges(): void {
  challenges.clear();
  userBadges.clear();
  userPoints.clear();
}
