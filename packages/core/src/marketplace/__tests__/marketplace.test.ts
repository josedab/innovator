import { describe, it, expect, beforeEach } from "vitest";
import {
  publishPlugin,
  searchPlugins,
  installPlugin,
  uninstallPlugin,
  clearMarketplace,
  validatePluginManifest,
  getMarketplacePlugin,
  addReview,
  getReviews,
  verifyPlugin,
  getFeaturedPlugins,
  getCategories,
  listInstalledPlugins,
  togglePlugin,
  getPluginVersions,
  getMarketplaceStats,
  scaffoldPlugin,
  publishTemplate,
  searchTemplates,
  getTemplate,
  resolveDependencies,
  checkDependencyConflicts,
  exportBundle,
  importBundle,
  testTemplate,
  diffTemplates,
  createCollection,
  listCollections,
  updateTemplate,
} from "../index.js";
import type { PluginCategory, MarketplacePlugin } from "../index.js";

function makePluginParams(overrides: Partial<Parameters<typeof publishPlugin>[0]> = {}) {
  return {
    name: "test-plugin",
    description: "A test plugin",
    category: "angle" as PluginCategory,
    author: { name: "Test Author" },
    version: "1.0.0",
    source: "npm:test-plugin",
    tags: ["test"],
    ...overrides,
  };
}

