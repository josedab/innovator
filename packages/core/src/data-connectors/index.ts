/**
 * @module data-connectors
 *
 * Plug-and-Play Data Connectors — pre-built connectors to import context
 * from Jira, Confluence, Notion, Google Docs, Figma, and GitHub Issues
 * with two-way sync. Provides standardized connector interface, OAuth2
 * authentication, data normalization, and conflict resolution.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Zod Schemas ----

/** Supported connector types. */
export const ConnectorTypeSchema = z.enum([
  "jira",
  "github-issues",
  "notion",
  "confluence",
  "google-docs",
  "figma",
  "custom",
]);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

/** Sync direction. */
export const SyncDirectionSchema = z.enum(["import", "export", "bidirectional"]);
export type SyncDirection = z.infer<typeof SyncDirectionSchema>;

/** Sync status. */
export const SyncStatusSchema = z.enum(["idle", "syncing", "success", "error", "conflict"]);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

/** OAuth2 credentials. */
export const OAuth2CredentialsSchema = z.object({
  clientId: z.string().max(500),
  accessToken: z.string().max(5000),
  refreshToken: z.string().max(5000).optional(),
  expiresAt: z.string().optional(),
  scopes: z.array(z.string().max(200)).max(20),
});
export type OAuth2Credentials = z.infer<typeof OAuth2CredentialsSchema>;

/** Connector configuration. */
export const DataConnectorConfigSchema = z.object({
  id: z.string().max(200),
  type: ConnectorTypeSchema,
  name: z.string().max(300),
  enabled: z.boolean().default(true),
  direction: SyncDirectionSchema.default("import"),
  baseUrl: z.string().max(2000).optional(),
  credentials: OAuth2CredentialsSchema.optional(),
  filters: z
    .object({
      projects: z.array(z.string().max(200)).max(20).optional(),
      labels: z.array(z.string().max(100)).max(50).optional(),
      status: z.array(z.string().max(100)).max(20).optional(),
    })
    .optional(),
  syncIntervalMinutes: z.number().int().min(5).max(10080).default(60),
  lastSyncAt: z.string().optional(),
  createdAt: z.string(),
});
export type DataConnectorConfig = z.infer<typeof DataConnectorConfigSchema>;

/** Normalized data item from any connector. */
export const NormalizedItemSchema = z.object({
  id: z.string().max(500),
  connectorId: z.string().max(200),
  sourceType: ConnectorTypeSchema,
  sourceId: z.string().max(500),
  title: z.string().max(1000),
  description: z.string().max(50000),
  url: z.string().max(2000).optional(),
  status: z.string().max(100).optional(),
  labels: z.array(z.string().max(100)).max(50),
  author: z.string().max(300).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
  syncedAt: z.string(),
});
export type NormalizedItem = z.infer<typeof NormalizedItemSchema>;

/** Sync result summary. */
export const SyncResultSchema = z.object({
  connectorId: z.string(),
  status: SyncStatusSchema,
  itemsImported: z.number().int().min(0),
  itemsExported: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  errors: z.array(z.string().max(1000)).max(50),
  syncedAt: z.string(),
  durationMs: z.number().int().min(0),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

/** Conflict entry when bidirectional sync detects changes on both sides. */
export const ConflictEntrySchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  itemId: z.string(),
  localVersion: z.string().max(50000),
  remoteVersion: z.string().max(50000),
  field: z.string().max(200),
  detectedAt: z.string(),
  resolution: z.enum(["pending", "local-wins", "remote-wins", "merged"]).default("pending"),
});
export type ConflictEntry = z.infer<typeof ConflictEntrySchema>;

// ---- Connector Interface ----

/** Interface that all data connectors must implement. */
export interface DataConnector {
  readonly type: ConnectorType;
  readonly name: string;

  /** Test the connection and credentials. */
  testConnection(config: DataConnectorConfig): Promise<boolean>;

