/**
 * @module marketplace
 *
 * Plugin Marketplace & Registry: discover, install, publish, and manage
 * community plugins (angles, vertical packs, export formats, validators).
 * Leverages the existing plugin system in plugins/index.ts.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { InnovatorPlugin } from "../types.js";

const MARKETPLACE_DIR = join(homedir(), ".innovator", "marketplace");
const REGISTRY_FILE = join(MARKETPLACE_DIR, "registry.json");

function ensureDir(): void {
  if (!existsSync(MARKETPLACE_DIR)) mkdirSync(MARKETPLACE_DIR, { recursive: true });
}

// ---- Types ----

/** Plugin category in the marketplace. */
export type PluginCategory =
  | "angle"
  | "vertical-pack"
  | "exporter"
  | "validator"
  | "visualizer"
  | "integration";

/** Metadata for a published plugin. */
export interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  author: {
    name: string;
    email?: string;
    url?: string;
    githubHandle?: string;
  };
  version: string;
  /** Semver compatibility range for @innovator/core. */
  compatibility: string;
  /** npm package name or git URL. */
  source: string;
  /** Number of downloads. */
  downloads: number;
  /** Average rating (1-5). */
  rating: number;
  ratingCount: number;
  /** Tags for search. */
  tags: string[];
  /** Whether the publisher is verified. */
  verified: boolean;
  publishedAt: string;
  updatedAt: string;
  readme?: string;
}

/** Local installation record. */
export interface InstalledPlugin {
  pluginId: string;
  name: string;
  version: string;
  source: string;
  installedAt: string;
  enabled: boolean;
}

/** Search options for the marketplace. */
export interface MarketplaceSearchOptions {
  query?: string;
  category?: PluginCategory;
  tags?: string[];
  sortBy?: "downloads" | "rating" | "newest";
  limit?: number;
  offset?: number;
}

/** Review for a plugin. */
export interface PluginReview {
  id: string;
  pluginId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ---- Local Registry (file-based) ----

interface RegistryData {
  plugins: MarketplacePlugin[];
  installed: InstalledPlugin[];
  reviews: PluginReview[];
}

function loadRegistry(): RegistryData {
  ensureDir();
  if (!existsSync(REGISTRY_FILE)) {
    return { plugins: [], installed: [], reviews: [] };
  }
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8")) as RegistryData;
  } catch {
    return { plugins: [], installed: [], reviews: [] };
  }
}

function saveRegistry(data: RegistryData): void {
  ensureDir();
  writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ---- Publishing ----

/**
 * Publish a plugin to the marketplace registry.
 */
export function publishPlugin(params: {
  name: string;
  description: string;
  category: PluginCategory;
  author: MarketplacePlugin["author"];
  version: string;
  source: string;
  compatibility?: string;
  tags?: string[];
  readme?: string;
}): MarketplacePlugin {
  const registry = loadRegistry();
  const now = new Date().toISOString();

  // Check for existing plugin with same name by same author
  const existing = registry.plugins.find(
    (p) => p.name === params.name && p.author.name === params.author.name
  );

  if (existing) {
    // Update existing
    existing.version = params.version;
    existing.description = params.description;
    existing.source = params.source;
    existing.compatibility = params.compatibility ?? ">=0.1.0";
    existing.tags = params.tags ?? existing.tags;
    existing.readme = params.readme ?? existing.readme;
    existing.updatedAt = now;
    saveRegistry(registry);
    return existing;
  }

  const plugin: MarketplacePlugin = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    category: params.category,
    author: params.author,
    version: params.version,
    compatibility: params.compatibility ?? ">=0.1.0",
    source: params.source,
    downloads: 0,
    rating: 0,
    ratingCount: 0,
    tags: params.tags ?? [],
    verified: false,
    publishedAt: now,
    updatedAt: now,
    readme: params.readme,
  };

  registry.plugins.push(plugin);
  saveRegistry(registry);
  return plugin;
}

// ---- Discovery ----

/**
 * Search the marketplace for plugins.
 */
export function searchPlugins(options: MarketplaceSearchOptions = {}): MarketplacePlugin[] {
  const registry = loadRegistry();
  let results = [...registry.plugins];

  if (options.query) {
    const q = options.query.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.author.name.toLowerCase().includes(q)
    );
  }

  if (options.category) {
    results = results.filter((p) => p.category === options.category);
  }

  if (options.tags?.length) {
    results = results.filter((p) => options.tags!.some((t) => p.tags.includes(t)));
  }

  // Sort
  switch (options.sortBy) {
    case "downloads":
      results.sort((a, b) => b.downloads - a.downloads);
      break;
    case "rating":
      results.sort((a, b) => b.rating - a.rating);
      break;
    case "newest":
      results.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      break;
    default:
      results.sort((a, b) => b.downloads - a.downloads);
  }

  const offset = options.offset ?? 0;
  const limit = options.limit ?? 20;
  return results.slice(offset, offset + limit);
}

