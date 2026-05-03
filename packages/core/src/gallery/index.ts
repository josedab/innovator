/**
 * @module gallery
 *
 * Idea Marketplace & Community Gallery — browse, fork, remix, and build on
 * shared investigations. Extends sharing with public listing, tags, categories,
 * upvoting, commenting, trending algorithm, and contributor profiles.
 */

import { z } from "zod";

// ---- Schemas ----

/** Gallery categories. */
export const GalleryCategorySchema = z.enum([
  "technology",
  "healthcare",
  "education",
  "finance",
  "sustainability",
  "consumer",
  "enterprise",
  "creative",
  "science",
  "social",
  "other",
]);

/** A gallery listing extending shared investigations with community features. */
export const GalleryListingSchema = z.object({
  id: z.string().max(200),
  slug: z.string().max(100),
  title: z.string().max(500),
  subject: z.string().max(500),
  description: z.string().max(2000),
  category: GalleryCategorySchema,
  tags: z.array(z.string().max(100)).max(20),
  authorId: z.string().max(200),
  authorName: z.string().max(200),
  createdAt: z.number(),
  updatedAt: z.number(),
  upvotes: z.number().default(0),
  forkCount: z.number().default(0),
  viewCount: z.number().default(0),
  commentCount: z.number().default(0),
  featured: z.boolean().default(false),
  forkedFrom: z.string().max(200).optional(),
  ideaCount: z.number().default(0),
  angleCount: z.number().default(0),
});

/** A comment on a gallery listing. */
export const GalleryCommentSchema = z.object({
  id: z.string().max(200),
  listingId: z.string().max(200),
  authorId: z.string().max(200),
  authorName: z.string().max(200),
  content: z.string().max(5000),
  createdAt: z.number(),
  parentId: z.string().max(200).optional(),
});

/** A contributor profile. */
export const ContributorProfileSchema = z.object({
  userId: z.string().max(200),
  displayName: z.string().max(200),
  bio: z.string().max(1000).optional(),
  listingCount: z.number().default(0),
  totalUpvotes: z.number().default(0),
  totalForks: z.number().default(0),
  joinedAt: z.number(),
  badges: z.array(z.string().max(100)).max(50),
});

/** Gallery search/filter options. */
export const GalleryFilterSchema = z.object({
  query: z.string().max(500).optional(),
  category: GalleryCategorySchema.optional(),
  tags: z.array(z.string().max(100)).max(10).optional(),
  sortBy: z.enum(["trending", "newest", "most-upvoted", "most-forked"]).default("trending"),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

/** Featured collection grouping related listings. */
export const FeaturedCollectionSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(500),
  description: z.string().max(2000),
  listingIds: z.array(z.string().max(200)).max(50),
  curatedBy: z.string().max(200),
  createdAt: z.number(),
});

// ---- Types ----

export type GalleryCategory = z.infer<typeof GalleryCategorySchema>;
export type GalleryListing = z.infer<typeof GalleryListingSchema>;
export type GalleryComment = z.infer<typeof GalleryCommentSchema>;
export type ContributorProfile = z.infer<typeof ContributorProfileSchema>;
export type GalleryFilter = z.infer<typeof GalleryFilterSchema>;
export type FeaturedCollection = z.infer<typeof FeaturedCollectionSchema>;

// ---- In-Memory Stores ----

const listings = new Map<string, GalleryListing>();
const comments = new Map<string, GalleryComment[]>();
const profiles = new Map<string, ContributorProfile>();
const upvotes = new Map<string, Set<string>>(); // listingId -> Set<userId>
const collections = new Map<string, FeaturedCollection>();

// ---- Listing Management ----

/**
 * Publish an investigation to the gallery.
 *
 * @param listing - The gallery listing to publish
 * @returns The published listing
 */
export function publishToGallery(listing: GalleryListing): GalleryListing {
  const validated = GalleryListingSchema.parse(listing);
  listings.set(validated.id, validated);

  // Update contributor profile
  const profile = profiles.get(validated.authorId);
  if (profile) {
    profile.listingCount++;
    profile.listingCount = Math.max(
      profile.listingCount,
      [...listings.values()].filter((l) => l.authorId === validated.authorId).length
    );
  }

  return validated;
}

/**
 * Get a gallery listing by ID.
 *
 * @param id - Listing ID
 * @returns The listing or undefined
 */
export function getGalleryListing(id: string): GalleryListing | undefined {
  const listing = listings.get(id);
  if (listing) {
    listing.viewCount++;
  }
  return listing ? { ...listing } : undefined;
}

/**
 * Search and filter gallery listings.
 *
 * @param filter - Search and filter criteria
 * @returns Matching listings with total count
 */