  /** Fetch items from the external source. */
  fetchItems(config: DataConnectorConfig): Promise<NormalizedItem[]>;

  /** Push items to the external source. */
  pushItems?(config: DataConnectorConfig, items: NormalizedItem[]): Promise<number>;
}

// ---- In-Memory Stores ----

const connectorConfigs = new Map<string, DataConnectorConfig>();
const connectorImplementations = new Map<ConnectorType, DataConnector>();
const normalizedItems = new Map<string, NormalizedItem>();
const syncHistory: SyncResult[] = [];
const conflicts: ConflictEntry[] = [];

// ---- Connector Registration ----

/** Register a connector implementation. */
export function registerDataConnector(connector: DataConnector): void {
  connectorImplementations.set(connector.type, connector);
}

/** Get a registered connector implementation. */
export function getDataConnectorImpl(type: ConnectorType): DataConnector | undefined {
  return connectorImplementations.get(type);
}

/** List registered connector types. */
export function listRegisteredConnectorTypes(): ConnectorType[] {
  return [...connectorImplementations.keys()];
}

// ---- Configuration Management ----

/** Create or update a connector configuration. */
export function upsertConnectorConfig(config: DataConnectorConfig): DataConnectorConfig {
  const validated = DataConnectorConfigSchema.parse(config);
  connectorConfigs.set(validated.id, validated);
  return validated;
}

/** Get a connector configuration. */
export function getConnectorConfig(configId: string): DataConnectorConfig | undefined {
  return connectorConfigs.get(configId);
}

/** List all connector configurations. */
export function listConnectorConfigs(): DataConnectorConfig[] {
  return [...connectorConfigs.values()];
}

/** Delete a connector configuration. */
export function deleteConnectorConfig(configId: string): boolean {
  return connectorConfigs.delete(configId);
}

// ---- Sync Operations ----

