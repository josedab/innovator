/**
 * @module sharing
 *
 * Shareable investigation links — generates unique URLs for completed
 * investigations that can be shared publicly or within a team. Supports
 * snapshot storage, read-only viewing, and forking investigations.
 */

import { z } from "zod";
import type { AngleResult, Investigation, Synthesis } from "../types.js";

// ---- Zod Schemas ----

/** Schema for a shared investigation snapshot. */
export const SharedInvestigationSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().max(500),
  subject: z.string().max(500),
  investigation: z.unknown().optional(),
  angleResults: z.array(z.unknown()).optional(),
  synthesis: z.unknown().optional(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  createdBy: z.string().max(200).optional(),
  viewCount: z.number().default(0),
  isPublic: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

/** Schema for share options. */
export const ShareOptionsSchema = z.object({
  title: z.string().max(500).optional(),
  isPublic: z.boolean().optional().default(true),
  expiresInDays: z.number().min(1).max(365).optional(),
  createdBy: z.string().max(200).optional(),
});

/** Schema for a fork of a shared investigation. */
export const ForkResultSchema = z.object({
  sourceSlug: z.string(),
  newSessionId: z.string(),
  subject: z.string(),
  forkedAt: z.string(),
});

export type SharedInvestigation = z.infer<typeof SharedInvestigationSchema>;
export type ShareOptions = z.infer<typeof ShareOptionsSchema>;
export type ForkResult = z.infer<typeof ForkResultSchema>;

// ---- Slug Generation ----

/** Generate a unique, human-friendly slug. */
function generateSlug(subject: string): string {
  const base = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

// ---- In-memory Store ----

const sharedInvestigations: Map<string, SharedInvestigation> = new Map();

// ---- Core Functions ----

/**
 * Create a shareable link for a completed investigation.
 *
 * @param subject - The investigation subject
 * @param data - The investigation data to share
 * @param options - Sharing options
 * @returns The SharedInvestigation with a unique slug
 */
export function shareInvestigation(
  subject: string,
  data: {
    investigation?: Investigation;
    angleResults?: AngleResult[];
    synthesis?: Synthesis;
  },
  options: Partial<ShareOptions> = {}
): SharedInvestigation {
  const slug = generateSlug(subject);
  const now = new Date();

  const shared: SharedInvestigation = {
    slug,
    title: options.title ?? subject,
    subject,
    investigation: data.investigation,
    angleResults: data.angleResults,
    synthesis: data.synthesis,
    createdAt: now.toISOString(),
    expiresAt: options.expiresInDays
      ? new Date(now.getTime() + options.expiresInDays * 86400000).toISOString()
      : undefined,
    createdBy: options.createdBy,
    viewCount: 0,
    isPublic: options.isPublic ?? true,
  };

  sharedInvestigations.set(slug, shared);
  return shared;
}

/**
 * Retrieve a shared investigation by slug.
 *
 * @param slug - The unique slug
 * @returns The SharedInvestigation or undefined if not found/expired
 */
export function getSharedInvestigation(slug: string): SharedInvestigation | undefined {
  const shared = sharedInvestigations.get(slug);
  if (!shared) return undefined;

  // Check expiration
  if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
    sharedInvestigations.delete(slug);
    return undefined;
  }

  // Increment view count
  shared.viewCount++;

  return shared;
}

/**
 * List all shared investigations.
 *
 * @param publicOnly - If true, only return public investigations
 * @returns Array of SharedInvestigation
 */
export function listSharedInvestigations(publicOnly = false): SharedInvestigation[] {
  const now = new Date();
  const all = Array.from(sharedInvestigations.values())
    .filter((s) => {
      // Filter expired
      if (s.expiresAt && new Date(s.expiresAt) < now) return false;
      // Filter by visibility
      if (publicOnly && !s.isPublic) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return all;
}

/**
 * Delete a shared investigation.
 *
 * @param slug - The unique slug
 * @returns True if deleted, false if not found
 */
export function deleteSharedInvestigation(slug: string): boolean {
  return sharedInvestigations.delete(slug);
}

/** Clear all shared investigations. */
export function clearSharedInvestigations(): void {
  sharedInvestigations.clear();
}

/**
 * Update sharing options for an existing shared investigation.
 *
 * @param slug - The unique slug
 * @param updates - Fields to update
 * @returns Updated SharedInvestigation or undefined
 */
export function updateSharedInvestigation(
  slug: string,
  updates: Partial<Pick<SharedInvestigation, "title" | "isPublic" | "expiresAt">>
): SharedInvestigation | undefined {
  const shared = sharedInvestigations.get(slug);
  if (!shared) return undefined;

  if (updates.title !== undefined) shared.title = updates.title;
  if (updates.isPublic !== undefined) shared.isPublic = updates.isPublic;
  if (updates.expiresAt !== undefined) shared.expiresAt = updates.expiresAt;

  return shared;
}

/**
 * Fork a shared investigation into a new session.
 * Returns data needed to create a new local session from the shared one.
 *
 * @param slug - The slug of the shared investigation to fork
 * @returns ForkResult with session data, or undefined if not found
 */
export function forkInvestigation(slug: string): ForkResult | undefined {
  const shared = getSharedInvestigation(slug);
  if (!shared) return undefined;

  const newSessionId = `forked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    sourceSlug: slug,
    newSessionId,
    subject: shared.subject,
    forkedAt: new Date().toISOString(),
  };
}

/**
 * Build the share URL for a shared investigation.
 *
 * @param slug - The unique slug
 * @param baseUrl - The base URL of the application (e.g., "https://innovator.dev")
 * @returns The full shareable URL
 */
export function buildShareUrl(slug: string, baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}/share/${slug}`;
}
