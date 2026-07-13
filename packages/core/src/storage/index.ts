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

/** Instance-owned storage provider selection and lifecycle state. */
export class StorageContext {
  private provider: StorageProvider;
  private initialized = false;

  constructor(provider: StorageProvider = new InMemoryStorageProvider()) {
    this.provider = provider;
  }

  getStorage(): StorageProvider {
    return this.provider;
  }

  setStorage(provider: StorageProvider): void {
    if (!provider) {
      throw new ConfigurationError(
        "setStorage: provider must not be null or undefined",
        "provider"
      );
    }
    if (typeof provider.initialize !== "function" || typeof provider.close !== "function") {
      throw new ConfigurationError(
        "setStorage: provider must implement initialize() and close() methods",
        "provider"
      );
    }
    this.provider = provider;
    this.initialized = false;
  }

  async initializeStorage(): Promise<void> {
    if (this.initialized) return;
    await this.provider.initialize();
    this.initialized = true;
  }

  async closeStorage(): Promise<void> {
    if (!this.initialized) return;
    await this.provider.close();
    this.initialized = false;
  }

  isStorageInitialized(): boolean {
    return this.initialized;
  }
}

export const defaultStorageContext = new StorageContext();

/** Get the current global storage provider. */
export function getStorage(): StorageProvider {
  return defaultStorageContext.getStorage();
}

/**
 * Set the global storage provider. Call initialize() after setting.
 * @throws {ConfigurationError} if the provider is null/undefined or missing required methods
 */
export function setStorage(provider: StorageProvider): void {
  defaultStorageContext.setStorage(provider);
}

/** Initialize the global storage provider (creates tables, etc.). Idempotent — safe to call multiple times. */
export async function initializeStorage(): Promise<void> {
  await defaultStorageContext.initializeStorage();
}

/** Close the global storage provider (for graceful shutdown). Idempotent — safe to call multiple times. */
export async function closeStorage(): Promise<void> {
  await defaultStorageContext.closeStorage();
}

/** Check whether the storage provider has been initialized. */
export function isStorageInitialized(): boolean {
  return defaultStorageContext.isStorageInitialized();
}
