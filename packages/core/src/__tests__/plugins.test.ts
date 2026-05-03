import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  listPlugins,
  getPluginsByType,
  clearPlugins,
  loadPlugin,
} from "../plugins/index.js";
import type { AnglePlugin, ExporterPlugin } from "../types.js";

const sampleAnglePlugin: AnglePlugin = {
  id: "test-angle-plugin",
  name: "Test Angle Plugin",
  version: "1.0.0",
  type: "angle",
  angles: [
    {
      id: "test-custom",
      name: "Test Custom",
      description: "A test custom angle",
      promptTemplate: "Test {{subject}} with {{investigation}}",
    },
  ],
};

const sampleExporterPlugin: ExporterPlugin = {
  id: "test-exporter-plugin",
  name: "Test Exporter",
  version: "1.0.0",
  type: "exporter",
  formats: [{ id: "txt", name: "Text", extension: ".txt" }],
  async export(data, format) {
    return JSON.stringify(data);
  },
};

describe("plugin registry", () => {
  beforeEach(() => {
    clearPlugins();
  });

  it("registers and retrieves a plugin", () => {
    registerPlugin(sampleAnglePlugin);
    expect(getPlugin("test-angle-plugin")).toEqual(sampleAnglePlugin);
  });

  it("rejects duplicate plugin IDs", () => {
    registerPlugin(sampleAnglePlugin);
    expect(() => registerPlugin(sampleAnglePlugin)).toThrow("already registered");
  });

  it("rejects plugins without required fields", () => {
    expect(() => registerPlugin({} as AnglePlugin)).toThrow("must have id, name, and type");
  });

  it("unregisters a plugin", () => {
    registerPlugin(sampleAnglePlugin);
    expect(unregisterPlugin("test-angle-plugin")).toBe(true);
    expect(getPlugin("test-angle-plugin")).toBeUndefined();
  });

  it("returns false when unregistering non-existent plugin", () => {
    expect(unregisterPlugin("nonexistent")).toBe(false);
  });

  it("lists all plugins", () => {
    registerPlugin(sampleAnglePlugin);
    registerPlugin(sampleExporterPlugin);
    expect(listPlugins()).toHaveLength(2);
  });

  it("filters plugins by type", () => {
    registerPlugin(sampleAnglePlugin);
    registerPlugin(sampleExporterPlugin);
    expect(getPluginsByType("angle")).toHaveLength(1);
    expect(getPluginsByType("exporter")).toHaveLength(1);
    expect(getPluginsByType("visualizer")).toHaveLength(0);
  });

  it("clears all plugins", () => {
    registerPlugin(sampleAnglePlugin);
    clearPlugins();
    expect(listPlugins()).toHaveLength(0);
  });

  describe("loadPlugin", () => {
    it("throws meaningful error for invalid path", async () => {
      const { loadPlugin } = await import("../plugins/index.js");
      await expect(loadPlugin("/nonexistent/path/plugin.js")).rejects.toThrow(
        'Failed to load plugin from "/nonexistent/path/plugin.js"'
      );
    });

    it("throws for malformed plugin module (missing id/type)", async () => {
      const { loadPlugin } = await import("../plugins/index.js");
      // Dynamic import of a real module that doesn't export a plugin shape
      await expect(loadPlugin("node:path")).rejects.toThrow("Failed to load plugin");
    });

    it("re-registers same ID after unregisterPlugin() succeeds", () => {
      registerPlugin(sampleAnglePlugin);
      unregisterPlugin(sampleAnglePlugin.id);
      expect(() => registerPlugin(sampleAnglePlugin)).not.toThrow();
      expect(getPlugin(sampleAnglePlugin.id)).toEqual(sampleAnglePlugin);
    });
  });

  describe("AnglePlugin validation", () => {
    it("angles array validates promptTemplate with {{subject}}", () => {
      expect(sampleAnglePlugin.angles[0].promptTemplate).toContain("{{subject}}");
    });

    it("angles array contains valid angle definitions", () => {
      for (const angle of sampleAnglePlugin.angles) {
        expect(angle.id).toBeTruthy();
        expect(angle.name).toBeTruthy();
        expect(angle.description).toBeTruthy();
      }
    });
  });

  describe("ExporterPlugin", () => {
    it("export() async invocation returns string", async () => {
      const result = await sampleExporterPlugin.export({ test: true }, "txt");
      expect(typeof result).toBe("string");
      expect(result).toBe(JSON.stringify({ test: true }));
    });

    it("has valid formats with extension", () => {
      expect(sampleExporterPlugin.formats).toHaveLength(1);
      expect(sampleExporterPlugin.formats[0].extension).toBe(".txt");
    });
  });

  describe("plugin version field", () => {
    it("version field is a valid semver-like string", () => {
      expect(sampleAnglePlugin.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(sampleExporterPlugin.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("registers plugin with non-semver version string", () => {
      const plugin: AnglePlugin = {
        ...sampleAnglePlugin,
        id: "non-semver-plugin",
        version: "latest",
      };
      expect(() => registerPlugin(plugin)).not.toThrow();
      expect(getPlugin("non-semver-plugin")?.version).toBe("latest");
    });
  });
});
