/**
 * @module peer-review
 *
 * Innovation Peer Review Network — enables users to submit ideas for
 * asynchronous peer review by domain experts. Provides expertise profiles,
 * review request matching, structured review forms with dimension-specific
 * scoring, reviewer reputation, badges, leaderboards, and anti-gaming measures.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Expertise domain for reviewer profiles. */
export const ExpertiseDomainSchema = z.object({
  domain: z.string().max(200),
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  yearsOfExperience: z.number().min(0).max(50).optional(),
  keywords: z.array(z.string().max(100)).max(30).optional(),
});
export type ExpertiseDomain = z.infer<typeof ExpertiseDomainSchema>;

/** Reviewer expertise profile. */
export const ExpertiseProfileSchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  bio: z.string().max(2000).optional(),
  domains: z.array(ExpertiseDomainSchema).min(1).max(20),
  availability: z.enum(["available", "busy", "unavailable"]),
  maxReviewsPerWeek: z.number().int().min(0).max(50).default(5),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExpertiseProfile = z.infer<typeof ExpertiseProfileSchema>;

/** Review dimension scoring. */
export const ReviewDimensionSchema = z.object({
  dimension: z.enum([
    "feasibility",
    "novelty",
    "market-fit",
    "technical-depth",
    "scalability",
    "clarity",
  ]),
  score: z.number().min(1).max(10),
  feedback: z.string().max(2000),
});
export type ReviewDimension = z.infer<typeof ReviewDimensionSchema>;

/** Structured review form submitted by a reviewer. */
export const ReviewFormSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  reviewerId: z.string(),
  dimensions: z.array(ReviewDimensionSchema).min(1).max(10),
  overallScore: z.number().min(1).max(10),
  strengths: z.array(z.string().max(500)).max(10),
  weaknesses: z.array(z.string().max(500)).max(10),
  suggestions: z.array(z.string().max(500)).max(10),
  verdict: z.enum(["strong-approve", "approve", "needs-work", "reject"]),
  submittedAt: z.string(),
});
export type ReviewForm = z.infer<typeof ReviewFormSchema>;

/** Review request status lifecycle. */
export const ReviewStatusSchema = z.enum([
  "submitted",
  "matching",
  "in-review",
  "responded",
  "closed",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** A review request submitted by an idea author. */
export const ReviewRequestSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  domains: z.array(z.string().max(200)).min(1).max(10),
  context: z.string().max(5000).optional(),
  status: ReviewStatusSchema,
  matchedReviewers: z.array(z.string()).max(10),
  reviews: z.array(ReviewFormSchema).max(10),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

/** Badge earned by reviewers. */
export const ReviewerBadgeSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500),
  icon: z.string().max(50),
  earnedAt: z.string(),
});
export type ReviewerBadge = z.infer<typeof ReviewerBadgeSchema>;

/** Reviewer reputation profile. */
export const ReviewerReputationSchema = z.object({
  userId: z.string(),
  totalReviews: z.number().int().min(0),
  averageRating: z.number().min(0).max(5),
  helpfulnessScore: z.number().min(0).max(1),
  consistencyScore: z.number().min(0).max(1),
  reputationPoints: z.number().int().min(0),
  badges: z.array(ReviewerBadgeSchema).max(50),
  rank: z.number().int().min(1).optional(),
});
export type ReviewerReputation = z.infer<typeof ReviewerReputationSchema>;

/** Leaderboard entry. */
export const LeaderboardEntrySchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  reputationPoints: z.number().int(),
  totalReviews: z.number().int(),
  badges: z.array(ReviewerBadgeSchema),
  rank: z.number().int().min(1),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

