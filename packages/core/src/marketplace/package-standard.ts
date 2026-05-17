/**
 * @module marketplace/package-standard
 *
 * Innovation Marketplace 2.0 — formalized package standard with versioning,
 * compatibility matrix, searchable discovery catalog, ratings, reviews,
 * verified badges, and CLI tooling for contributors.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Package Standard ----

export const PackageCategorySchema = z.enum([
  "angle-pack",
  "prompt-template",
  "domain-preset",
  "workflow-recipe",
  "visualizer",
  "exporter",
  "connector",
  "theme",
]);
export type PackageCategory = z.infer<typeof PackageCategorySchema>;

export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
  .max(50);

export const CompatibilitySchema = z.object({
  minCoreVersion: SemverSchema,
  maxCoreVersion: SemverSchema.optional(),
  requiredModules: z.array(z.string().max(100)).max(20).default([]),
  nodeVersions: z.string().max(20).optional(),
});
export type Compatibility = z.infer<typeof CompatibilitySchema>;

export const PackageManifestSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  version: SemverSchema,
  description: z.string().max(2000),
  category: PackageCategorySchema,
  author: z.object({
    name: z.string().max(200),
    email: z.string().max(300).optional(),
    url: z.string().max(2000).optional(),
  }),
  license: z.string().max(50).default("MIT"),
  homepage: z.string().max(2000).optional(),
  repository: z.string().max(2000).optional(),
  keywords: z.array(z.string().max(50)).max(20).default([]),
  compatibility: CompatibilitySchema,
  files: z.array(z.string().max(500)).max(50).default([]),
  main: z.string().max(500).optional(),
  configSchema: z.record(z.unknown()).optional(),
  changelog: z.string().max(5000).optional(),
  readme: z.string().max(10000).optional(),
  verified: z.boolean().default(false),
  publishedAt: z.string(),
  updatedAt: z.string(),
});
export type PackageManifest = z.infer<typeof PackageManifestSchema>;

// ---- Discovery & Curation ----

export const ReviewSchema = z.object({
  id: z.string().max(100),
  packageId: z.string().max(200),
  userId: z.string().max(200),
  userName: z.string().max(200),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
  helpful: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const PackageListingSchema = z.object({
  manifest: PackageManifestSchema,
  downloads: z.number().int().min(0).default(0),
  averageRating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().min(0).default(0),
  installCount: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  trending: z.boolean().default(false),
  reviews: z.array(ReviewSchema).max(100).default([]),
});
export type PackageListing = z.infer<typeof PackageListingSchema>;

export const CatalogSearchResultSchema = z.object({
  packages: z.array(PackageListingSchema).max(50),
  total: z.number().int().min(0),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(50),
});
export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;

// ---- In-Memory Catalog ----

const catalog = new Map<string, PackageListing>();

/**
 * Publish a package to the marketplace.
 */
export function publishPackage(manifest: PackageManifest): PackageListing {
  const validated = PackageManifestSchema.parse(manifest);
  const existing = catalog.get(validated.id);

  const listing: PackageListing = {
    manifest: validated,
    downloads: existing?.downloads ?? 0,
    averageRating: existing?.averageRating ?? 0,
    reviewCount: existing?.reviewCount ?? 0,
    installCount: existing?.installCount ?? 0,
    featured: existing?.featured ?? false,
    trending: false,
    reviews: existing?.reviews ?? [],
  };

  catalog.set(validated.id, listing);
  return listing;
}

/**
 * Get a package by ID.
 */
export function getPackageListing(packageId: string): PackageListing | undefined {
  return catalog.get(packageId);
}

/**
 * Search the marketplace catalog.
 */
