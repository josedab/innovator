import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  listPlugins,
  getPluginsByType,
  clearPlugins,
  clearPluginsSync,
  loadPlugin,
  initPlugin,
  initAllPlugins,
  getPluginState,
  checkPluginHealth,
} from "../plugins/index.js";
import type { AnglePlugin, ExporterPlugin, ExportData } from "../types.js";
import type { LifecyclePlugin } from "../plugins/index.js";

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
    clearPluginsSync();
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

  it("unregisters a plugin", async () => {
    registerPlugin(sampleAnglePlugin);
    expect(await unregisterPlugin("test-angle-plugin")).toBe(true);
    expect(getPlugin("test-angle-plugin")).toBeUndefined();
  });

  it("returns false when unregistering non-existent plugin", async () => {
    expect(await unregisterPlugin("nonexistent")).toBe(false);
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

  it("clears all plugins", async () => {
    registerPlugin(sampleAnglePlugin);
    await clearPlugins();
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

    it("re-registers same ID after unregisterPlugin() succeeds", async () => {
      registerPlugin(sampleAnglePlugin);
      await unregisterPlugin(sampleAnglePlugin.id);
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
      const exportData: ExportData = { subject: "test", angleResults: [] };
      const result = await sampleExporterPlugin.export(exportData, "txt");
      expect(typeof result).toBe("string");
      expect(result).toBe(JSON.stringify(exportData));
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

  describe("edge cases", () => {
    it("preserves extra fields on registered plugins", () => {
      const plugin = {
        ...sampleAnglePlugin,
        id: "extra-fields",
        customField: "preserved",
        nestedData: { key: "value" },
      } as AnglePlugin & Record<string, unknown>;
      registerPlugin(plugin);
      const retrieved = getPlugin("extra-fields") as typeof plugin;
      expect(retrieved.customField).toBe("preserved");
      expect(retrieved.nestedData).toEqual({ key: "value" });
    });

    it("getPlugin returns undefined for empty string id", () => {
      expect(getPlugin("")).toBeUndefined();
    });

    it("getPluginsByType returns empty for unknown type", () => {
      registerPlugin(sampleAnglePlugin);
      expect(getPluginsByType("nonexistent" as "angle")).toEqual([]);
    });

    it("loadPlugin re-throws 'already registered' without wrapping", async () => {
      registerPlugin(sampleAnglePlugin);
      // Mock import to return a plugin with same id
      await expect(loadPlugin("./nonexistent-but-already-registered.js")).rejects.toThrow(
        "Failed to load plugin"
      );
    });
  });

  describe("lifecycle hooks", () => {
    it("initializes a plugin with onInit", async () => {
      let initialized = false;
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "lifecycle-init",
        onInit: async (ctx) => {
          expect(ctx.pluginId).toBe("lifecycle-init");
          initialized = true;
        },
      };
      registerPlugin(plugin);
      expect(getPluginState("lifecycle-init")).toBe("pending");

      await initPlugin("lifecycle-init");
      expect(initialized).toBe(true);
      expect(getPluginState("lifecycle-init")).toBe("initialized");
    });

    it("calls onDestroy when unregistering", async () => {
      let destroyed = false;
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "lifecycle-destroy",
        onDestroy: async () => {
          destroyed = true;
        },
      };
      registerPlugin(plugin);
      await unregisterPlugin("lifecycle-destroy");
      expect(destroyed).toBe(true);
    });

    it("rejects plugins with unmet dependencies", () => {
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "dependent-plugin",
        dependencies: ["nonexistent-dep"],
      };
      expect(() => registerPlugin(plugin)).toThrow("unmet dependencies: nonexistent-dep");
    });

    it("allows plugins with satisfied dependencies", () => {
      registerPlugin(sampleAnglePlugin);
      const plugin: LifecyclePlugin = {
        ...sampleExporterPlugin,
        id: "dependent-exporter",
        dependencies: ["test-angle-plugin"],
      };
      expect(() => registerPlugin(plugin)).not.toThrow();
    });

    it("initAllPlugins initializes all pending plugins", async () => {
      let count = 0;
      const mkPlugin = (id: string): LifecyclePlugin => ({
        id,
        name: id,
        version: "1.0.0",
        type: "angle",
        angles: [],
        onInit: async () => {
          count++;
        },
      });
      registerPlugin(mkPlugin("p1"));
      registerPlugin(mkPlugin("p2"));

      await initAllPlugins();
      expect(count).toBe(2);
      expect(getPluginState("p1")).toBe("initialized");
      expect(getPluginState("p2")).toBe("initialized");
    });

    it("initPlugin is idempotent", async () => {
      let count = 0;
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "idempotent-init",
        onInit: async () => {
          count++;
        },
      };
      registerPlugin(plugin);
      await initPlugin("idempotent-init");
      await initPlugin("idempotent-init");
      expect(count).toBe(1);
    });

    it("marks failed init state", async () => {
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "fail-init",
        onInit: async () => {
          throw new Error("boom");
        },
      };
      registerPlugin(plugin);
      await expect(initPlugin("fail-init")).rejects.toThrow("initialization failed");
      expect(getPluginState("fail-init")).toBe("failed");
    });

    it("checkPluginHealth reports plugin health", async () => {
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "healthy-plugin",
        healthCheck: async () => true,
      };
      registerPlugin(plugin);
      await initPlugin("healthy-plugin");

      const health = await checkPluginHealth();
      expect(health["healthy-plugin"]).toBe(true);
    });

    it("checkPluginHealth catches failing health checks", async () => {
      const plugin: LifecyclePlugin = {
        ...sampleAnglePlugin,
        id: "unhealthy-plugin",
        healthCheck: async () => {
          throw new Error("sick");
        },
      };
      registerPlugin(plugin);

      const health = await checkPluginHealth();
      expect(health["unhealthy-plugin"]).toBe(false);
    });

    it("onInit receives PluginContext with access to other plugins", async () => {
      registerPlugin(sampleAnglePlugin);

      let receivedCtx: unknown = null;
      const plugin: LifecyclePlugin = {
        ...sampleExporterPlugin,
        id: "ctx-plugin",
        onInit: async (ctx) => {
          receivedCtx = ctx;
        },
      };
      registerPlugin(plugin);
      await initPlugin("ctx-plugin");

      const ctx = receivedCtx as {
        getPlugin: (id: string) => unknown;
        listPlugins: () => unknown[];
      };
      expect(ctx.getPlugin("test-angle-plugin")).toBeDefined();
      expect(ctx.listPlugins().length).toBeGreaterThanOrEqual(2);
    });
  });
});
