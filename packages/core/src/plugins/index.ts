/**
 * @module plugins
 *
 * Plugin registry for managing angle, exporter, and visualizer plugins.
 * Supports local file loading, npm package loading, lifecycle hooks,
 * dependency resolution, and health checks.
 */

import type { InnovatorPlugin, AnglePlugin, ExporterPlugin, VisualizerPlugin } from "../types.js";

/** Context provided to plugins during lifecycle events. */
export interface PluginContext {
  /** The plugin's own ID. */
  pluginId: string;
  /** Look up another registered plugin by ID. */
  getPlugin: (id: string) => InnovatorPlugin | undefined;
  /** List all registered plugins. */
  listPlugins: () => InnovatorPlugin[];
}

/** Lifecycle hooks a plugin may optionally implement. */
export interface PluginLifecycle {
  /** Called after the plugin is registered. Use for async initialization (open connections, load data). */
  onInit?: (ctx: PluginContext) => Promise<void> | void;
  /** Called before the plugin is unregistered. Use for cleanup (close connections, flush buffers). */
  onDestroy?: () => Promise<void> | void;
  /** Health check returning true if the plugin is operational. */
  healthCheck?: () => Promise<boolean> | boolean;
  /** IDs of plugins this plugin depends on. Checked at registration time. */
  dependencies?: string[];
}

/** A plugin with optional lifecycle hooks. */
export type LifecyclePlugin = InnovatorPlugin & Partial<PluginLifecycle>;

/** In-memory plugin registry. */
const plugins = new Map<string, LifecyclePlugin>();

/** Track initialization state per plugin. */
const initState = new Map<string, "pending" | "initialized" | "failed">();

function buildContext(pluginId: string): PluginContext {
  return {
    pluginId,
    getPlugin: (id: string) => plugins.get(id),
    listPlugins: () => Array.from(plugins.values()),
  };
}

/**
 * Register a plugin in the in-memory registry.
 * Throws if a plugin with the same ID is already registered.
 * If the plugin declares dependencies, verifies they are already registered.
 *
 * @param plugin - The plugin to register (must have `id`, `name`, and `type`).
 * @throws {Error} If `plugin` is missing required fields, a duplicate ID exists, or dependencies are unmet.
 * @example
 * ```ts
 * registerPlugin({ id: "my-angle", name: "My Angle", type: "angle", version: "1.0.0", angles: [] });
 * ```
 */
export function registerPlugin(plugin: LifecyclePlugin): void {
  if (!plugin.id || !plugin.name || !plugin.type) {
    throw new Error("Plugin must have id, name, and type");
  }
  if (plugins.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered`);
  }

  // Check dependencies
  if (plugin.dependencies) {
    const missing = plugin.dependencies.filter((dep) => !plugins.has(dep));
    if (missing.length > 0) {
      throw new Error(`Plugin "${plugin.id}" has unmet dependencies: ${missing.join(", ")}`);
    }
  }

  plugins.set(plugin.id, plugin);
  initState.set(plugin.id, "pending");
}

/**
 * Initialize a registered plugin by calling its `onInit` hook.
 * No-op if the plugin has no `onInit` hook or is already initialized.
 *
 * @param id - The plugin ID to initialize.
 * @throws {Error} If the plugin is not registered or initialization fails.
 */
export async function initPlugin(id: string): Promise<void> {
  const plugin = plugins.get(id);
  if (!plugin) {
    throw new Error(`Plugin "${id}" is not registered`);
  }
  if (initState.get(id) === "initialized") return;

  if (plugin.onInit) {
    try {
      await plugin.onInit(buildContext(id));
      initState.set(id, "initialized");
    } catch (err) {
      initState.set(id, "failed");
      throw new Error(
        `Plugin "${id}" initialization failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    initState.set(id, "initialized");
  }
}

/**
 * Initialize all registered plugins that have not yet been initialized.
 * Plugins are initialized in registration order.
 */
export async function initAllPlugins(): Promise<void> {
  for (const id of plugins.keys()) {
    if (initState.get(id) !== "initialized") {
      await initPlugin(id);
    }
  }
}

/**
 * Unregister a plugin by ID, calling its `onDestroy` hook if present.
 *
 * @param id - The unique plugin identifier to remove.
 * @returns `true` if the plugin was found and removed, `false` otherwise.
 * @example
 * ```ts
 * const removed = await unregisterPlugin("my-angle");
 * ```
 */
export async function unregisterPlugin(id: string): Promise<boolean> {
  const plugin = plugins.get(id);
  if (!plugin) return false;

  if (plugin.onDestroy) {
    try {
      await plugin.onDestroy();
    } catch {
      // Suppress destroy errors — we're removing the plugin regardless
    }
  }
  initState.delete(id);
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
 * Check the initialization state of a plugin.
 *
 * @param id - The plugin identifier.
 * @returns The initialization state, or `undefined` if not registered.
 */
export function getPluginState(id: string): "pending" | "initialized" | "failed" | undefined {
  return initState.get(id);
}

/**
 * Run health checks on all registered plugins that implement `healthCheck`.
 *
 * @returns A record mapping plugin IDs to their health status.
 */
export async function checkPluginHealth(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  for (const [id, plugin] of plugins) {
    if (plugin.healthCheck) {
      try {
        results[id] = await plugin.healthCheck();
      } catch {
        results[id] = false;
      }
    } else {
      results[id] = initState.get(id) === "initialized";
    }
  }
  return results;
}

/**
 * Clear all registered plugins from the registry, calling `onDestroy` on each.
 * Primarily intended for test teardown.
 */
export async function clearPlugins(): Promise<void> {
  for (const [_id, plugin] of plugins) {
    if (plugin.onDestroy) {
      try {
        await plugin.onDestroy();
      } catch {
        // Suppress errors during bulk cleanup
      }
    }
  }
  plugins.clear();
  initState.clear();
}

/**
 * Synchronous clear for backward compatibility and test teardown.
 * Does NOT call `onDestroy` hooks — use {@link clearPlugins} when possible.
 */
export function clearPluginsSync(): void {
  plugins.clear();
  initState.clear();
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
    const plugin: LifecyclePlugin = mod.default ?? mod;
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