export function searchGallery(filter: Partial<GalleryFilter> = {}): {
  listings: GalleryListing[];
  total: number;
} {
  const parsedFilter = GalleryFilterSchema.parse({
    sortBy: "trending",
    limit: 20,
    offset: 0,
    ...filter,
  });
  let results = [...listings.values()];

  // Text search
  if (parsedFilter.query) {
    const q = parsedFilter.query.toLowerCase();
    results = results.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.subject.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // Category filter
  if (parsedFilter.category) {
    results = results.filter((l) => l.category === parsedFilter.category);
  }

  // Tag filter
  if (parsedFilter.tags && parsedFilter.tags.length > 0) {
    results = results.filter((l) => parsedFilter.tags!.some((t) => l.tags.includes(t)));
  }

  // Sort
  switch (parsedFilter.sortBy) {
    case "newest":
      results.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "most-upvoted":
      results.sort((a, b) => b.upvotes - a.upvotes);
      break;
    case "most-forked":
      results.sort((a, b) => b.forkCount - a.forkCount);
      break;
    case "trending":
    default:
      results.sort((a, b) => computeTrendingScore(b) - computeTrendingScore(a));
      break;
  }

  const total = results.length;
  results = results.slice(parsedFilter.offset, parsedFilter.offset + parsedFilter.limit);

  return { listings: results, total };
}

/**
 * Upvote a gallery listing.
 *
 * @param listingId - The listing to upvote
 * @param userId - The user upvoting
 * @returns Updated upvote count, or -1 if listing not found
 */
export function upvoteListing(listingId: string, userId: string): number {
  const listing = listings.get(listingId);
  if (!listing) return -1;

  const voters = upvotes.get(listingId) ?? new Set<string>();
  if (voters.has(userId)) {
    // Toggle off
    voters.delete(userId);
    listing.upvotes = Math.max(0, listing.upvotes - 1);
  } else {
    voters.add(userId);
    listing.upvotes++;
  }
  upvotes.set(listingId, voters);

  return listing.upvotes;
}

/**
 * Add a comment to a gallery listing.
 *
 * @param comment - The comment to add
 * @returns The added comment
 */
export function addGalleryComment(comment: GalleryComment): GalleryComment {
  const validated = GalleryCommentSchema.parse(comment);
  const listingComments = comments.get(validated.listingId) ?? [];
  listingComments.push(validated);
  comments.set(validated.listingId, listingComments);

  const listing = listings.get(validated.listingId);
  if (listing) {
    listing.commentCount = listingComments.length;
  }

  return validated;
}

/**
 * Get comments for a listing.
 *
 * @param listingId - The listing ID
 * @returns Array of comments
 */
export function getGalleryComments(listingId: string): GalleryComment[] {
  return [...(comments.get(listingId) ?? [])];
}

/**
 * Fork a gallery listing, creating a new entry linked to the original.
 *
 * @param listingId - The original listing to fork
 * @param userId - The user forking
 * @param userName - Display name of the forking user
 * @returns The new forked listing or undefined if source not found
 */
export function forkGalleryListing(
  listingId: string,
  userId: string,
  userName: string
): GalleryListing | undefined {
  const original = listings.get(listingId);
  if (!original) return undefined;

  original.forkCount++;

  const forked: GalleryListing = {
    ...original,
    id: `${original.id}-fork-${Date.now()}`,
    slug: `${original.slug}-fork-${Date.now()}`,
    authorId: userId,
    authorName: userName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    upvotes: 0,
    forkCount: 0,
    viewCount: 0,
    commentCount: 0,
    featured: false,
    forkedFrom: original.id,
  };

  listings.set(forked.id, forked);
  return forked;
}

// ---- Contributor Profiles ----

/**
 * Create or update a contributor profile.
 *
 * @param profile - The profile data
 * @returns The saved profile
 */
export function upsertContributorProfile(profile: ContributorProfile): ContributorProfile {
  const validated = ContributorProfileSchema.parse(profile);
  profiles.set(validated.userId, validated);
  return validated;
}

/**
 * Get a contributor profile by user ID.
 *
 * @param userId - The user ID
 * @returns The profile or undefined
 */
export function getContributorProfile(userId: string): ContributorProfile | undefined {
  return profiles.get(userId) ? { ...profiles.get(userId)! } : undefined;
}

// ---- Featured Collections ----

/**
 * Create a featured collection.
 *
 * @param collection - The collection to create
 * @returns The created collection
 */
export function createFeaturedCollection(collection: FeaturedCollection): FeaturedCollection {
  const validated = FeaturedCollectionSchema.parse(collection);
  collections.set(validated.id, validated);
  return validated;
}

/**
 * List all featured collections.
 *
 * @returns Array of featured collections
 */
export function listFeaturedCollections(): FeaturedCollection[] {
  return [...collections.values()];
}

/**
 * Clear all gallery data (for testing).
 */
export function clearGallery(): void {
  listings.clear();
  comments.clear();
  profiles.clear();
  upvotes.clear();
  collections.clear();
}

// ---- Trending Algorithm ----

/**
 * Compute a trending score using a time-decayed engagement formula.
 * Weights: forks (5×) > upvotes (3×) > comments (2×) > views (0.1×)
 * because forks indicate deeper engagement than passive interactions.
 * The "+2" in the denominator prevents division-by-zero for brand-new
 * listings and gives new items a brief visibility boost before decay
 * takes effect. The 1.5 exponent produces a sub-quadratic decay curve
 * that balances recency with sustained engagement.
 */
function computeTrendingScore(listing: GalleryListing): number {
  const ageMs = Math.max(Date.now() - listing.createdAt, 1);
  const ageHours = ageMs / (1000 * 60 * 60);
  const engagement =
    listing.upvotes * 3 +
    listing.forkCount * 5 +
    listing.commentCount * 2 +
    listing.viewCount * 0.1;
  return engagement / Math.pow(ageHours + 2, 1.5);
}
