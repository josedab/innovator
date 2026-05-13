/**
 * Plugin Marketplace API route.
 * GET  /api/marketplace          — Search/list plugins
 * GET  /api/marketplace?id=...   — Get specific plugin
 * POST /api/marketplace          — Install, publish, or review
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchPlugins,
  getMarketplacePlugin,
  getFeaturedPlugins,
  getCategories,
  installMarketplacePlugin,
  publishPlugin,
  addReview,
  getSeedPackages,
  seedMarketplace,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const featured = request.nextUrl.searchParams.get("featured");

  if (id) {
    const plugin = getMarketplacePlugin(id);
    if (!plugin) {
      return NextResponse.json(
        { error: "Plugin not found" },
        { status: 404, headers: API_RESPONSE_HEADERS }
      );
    }
    return NextResponse.json(plugin, { headers: API_RESPONSE_HEADERS });
  }

  if (featured === "true") {
    const plugins = getFeaturedPlugins();
    return NextResponse.json(
      { plugins, categories: getCategories() },
      { headers: API_RESPONSE_HEADERS }
    );
  }

  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const sortBy = (request.nextUrl.searchParams.get("sort") ?? "downloads") as
    | "downloads"
    | "rating"
    | "newest";

  const plugins = searchPlugins({ query, category: category as never, sortBy });
  return NextResponse.json(
    { plugins, categories: getCategories() },
    { headers: API_RESPONSE_HEADERS }
  );
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("install"),
    pluginId: z.string().min(1),
  }),
  z.object({
    action: z.literal("publish"),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(1000),
    category: z.enum([
      "angle",
      "vertical-pack",
      "exporter",
      "validator",
      "visualizer",
      "integration",
    ]),
    source: z.string().min(1),
    version: z.string().min(1),
    author: z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      githubHandle: z.string().optional(),
    }),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("review"),
    pluginId: z.string().min(1),
    authorName: z.string().min(1),
    rating: z.number().min(1).max(5),
    comment: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("seed"),
  }),
  z.object({
    action: z.literal("list_seed"),
  }),
]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;

  switch (data.action) {
    case "install": {
      const result = installMarketplacePlugin(data.pluginId);
      if (!result) {
        return NextResponse.json(
          { error: "Plugin not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json({ installed: result }, { headers: API_RESPONSE_HEADERS });
    }
    case "publish": {
      const plugin = publishPlugin(data);
      return NextResponse.json(
        { published: plugin },
        { status: 201, headers: API_RESPONSE_HEADERS }
      );
    }
    case "review": {
      const review = addReview(data);
      if (!review) {
        return NextResponse.json(
          { error: "Plugin not found or invalid rating" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json({ review }, { headers: API_RESPONSE_HEADERS });
    }
    case "seed": {
      const count = seedMarketplace();
      return NextResponse.json(
        { seeded: count, message: `Seeded ${count} first-party packages` },
        { headers: API_RESPONSE_HEADERS }
      );
    }
    case "list_seed": {
      const packages = getSeedPackages();
      return NextResponse.json(
        { packages, count: packages.length },
        { headers: API_RESPONSE_HEADERS }
      );
    }
  }
}
