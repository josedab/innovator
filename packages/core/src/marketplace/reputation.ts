/**
 * @module marketplace/reputation
 *
 * Reputation and trust system for marketplace contributors.
 * Tracks creator quality, reviews, and trust scores.
 * Manages prompt packs and template collections with discovery and curation.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Reputation Schemas ----

export const ReputationLevelSchema = z.enum([
  "newcomer",
  "contributor",
  "trusted",
  "expert",
  "elite",
]);
export type ReputationLevel = z.infer<typeof ReputationLevelSchema>;

export const CreatorReputationSchema = z.object({
  creatorId: z.string(),
  displayName: z.string().max(200),
  level: ReputationLevelSchema,
  score: z.number().min(0),
  totalPublished: z.number().int().min(0),
  totalDownloads: z.number().int().min(0),
  totalStars: z.number().int().min(0),
  avgRating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  badges: z.array(z.string().max(100)).max(20),
  joinedAt: z.string(),
  lastActiveAt: z.string(),
});
export type CreatorReputation = z.infer<typeof CreatorReputationSchema>;

export const ReviewSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  reviewerId: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200),
  body: z.string().max(2000),
  helpful: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

// ---- Prompt Pack Schemas ----

export const PromptPackSchema = z.object({
  id: z.string(),
  title: z.string().max(300),
  description: z.string().max(2000),
  creatorId: z.string(),
  version: z.string().max(20),
  prompts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(200),
        template: z.string().max(5000),
        variables: z.array(z.string().max(100)).max(20),
        category: z.string().max(100).optional(),
      })
    )
    .min(1)
    .max(50),
  tags: z.array(z.string().max(50)).max(20),
  downloads: z.number().int().min(0).default(0),
  avgRating: z.number().min(0).max(5).default(0),
  featured: z.boolean().default(false),
  publishedAt: z.string(),
  updatedAt: z.string(),
});
export type PromptPack = z.infer<typeof PromptPackSchema>;

// ---- Collection Schemas ----

export const CuratedCollectionSchema = z.object({
  id: z.string(),
  title: z.string().max(300),
  description: z.string().max(2000),
  curatorId: z.string(),
  itemIds: z.array(z.string()).max(100),
  tags: z.array(z.string().max(50)).max(20),
  featured: z.boolean().default(false),
  views: z.number().int().min(0).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CuratedCollection = z.infer<typeof CuratedCollectionSchema>;

// ---- In-Memory Stores ----

const reputations = new Map<string, CreatorReputation>();
const reviews = new Map<string, Review>();
const promptPacks = new Map<string, PromptPack>();
const collections = new Map<string, CuratedCollection>();

// ---- Reputation Management ----

/** Get or create a creator's reputation profile. */
export function getReputation(creatorId: string): CreatorReputation {
  const existing = reputations.get(creatorId);
  if (existing) return existing;

  const rep: CreatorReputation = {
    creatorId,
    displayName: creatorId,
    level: "newcomer",
    score: 0,
    totalPublished: 0,
    totalDownloads: 0,
    totalStars: 0,
    avgRating: 0,
    reviewCount: 0,
    badges: [],
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
  reputations.set(creatorId, rep);
  return rep;
}

/** Update reputation based on activity. */
export function updateReputation(
  creatorId: string,
  event: {
    type: "publish" | "download" | "star" | "review";
    value?: number;
  }
): CreatorReputation {
  const rep = getReputation(creatorId);

  switch (event.type) {
    case "publish":
      rep.totalPublished++;
      rep.score += 10;
      break;
    case "download":
      rep.totalDownloads++;
      rep.score += 1;
      break;
    case "star":
      rep.totalStars++;
      rep.score += 3;
      break;
    case "review":
      rep.reviewCount++;
      if (event.value) {
        const total = rep.avgRating * (rep.reviewCount - 1) + event.value;
        rep.avgRating = +(total / rep.reviewCount).toFixed(2);
      }
      rep.score += 2;
      break;
  }

  // Update level based on score
  rep.level = computeLevel(rep.score);

  // Check for badges
  rep.badges = computeBadges(rep);
  rep.lastActiveAt = new Date().toISOString();

  reputations.set(creatorId, rep);
  return rep;
}

function computeLevel(score: number): ReputationLevel {
  if (score >= 500) return "elite";
  if (score >= 200) return "expert";
  if (score >= 50) return "trusted";
  if (score >= 10) return "contributor";
  return "newcomer";
}

function computeBadges(rep: CreatorReputation): string[] {
  const badges: string[] = [];
  if (rep.totalPublished >= 10) badges.push("prolific-publisher");
  if (rep.totalDownloads >= 100) badges.push("popular-creator");
  if (rep.avgRating >= 4.5 && rep.reviewCount >= 5) badges.push("highly-rated");
  if (rep.totalStars >= 50) badges.push("star-collector");
  if (rep.totalPublished >= 1) badges.push("first-publish");
  return badges;
}

/** List top creators by reputation score. */
export function listTopCreators(limit = 20): CreatorReputation[] {
  return Array.from(reputations.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---- Reviews ----

/** Add a review for a marketplace item. */
export function addReview(input: {
  itemId: string;
  reviewerId: string;
  rating: number;
  title: string;
  body: string;
}): Review {
  const review = ReviewSchema.parse({
    ...input,
    id: randomUUID(),
    helpful: 0,
    createdAt: new Date().toISOString(),
  });
  reviews.set(review.id, review);
  return review;
}

/** Get reviews for an item. */
export function getItemReviews(itemId: string): Review[] {
  return Array.from(reviews.values())
    .filter((r) => r.itemId === itemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Mark a review as helpful. */
export function markReviewHelpful(reviewId: string): boolean {
  const review = reviews.get(reviewId);
  if (!review) return false;
  review.helpful++;
  return true;
}

// ---- Prompt Packs ----

/** Publish a prompt pack. */
export function publishPromptPack(
  input: Omit<
    PromptPack,
    "id" | "downloads" | "avgRating" | "featured" | "publishedAt" | "updatedAt"
  >
): PromptPack {
  const pack = PromptPackSchema.parse({
    ...input,
    id: randomUUID(),
    downloads: 0,
    avgRating: 0,
    featured: false,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  promptPacks.set(pack.id, pack);

  // Update creator reputation
  updateReputation(pack.creatorId, { type: "publish" });

  return pack;
}

/** Get a prompt pack. */
export function getPromptPack(id: string): PromptPack | undefined {
  return promptPacks.get(id);
}

/** Search prompt packs. */
export function searchPromptPacks(options?: {
  query?: string;
  tags?: string[];
  featured?: boolean;
  sortBy?: "downloads" | "rating" | "newest";
  limit?: number;
}): PromptPack[] {
  let results = Array.from(promptPacks.values());

  if (options?.query) {
    const q = options.query.toLowerCase();
    results = results.filter(
      (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }

  if (options?.tags?.length) {
    results = results.filter((p) => options.tags!.some((t) => p.tags.includes(t)));
  }

  if (options?.featured !== undefined) {
    results = results.filter((p) => p.featured === options.featured);
  }

  const sortBy = options?.sortBy ?? "downloads";
  results.sort((a, b) => {
    switch (sortBy) {
      case "downloads":
        return b.downloads - a.downloads;
      case "rating":
        return b.avgRating - a.avgRating;
      case "newest":
        return b.publishedAt.localeCompare(a.publishedAt);
    }
  });

  return results.slice(0, options?.limit ?? 50);
}

/** Download a prompt pack (increments count). */
export function downloadPromptPack(id: string): PromptPack | undefined {
  const pack = promptPacks.get(id);
  if (!pack) return undefined;

  pack.downloads++;
  updateReputation(pack.creatorId, { type: "download" });
  return pack;
}

// ---- Curated Collections ----

/** Create a curated collection of marketplace items. */
export function createCollection(
  input: Omit<CuratedCollection, "id" | "views" | "featured" | "createdAt" | "updatedAt">
): CuratedCollection {
  const collection = CuratedCollectionSchema.parse({
    ...input,
    id: randomUUID(),
    views: 0,
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  collections.set(collection.id, collection);
  return collection;
}

/** Get a collection. */
export function getCollection(id: string): CuratedCollection | undefined {
  return collections.get(id);
}

/** List collections with optional filtering. */
export function listCollections(options?: {
  curatorId?: string;
  featured?: boolean;
  tags?: string[];
  limit?: number;
}): CuratedCollection[] {
  let results = Array.from(collections.values());

  if (options?.curatorId) {
    results = results.filter((c) => c.curatorId === options.curatorId);
  }
  if (options?.featured !== undefined) {
    results = results.filter((c) => c.featured === options.featured);
  }
  if (options?.tags?.length) {
    results = results.filter((c) => options.tags!.some((t) => c.tags.includes(t)));
  }

  return results.sort((a, b) => b.views - a.views).slice(0, options?.limit ?? 50);
}

/** Add item to collection. */
export function addToCollection(collectionId: string, itemId: string): boolean {
  const collection = collections.get(collectionId);
  if (!collection) return false;
  if (collection.itemIds.includes(itemId)) return false;
  collection.itemIds.push(itemId);
  collection.updatedAt = new Date().toISOString();
  return true;
}

/** View a collection (increments view count). */
export function viewCollection(id: string): CuratedCollection | undefined {
  const collection = collections.get(id);
  if (!collection) return undefined;
  collection.views++;
  return collection;
}

// ---- Clear (for testing) ----

export function clearMarketplaceExtData(): void {
  reputations.clear();
  reviews.clear();
  promptPacks.clear();
  collections.clear();
}