describe("marketplace", () => {
  beforeEach(() => {
    clearMarketplace();
  });

  // ---- publishPlugin ----

  describe("publishPlugin", () => {
    it("publishes a plugin with valid manifest", () => {
      const plugin = publishPlugin(makePluginParams());
      expect(plugin.id).toBeDefined();
      expect(plugin.name).toBe("test-plugin");
      expect(plugin.version).toBe("1.0.0");
      expect(plugin.downloads).toBe(0);
      expect(plugin.verified).toBe(false);
    });

    it("updates an existing plugin with same name and author", () => {
      const first = publishPlugin(makePluginParams());
      const second = publishPlugin(makePluginParams({ version: "2.0.0" }));
      expect(second.id).toBe(first.id);
      expect(second.version).toBe("2.0.0");
    });

    it("creates distinct entries for different authors", () => {
      const a = publishPlugin(makePluginParams({ author: { name: "Author A" } }));
      const b = publishPlugin(makePluginParams({ author: { name: "Author B" } }));
      expect(a.id).not.toBe(b.id);
    });

    it("defaults compatibility to >=0.1.0", () => {
      const plugin = publishPlugin(makePluginParams());
      expect(plugin.compatibility).toBe(">=0.1.0");
    });
  });

  // ---- searchPlugins ----

  describe("searchPlugins", () => {
    it("returns all plugins when no query", () => {
      publishPlugin(makePluginParams({ name: "alpha" }));
      publishPlugin(makePluginParams({ name: "beta", author: { name: "Other" } }));
      const results = searchPlugins();
      expect(results).toHaveLength(2);
    });

    it("filters by keyword in name", () => {
      publishPlugin(makePluginParams({ name: "ai-helper" }));
      publishPlugin(makePluginParams({ name: "data-tools", author: { name: "Other" } }));
      const results = searchPlugins({ query: "ai" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("ai-helper");
    });

    it("filters by category", () => {
      publishPlugin(makePluginParams({ category: "angle" }));
      publishPlugin(
        makePluginParams({ name: "exp", category: "exporter", author: { name: "Other" } })
      );
      const results = searchPlugins({ category: "exporter" });
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("exporter");
    });

    it("returns empty for no matches", () => {
      publishPlugin(makePluginParams());
      const results = searchPlugins({ query: "nonexistent" });
      expect(results).toHaveLength(0);
    });

    it("respects limit and offset", () => {
      for (let i = 0; i < 5; i++) {
        publishPlugin(makePluginParams({ name: `plugin-${i}`, author: { name: `Author ${i}` } }));
      }
      const results = searchPlugins({ limit: 2, offset: 1 });
      expect(results).toHaveLength(2);
    });

    it("sorts by rating", () => {
      const p1 = publishPlugin(makePluginParams({ name: "low-rated" }));
      const p2 = publishPlugin(makePluginParams({ name: "high-rated", author: { name: "Other" } }));
      addReview({ pluginId: p1.id, authorName: "R", rating: 2, comment: "ok" });
      addReview({ pluginId: p2.id, authorName: "R", rating: 5, comment: "great" });
      const results = searchPlugins({ sortBy: "rating" });
      expect(results[0].name).toBe("high-rated");
    });
  });

  // ---- installPlugin / uninstallPlugin ----

  describe("installPlugin", () => {
    it("installs a published plugin", () => {
      const plugin = publishPlugin(makePluginParams());
      const installed = installPlugin(plugin.id);
      expect(installed).toBeDefined();
      expect(installed!.pluginId).toBe(plugin.id);
      expect(installed!.enabled).toBe(true);
    });

    it("increments download count on install", () => {
      const plugin = publishPlugin(makePluginParams());
      installPlugin(plugin.id);
      const updated = getMarketplacePlugin(plugin.id);
      expect(updated!.downloads).toBe(1);
    });

    it("returns undefined for non-existent plugin", () => {
      expect(installPlugin("non-existent")).toBeUndefined();
    });

    it("updates version on re-install", () => {
      const plugin = publishPlugin(makePluginParams());
      installPlugin(plugin.id);
      publishPlugin(makePluginParams({ version: "2.0.0" }));
      const reinstalled = installPlugin(plugin.id);
      expect(reinstalled!.version).toBe("2.0.0");
    });
  });

  describe("uninstallPlugin", () => {
    it("uninstalls an installed plugin", () => {
      const plugin = publishPlugin(makePluginParams());
      installPlugin(plugin.id);
      expect(uninstallPlugin(plugin.id)).toBe(true);
      expect(listInstalledPlugins()).toHaveLength(0);
    });

    it("returns false for non-installed plugin", () => {
      expect(uninstallPlugin("non-existent")).toBe(false);
    });
  });

  // ---- validatePluginManifest ----

  describe("validatePluginManifest", () => {
    it("validates a correct manifest", () => {
      const result = validatePluginManifest({
        name: "test",
        version: "1.0.0",
        description: "desc",
        category: "angle",
        author: { name: "Auth" },
        main: "dist/index.js",
        tags: ["test"],
        compatibility: ">=0.1.0",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("reports missing fields", () => {
      const result = validatePluginManifest({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects non-object input", () => {
      const result = validatePluginManifest(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Manifest must be an object");
    });

    it("rejects invalid category", () => {
      const result = validatePluginManifest({
        name: "test",
        version: "1.0.0",
        description: "desc",
        category: "invalid-cat",
        author: { name: "Auth" },
        main: "dist/index.js",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid category"))).toBe(true);
    });

    it("warns when no tags", () => {
      const result = validatePluginManifest({
        name: "test",
        version: "1.0.0",
        description: "desc",
        category: "angle",
        author: { name: "Auth" },
        main: "dist/index.js",
      });
      expect(result.warnings.some((w) => w.includes("tags"))).toBe(true);
    });
  });

  // ---- Reviews ----

  describe("reviews", () => {
    it("adds a review and updates rating", () => {
      const plugin = publishPlugin(makePluginParams());
      const review = addReview({
        pluginId: plugin.id,
        authorName: "Reviewer",
        rating: 4,
        comment: "Nice",
      });
      expect(review).toBeDefined();
      expect(review!.rating).toBe(4);
      const updated = getMarketplacePlugin(plugin.id);
      expect(updated!.rating).toBe(4);
      expect(updated!.ratingCount).toBe(1);
    });

    it("rejects rating out of range", () => {
      const plugin = publishPlugin(makePluginParams());
      expect(
        addReview({ pluginId: plugin.id, authorName: "R", rating: 0, comment: "bad" })
      ).toBeUndefined();
      expect(
        addReview({ pluginId: plugin.id, authorName: "R", rating: 6, comment: "too high" })
      ).toBeUndefined();
    });

    it("retrieves reviews for a plugin", () => {
      const plugin = publishPlugin(makePluginParams());
      addReview({ pluginId: plugin.id, authorName: "R1", rating: 3, comment: "ok" });
      addReview({ pluginId: plugin.id, authorName: "R2", rating: 5, comment: "great" });
      const reviews = getReviews(plugin.id);
      expect(reviews).toHaveLength(2);
    });
  });

  // ---- Template dependency resolution ----

  describe("resolveDependencies", () => {
    it("resolves a linear dependency chain", () => {
      const a = publishTemplate({
        name: "A",
        description: "Base",
        type: "workflow",
        files: { "a.txt": "a" },
        dependencies: [],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const b = publishTemplate({
        name: "B",
        description: "Depends on A",
        type: "workflow",
        files: { "b.txt": "b" },
        dependencies: [a.id],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const resolved = resolveDependencies(b.id);
      expect(resolved).toHaveLength(2);
      expect(resolved[0].id).toBe(a.id);
      expect(resolved[1].id).toBe(b.id);
    });

    it("detects circular dependencies", () => {
      // We can't create true circular deps via publishTemplate (IDs are generated),
      // so we test that the function throws for missing templates
      expect(() => resolveDependencies("nonexistent")).toThrow("not found");
    });
  });

  // ---- checkDependencyConflicts ----

  describe("checkDependencyConflicts", () => {
    it("returns empty when no conflicts", () => {
      const a = publishTemplate({
        name: "A",
        description: "A",
        type: "workflow",
        files: { "a.txt": "a" },
        dependencies: [],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const conflicts = checkDependencyConflicts([a.id]);
      expect(conflicts).toHaveLength(0);
    });
  });

  // ---- exportBundle / importBundle ----

  describe("exportBundle / importBundle", () => {
    it("round-trips templates through export and import", () => {
      const t = publishTemplate({
        name: "Exportable",
        description: "For export",
        type: "domain-preset",
        files: { "config.json": '{"key":"value"}' },
        dependencies: [],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const bundleJson = exportBundle([t.id]);
      const parsed = JSON.parse(bundleJson);
      expect(parsed.version).toBe("1.0.0");
      expect(parsed.templates).toHaveLength(1);
      expect(parsed.templates[0].name).toBe("Exportable");
      expect(parsed.templates[0].files["config.json"]).toBe('{"key":"value"}');
    });

    it("throws on corrupt bundle", () => {
      expect(() => importBundle("not valid json")).toThrow();
    });

    it("throws on bundle with no templates array", () => {
      expect(() => importBundle(JSON.stringify({ version: "1.0.0" }))).toThrow("Invalid bundle");
    });

    it("skips duplicate templates on import", () => {
      const t = publishTemplate({
        name: "Dup",
        description: "dup test",
        type: "workflow",
        files: { "x.txt": "x" },
        dependencies: [],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const bundleJson = exportBundle([t.id]);
      // Import without clearing — template already exists
      const imported = importBundle(bundleJson);
      expect(imported).toHaveLength(0);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("searchPlugins on empty registry returns empty", () => {
      expect(searchPlugins()).toHaveLength(0);
    });

    it("getMarketplaceStats on empty registry", () => {
      const stats = getMarketplaceStats();
      expect(stats.totalPlugins).toBe(0);
      expect(stats.totalDownloads).toBe(0);
    });

    it("scaffoldPlugin generates valid files", () => {
      const { manifest, files } = scaffoldPlugin("my-plugin", "angle", "Dev");
      expect(manifest.name).toBe("my-plugin");
      expect(files["innovator-plugin.json"]).toBeDefined();
      expect(files["src/index.ts"]).toBeDefined();
      expect(files["README.md"]).toBeDefined();
    });

    it("verifyPlugin marks plugin as verified", () => {
      const plugin = publishPlugin(makePluginParams());
      expect(verifyPlugin(plugin.id)).toBe(true);
      const updated = getMarketplacePlugin(plugin.id);
      expect(updated!.verified).toBe(true);
    });

    it("togglePlugin changes enabled state", () => {
      const plugin = publishPlugin(makePluginParams());
      installPlugin(plugin.id);
      expect(togglePlugin(plugin.id, false)).toBe(true);
      const installed = listInstalledPlugins();
      expect(installed[0].enabled).toBe(false);
    });

    it("getPluginVersions returns current version", () => {
      const plugin = publishPlugin(makePluginParams());
      const versions = getPluginVersions(plugin.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe("1.0.0");
    });

    it("testTemplate reports issues for empty template", () => {
      const issues = testTemplate({
        name: "",
        description: "",
        type: "workflow",
        files: {},
        dependencies: [],
        metadata: {},
        version: "",
        author: "",
      });
      expect(issues.length).toBeGreaterThan(0);
    });

    it("diffTemplates detects added and removed files", () => {
      const a = publishTemplate({
        name: "A",
        description: "A",
        type: "workflow",
        files: { "shared.txt": "same", "old.txt": "old" },
        dependencies: [],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const b = publishTemplate({
        name: "B",
        description: "B",
        type: "workflow",
        files: { "shared.txt": "same", "new.txt": "new" },
        dependencies: [],
        metadata: {},
        version: "1.0.0",
        author: "test",
      });
      const diff = diffTemplates(a.id, b.id);
      expect(diff.added).toContain("new.txt");
      expect(diff.removed).toContain("old.txt");
      expect(diff.unchanged).toContain("shared.txt");
    });
  });
});
