/**
 * @module plugins
 *
 * Plugin registry for managing angle, exporter, and visualizer plugins.
 * Supports local file loading and npm package loading.
 */

import type { InnovatorPlugin, AnglePlugin, ExporterPlugin, VisualizerPlugin } from "../types.js";

/** In-memory plugin registry. */
const plugins = new Map<string, InnovatorPlugin>();

/**
 * Register a plugin in the in-memory registry.
 * Throws if a plugin with the same ID is already registered.
 *
 * @param plugin - The plugin to register (must have `id`, `name`, and `type`).
 * @throws {Error} If `plugin` is missing required fields or a duplicate ID exists.
 * @example
 * ```ts
 * registerPlugin({ id: "my-angle", name: "My Angle", type: "angle", version: "1.0.0", angles: [] });
 * ```
 */
export function registerPlugin(plugin: InnovatorPlugin): void {
  if (!plugin.id || !plugin.name || !plugin.type) {
    throw new Error("Plugin must have id, name, and type");
  }
  if (plugins.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered`);
  }
  plugins.set(plugin.id, plugin);
}

/**
 * Unregister a plugin by ID.
 *
 * @param id - The unique plugin identifier to remove.
 * @returns `true` if the plugin was found and removed, `false` otherwise.
 * @example
 * ```ts
 * const removed = unregisterPlugin("my-angle");
 * ```
 */
export function unregisterPlugin(id: string): boolean {
  return plugins.delete(id);
}

/**
 * Get a registered plugin by its unique ID.
 *
 * @param id - The plugin identifier to look up.
 * @returns The plugin instance, or `undefined` if not found.
 */
export function getPlugin(id: string): InnovatorPlugin | undefined {
  return plugins.get(id);
}

/**
 * Get all registered plugins.
 *
 * @returns An array of all currently registered plugins.
 */
export function listPlugins(): InnovatorPlugin[] {
  return Array.from(plugins.values());
}

/**
 * Get all plugins of a specific type.
 *
 * @param type - The plugin type to filter by (`"angle"`, `"exporter"`, or `"visualizer"`).
 * @returns An array of plugins matching the requested type.
 * @example
 * ```ts
 * const anglePlugins = getPluginsByType("angle");
 * ```
 */
export function getPluginsByType(type: "angle"): AnglePlugin[];
export function getPluginsByType(type: "exporter"): ExporterPlugin[];
export function getPluginsByType(type: "visualizer"): VisualizerPlugin[];
export function getPluginsByType(type: string): InnovatorPlugin[] {
  return listPlugins().filter((p) => p.type === type);
}

/**
 * Clear all registered plugins from the registry.
 * Primarily intended for test teardown.
 */
export function clearPlugins(): void {
  plugins.clear();
}

/**
 * Dynamically load and register a plugin from a local file path or npm package name.
 *
 * The module must export a default (or top-level) object conforming to {@link InnovatorPlugin}.
 *
 * @param source - Absolute file path or npm package name to import.
 * @returns The loaded and registered plugin instance.
 * @throws {Error} If the module cannot be loaded or is missing `id`/`type`.
 * @example
 * ```ts
 * const plugin = await loadPlugin("./my-plugin.js");
 * const plugin = await loadPlugin("innovator-plugin-foo");
 * ```
 */
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
