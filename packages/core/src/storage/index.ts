/**
 * @module storage
 *
 * Global storage provider management.
 * Exposes getStorage() / setStorage() for the entire application.
 * Defaults to InMemoryStorageProvider for backward compatibility.
 */

import type { StorageProvider } from "./types.js";
import { InMemoryStorageProvider } from "./memory.js";

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
export { SQLiteStorageProvider, createBetterSqliteDB } from "./sqlite.js";
export type { SQLiteDB, TursoConfig } from "./sqlite.js";

let globalProvider: StorageProvider = new InMemoryStorageProvider();

/** Get the current global storage provider. */
export function getStorage(): StorageProvider {
  return globalProvider;
}

/** Set the global storage provider. Call initialize() after setting. */
export function setStorage(provider: StorageProvider): void {
  globalProvider = provider;
}

/** Initialize the global storage provider (creates tables, etc.). */
export async function initializeStorage(): Promise<void> {
  await globalProvider.initialize();
}

/** Close the global storage provider (for graceful shutdown). */
export async function closeStorage(): Promise<void> {
  await globalProvider.close();
}

/**
 * Create and configure a SQLite storage provider from a file path.
 * Convenience helper that handles the common case.
 */
export async function createSQLiteStorage(filepath: string): Promise<StorageProvider> {
  const { SQLiteStorageProvider, createBetterSqliteDB } = await import("./sqlite.js");
  const db = createBetterSqliteDB(filepath);
  const provider = new SQLiteStorageProvider(db);
  await provider.initialize();
  return provider;
}
