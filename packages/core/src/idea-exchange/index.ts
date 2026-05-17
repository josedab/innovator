/**
 * @module idea-exchange
 *
 * Idea Exchange & Licensing Platform: cross-organization marketplace where teams
 * can publish validated ideas with anonymization, browse other organizations'
 * surplus innovation, and license or trade ideas with transaction tracking.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

/** Schema for anonymization level. */
export const AnonymizationLevelSchema = z.enum(["none", "light", "moderate", "heavy", "full"]);

/** Schema for a published idea listing. */
export const IdeaListingSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(3000),
  category: z.string().max(200),
  tags: z.array(z.string().max(100)).max(20),
  anonymizationLevel: AnonymizationLevelSchema,
  publisherOrg: z.string().max(200),
  publisherAlias: z.string().max(200),
  validationScore: z.number().min(0).max(1).optional(),
  feasibilityRating: z.enum(["low", "medium", "high", "very-high"]).optional(),
  industry: z.string().max(200),
  stage: z.enum(["concept", "validated", "prototyped", "tested", "ready-to-build"]),
  licenseType: z.enum(["view-only", "single-use", "multi-use", "exclusive", "open"]),
  priceUsd: z.number().min(0),
  views: z.number().min(0).default(0),
  inquiries: z.number().min(0).default(0),
  publishedAt: z.string(),
  updatedAt: z.string(),
});

/** Schema for a license transaction. */
export const TransactionSchema = z.object({
  id: z.string().max(100),
  listingId: z.string().max(100),
  buyerOrg: z.string().max(200),
  sellerOrg: z.string().max(200),
  licenseType: IdeaListingSchema.shape.licenseType,
  priceUsd: z.number().min(0),
  status: z.enum(["pending", "escrow", "completed", "cancelled", "disputed"]),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

/** Schema for an inquiry/message. */
export const InquirySchema = z.object({
  id: z.string().max(100),
  listingId: z.string().max(100),
  fromOrg: z.string().max(200),
  fromAlias: z.string().max(200),
  message: z.string().max(2000),
  status: z.enum(["open", "replied", "closed"]),
  createdAt: z.string(),
});

/** Schema for marketplace search filters. */
export const SearchFiltersSchema = z.object({
  query: z.string().max(500).optional(),
  category: z.string().max(200).optional(),
  industry: z.string().max(200).optional(),
  minScore: z.number().min(0).max(1).optional(),
  maxPrice: z.number().min(0).optional(),
  stage: IdeaListingSchema.shape.stage.optional(),
  licenseType: IdeaListingSchema.shape.licenseType.optional(),
  tags: z.array(z.string().max(100)).max(10).optional(),
  sortBy: z.enum(["relevance", "price-asc", "price-desc", "newest", "score"]).default("relevance"),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

// ---- Types ----

export type AnonymizationLevel = z.infer<typeof AnonymizationLevelSchema>;
export type IdeaListing = z.infer<typeof IdeaListingSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type Inquiry = z.infer<typeof InquirySchema>;
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

// ---- In-memory stores ----

const listings: Map<string, IdeaListing> = new Map();
const transactions: Map<string, Transaction> = new Map();
const inquiries: Map<string, Inquiry> = new Map();

// ---- Anonymization pipeline ----

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Z][a-z]+\s(Inc|Corp|LLC|Ltd|GmbH|SA|AG)\b/g, replacement: "[Organization]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[email]" },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: "[phone]" },
  { pattern: /\bhttps?:\/\/[^\s]+/g, replacement: "[url]" },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "[ip-address]" },
];

/**
 * Anonymize text based on the specified level.
 */
export function anonymizeText(text: string, level: AnonymizationLevel): string {
  if (level === "none") return text;

  let result = text;

  if (level === "light" || level === "moderate" || level === "heavy" || level === "full") {
    // Remove emails and URLs
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
  }

  if (level === "moderate" || level === "heavy" || level === "full") {
    // Remove specific names and numbers
    result = result.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "[Person]");
    result = result.replace(/\$[\d,.]+[MBK]?\b/g, "[amount]");
  }

  if (level === "heavy" || level === "full") {
    // Remove locations and dates
    result = result.replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2},?\s?\d{4}\b/g,
      "[date]"
    );
    result = result.replace(
      /\b(New York|San Francisco|London|Berlin|Tokyo|Sydney|Toronto|Paris|Singapore|Mumbai)\b/gi,
      "[City]"
    );
  }

  if (level === "full") {
    // Generic number replacement
    result = result.replace(/\b\d{4,}\b/g, "[number]");
  }

  return result;
}

