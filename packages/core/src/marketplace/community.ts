/**
 * @module marketplace/community
 *
 * Community reviews, ratings, search, and popularity for first-party domain packs.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  getDomainPack,
  getDomainPackInstallCount,
  listDomainPacks,
  type DomainPack,
} from "./domain-packs.js";

export const PackReviewSchema = z.object({
  id: z.string().max(200),
  packId: z.string().max(100),
  userId: z.string().max(200),
  rating: z.number().min(1).max(5),
  title: z.string().max(200),
  comment: z.string().max(2000),
  helpful: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type PackReview = z.infer<typeof PackReviewSchema>;

export const PackSearchResultSchema = z.object({
  packId: z.string().max(100),
  name: z.string().max(200),
  domain: z.string().max(100),
  description: z.string().max(500),
  avgRating: z.number().min(0).max(5),
  installCount: z.number().int().min(0),
  tags: z.array(z.string()).max(20),
});
export type PackSearchResult = z.infer<typeof PackSearchResultSchema>;

const SubmitPackReviewInputSchema = PackReviewSchema.omit({
  id: true,
  helpful: true,
  createdAt: true,
});

type SubmitPackReviewInput = z.infer<typeof SubmitPackReviewInputSchema>;

const reviewsByPack = new Map<string, PackReview[]>();

function truncateDescription(description: string): string {
  return description.length <= 500 ? description : `${description.slice(0, 497)}...`;
}

function buildSearchText(pack: DomainPack): string {
  const rubricText =
    pack.scoringRubric?.dimensions
      .map((dimension) => `${dimension.name} ${dimension.description}`)
      .join(" ") ?? "";
  const templateText =
    pack.promptTemplates?.map((template) => `${template.name} ${template.template}`).join(" ") ??
    "";

  return [
    pack.name,
    pack.domain,
    pack.description,
    pack.tags.join(" "),
    pack.angles
      .map(
        (angle) =>
          `${angle.name} ${angle.description} ${angle.tags.join(" ")} ${angle.promptTemplate}`
      )
      .join(" "),
    rubricText,
    templateText,
  ]
    .join(" ")
    .toLowerCase();
}

function scorePack(pack: DomainPack, tokens: string[]): number {
  const name = pack.name.toLowerCase();
  const domain = pack.domain.toLowerCase();
  const description = pack.description.toLowerCase();
  const tagText = pack.tags.join(" ").toLowerCase();
  const angleText = pack.angles
    .map((angle) => `${angle.id} ${angle.name} ${angle.description} ${angle.tags.join(" ")}`)
    .join(" ")
    .toLowerCase();

  return tokens.reduce((score, token) => {
    let tokenScore = 0;
    if (name.includes(token)) tokenScore += 5;
    if (domain.includes(token)) tokenScore += 4;
    if (tagText.includes(token)) tokenScore += 3;
    if (angleText.includes(token)) tokenScore += 2;
    if (description.includes(token)) tokenScore += 1;
    return score + tokenScore;
  }, 0);
}

function toSearchResult(pack: DomainPack): PackSearchResult {
  return PackSearchResultSchema.parse({
    packId: pack.id,
    name: pack.name,
    domain: pack.domain,
    description: truncateDescription(pack.description),
    avgRating: getPackAverageRating(pack.id),
    installCount: getDomainPackInstallCount(pack.id),
    tags: pack.tags,
  });
}

export function submitReview(input: SubmitPackReviewInput): PackReview {
  const pack = getDomainPack(input.packId);
  if (!pack) {
    throw new Error(`Unknown domain pack: ${input.packId}`);
  }

  const validatedInput = SubmitPackReviewInputSchema.parse(input);
  const existingReviews = reviewsByPack.get(validatedInput.packId) ?? [];
  const filteredReviews = existingReviews.filter(
    (review) => review.userId !== validatedInput.userId
  );

  const review = PackReviewSchema.parse({
    id: `pack-review-${randomUUID().slice(0, 12)}`,
    ...validatedInput,
    helpful: 0,
    createdAt: new Date().toISOString(),
  });

  filteredReviews.push(review);
  reviewsByPack.set(validatedInput.packId, filteredReviews);
  return review;
}

export function getPackReviews(packId: string): PackReview[] {
  return [...(reviewsByPack.get(packId) ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function getPackAverageRating(packId: string): number {
  const reviews = reviewsByPack.get(packId) ?? [];
  if (reviews.length === 0) return 0;

  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return Math.round(average * 10) / 10;
}

export function searchPacks(query: string): PackSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const results = listDomainPacks()
    .map((pack) => ({
      pack,
      searchText: buildSearchText(pack),
      score: tokens.length === 0 ? 0 : scorePack(pack, tokens),
    }))
    .filter(({ searchText, score }) =>
      tokens.length === 0 ? true : tokens.every((token) => searchText.includes(token)) && score > 0
    )
    .sort((a, b) => {
      const scoreDifference = b.score - a.score;
      if (scoreDifference !== 0) return scoreDifference;

      const installDifference =
        getDomainPackInstallCount(b.pack.id) - getDomainPackInstallCount(a.pack.id);
      if (installDifference !== 0) return installDifference;

      const ratingDifference = getPackAverageRating(b.pack.id) - getPackAverageRating(a.pack.id);
      if (ratingDifference !== 0) return ratingDifference;

      return a.pack.name.localeCompare(b.pack.name);
    });

  return results.map(({ pack }) => toSearchResult(pack));
}

export function getPopularPacks(limit: number = 5): PackSearchResult[] {
  return listDomainPacks()
    .sort((a, b) => {
      const installDifference = getDomainPackInstallCount(b.id) - getDomainPackInstallCount(a.id);
      if (installDifference !== 0) return installDifference;

      const ratingDifference = getPackAverageRating(b.id) - getPackAverageRating(a.id);
      if (ratingDifference !== 0) return ratingDifference;

      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map((pack) => toSearchResult(pack));
}

export function clearCommunityData(): void {
  reviewsByPack.clear();
}
