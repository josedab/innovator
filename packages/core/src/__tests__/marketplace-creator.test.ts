import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  scaffoldPlugin,
  validatePluginManifest,
  getPluginVersions,
  getMarketplaceStats,
} from "../marketplace/index.js";

describe("Marketplace Creator Tools", () => {
  describe("scaffoldPlugin", () => {
    it("scaffolds an angle plugin with correct structure", () => {
      const { manifest, files } = scaffoldPlugin("my-angle", "angle", "Alice");
      expect(manifest.name).toBe("my-angle");
      expect(manifest.category).toBe("angle");
      expect(manifest.author.name).toBe("Alice");
      expect(files["innovator-plugin.json"]).toBeDefined();
      expect(files["src/index.ts"]).toBeDefined();
      expect(files["tsconfig.json"]).toBeDefined();
      expect(files["README.md"]).toBeDefined();
    });

    it("generates angle-specific template code", () => {
      const { files } = scaffoldPlugin("custom-thinker", "angle", "Bob");
      expect(files["src/index.ts"]).toContain("AnglePlugin");
      expect(files["src/index.ts"]).toContain("custom-thinker");
    });

    it("generates exporter-specific template code", () => {
      const { files } = scaffoldPlugin("csv-export", "exporter", "Charlie");
      expect(files["src/index.ts"]).toContain("ExporterPlugin");
    });

    it("generates generic template for other categories", () => {
      const { files } = scaffoldPlugin("my-validator", "validator", "Dave");
      expect(files["src/index.ts"]).toContain("validator");
    });

    it("sanitizes plugin names", () => {
      const { manifest } = scaffoldPlugin("My Amazing Plugin!!!", "angle", "Eve");
      expect(manifest.name).toBe("my-amazing-plugin---");
    });

    it("includes install instructions in README", () => {
      const { files } = scaffoldPlugin("test-plugin", "angle", "Frank");
      expect(files["README.md"]).toContain("innovator plugin install");
    });
  });

  describe("validatePluginManifest", () => {
    it("validates a complete manifest", () => {
      const result = validatePluginManifest({
        name: "test",
        version: "1.0.0",
        description: "Test plugin",
        category: "angle",
        author: { name: "Test" },
        main: "dist/index.js",
        compatibility: ">=0.2.0",
        tags: ["test"],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects manifest without name", () => {
      const result = validatePluginManifest({ version: "1.0.0" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("rejects invalid category", () => {
      const result = validatePluginManifest({
        name: "test",
        version: "1.0.0",
        description: "Test",
        category: "invalid-category",
        author: { name: "Test" },
        main: "dist/index.js",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("category"))).toBe(true);
    });

    it("warns about missing tags", () => {
      const result = validatePluginManifest({
        name: "test",
        version: "1.0.0",
        description: "Test",
        category: "angle",
        author: { name: "Test" },
        main: "dist/index.js",
      });
      expect(result.warnings.some((w) => w.includes("tags"))).toBe(true);
    });

    it("rejects null input", () => {
      const result = validatePluginManifest(null);
      expect(result.valid).toBe(false);
    });
  });

  describe("getPluginVersions", () => {
    it("returns empty for unknown plugin", () => {
      expect(getPluginVersions("nonexistent")).toHaveLength(0);
    });
  });

  describe("getMarketplaceStats", () => {
    it("returns stats object", () => {
      const stats = getMarketplaceStats();
      expect(stats).toHaveProperty("totalPlugins");
      expect(stats).toHaveProperty("totalDownloads");
      expect(stats).toHaveProperty("byCategory");
      expect(stats).toHaveProperty("topPlugins");
    });
  });
});
