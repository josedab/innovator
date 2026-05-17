/**
 * @module saas/onboarding
 *
 * Guided onboarding flow for hosted SaaS users.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Zod schema for an onboarding step definition. */
export const OnboardingStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  order: z.number().int().positive(),
  optional: z.boolean().default(false),
});

/** A guided onboarding step presented to a user. */
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

/** Zod schema for user onboarding progress. */
export const OnboardingProgressSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.enum(["in_progress", "completed", "skipped"]),
  currentStepId: z.string().optional(),
  completedStepIds: z.array(z.string()),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  skippedAt: z.string().optional(),
});

/** Progress state for a user's onboarding journey. */
export type OnboardingProgress = z.infer<typeof OnboardingProgressSchema>;

/** Ordered onboarding steps for first-time SaaS users. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "create-account",
    title: "Create account",
    description: "Set up your hosted Innovator account and profile.",
    order: 1,
    optional: false,
  },
  {
    id: "create-workspace",
    title: "Create workspace",
    description: "Create your first workspace to organize innovation sessions.",
    order: 2,
    optional: false,
  },
  {
    id: "first-investigation",
    title: "Run first investigation",
    description: "Kick off your first investigation to see the SaaS workflow in action.",
    order: 3,
    optional: false,
  },
  {
    id: "explore-angles",
    title: "Explore angles",
    description: "Review multiple innovation angles and compare the results.",
    order: 4,
    optional: false,
  },
  {
    id: "share-results",
    title: "Share results",
    description: "Share a result or invite collaborators to continue the work together.",
    order: 5,
    optional: false,
  },
].map((step) => OnboardingStepSchema.parse(step));

const onboardingProgress = new Map<string, OnboardingProgress>();

function getNextStepId(completedStepIds: string[]): string | undefined {
  return ONBOARDING_STEPS.find((step) => !completedStepIds.includes(step.id))?.id;
}

/**
 * Start onboarding for a user, or return existing progress if already started.
 * @param userId - The user beginning onboarding.
 * @returns The current onboarding progress record.
 */
export function startOnboarding(userId: string): OnboardingProgress {
  const existing = onboardingProgress.get(userId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const progress = OnboardingProgressSchema.parse({
    id: randomUUID(),
    userId,
    status: "in_progress",
    currentStepId: ONBOARDING_STEPS[0]?.id,
    completedStepIds: [],
    startedAt: now,
    updatedAt: now,
  });

  onboardingProgress.set(userId, progress);
  return progress;
}

/**
 * Mark an onboarding step as completed for a user.
 * @param userId - The user advancing through onboarding.
 * @param stepId - The step identifier to complete.
 * @returns Updated onboarding progress.
 */
export function completeStep(userId: string, stepId: string): OnboardingProgress {
  const step = ONBOARDING_STEPS.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new Error(`Unknown onboarding step: ${stepId}`);
  }

  const current = startOnboarding(userId);
  if (current.status === "skipped" || current.status === "completed") {
    return current;
  }

  const completedStepIds = current.completedStepIds.includes(stepId)
    ? current.completedStepIds
    : [...current.completedStepIds, stepId];
  const now = new Date().toISOString();
  const nextStepId = getNextStepId(completedStepIds);

  const updated = OnboardingProgressSchema.parse({
    ...current,
    completedStepIds,
    currentStepId: nextStepId,
    status: nextStepId ? "in_progress" : "completed",
    updatedAt: now,
    completedAt: nextStepId ? current.completedAt : now,
  });

  onboardingProgress.set(userId, updated);
  return updated;
}

/**
 * Retrieve onboarding progress for a user.
 * @param userId - The user whose progress should be returned.
 * @returns The progress record, or `null` when onboarding has not started.
 */
export function getOnboardingProgress(userId: string): OnboardingProgress | null {
  return onboardingProgress.get(userId) ?? null;
}

/**
 * Skip the onboarding experience for a user.
 * @param userId - The user skipping onboarding.
 * @returns Updated onboarding progress marked as skipped.
 */
export function skipOnboarding(userId: string): OnboardingProgress {
  const current = startOnboarding(userId);
  const now = new Date().toISOString();
  const updated = OnboardingProgressSchema.parse({
    ...current,
    status: "skipped",
    currentStepId: undefined,
    updatedAt: now,
    skippedAt: now,
  });

  onboardingProgress.set(userId, updated);
  return updated;
}

/**
 * Clear all in-memory onboarding progress.
 * Intended for test teardown.
 */
export function clearOnboardingData(): void {
  onboardingProgress.clear();
}
