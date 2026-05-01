/**
 * @module plugins
 *
 * Plugin registry for managing angle, exporter, and visualizer plugins.
 * Supports local file loading and npm package loading.
 */

import type { InnovatorPlugin, AnglePlugin, ExporterPlugin, VisualizerPlugin } from "../types.js";

/** In-memory plugin registry. */
const plugins = new Map<string, InnovatorPlugin>();

/** Register a plugin. Throws if a plugin with the same ID is already registered. */
export function registerPlugin(plugin: InnovatorPlugin): void {
  if (!plugin.id || !plugin.name || !plugin.type) {
    throw new Error("Plugin must have id, name, and type");
  }
  if (plugins.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered`);
  }
  plugins.set(plugin.id, plugin);
}

/** Unregister a plugin by ID. Returns true if found and removed. */
export function unregisterPlugin(id: string): boolean {
  return plugins.delete(id);
}

/** Get a plugin by ID. */
export function getPlugin(id: string): InnovatorPlugin | undefined {
  return plugins.get(id);
}

/** Get all registered plugins. */
export function listPlugins(): InnovatorPlugin[] {
  return Array.from(plugins.values());
}

/** Get all plugins of a specific type. */
export function getPluginsByType(type: "angle"): AnglePlugin[];
export function getPluginsByType(type: "exporter"): ExporterPlugin[];
export function getPluginsByType(type: "visualizer"): VisualizerPlugin[];
export function getPluginsByType(type: string): InnovatorPlugin[] {
  return listPlugins().filter((p) => p.type === type);
}

/** Clear all registered plugins (mainly for testing). */
export function clearPlugins(): void {
  plugins.clear();
}

/** Load a plugin from a local file path or npm package name. */
export async function loadPlugin(source: string): Promise<InnovatorPlugin> {
  try {
    const mod = await import(source);
    const plugin: InnovatorPlugin = mod.default ?? mod;
    if (!plugin.id || !plugin.type) {
      throw new Error(`Invalid plugin at "${source}": missing id or type`);
    }
    registerPlugin(plugin);
    return plugin;
  } catch (err) {
    if (err instanceof Error && err.message.includes("already registered")) {
      throw err;
    }
    throw new Error(
      `Failed to load plugin from "${source}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