/**
 * Generate an anonymous alias for an organization.
 */
export function generateOrgAlias(orgName: string): string {
  const adjectives = [
    "Innovative",
    "Creative",
    "Strategic",
    "Dynamic",
    "Agile",
    "Visionary",
    "Bold",
    "Stellar",
  ];
  const nouns = ["Labs", "Ventures", "Studio", "Workshop", "Forge", "Works", "Hub", "Collective"];
  const hash = orgName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `${adjectives[hash % adjectives.length]} ${nouns[(hash * 7) % nouns.length]}`;
}

// ---- Listing management ----

/** Options for publishing a listing. */
export interface PublishListingOptions {
  model?: string;
  signal?: AbortSignal;
}

/**
 * Publish an idea to the exchange marketplace.
 */
export async function publishListing(
  idea: { title: string; description: string; tags?: string[] },
  orgName: string,
  config: {
    anonymizationLevel?: AnonymizationLevel;
    licenseType?: IdeaListing["licenseType"];
    priceUsd?: number;
    industry?: string;
    stage?: IdeaListing["stage"];
    category?: string;
  } = {},
  options: PublishListingOptions = {}
): Promise<IdeaListing> {
  if (!idea.title || idea.title.trim().length === 0) {
    throw new ValidationError("Idea title is required");
  }
  if (!orgName || orgName.trim().length === 0) {
    throw new ValidationError("Organization name is required");
  }

  const anonymizationLevel = config.anonymizationLevel ?? "moderate";
  const now = new Date().toISOString();

  // Auto-categorize if not provided
  let category = config.category ?? "";
  let industry = config.industry ?? "";

  if (!category || !industry) {
    try {
      const prompt = `Categorize this innovation idea.

Title: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description.slice(0, 500))}

Respond with JSON:
{"category": "single category", "industry": "target industry"}`;

      const raw = await withRetry(
        async () => {
          const result = await generateText({
            prompt,
            model: options.model,
            signal: options.signal,
          });
          return result;
        },
        {
          signal: options.signal,
          isRetryable: (err) => err instanceof Error && err.message.includes("No JSON"),
        }
      );
      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr) as Record<string, string>;
      category = category || parsed.category || "General";
      industry = industry || parsed.industry || "Cross-industry";
    } catch {
      category = category || "General";
      industry = industry || "Cross-industry";
    }
  }

  const listing: IdeaListing = {
    id: `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: anonymizeText(idea.title, anonymizationLevel),
    description: anonymizeText(idea.description, anonymizationLevel),
    category,
    tags: idea.tags ?? [],
    anonymizationLevel,
    publisherOrg: anonymizationLevel !== "none" ? generateOrgAlias(orgName) : orgName,
    publisherAlias: generateOrgAlias(orgName),
    industry,
    stage: config.stage ?? "concept",
    licenseType: config.licenseType ?? "single-use",
    priceUsd: config.priceUsd ?? 0,
    views: 0,
    inquiries: 0,
    publishedAt: now,
    updatedAt: now,
  };

  listings.set(listing.id, listing);
  return listing;
}

/**
 * Search the marketplace.
 */
export function searchListings(filters: Partial<SearchFilters> = {}): {
  results: IdeaListing[];
  total: number;
} {
  const parsed = SearchFiltersSchema.partial().parse(filters);
  let results = Array.from(listings.values());

  if (parsed.query) {
    const q = parsed.query.toLowerCase();
    results = results.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (parsed.category) results = results.filter((l) => l.category === parsed.category);
  if (parsed.industry) results = results.filter((l) => l.industry === parsed.industry);
  if (parsed.stage) results = results.filter((l) => l.stage === parsed.stage);
  if (parsed.licenseType) results = results.filter((l) => l.licenseType === parsed.licenseType);
  if (parsed.minScore != null)
    results = results.filter((l) => (l.validationScore ?? 0) >= parsed.minScore!);
  if (parsed.maxPrice != null) results = results.filter((l) => l.priceUsd <= parsed.maxPrice!);
  if (parsed.tags && parsed.tags.length > 0) {
    results = results.filter((l) => parsed.tags!.some((t) => l.tags.includes(t)));
  }

  const total = results.length;

  const sortBy = parsed.sortBy ?? "relevance";
  switch (sortBy) {
    case "price-asc":
      results.sort((a, b) => a.priceUsd - b.priceUsd);
      break;
    case "price-desc":
      results.sort((a, b) => b.priceUsd - a.priceUsd);
      break;
    case "newest":
      results.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      break;
    case "score":
      results.sort((a, b) => (b.validationScore ?? 0) - (a.validationScore ?? 0));
      break;
    default:
      results.sort((a, b) => b.views - a.views);
      break;
  }

  const offset = parsed.offset ?? 0;
  const limit = parsed.limit ?? 20;
  results = results.slice(offset, offset + limit);

  return { results, total };
}

/**
 * Get a listing by ID (increments view count).
 */
export function getListing(id: string): IdeaListing | undefined {
  const listing = listings.get(id);
  if (listing) listing.views++;
  return listing;
}

/**
 * Create a purchase transaction.
 */
export function createTransaction(listingId: string, buyerOrg: string): Transaction {
  const listing = listings.get(listingId);
  if (!listing) throw new ValidationError(`Listing not found: ${listingId}`);

  const transaction: Transaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    listingId,
    buyerOrg,
    sellerOrg: listing.publisherOrg,
    licenseType: listing.licenseType,
    priceUsd: listing.priceUsd,
    status: listing.priceUsd > 0 ? "escrow" : "completed",
    createdAt: new Date().toISOString(),
    completedAt: listing.priceUsd === 0 ? new Date().toISOString() : undefined,
  };

  transactions.set(transaction.id, transaction);
  return transaction;
}

/**
 * Complete a transaction (release from escrow).
 */
export function completeTransaction(transactionId: string): Transaction {
  const tx = transactions.get(transactionId);
  if (!tx) throw new ValidationError(`Transaction not found: ${transactionId}`);
  if (tx.status !== "escrow" && tx.status !== "pending") {
    throw new ValidationError(`Cannot complete transaction in ${tx.status} status`);
  }

  tx.status = "completed";
  tx.completedAt = new Date().toISOString();
  return tx;
}

/**
 * Cancel a transaction.
 */
export function cancelTransaction(transactionId: string): Transaction {
  const tx = transactions.get(transactionId);
  if (!tx) throw new ValidationError(`Transaction not found: ${transactionId}`);
  if (tx.status === "completed") {
    throw new ValidationError("Cannot cancel a completed transaction");
  }

  tx.status = "cancelled";
  return tx;
}

/**
 * Create an inquiry on a listing.
 */
export function createInquiry(listingId: string, fromOrg: string, message: string): Inquiry {
  const listing = listings.get(listingId);
  if (!listing) throw new ValidationError(`Listing not found: ${listingId}`);

  const inquiry: Inquiry = {
    id: `inquiry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    listingId,
    fromOrg: generateOrgAlias(fromOrg),
    fromAlias: generateOrgAlias(fromOrg),
    message: message.slice(0, 2000),
    status: "open",
    createdAt: new Date().toISOString(),
  };

  listing.inquiries++;
  inquiries.set(inquiry.id, inquiry);
  return inquiry;
}

