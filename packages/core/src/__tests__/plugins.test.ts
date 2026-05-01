import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  listPlugins,
  getPluginsByType,
  clearPlugins,
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
});
