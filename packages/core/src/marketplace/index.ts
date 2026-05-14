/**
 * @module marketplace
 *
 * Plugin Marketplace & Registry: discover, install, publish, and manage
 * community plugins (angles, vertical packs, export formats, validators).
 * Leverages the existing plugin system in plugins/index.ts.
 *
 * Sub-modules:
 * - monetization.ts — pricing, licensing, creator earnings, security scanning
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { InnovatorPlugin } from "../types.js";

const MARKETPLACE_DIR = join(homedir(), ".innovator", "marketplace");
const REGISTRY_FILE = join(MARKETPLACE_DIR, "registry.json");

function ensureDir(): void {
  if (!existsSync(MARKETPLACE_DIR)) mkdirSync(MARKETPLACE_DIR, { recursive: true });
}

/** Write to a temp file then atomically rename to prevent corruption. */
function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
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
  atomicWriteFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
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
  atomicWriteFileSync(
    REGISTRY_FILE,
    JSON.stringify({ plugins: [], installed: [], reviews: [] })
  );
  atomicWriteFileSync(
    TEMPLATE_REGISTRY_FILE,
    JSON.stringify({ templates: [], collections: [] })
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

// ---- Template Package Format ----

/** Template type within the marketplace. */
export type TemplateType = "angle-pack" | "workflow" | "scoring-rubric" | "domain-preset";

/** A publishable template package. */
export interface TemplatePackage {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  /** Map of relative file paths to file contents. */
  files: Record<string, string>;
  /** IDs of other templates this one depends on. */
  dependencies: string[];
  metadata: Record<string, unknown>;
  version: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
}

/** A curated collection of templates. */
export interface TemplateCollection {
  id: string;
  name: string;
  description: string;
  templateIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** A bundle containing multiple templates for export/import. */
export interface TemplateBundle {
  version: string;
  exportedAt: string;
  templates: TemplatePackage[];
}

// ---- Template Registry (file-based, extends marketplace dir) ----

const TEMPLATE_REGISTRY_FILE = join(MARKETPLACE_DIR, "template-registry.json");

interface TemplateRegistryData {
  templates: TemplatePackage[];
  collections: TemplateCollection[];
}

function loadTemplateRegistry(): TemplateRegistryData {
  ensureDir();
  if (!existsSync(TEMPLATE_REGISTRY_FILE)) {
    return { templates: [], collections: [] };
  }
  try {
    return JSON.parse(readFileSync(TEMPLATE_REGISTRY_FILE, "utf-8")) as TemplateRegistryData;
  } catch {
    return { templates: [], collections: [] };
  }
}

function saveTemplateRegistry(data: TemplateRegistryData): void {
  ensureDir();
  atomicWriteFileSync(TEMPLATE_REGISTRY_FILE, JSON.stringify(data, null, 2));
}

// ---- Dependency Resolution ----

/**
 * Walk the dependency tree for a template and return an ordered list
 * (dependencies before dependents). Throws on missing or circular deps.
 */
export function resolveDependencies(templateId: string): TemplatePackage[] {
  const registry = loadTemplateRegistry();
  const byId = new Map(registry.templates.map((t) => [t.id, t]));
  const ordered: TemplatePackage[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Circular dependency detected involving "${id}"`);
    const tpl = byId.get(id);
    if (!tpl) throw new Error(`Template "${id}" not found in registry`);
    visiting.add(id);
    for (const dep of tpl.dependencies) visit(dep);
    visiting.delete(id);
    visited.add(id);
    ordered.push(tpl);
  }

  visit(templateId);
  return ordered;
}

/**
 * Detect version conflicts when installing multiple templates together.
 * Returns an array of conflict descriptions (empty if none).
 */
export function checkDependencyConflicts(
  templateIds: string[]
): Array<{ templateId: string; conflictsWith: string; reason: string }> {
  const registry = loadTemplateRegistry();
  const byId = new Map(registry.templates.map((t) => [t.id, t]));
  const seen = new Map<string, { version: string; from: string }>();
  const conflicts: Array<{ templateId: string; conflictsWith: string; reason: string }> = [];

  for (const id of templateIds) {
    let chain: TemplatePackage[];
    try {
      chain = resolveDependencies(id);
    } catch {
      continue;
    }
    for (const tpl of chain) {
      const existing = seen.get(tpl.id);
      if (existing && existing.version !== tpl.version) {
        conflicts.push({
          templateId: tpl.id,
          conflictsWith: existing.from,
          reason: `Version mismatch: "${existing.version}" (from ${existing.from}) vs "${tpl.version}" (from ${id})`,
        });
      } else if (!existing) {
        seen.set(tpl.id, { version: tpl.version, from: id });
      }
    }
  }
  return conflicts;
}

// ---- Template CRUD ----

/** Publish a new template to the registry. */
export function publishTemplate(
  template: Omit<TemplatePackage, "id" | "publishedAt" | "updatedAt">
): TemplatePackage {
  const registry = loadTemplateRegistry();
  const now = new Date().toISOString();
  const entry: TemplatePackage = {
    ...template,
    id: randomUUID(),
    publishedAt: now,
    updatedAt: now,
  };
  registry.templates.push(entry);
  saveTemplateRegistry(registry);
  return entry;
}

/** Search templates with optional filters. */
export function searchTemplates(options?: {
  query?: string;
  type?: TemplateType;
  limit?: number;
  offset?: number;
}): TemplatePackage[] {
  const registry = loadTemplateRegistry();
  let results = registry.templates;

  if (options?.type) {
    results = results.filter((t) => t.type === options.type);
  }
  if (options?.query) {
    const q = options.query.toLowerCase();
    results = results.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  return results.slice(offset, offset + limit);
}

/** Install a template by ID (marks it as installed by copying to local store). */
export function installTemplate(templateId: string): TemplatePackage {
  const deps = resolveDependencies(templateId);
  const target = deps[deps.length - 1];
  if (!target) throw new Error(`Template "${templateId}" not found`);

  const installDir = join(MARKETPLACE_DIR, "installed-templates");
  if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });

  for (const tpl of deps) {
    const tplDir = join(installDir, tpl.id);
    if (!existsSync(tplDir)) mkdirSync(tplDir, { recursive: true });
    for (const [filePath, content] of Object.entries(tpl.files)) {
      const fullPath = join(tplDir, filePath);
      const parentDir = join(fullPath, "..");
      if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
      writeFileSync(fullPath, content, "utf-8");
    }
  }
  return target;
}

/** Retrieve a template by ID. */
export function getTemplate(templateId: string): TemplatePackage | undefined {
  const registry = loadTemplateRegistry();
  return registry.templates.find((t) => t.id === templateId);
}

// ---- CLI Publishing Pipeline ----

/**
 * Create a TemplatePackage from a directory on disk.
 * Reads all files recursively and bundles them into the template.
 */
export function createTemplateFromDirectory(
  dirPath: string,
  author: string
): Omit<TemplatePackage, "id" | "publishedAt" | "updatedAt"> {
  if (!existsSync(dirPath)) throw new Error(`Directory "${dirPath}" does not exist`);

  const files: Record<string, string> = {};

  function readDir(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        readDir(full, rel);
      } else {
        files[rel] = readFileSync(full, "utf-8");
      }
    }
  }

  readDir(dirPath, "");

  const manifestPath = join(dirPath, "template.json");
  let manifest: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      /* ignore malformed manifest */
    }
  }

  return {
    name: (manifest["name"] as string) ?? join(dirPath).split("/").pop() ?? "unnamed",
    description: (manifest["description"] as string) ?? "",
    type: (manifest["type"] as TemplateType) ?? "domain-preset",
    files,
    dependencies: (manifest["dependencies"] as string[]) ?? [],
    metadata: (manifest["metadata"] as Record<string, unknown>) ?? {},
    version: (manifest["version"] as string) ?? "1.0.0",
    author,
  };
}

/**
 * Validate that a template is well-formed.
 * Returns an array of issues (empty if valid).
 */
export function testTemplate(
  template: Omit<TemplatePackage, "id" | "publishedAt" | "updatedAt">
): string[] {
  const issues: string[] = [];
  if (!template.name || template.name.trim().length === 0) issues.push("name is required");
  if (!template.description) issues.push("description is required");
  if (!template.version) issues.push("version is required");
  if (!template.author) issues.push("author is required");
  const validTypes: TemplateType[] = ["angle-pack", "workflow", "scoring-rubric", "domain-preset"];
  if (!validTypes.includes(template.type))
    issues.push(`type must be one of: ${validTypes.join(", ")}`);
  if (!template.files || Object.keys(template.files).length === 0)
    issues.push("at least one file is required");
  if (template.version && !/^\d+\.\d+\.\d+/.test(template.version))
    issues.push("version must follow semver (e.g. 1.0.0)");
  return issues;
}

/** Update an existing template (version bump, metadata changes, etc.). */
export function updateTemplate(
  templateId: string,
  updates: Partial<
    Pick<
      TemplatePackage,
      "name" | "description" | "version" | "files" | "metadata" | "dependencies" | "type"
    >
  >
): TemplatePackage {
  const registry = loadTemplateRegistry();
  const idx = registry.templates.findIndex((t) => t.id === templateId);
  if (idx === -1) throw new Error(`Template "${templateId}" not found`);
  const updated: TemplatePackage = {
    ...registry.templates[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  registry.templates[idx] = updated;
  saveTemplateRegistry(registry);
  return updated;
}

// ---- Template Collections ----

/** Create a curated collection of templates. */
export function createCollection(
  name: string,
  description: string,
  templateIds: string[]
): TemplateCollection {
  const registry = loadTemplateRegistry();
  const now = new Date().toISOString();
  const collection: TemplateCollection = {
    id: randomUUID(),
    name,
    description,
    templateIds,
    createdAt: now,
    updatedAt: now,
  };
  registry.collections.push(collection);
  saveTemplateRegistry(registry);
  return collection;
}

/** List all template collections. */
export function listCollections(): TemplateCollection[] {
  return loadTemplateRegistry().collections;
}

/** Get a single collection by ID. */
export function getCollection(collectionId: string): TemplateCollection | undefined {
  return loadTemplateRegistry().collections.find((c) => c.id === collectionId);
}

// ---- Template Diff ----

/** Show differences between two templates (file-level diff). */
export function diffTemplates(
  templateIdA: string,
  templateIdB: string
): {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
} {
  const registry = loadTemplateRegistry();
  const a = registry.templates.find((t) => t.id === templateIdA);
  const b = registry.templates.find((t) => t.id === templateIdB);
  if (!a) throw new Error(`Template "${templateIdA}" not found`);
  if (!b) throw new Error(`Template "${templateIdB}" not found`);

  const filesA = new Set(Object.keys(a.files));
  const filesB = new Set(Object.keys(b.files));

  const added = [...filesB].filter((f) => !filesA.has(f));
  const removed = [...filesA].filter((f) => !filesB.has(f));
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const f of filesA) {
    if (filesB.has(f)) {
      if (a.files[f] !== b.files[f]) modified.push(f);
      else unchanged.push(f);
    }
  }

  return { added, removed, modified, unchanged };
}

// ---- Bundle Export / Import ----

/** Package multiple templates into a single JSON bundle string. */
export function exportBundle(templateIds: string[]): string {
  const registry = loadTemplateRegistry();
  const templates = templateIds.map((id) => {
    const tpl = registry.templates.find((t) => t.id === id);
    if (!tpl) throw new Error(`Template "${id}" not found`);
    return tpl;
  });

  const bundle: TemplateBundle = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    templates,
  };
  return JSON.stringify(bundle, null, 2);
}

/** Import all templates from a bundle JSON string. Returns imported templates. */
export function importBundle(bundleJson: string): TemplatePackage[] {
  const bundle = JSON.parse(bundleJson) as TemplateBundle;
  if (!bundle.templates || !Array.isArray(bundle.templates)) {
    throw new Error("Invalid bundle: missing templates array");
  }

  const registry = loadTemplateRegistry();
  const imported: TemplatePackage[] = [];
  const now = new Date().toISOString();

  for (const tpl of bundle.templates) {
    const existing = registry.templates.find((t) => t.id === tpl.id);
    if (existing) continue; // skip duplicates
    const entry: TemplatePackage = { ...tpl, updatedAt: now };
    registry.templates.push(entry);
    imported.push(entry);
  }

  saveTemplateRegistry(registry);
  return imported;
}

// ---- Monetization & Security ----

export {
  type PluginPricing,
  type CreatorEarnings,
  type PluginLicense,
  type SecurityScanResult,
  PluginPricingSchema,
  setPluginPricing,
  getPluginPricing,
  grantLicense,
  checkLicense,
  getCreatorEarnings,
  recordPurchase,
  scanPlugin,
  getScanResult,
  clearMonetizationData,
} from "./monetization.js";

// ---- First-Party Seed Packages ----

export interface SeedPackage {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  tags: string[];
  content: Record<string, unknown>;
}

/**
 * Get built-in first-party marketplace packages for seeding a fresh installation.
 * Returns 20+ curated angle packs, templates, and presets.
 */
export function getSeedPackages(): SeedPackage[] {
  return [
    // Angle Packs
    {
      id: "angles-design-thinking",
      name: "Design Thinking Angles",
      description:
        "Empathize, Define, Ideate, Prototype, Test — innovation angles inspired by design thinking methodology",
      category: "angle",
      version: "1.0.0",
      tags: ["design", "ux", "product"],
      content: { angles: ["empathize", "define", "ideate", "prototype", "test"] },
    },
    {
      id: "angles-lean-startup",
      name: "Lean Startup Angles",
      description: "Build-Measure-Learn cycle angles for startup innovation",
      category: "angle",
      version: "1.0.0",
      tags: ["startup", "lean", "mvp"],
      content: { angles: ["build", "measure", "learn", "pivot", "scale"] },
    },
    {
      id: "angles-blue-ocean",
      name: "Blue Ocean Strategy",
      description: "Eliminate-Reduce-Raise-Create framework for uncontested market space",
      category: "angle",
      version: "1.0.0",
      tags: ["strategy", "market", "competition"],
      content: { angles: ["eliminate", "reduce", "raise", "create"] },
    },
    {
      id: "angles-six-hats",
      name: "Six Thinking Hats",
      description: "De Bono's six hats framework for parallel thinking",
      category: "angle",
      version: "1.0.0",
      tags: ["thinking", "decision", "team"],
      content: { angles: ["white", "red", "black", "yellow", "green", "blue"] },
    },
    {
      id: "angles-triz",
      name: "TRIZ Innovation",
      description: "Theory of Inventive Problem Solving — systematic innovation patterns",
      category: "angle",
      version: "1.0.0",
      tags: ["engineering", "systematic", "patents"],
      content: { angles: ["contradictions", "ideality", "resources", "patterns"] },
    },
    // Domain Packs
    {
      id: "domain-healthcare",
      name: "Healthcare Innovation Pack",
      description: "Specialized angles and presets for healthcare and medtech innovation",
      category: "vertical-pack",
      version: "1.0.0",
      tags: ["healthcare", "medtech", "clinical"],
      content: { domain: "healthcare", presets: 5 },
    },
    {
      id: "domain-fintech",
      name: "Fintech Innovation Pack",
      description: "Financial technology innovation angles with regulatory awareness",
      category: "vertical-pack",
      version: "1.0.0",
      tags: ["fintech", "banking", "payments"],
      content: { domain: "fintech", presets: 4 },
    },
    {
      id: "domain-edtech",
      name: "EdTech Innovation Pack",
      description: "Education technology innovation with pedagogy-aware angles",
      category: "vertical-pack",
      version: "1.0.0",
      tags: ["education", "learning", "edtech"],
      content: { domain: "edtech", presets: 4 },
    },
    {
      id: "domain-sustainability",
      name: "Sustainability Innovation Pack",
      description: "Green innovation angles focused on environmental impact and circular economy",
      category: "vertical-pack",
      version: "1.0.0",
      tags: ["sustainability", "green", "circular"],
      content: { domain: "sustainability", presets: 5 },
    },
    {
      id: "domain-ai-ml",
      name: "AI/ML Innovation Pack",
      description: "AI and machine learning product innovation angles",
      category: "vertical-pack",
      version: "1.0.0",
      tags: ["ai", "ml", "deep-learning"],
      content: { domain: "ai-ml", presets: 4 },
    },
    // Pipeline Templates
    {
      id: "template-rapid-prototype",
      name: "Rapid Prototyping Pipeline",
      description: "Quick investigation → 2 angles → artifact generation in under 60 seconds",
      category: "validator",
      version: "1.0.0",
      tags: ["fast", "prototype", "mvp"],
      content: { steps: 3, duration: "60s" },
    },
    {
      id: "template-deep-research",
      name: "Deep Research Pipeline",
      description: "Thorough investigation with 8 angles, scoring, debate, and synthesis",
      category: "validator",
      version: "1.0.0",
      tags: ["research", "thorough", "academic"],
      content: { steps: 12, duration: "5min" },
    },
    {
      id: "template-competitive-analysis",
      name: "Competitive Analysis",
      description: "Multi-subject comparative pipeline for market positioning",
      category: "validator",
      version: "1.0.0",
      tags: ["competition", "market", "analysis"],
      content: { steps: 6, duration: "3min" },
    },
    {
      id: "template-hackathon",
      name: "Hackathon Sprint",
      description: "Time-boxed innovation sprint with voting and artifact generation",
      category: "validator",
      version: "1.0.0",
      tags: ["hackathon", "sprint", "team"],
      content: { steps: 5, duration: "2min" },
    },
    {
      id: "template-patent-mining",
      name: "Patent Opportunity Mining",
      description: "Identify patentable innovation opportunities in a domain",
      category: "validator",
      version: "1.0.0",
      tags: ["patents", "ip", "legal"],
      content: { steps: 7, duration: "4min" },
    },
    // Prompt Packs
    {
      id: "prompts-creative-writing",
      name: "Creative Writing Prompts",
      description: "Innovation prompts tuned for creative and narrative contexts",
      category: "exporter",
      version: "1.0.0",
      tags: ["creative", "writing", "narrative"],
      content: { promptCount: 12 },
    },
    {
      id: "prompts-technical-innovation",
      name: "Technical Innovation Prompts",
      description: "Engineering-focused prompt templates for technical problem solving",
      category: "exporter",
      version: "1.0.0",
      tags: ["engineering", "technical", "architecture"],
      content: { promptCount: 15 },
    },
    {
      id: "prompts-business-model",
      name: "Business Model Prompts",
      description: "Prompts for business model innovation and revenue strategy",
      category: "exporter",
      version: "1.0.0",
      tags: ["business", "revenue", "model"],
      content: { promptCount: 10 },
    },
    // Integrations
    {
      id: "integration-jira",
      name: "Jira Integration",
      description: "Export innovation artifacts directly to Jira issues and epics",
      category: "integration",
      version: "1.0.0",
      tags: ["jira", "agile", "project-management"],
      content: { type: "integration" },
    },
    {
      id: "integration-notion",
      name: "Notion Integration",
      description: "Sync innovation sessions and artifacts to Notion databases",
      category: "integration",
      version: "1.0.0",
      tags: ["notion", "documentation", "wiki"],
      content: { type: "integration" },
    },
    {
      id: "integration-slack",
      name: "Slack Notifications",
      description: "Post innovation highlights and session summaries to Slack channels",
      category: "integration",
      version: "1.0.0",
      tags: ["slack", "notifications", "team"],
      content: { type: "integration" },
    },
    // Visualizers
    {
      id: "viz-mindmap",
      name: "Mind Map Visualizer",
      description: "Export innovation results as interactive mind maps",
      category: "visualizer",
      version: "1.0.0",
      tags: ["mindmap", "visualization", "export"],
      content: { type: "visualizer" },
    },
    {
      id: "viz-timeline",
      name: "Timeline Visualizer",
      description: "Chronological visualization of innovation session progression",
      category: "visualizer",
      version: "1.0.0",
      tags: ["timeline", "chronological", "history"],
      content: { type: "visualizer" },
    },
  ];
}

/**
 * Seed the marketplace with first-party packages.
 * Only adds packages that don't already exist.
 */
export function seedMarketplace(): number {
  const packages = getSeedPackages();
  let seeded = 0;

  for (const pkg of packages) {
    const existing = searchPlugins({ query: pkg.name }).find((p) => p.name === pkg.name);
    if (existing) continue;

    try {
      publishPlugin({
        name: pkg.name,
        description: pkg.description,
        category: pkg.category as PluginCategory,
        version: pkg.version,
        tags: pkg.tags,
        author: { name: "Innovator Team" },
        source: JSON.stringify(pkg.content),
      });
      seeded++;
    } catch {
      // Skip failures (e.g., if publish validation differs)
    }
  }

  return seeded;
}
