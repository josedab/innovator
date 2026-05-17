/**
 * @module gamification/daily-challenges
 *
 * Deterministic daily challenge rotation with completion tracking.
 */

import { z } from "zod";

export const DailyChallengeSchema = z.object({
  id: z.string().max(200),
  date: z.string().max(10),
  title: z.string().max(500),
  description: z.string().max(2000),
  category: z.enum(["exploration", "quality", "speed", "diversity", "collaboration"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  points: z.number().int().min(1).max(100),
  criteria: z.object({
    type: z.enum(["complete-session", "use-angle", "score-threshold", "multi-angle", "time-limit"]),
    target: z.unknown(),
  }),
});
export type DailyChallenge = z.infer<typeof DailyChallengeSchema>;

export const ChallengeCompletionSchema = z.object({
  challengeId: z.string().max(200),
  userId: z.string().max(200),
  completedAt: z.string(),
  pointsEarned: z.number().int().min(0),
});
export type ChallengeCompletion = z.infer<typeof ChallengeCompletionSchema>;

type DailyChallengeTemplate = Omit<DailyChallenge, "id" | "date"> & { templateId: string };

export const DAILY_CHALLENGE_TEMPLATES: DailyChallengeTemplate[] = [
  {
    templateId: "explore-one-angle",
    title: "Angle Scout",
    description: "Complete one innovation session using an angle you have not touched this week.",
    category: "exploration",
    difficulty: "easy",
    points: 15,
    criteria: { type: "use-angle", target: { count: 1, unique: true } },
  },
  {
    templateId: "speed-sprint",
    title: "Ten-Minute Spark",
    description: "Complete a focused ideation session within ten minutes.",
    category: "speed",
    difficulty: "easy",
    points: 20,
    criteria: { type: "time-limit", target: { minutes: 10 } },
  },
  {
    templateId: "quality-threshold",
    title: "Quality First",
    description: "Generate an idea that scores at least 8/10 on your quality rubric.",
    category: "quality",
    difficulty: "medium",
    points: 30,
    criteria: { type: "score-threshold", target: { minimumScore: 8 } },
  },
  {
    templateId: "multi-angle-two",
    title: "Double Lens",
    description: "Explore a subject with at least two distinct innovation angles.",
    category: "diversity",
    difficulty: "easy",
    points: 20,
    criteria: { type: "multi-angle", target: { angles: 2 } },
  },
  {
    templateId: "complete-session",
    title: "Ship a Session",
    description: "Finish a complete investigation-to-synthesis session today.",
    category: "exploration",
    difficulty: "easy",
    points: 15,
    criteria: { type: "complete-session", target: { required: 1 } },
  },
  {
    templateId: "collaboration-share",
    title: "Collaborative Push",
    description: "Work with a teammate and contribute one shared idea or comment.",
    category: "collaboration",
    difficulty: "medium",
    points: 30,
    criteria: { type: "complete-session", target: { collaborative: true } },
  },
  {
    templateId: "three-angle-mix",
    title: "Triple Remix",
    description: "Use three different angles to challenge one assumption.",
    category: "diversity",
    difficulty: "medium",
    points: 35,
    criteria: { type: "multi-angle", target: { angles: 3 } },
  },
  {
    templateId: "fast-followup",
    title: "Rapid Follow-Up",
    description:
      "Start and complete a new session within fifteen minutes of capturing the problem.",
    category: "speed",
    difficulty: "medium",
    points: 25,
    criteria: { type: "time-limit", target: { minutes: 15 } },
  },
  {
    templateId: "stretch-score",
    title: "Nine-Out-of-Ten",
    description: "Produce a standout idea with a score of 9 or higher.",
    category: "quality",
    difficulty: "hard",
    points: 45,
    criteria: { type: "score-threshold", target: { minimumScore: 9 } },
  },
  {
    templateId: "angle-deep-dive",
    title: "Framework Focus",
    description: "Use one angle twice on different subjects to compare outcomes.",
    category: "exploration",
    difficulty: "medium",
    points: 30,
    criteria: { type: "use-angle", target: { count: 2, sameAngle: true } },
  },
  {
    templateId: "cross-domain",
    title: "Cross-Domain Borrower",
    description: "Import inspiration from another industry into today’s subject.",
    category: "diversity",
    difficulty: "hard",
    points: 40,
    criteria: { type: "multi-angle", target: { crossDomain: true } },
  },
  {
    templateId: "lightning-session",
    title: "Lightning Round",
    description:
      "Complete a session in under five minutes and capture at least one viable next step.",
    category: "speed",
    difficulty: "hard",
    points: 35,
    criteria: { type: "time-limit", target: { minutes: 5 } },
  },
  {
    templateId: "peer-review",
    title: "Peer Signal",
    description: "Review a teammate’s idea and add one constructive improvement.",
    category: "collaboration",
    difficulty: "medium",
    points: 25,
    criteria: { type: "complete-session", target: { peerReview: true } },
  },
  {
    templateId: "high-bar-session",
    title: "Elite Session",
    description: "Run a complete multi-angle session and land a top-tier score in the same day.",
    category: "quality",
    difficulty: "hard",
    points: 50,
    criteria: { type: "score-threshold", target: { minimumScore: 8.5, requiresSession: true } },
  },
];

const completionStore: ChallengeCompletion[] = [];

function normalizeDate(date?: string | Date): string {
  if (!date) return new Date().toISOString().slice(0, 10);
  if (typeof date === "string") return new Date(date).toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function challengeIndexForDate(date: string): number {
  const dayNumber = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 86_400_000);
  return (
    ((dayNumber % DAILY_CHALLENGE_TEMPLATES.length) + DAILY_CHALLENGE_TEMPLATES.length) %
    DAILY_CHALLENGE_TEMPLATES.length
  );
}

export function getDailyChallenge(date?: string | Date): DailyChallenge {
  const normalizedDate = normalizeDate(date);
  const template = DAILY_CHALLENGE_TEMPLATES[challengeIndexForDate(normalizedDate)];

  return DailyChallengeSchema.parse({
    id: `daily-${normalizedDate}-${template.templateId}`,
    date: normalizedDate,
    title: template.title,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    points: template.points,
    criteria: template.criteria,
  });
}

export function completeDailyChallenge(
  userId: string,
  challengeId: string
): ChallengeCompletion | undefined {
  const existing = completionStore.find(
    (completion) => completion.userId === userId && completion.challengeId === challengeId
  );
  if (existing) return { ...existing };

  const dateMatch = challengeId.match(/^daily-(\d{4}-\d{2}-\d{2})-/);
  if (!dateMatch) return undefined;

  const challenge = getDailyChallenge(dateMatch[1]);
  if (challenge.id !== challengeId) return undefined;

  const completion = ChallengeCompletionSchema.parse({
    challengeId,
    userId,
    completedAt: new Date().toISOString(),
    pointsEarned: challenge.points,
  });
  completionStore.push(completion);
  return { ...completion };
}

export function getUserDailyChallengeHistory(userId: string): ChallengeCompletion[] {
  return completionStore
    .filter((completion) => completion.userId === userId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .map((completion) => ({ ...completion }));
}

export function clearDailyChallengeData(): void {
  completionStore.length = 0;
}