/** Notification for review events. */
export const ReviewNotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum([
    "review-requested",
    "reviewer-matched",
    "review-submitted",
    "review-responded",
    "review-closed",
    "badge-earned",
  ]),
  message: z.string().max(1000),
  requestId: z.string().optional(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type ReviewNotification = z.infer<typeof ReviewNotificationSchema>;

// ---- Badge Definitions ----

const BADGE_DEFINITIONS: Omit<ReviewerBadge, "earnedAt">[] = [
  {
    id: "first-review",
    name: "First Review",
    description: "Completed first peer review",
    icon: "🌟",
  },
  {
    id: "ten-reviews",
    name: "Seasoned Reviewer",
    description: "Completed 10 peer reviews",
    icon: "🏅",
  },
  {
    id: "fifty-reviews",
    name: "Review Master",
    description: "Completed 50 peer reviews",
    icon: "🏆",
  },
  {
    id: "high-quality",
    name: "Quality Champion",
    description: "Maintained 4.5+ average rating over 10 reviews",
    icon: "💎",
  },
  {
    id: "domain-expert",
    name: "Domain Expert",
    description: "Reviewed 20+ ideas in a single domain",
    icon: "🎓",
  },
  {
    id: "helpful-reviewer",
    name: "Most Helpful",
    description: "Helpfulness score above 0.9",
    icon: "🤝",
  },
  {
    id: "consistent",
    name: "Consistent Reviewer",
    description: "Consistency score above 0.9",
    icon: "⚖️",
  },
  {
    id: "fast-turnaround",
    name: "Quick Responder",
    description: "Average review turnaround under 24 hours",
    icon: "⚡",
  },
];

// ---- In-Memory Stores ----

const profiles = new Map<string, ExpertiseProfile>();
const requests = new Map<string, ReviewRequest>();
const reputations = new Map<string, ReviewerReputation>();
const notifications: ReviewNotification[] = [];
const reviewTimestamps = new Map<string, string[]>(); // reviewerId → submittedAt[]

// ---- Anti-Gaming ----

const ANTI_GAMING = {
  minReviewLengthChars: 50,
  minDimensionsRequired: 3,
  maxReviewsPerDayPerReviewer: 10,
  selfReviewBlocked: true,
  duplicateDetectionWindowMs: 60_000,
} as const;

// ---- Profile Management ----

/** Create or update an expertise profile. */
export function upsertExpertiseProfile(profile: ExpertiseProfile): ExpertiseProfile {
  const validated = ExpertiseProfileSchema.parse(profile);
  profiles.set(validated.userId, validated);
  return validated;
}

/** Get an expertise profile by user ID. */
export function getExpertiseProfile(userId: string): ExpertiseProfile | undefined {
  return profiles.get(userId);
}

/** List all available reviewers. */
export function listAvailableReviewers(): ExpertiseProfile[] {
  return [...profiles.values()].filter((p) => p.availability === "available");
}

// ---- Review Request Lifecycle ----

/** Submit a new review request. */
export function submitReviewRequest(
  authorId: string,
  ideaTitle: string,
  ideaDescription: string,
  domains: string[],
  context?: string
): ReviewRequest {
  const now = new Date().toISOString();
  const request: ReviewRequest = {
    id: randomUUID(),
    authorId,
    ideaTitle,
    ideaDescription,
    domains,
    context,
    status: "submitted",
    matchedReviewers: [],
    reviews: [],
    createdAt: now,
    updatedAt: now,
  };
  const validated = ReviewRequestSchema.parse(request);
  requests.set(validated.id, validated);
  emitNotification(
    authorId,
    "review-requested",
    `Your review request for "${ideaTitle}" has been submitted.`,
    validated.id
  );
  return validated;
}

/** Get a review request by ID. */
export function getReviewRequest(requestId: string): ReviewRequest | undefined {
  return requests.get(requestId);
}

/** List review requests filtered by status. */
export function listReviewRequests(filters?: {
  status?: ReviewStatus;
  authorId?: string;
}): ReviewRequest[] {
  let results = [...requests.values()];
  if (filters?.status) results = results.filter((r) => r.status === filters.status);
  if (filters?.authorId) results = results.filter((r) => r.authorId === filters.authorId);
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- Reviewer-to-Idea Matching ----

/** Compute a match score between a reviewer profile and a review request. */
export function computeMatchScore(profile: ExpertiseProfile, request: ReviewRequest): number {
  if (ANTI_GAMING.selfReviewBlocked && profile.userId === request.authorId) return 0;
  if (profile.availability !== "available") return 0;

  let score = 0;
  const requestDomains = new Set(request.domains.map((d) => d.toLowerCase()));

  for (const expertise of profile.domains) {
    const domainLower = expertise.domain.toLowerCase();
    if (requestDomains.has(domainLower)) {
      const levelMultiplier = { beginner: 0.25, intermediate: 0.5, advanced: 0.75, expert: 1.0 }[
        expertise.level
      ];
      score += levelMultiplier;

      // Keyword overlap bonus
      if (expertise.keywords) {
        const descWords = new Set(request.ideaDescription.toLowerCase().split(/\s+/));
        const keywordMatches = expertise.keywords.filter((k) => descWords.has(k.toLowerCase()));
        score += keywordMatches.length * 0.1;
      }
    }
  }

  // Reputation bonus
  const rep = reputations.get(profile.userId);
  if (rep) {
    score += rep.helpfulnessScore * 0.3;
    score += rep.consistencyScore * 0.2;
  }

  return Math.min(score, 5);
}

/** Match reviewers to a review request, returning top N matches. */
export function matchReviewers(requestId: string, maxReviewers: number = 3): string[] {
  const request = requests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const candidates = listAvailableReviewers();
  const scored = candidates
    .map((profile) => ({ userId: profile.userId, score: computeMatchScore(profile, request) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxReviewers);

  const matchedIds = scored.map((s) => s.userId);
  request.matchedReviewers = matchedIds;
  request.status = matchedIds.length > 0 ? "matching" : "submitted";
  request.updatedAt = new Date().toISOString();

  for (const userId of matchedIds) {
    emitNotification(
      userId,
      "reviewer-matched",
      `You've been matched to review "${request.ideaTitle}".`,
      requestId
    );
  }

  return matchedIds;
}

// ---- Review Submission ----

/** Validate anti-gaming rules for a review submission. */
function validateAntiGaming(
  reviewerId: string,
  request: ReviewRequest,
  form: Partial<ReviewForm>
): string[] {
  const errors: string[] = [];

  if (ANTI_GAMING.selfReviewBlocked && reviewerId === request.authorId) {
    errors.push("Self-review is not allowed.");
  }

  if (form.dimensions && form.dimensions.length < ANTI_GAMING.minDimensionsRequired) {
    errors.push(`At least ${ANTI_GAMING.minDimensionsRequired} dimensions must be scored.`);
  }

  const totalFeedback = form.dimensions?.reduce((sum, d) => sum + d.feedback.length, 0) ?? 0;
  if (totalFeedback < ANTI_GAMING.minReviewLengthChars) {
    errors.push(`Total feedback must be at least ${ANTI_GAMING.minReviewLengthChars} characters.`);
  }

  // Rate limiting
  const timestamps = reviewTimestamps.get(reviewerId) ?? [];
  const oneDayAgo = Date.now() - 86_400_000;
  const recentCount = timestamps.filter((t) => new Date(t).getTime() > oneDayAgo).length;
  if (recentCount >= ANTI_GAMING.maxReviewsPerDayPerReviewer) {
    errors.push(`Maximum ${ANTI_GAMING.maxReviewsPerDayPerReviewer} reviews per day exceeded.`);
  }

  return errors;
}

/** Submit a review for a request. */
export function submitReview(
  requestId: string,
  reviewerId: string,
  dimensions: ReviewDimension[],
  overallScore: number,
  strengths: string[],
  weaknesses: string[],
  suggestions: string[],
  verdict: ReviewForm["verdict"]
): ReviewForm {
  const request = requests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);
  if (!request.matchedReviewers.includes(reviewerId)) {
    throw new Error("Reviewer is not matched to this request.");
  }
  if (request.reviews.some((r) => r.reviewerId === reviewerId)) {
    throw new Error("Reviewer has already submitted a review for this request.");
  }

  const now = new Date().toISOString();
  const form: ReviewForm = {
    id: randomUUID(),
    requestId,
    reviewerId,
    dimensions,
    overallScore,
    strengths,
    weaknesses,
    suggestions,
    verdict,
    submittedAt: now,
  };

  const errors = validateAntiGaming(reviewerId, request, form);
  if (errors.length > 0) throw new Error(`Anti-gaming validation failed: ${errors.join("; ")}`);

  const validated = ReviewFormSchema.parse(form);
  request.reviews.push(validated);
  request.status = "in-review";
  request.updatedAt = now;

  // Track timestamps for rate limiting
  const timestamps = reviewTimestamps.get(reviewerId) ?? [];
  timestamps.push(now);
  reviewTimestamps.set(reviewerId, timestamps);

  // Update reputation
  updateReputation(reviewerId);

  emitNotification(
    request.authorId,
    "review-submitted",
    `A review has been submitted for "${request.ideaTitle}".`,
    requestId
  );

  return validated;
}

/** Respond to reviews and close the request. */
export function closeReviewRequest(requestId: string, authorId: string): ReviewRequest {
  const request = requests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);
  if (request.authorId !== authorId) throw new Error("Only the author can close a review request.");
  if (request.reviews.length === 0) throw new Error("Cannot close request with no reviews.");

  request.status = "closed";
  request.closedAt = new Date().toISOString();
  request.updatedAt = request.closedAt;

  for (const review of request.reviews) {
    emitNotification(
      review.reviewerId,
      "review-closed",
      `Review request for "${request.ideaTitle}" has been closed.`,
      requestId
    );
  }

  return request;
}

// ---- Reputation System ----

/** Update reviewer reputation based on their review history. */
function updateReputation(reviewerId: string): void {
  const allReviews = [...requests.values()]
    .flatMap((r) => r.reviews)
    .filter((r) => r.reviewerId === reviewerId);

  if (allReviews.length === 0) return;

  const totalReviews = allReviews.length;
  const avgDimensions = allReviews.reduce((sum, r) => sum + r.dimensions.length, 0) / totalReviews;
  const avgFeedbackLength =
    allReviews.reduce(
      (sum, r) => sum + r.dimensions.reduce((s, d) => s + d.feedback.length, 0),
      0
    ) / totalReviews;

  // Helpfulness: normalized by feedback depth
  const helpfulnessScore = Math.min(1, avgFeedbackLength / 500);

  // Consistency: low variance in scoring
  const scores = allReviews.map((r) => r.overallScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const consistencyScore = Math.max(0, 1 - variance / 25);

  // Reputation points: weighted combination
  const reputationPoints = Math.floor(
    totalReviews * 10 + helpfulnessScore * 50 + consistencyScore * 30 + avgDimensions * 5
  );

  const existing = reputations.get(reviewerId);
  const badges = existing?.badges ?? [];

  // Check for new badges
  const earnedBadgeIds = new Set(badges.map((b) => b.id));
  const now = new Date().toISOString();

  if (!earnedBadgeIds.has("first-review") && totalReviews >= 1) {
    badges.push({ ...BADGE_DEFINITIONS.find((b) => b.id === "first-review")!, earnedAt: now });
    emitNotification(reviewerId, "badge-earned", "You earned the First Review badge! 🌟");
  }
  if (!earnedBadgeIds.has("ten-reviews") && totalReviews >= 10) {
    badges.push({ ...BADGE_DEFINITIONS.find((b) => b.id === "ten-reviews")!, earnedAt: now });
    emitNotification(reviewerId, "badge-earned", "You earned the Seasoned Reviewer badge! 🏅");
  }
  if (!earnedBadgeIds.has("fifty-reviews") && totalReviews >= 50) {
    badges.push({ ...BADGE_DEFINITIONS.find((b) => b.id === "fifty-reviews")!, earnedAt: now });
    emitNotification(reviewerId, "badge-earned", "You earned the Review Master badge! 🏆");
  }
  if (!earnedBadgeIds.has("helpful-reviewer") && helpfulnessScore > 0.9) {
    badges.push({ ...BADGE_DEFINITIONS.find((b) => b.id === "helpful-reviewer")!, earnedAt: now });
    emitNotification(reviewerId, "badge-earned", "You earned the Most Helpful badge! 🤝");
  }
  if (!earnedBadgeIds.has("consistent") && consistencyScore > 0.9 && totalReviews >= 5) {
    badges.push({ ...BADGE_DEFINITIONS.find((b) => b.id === "consistent")!, earnedAt: now });
    emitNotification(reviewerId, "badge-earned", "You earned the Consistent Reviewer badge! ⚖️");
  }

  const reputation: ReviewerReputation = {
    userId: reviewerId,
    totalReviews,
    averageRating: mean,
    helpfulnessScore,
    consistencyScore,
    reputationPoints,
    badges,
  };

  reputations.set(reviewerId, reputation);
}

/** Get reviewer reputation. */
export function getReviewerReputation(userId: string): ReviewerReputation | undefined {
  return reputations.get(userId);
}

/** Get the leaderboard sorted by reputation points. */
export function getLeaderboard(limit: number = 20): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [...reputations.values()]
    .sort((a, b) => b.reputationPoints - a.reputationPoints)
    .slice(0, limit)
    .map((rep, i) => ({
      userId: rep.userId,
      displayName: profiles.get(rep.userId)?.displayName ?? rep.userId,
      reputationPoints: rep.reputationPoints,
      totalReviews: rep.totalReviews,
      badges: rep.badges,
      rank: i + 1,
    }));
  return entries;
}

// ---- LLM-Powered Review Matching ----

/** Use LLM to generate a detailed review suggestion for a matched reviewer. */
export async function generateReviewGuidance(
  requestId: string,
  reviewerId: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<string> {
  const request = requests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);
  const profile = profiles.get(reviewerId);
  if (!profile) throw new Error(`Reviewer profile ${reviewerId} not found`);

  const prompt = `You are an innovation review coach. Generate review guidance for a peer reviewer.

${wrapUserInput("IDEA TITLE", request.ideaTitle)}
${wrapUserInput("IDEA DESCRIPTION", request.ideaDescription)}
${request.context ? wrapUserInput("ADDITIONAL CONTEXT", request.context) : ""}

REVIEWER EXPERTISE: ${profile.domains.map((d) => `${d.domain} (${d.level})`).join(", ")}

Provide structured guidance on:
1. Key aspects to evaluate given the reviewer's expertise
2. Specific questions to consider for each review dimension
3. Common pitfalls to look for in this type of idea
4. Suggestions for constructive feedback

Keep guidance concise and actionable.`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  return raw;
}

// ---- Notifications ----

function emitNotification(
  userId: string,
  type: ReviewNotification["type"],
  message: string,
  requestId?: string
): void {
  notifications.push({
    id: randomUUID(),
    userId,
    type,
    message,
    requestId,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

/** Get unread notifications for a user. */
export function getNotifications(userId: string, unreadOnly: boolean = true): ReviewNotification[] {
  return notifications
    .filter((n) => n.userId === userId && (!unreadOnly || !n.read))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Mark notifications as read. */
export function markNotificationsRead(notificationIds: string[]): void {
  const idSet = new Set(notificationIds);
  for (const n of notifications) {
    if (idSet.has(n.id)) n.read = true;
  }
}

// ---- Store Management ----

/** Clear all peer review data (for testing). */
export function clearPeerReviewData(): void {
  profiles.clear();
  requests.clear();
  reputations.clear();
  notifications.length = 0;
  reviewTimestamps.clear();
}