/**
 * Get inquiries for a listing.
 */
export function getListingInquiries(listingId: string): Inquiry[] {
  return Array.from(inquiries.values()).filter((i) => i.listingId === listingId);
}

/**
 * Get transactions for an organization.
 */
export function getOrgTransactions(orgName: string): Transaction[] {
  return Array.from(transactions.values()).filter(
    (t) => t.buyerOrg === orgName || t.sellerOrg === orgName
  );
}

/**
 * Get marketplace statistics.
 */
export function getMarketplaceStats(): {
  totalListings: number;
  totalTransactions: number;
  totalRevenue: number;
  avgPrice: number;
  topCategories: Array<{ category: string; count: number }>;
} {
  const allListings = Array.from(listings.values());
  const allTransactions = Array.from(transactions.values());

  const categoryCount = new Map<string, number>();
  for (const l of allListings) {
    categoryCount.set(l.category, (categoryCount.get(l.category) ?? 0) + 1);
  }

  const totalRevenue = allTransactions
    .filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + t.priceUsd, 0);

  return {
    totalListings: allListings.length,
    totalTransactions: allTransactions.length,
    totalRevenue,
    avgPrice:
      allListings.length > 0
        ? allListings.reduce((sum, l) => sum + l.priceUsd, 0) / allListings.length
        : 0,
    topCategories: Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

/**
 * Clear all exchange data.
 */
export function clearExchangeData(): void {
  listings.clear();
  transactions.clear();
  inquiries.clear();
}