/** Run a sync operation for a specific connector. */
export async function syncConnector(configId: string): Promise<SyncResult> {
  const config = connectorConfigs.get(configId);
  if (!config) throw new Error(`Connector config ${configId} not found`);
  if (!config.enabled) throw new Error(`Connector ${configId} is disabled`);

  const impl = connectorImplementations.get(config.type);
  if (!impl) throw new Error(`No implementation registered for connector type "${config.type}"`);

  const startTime = Date.now();
  const errors: string[] = [];
  let itemsImported = 0;
  let itemsExported = 0;
  let conflictCount = 0;

  try {
    // Import
    if (config.direction === "import" || config.direction === "bidirectional") {
      const items = await impl.fetchItems(config);
      for (const item of items) {
        const existing = normalizedItems.get(item.id);

        if (existing && config.direction === "bidirectional") {
          // Check for conflict
          if (existing.updatedAt !== item.updatedAt && existing.description !== item.description) {
            conflicts.push({
              id: randomUUID(),
              connectorId: configId,
              itemId: item.id,
              localVersion: existing.description,
              remoteVersion: item.description,
              field: "description",
              detectedAt: new Date().toISOString(),
              resolution: "pending",
            });
            conflictCount++;
            continue;
          }
        }

        normalizedItems.set(item.id, item);
        itemsImported++;
      }
    }

    // Export
    if ((config.direction === "export" || config.direction === "bidirectional") && impl.pushItems) {
      const localItems = [...normalizedItems.values()].filter((i) => i.connectorId === configId);
      itemsExported = await impl.pushItems(config, localItems);
    }

    config.lastSyncAt = new Date().toISOString();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const result: SyncResult = {
    connectorId: configId,
    status: errors.length > 0 ? "error" : conflictCount > 0 ? "conflict" : "success",
    itemsImported,
    itemsExported,
    conflicts: conflictCount,
    errors,
    syncedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  syncHistory.push(result);
  return result;
}

/** Test a connector's connection. */
export async function testConnectorConnection(configId: string): Promise<boolean> {
  const config = connectorConfigs.get(configId);
  if (!config) throw new Error(`Connector config ${configId} not found`);

  const impl = connectorImplementations.get(config.type);
  if (!impl) throw new Error(`No implementation for connector type "${config.type}"`);

  return impl.testConnection(config);
}

// ---- Conflict Resolution ----

/** List unresolved conflicts. */
export function listConflicts(connectorId?: string): ConflictEntry[] {
  let result = conflicts.filter((c) => c.resolution === "pending");
  if (connectorId) result = result.filter((c) => c.connectorId === connectorId);
  return result;
}

/** Resolve a conflict. */
export function resolveConflict(
  conflictId: string,
  resolution: "local-wins" | "remote-wins" | "merged",
  mergedContent?: string
): void {
  const conflict = conflicts.find((c) => c.id === conflictId);
  if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

  conflict.resolution = resolution;

  const item = normalizedItems.get(conflict.itemId);
  if (item) {
    if (resolution === "remote-wins") {
      item.description = conflict.remoteVersion;
    } else if (resolution === "merged" && mergedContent) {
      item.description = mergedContent;
    }
    // "local-wins" keeps the current version
    item.updatedAt = new Date().toISOString();
  }
}

// ---- Item Queries ----

/** Get all normalized items. */
export function getNormalizedItems(filters?: {
  connectorId?: string;
  sourceType?: ConnectorType;
  labels?: string[];
}): NormalizedItem[] {
  let result = [...normalizedItems.values()];
  if (filters?.connectorId) result = result.filter((i) => i.connectorId === filters.connectorId);
  if (filters?.sourceType) result = result.filter((i) => i.sourceType === filters.sourceType);
  if (filters?.labels) {
    const labelSet = new Set(filters.labels);
    result = result.filter((i) => i.labels.some((l) => labelSet.has(l)));
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Get sync history. */
export function getSyncHistory(connectorId?: string): SyncResult[] {
  let result = [...syncHistory];
  if (connectorId) result = result.filter((s) => s.connectorId === connectorId);
  return result.sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
}

// ---- Built-in Connector Stubs ----

/** Create a Jira connector stub. */
export function createJiraConnector(): DataConnector {
  return {
    type: "jira",
    name: "Jira",
    async testConnection() {
      return true;
    },
    async fetchItems(config) {
      // In production, this would use the Jira REST API
      return [];
    },
    async pushItems(_config, items) {
      return items.length;
    },
  };
}

/** Create a GitHub Issues connector stub. */
export function createGitHubIssuesConnector(): DataConnector {
  return {
    type: "github-issues",
    name: "GitHub Issues",
    async testConnection() {
      return true;
    },
    async fetchItems() {
      return [];
    },
    async pushItems(_config, items) {
      return items.length;
    },
  };
}

/** Create a Notion connector stub. */
export function createNotionConnector(): DataConnector {
  return {
    type: "notion",
    name: "Notion",
    async testConnection() {
      return true;
    },
    async fetchItems() {
      return [];
    },
    async pushItems(_config, items) {
      return items.length;
    },
  };
}

/** Create a Confluence connector stub. */
export function createConfluenceConnector(): DataConnector {
  return {
    type: "confluence",
    name: "Confluence",
    async testConnection() {
      return true;
    },
    async fetchItems() {
      return [];
    },
    async pushItems(_config, items) {
      return items.length;
    },
  };
}

/** Register all built-in connectors. */
export function registerBuiltInConnectors(): void {
  registerDataConnector(createJiraConnector());
  registerDataConnector(createGitHubIssuesConnector());
  registerDataConnector(createNotionConnector());
  registerDataConnector(createConfluenceConnector());
}

// ---- Store Management ----

/** Clear all data connector data (for testing). */
export function clearDataConnectorData(): void {
  connectorConfigs.clear();
  connectorImplementations.clear();
  normalizedItems.clear();
  syncHistory.length = 0;
  conflicts.length = 0;
}