export function searchCatalog(opts?: {
  query?: string;
  category?: PackageCategory;
  sortBy?: "downloads" | "rating" | "newest" | "trending";
  page?: number;
  pageSize?: number;
  verified?: boolean;
}): CatalogSearchResult {
  let results = Array.from(catalog.values());

  // Filter by query
  if (opts?.query) {
    const q = opts.query.toLowerCase();
    results = results.filter(
      (l) =>
        l.manifest.name.toLowerCase().includes(q) ||
        l.manifest.description.toLowerCase().includes(q) ||
        l.manifest.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }

  // Filter by category
  if (opts?.category) {
    results = results.filter((l) => l.manifest.category === opts.category);
  }

  // Filter by verified
  if (opts?.verified !== undefined) {
    results = results.filter((l) => l.manifest.verified === opts.verified);
  }

  // Sort
  const sortBy = opts?.sortBy ?? "downloads";
  switch (sortBy) {
    case "downloads":
      results.sort((a, b) => b.downloads - a.downloads);
      break;
    case "rating":
      results.sort((a, b) => b.averageRating - a.averageRating);
      break;
    case "newest":
      results.sort((a, b) => b.manifest.publishedAt.localeCompare(a.manifest.publishedAt));
      break;
    case "trending":
      results.sort(
        (a, b) => (b.trending ? 1 : 0) - (a.trending ? 1 : 0) || b.downloads - a.downloads
      );
      break;
  }

  const total = results.length;
  const page = opts?.page ?? 0;
  const pageSize = Math.min(opts?.pageSize ?? 20, 50);
  const paginated = results.slice(page * pageSize, (page + 1) * pageSize);

  return { packages: paginated, total, page, pageSize };
}

/**
 * Install (record download of) a package.
 */
export function installPackage(packageId: string): PackageListing {
  const listing = catalog.get(packageId);
  if (!listing) throw new ValidationError(`Package "${packageId}" not found`);

  listing.downloads++;
  listing.installCount++;

  // Mark as trending if downloads are high recently
  if (listing.downloads > 10) listing.trending = true;

  return listing;
}

/**
 * Submit a review for a package.
 */
export function submitReview(params: {
  packageId: string;
  userId: string;
  userName: string;
  rating: number;
  title?: string;
  body?: string;
}): Review {
  const listing = catalog.get(params.packageId);
  if (!listing) throw new ValidationError(`Package "${params.packageId}" not found`);

  // Check for duplicate review
  const existingIdx = listing.reviews.findIndex((r) => r.userId === params.userId);
  if (existingIdx >= 0) {
    listing.reviews.splice(existingIdx, 1);
  }

  const review: Review = {
    id: randomUUID(),
    packageId: params.packageId,
    userId: params.userId,
    userName: params.userName,
    rating: Math.max(1, Math.min(5, Math.round(params.rating))),
    title: params.title,
    body: params.body,
    helpful: 0,
    createdAt: new Date().toISOString(),
  };

  listing.reviews.push(review);
  listing.reviewCount = listing.reviews.length;

  // Recalculate average rating
  const totalRating = listing.reviews.reduce((sum, r) => sum + r.rating, 0);
  listing.averageRating = Math.round((totalRating / listing.reviews.length) * 10) / 10;

  return review;
}

/**
 * Mark a package as featured.
 */
export function featurePackage(packageId: string, featured: boolean = true): PackageListing {
  const listing = catalog.get(packageId);
  if (!listing) throw new ValidationError(`Package "${packageId}" not found`);
  listing.featured = featured;
  return listing;
}

/**
 * Verify a package.
 */
export function verifyPackage(packageId: string, verified: boolean = true): PackageListing {
  const listing = catalog.get(packageId);
  if (!listing) throw new ValidationError(`Package "${packageId}" not found`);
  listing.manifest.verified = verified;
  return listing;
}

// ---- Contributor Portal ----

export const ContributorStatsSchema = z.object({
  authorName: z.string().max(200),
  totalPackages: z.number().int().min(0),
  totalDownloads: z.number().int().min(0),
  averageRating: z.number().min(0).max(5),
  verifiedPackages: z.number().int().min(0),
  categories: z.array(PackageCategorySchema),
});
export type ContributorStats = z.infer<typeof ContributorStatsSchema>;

/**
 * Get contributor statistics for a given author name.
 */
export function getContributorStats(authorName: string): ContributorStats {
  const packages = Array.from(catalog.values()).filter(
    (l) => l.manifest.author.name.toLowerCase() === authorName.toLowerCase()
  );

  const totalDownloads = packages.reduce((sum, p) => sum + p.downloads, 0);
  const ratings = packages.filter((p) => p.reviewCount > 0);
  const avgRating =
    ratings.length > 0 ? ratings.reduce((sum, p) => sum + p.averageRating, 0) / ratings.length : 0;

  const categories = [...new Set(packages.map((p) => p.manifest.category))];

  return {
    authorName,
    totalPackages: packages.length,
    totalDownloads,
    averageRating: Math.round(avgRating * 10) / 10,
    verifiedPackages: packages.filter((p) => p.manifest.verified).length,
    categories,
  };
}

/**
 * Validate a package manifest before publishing.
 */
export function validateManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
} {
  const result = PackageManifestSchema.safeParse(manifest);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

/**
 * Remove a package from the catalog.
 */
export function unpublishPackage(packageId: string): boolean {
  return catalog.delete(packageId);
}

/**
 * Clear all marketplace data (for testing).
 */
export function clearMarketplace(): void {
  catalog.clear();
}