/**
 * Get a specific marketplace plugin by ID.
 */
export function getMarketplacePlugin(id: string): MarketplacePlugin | undefined {
  const registry = loadRegistry();
  return registry.plugins.find((p) => p.id === id);
}

/**
 * Get featured/popular plugins.
 */
export function getFeaturedPlugins(limit: number = 6): MarketplacePlugin[] {
  const registry = loadRegistry();
  return registry.plugins
    .filter((p) => p.verified || p.downloads > 10)
    .sort((a, b) => b.downloads * (b.rating || 1) - a.downloads * (a.rating || 1))
    .slice(0, limit);
}

/**
 * Get available plugin categories with counts.
 */
export function getCategories(): Array<{ category: PluginCategory; count: number }> {
  const registry = loadRegistry();
  const counts = new Map<PluginCategory, number>();
  for (const p of registry.plugins) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Installation ----

/**
 * Install a plugin from the marketplace.
 * Records the installation and increments the download count.
 */
export function installPlugin(pluginId: string): InstalledPlugin | undefined {
  const registry = loadRegistry();
  const plugin = registry.plugins.find((p) => p.id === pluginId);
  if (!plugin) return undefined;

  // Check if already installed
  const existing = registry.installed.find((i) => i.pluginId === pluginId);
  if (existing) {
    existing.version = plugin.version;
    existing.source = plugin.source;
    saveRegistry(registry);
    return existing;
  }

  plugin.downloads++;

  const installed: InstalledPlugin = {
    pluginId: plugin.id,
    name: plugin.name,
    version: plugin.version,
    source: plugin.source,
    installedAt: new Date().toISOString(),
    enabled: true,
  };

  registry.installed.push(installed);
  saveRegistry(registry);
  return installed;
}

/**
 * Uninstall a plugin.
 */
export function uninstallPlugin(pluginId: string): boolean {
  const registry = loadRegistry();
  const idx = registry.installed.findIndex((i) => i.pluginId === pluginId);
  if (idx === -1) return false;
  registry.installed.splice(idx, 1);
  saveRegistry(registry);
  return true;
}

/**
 * List installed plugins.
 */
export function listInstalledPlugins(): InstalledPlugin[] {
  const registry = loadRegistry();
  return registry.installed;
}

/**
 * Toggle a plugin's enabled state.
 */
export function togglePlugin(pluginId: string, enabled: boolean): boolean {
  const registry = loadRegistry();
  const installed = registry.installed.find((i) => i.pluginId === pluginId);
  if (!installed) return false;
  installed.enabled = enabled;
  saveRegistry(registry);
  return true;
}

// ---- Reviews ----

/**
 * Add a review for a plugin.
 */
export function addReview(params: {
  pluginId: string;
  authorName: string;
  rating: number;
  comment: string;
}): PluginReview | undefined {
  if (params.rating < 1 || params.rating > 5) return undefined;

  const registry = loadRegistry();
  const plugin = registry.plugins.find((p) => p.id === params.pluginId);
  if (!plugin) return undefined;

  const review: PluginReview = {
    id: randomUUID(),
    pluginId: params.pluginId,
    authorName: params.authorName,
    rating: params.rating,
    comment: params.comment,
    createdAt: new Date().toISOString(),
  };

  registry.reviews.push(review);

  // Update plugin rating
  const pluginReviews = registry.reviews.filter((r) => r.pluginId === params.pluginId);
  plugin.ratingCount = pluginReviews.length;
  plugin.rating = +(pluginReviews.reduce((s, r) => s + r.rating, 0) / pluginReviews.length).toFixed(
    1
  );

  saveRegistry(registry);
  return review;
}

/**
 * Get reviews for a plugin.
 */
export function getReviews(pluginId: string): PluginReview[] {
  const registry = loadRegistry();
  return registry.reviews
    .filter((r) => r.pluginId === pluginId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- Verification ----

/**
 * Verify a publisher (admin action).
 */
export function verifyPlugin(pluginId: string): boolean {
  const registry = loadRegistry();
  const plugin = registry.plugins.find((p) => p.id === pluginId);
  if (!plugin) return false;
  plugin.verified = true;
  saveRegistry(registry);
  return true;
}

/**
 * Clear marketplace data (for testing).
 */
export function clearMarketplace(): void {
  ensureDir();
  writeFileSync(
    REGISTRY_FILE,
    JSON.stringify({ plugins: [], installed: [], reviews: [] }),
    "utf-8"
  );
}
