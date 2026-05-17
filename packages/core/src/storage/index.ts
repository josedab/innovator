/**
 * @module storage
 *
 * Global storage provider management.
 * Exposes getStorage() / setStorage() for the entire application.
 * Defaults to InMemoryStorageProvider for backward compatibility.
 */

import type { StorageProvider } from "./types.js";
import { InMemoryStorageProvider } from "./memory.js";
import { ConfigurationError } from "../errors.js";

export type {
  StorageProvider,
  SessionStorage,
  WorkspaceStorage,
  ApiGatewayStorage,
  CollaborationStorage,
  AnalyticsStorage,
  KnowledgeGraphStorage,
} from "./types.js";

export { InMemoryStorageProvider } from "./memory.js";

let globalProvider: StorageProvider = new InMemoryStorageProvider();
let initialized = false;

/** Get the current global storage provider. */
export function getStorage(): StorageProvider {
  return globalProvider;
}

/**
 * Set the global storage provider. Call initialize() after setting.
 * @throws {ConfigurationError} if the provider is null/undefined or missing required methods
 */
export function setStorage(provider: StorageProvider): void {
  if (!provider) {
    throw new ConfigurationError("setStorage: provider must not be null or undefined", "provider");
  }
  if (typeof provider.initialize !== "function" || typeof provider.close !== "function") {
    throw new ConfigurationError(
      "setStorage: provider must implement initialize() and close() methods",
      "provider"
    );
  }
  globalProvider = provider;
  initialized = false;
}

/** Initialize the global storage provider (creates tables, etc.). Idempotent — safe to call multiple times. */
export async function initializeStorage(): Promise<void> {
  if (initialized) return;
  await globalProvider.initialize();
  initialized = true;
}

/** Close the global storage provider (for graceful shutdown). Idempotent — safe to call multiple times. */
export async function closeStorage(): Promise<void> {
  if (!initialized) return;
  await globalProvider.close();
  initialized = false;
}

/** Check whether the storage provider has been initialized. */
export function isStorageInitialized(): boolean {
  return initialized;
}
