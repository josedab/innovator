export const runtime = "nodejs";

import { publishListing, searchListings, getMarketplaceStats } from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const PublishSchema = z.object({
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(3000),
    tags: z.array(z.string().max(100)).max(20).optional(),
  }),
  orgName: z.string().min(1).max(200),
  config: z.object({
    anonymizationLevel: z.enum(["none", "light", "moderate", "heavy", "full"]).default("moderate"),
    licenseType: z.enum(["view-only", "single-use", "multi-use", "exclusive", "open"]).default("single-use"),
    priceUsd: z.number().min(0).default(0),
    industry: z.string().max(200).optional(),
    stage: z.enum(["concept", "validated", "prototyped", "tested", "ready-to-build"]).default("concept"),
    category: z.string().max(200).optional(),
  }).default({}),
  model: z.string().max(100).optional(),
});

const SearchSchema = z.object({
  query: z.string().max(500).optional(),
  category: z.string().max(200).optional(),
  industry: z.string().max(200).optional(),
  minScore: z.number().min(0).max(1).optional(),
  maxPrice: z.number().min(0).optional(),
  stage: z.enum(["concept", "validated", "prototyped", "tested", "ready-to-build"]).optional(),
  sortBy: z.enum(["relevance", "price-asc", "price-desc", "newest", "score"]).default("relevance"),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

/**
 * Publish an idea listing to the exchange.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = PublishSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const listing = await publishListing(
      parsed.data.idea,
      parsed.data.orgName,
      parsed.data.config,
      { model: parsed.data.model }
    );

    logger.info("Idea listing published", {
      route: "/api/idea-exchange",
      requestId,
      listingId: listing.id,
      durationMs: Date.now() - startTime,
    });

    return Response.json(listing, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Idea exchange publish error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/idea-exchange",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Publishing failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * Search listings or get marketplace stats.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    if (url.searchParams.get("stats") === "true") {
      const stats = getMarketplaceStats();
      return Response.json(stats, { headers: API_RESPONSE_HEADERS });
    }

    const filters: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key === "limit" || key === "offset" || key === "minScore" || key === "maxPrice") {
        filters[key] = Number(value);
      } else {
        filters[key] = value;
      }
    }

    const parsed = SearchSchema.safeParse(filters);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid search parameters", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const result = searchListings(parsed.data);
    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Idea exchange search error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/idea-exchange",
    });
    return new Response(
      JSON.stringify({ error: "Search failed." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
