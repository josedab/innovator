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

// ---- Creator Tools ----

/** Plugin manifest for scaffolding new plugins. */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  author: MarketplacePlugin["author"];
  main: string;
  tags: string[];
  compatibility: string;
  scripts?: {
    build?: string;
    test?: string;
    lint?: string;
  };
}

/** Scaffold a new plugin project structure. */
export function scaffoldPlugin(
  name: string,
  category: PluginCategory,
  authorName: string
): { manifest: PluginManifest; files: Record<string, string> } {
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 50);

  const manifest: PluginManifest = {
    name: safeName,
    version: "1.0.0",
    description: `Innovator ${category} plugin: ${name}`,
    category,
    author: { name: authorName },
    main: "dist/index.js",
    tags: [category],
    compatibility: ">=0.2.0",
    scripts: {
      build: "tsc",
      test: "vitest run",
    },
  };

  const files: Record<string, string> = {};

  files["innovator-plugin.json"] = JSON.stringify(manifest, null, 2);

  files["src/index.ts"] = generatePluginTemplate(safeName, category);

  files["tsconfig.json"] = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        outDir: "dist",
        declaration: true,
        strict: true,
      },
      include: ["src"],
    },
    null,
    2
  );

  files["README.md"] =
    `# ${name}\n\n${manifest.description}\n\n## Installation\n\n\`\`\`bash\ninnovator plugin install ${safeName}\n\`\`\`\n\n## Usage\n\nThis plugin is automatically loaded when installed.\n`;

  return { manifest, files };
}

function generatePluginTemplate(name: string, category: PluginCategory): string {
  switch (category) {
    case "angle":
      return `import type { AnglePlugin } from "@innovator/core";

const plugin: AnglePlugin = {
  type: "angle",
  id: "${name}",
  name: "${name}",
  version: "1.0.0",
  description: "Custom angle plugin",
  angleId: "${name}",
  angleName: "${name.replace(/-/g, " ")}",
  prompt: (subject: string) =>
    \`Analyze "\${subject}" using the ${name.replace(/-/g, " ")} methodology.\\n\\nGenerate 3-5 innovative ideas.\`,
};

export default plugin;
`;
    case "exporter":
      return `import type { ExporterPlugin } from "@innovator/core";

const plugin: ExporterPlugin = {
  type: "exporter",
  id: "${name}",
  name: "${name}",
  version: "1.0.0",
  description: "Custom export format",
  formatId: "${name}",
  formatName: "${name.replace(/-/g, " ")}",
  export: (data) => JSON.stringify(data, null, 2),
};

export default plugin;
`;
    default:
      return `// ${name} plugin
// Category: ${category}

export default {
  type: "${category}",
  id: "${name}",
  name: "${name}",
  version: "1.0.0",
  description: "Custom ${category} plugin",
};
`;
  }
}

/** Validate a plugin manifest before publishing. */
export function validatePluginManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Manifest must be an object"], warnings };
  }

  const m = manifest as Record<string, unknown>;

  if (!m.name || typeof m.name !== "string") errors.push("Missing or invalid 'name'");
  if (!m.version || typeof m.version !== "string") errors.push("Missing or invalid 'version'");
  if (!m.description || typeof m.description !== "string")
    errors.push("Missing or invalid 'description'");
  if (!m.category || typeof m.category !== "string") errors.push("Missing or invalid 'category'");
  if (!m.author || typeof m.author !== "object") errors.push("Missing or invalid 'author'");
  if (!m.main || typeof m.main !== "string") errors.push("Missing or invalid 'main'");

  const validCategories: PluginCategory[] = [
    "angle",
    "vertical-pack",
    "exporter",
    "validator",
    "visualizer",
    "integration",
  ];
  if (m.category && !validCategories.includes(m.category as PluginCategory)) {
    errors.push(`Invalid category '${m.category}'. Must be one of: ${validCategories.join(", ")}`);
  }

  if (!m.compatibility) warnings.push("No compatibility range specified");
  if (!m.tags || !Array.isArray(m.tags) || m.tags.length === 0) {
    warnings.push("No tags specified — add tags for better discoverability");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Get version history for a plugin. */
export function getPluginVersions(
  pluginId: string
): Array<{ version: string; publishedAt: string }> {
  const registry = loadRegistry();
  const plugin = registry.plugins.find((p) => p.id === pluginId);
  if (!plugin) return [];
  // Current version only (version history would need a versions array in the schema)
  return [{ version: plugin.version, publishedAt: plugin.publishedAt }];
}

/** Get marketplace statistics. */
export function getMarketplaceStats(): {
  totalPlugins: number;
  totalDownloads: number;
  byCategory: Record<string, number>;
  topPlugins: Array<{ name: string; downloads: number }>;
} {
  const registry = loadRegistry();
  const byCategory: Record<string, number> = {};
  let totalDownloads = 0;

  for (const plugin of registry.plugins) {
    byCategory[plugin.category] = (byCategory[plugin.category] ?? 0) + 1;
    totalDownloads += plugin.downloads;
  }

  const topPlugins = [...registry.plugins]
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 10)
    .map((p) => ({ name: p.name, downloads: p.downloads }));

  return {
    totalPlugins: registry.plugins.length,
    totalDownloads,
    byCategory,
    topPlugins,
  };
}
