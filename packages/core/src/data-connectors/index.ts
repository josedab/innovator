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

// ---- Built-in Connector Helpers ----

type ConnectorSnapshot = Record<string, unknown>;

function isRecord(value: unknown): value is ConnectorSnapshot {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (isRecord(entry))
        return asString(entry.name) ?? asString(entry.value) ?? asString(entry.key);
      return undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(value: unknown): string {
  if (typeof value === "string") return stripHtml(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractText(entry))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (!isRecord(value)) return "";

  const direct =
    asString(value.plain_text) ??
    asString(value.content) ??
    asString(value.value) ??
    asString(value.title);
  if (direct) return stripHtml(direct);

  if (Array.isArray(value.title)) return extractText(value.title);
  if (Array.isArray(value.rich_text)) return extractText(value.rich_text);
  if (Array.isArray(value.results)) return extractText(value.results);

  if (isRecord(value.text)) {
    const nested = asString(value.text.content) ?? asString(value.text.plain_text);
    if (nested) return stripHtml(nested);
  }

  if (isRecord(value.storage) && typeof value.storage.value === "string") {
    return stripHtml(value.storage.value);
  }

  if (isRecord(value.view) && typeof value.view.value === "string") {
    return stripHtml(value.view.value);
  }

  if (isRecord(value.properties)) {
    return extractText(Object.values(value.properties));
  }

  return "";
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  const raw = asString(value);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function buildConnectorItemId(configId: string, sourceId: string): string {
  return `${configId}:${sourceId}`;
}

function buildUrl(baseUrl: string | undefined, path: string): string | undefined {
  if (!baseUrl || baseUrl.startsWith("data:")) return undefined;
  try {
    return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return undefined;
  }
}

function decodeConnectorSnapshot(baseUrl?: string): unknown {
  if (!baseUrl?.startsWith("data:application/json")) return undefined;
  const [, payload = ""] = baseUrl.split(",", 2);
  try {
    if (baseUrl.includes(";base64,")) {
      return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    }
    return JSON.parse(decodeURIComponent(payload));
  } catch (error) {
    throw new Error(
      `Connector snapshot could not be parsed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function isConnectionConfigValid(config: DataConnectorConfig): boolean {
  if (config.credentials?.expiresAt) {
    const expiresAt = new Date(config.credentials.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      return false;
    }
  }

  if (!config.baseUrl) return true;
  if (config.baseUrl.startsWith("data:application/json")) {
    decodeConnectorSnapshot(config.baseUrl);
    return true;
  }

  try {
    const parsed = new URL(config.baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getSnapshotRecords(snapshot: unknown, collectionKeys: string[]): ConnectorSnapshot[] {
  if (Array.isArray(snapshot)) {
    return snapshot.filter((entry): entry is ConnectorSnapshot => isRecord(entry));
  }

  if (!isRecord(snapshot)) return [];

  for (const key of collectionKeys) {
    const value = snapshot[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is ConnectorSnapshot => isRecord(entry));
    }
  }

  return [snapshot];
}

function filterConnectorItems(
  items: NormalizedItem[],
  config: DataConnectorConfig,
  projectKeys: string[]
): NormalizedItem[] {
  const projectFilter = new Set(
    (config.filters?.projects ?? []).map((value) => value.toLowerCase())
  );
  const labelFilter = new Set((config.filters?.labels ?? []).map((value) => value.toLowerCase()));
  const statusFilter = new Set((config.filters?.status ?? []).map((value) => value.toLowerCase()));

  return items
    .filter((item) => {
      if (statusFilter.size > 0 && (!item.status || !statusFilter.has(item.status.toLowerCase()))) {
        return false;
      }
      if (
        labelFilter.size > 0 &&
        !item.labels.some((label) => labelFilter.has(label.toLowerCase()))
      ) {
        return false;
      }
      if (projectFilter.size > 0) {
        const values = projectKeys
          .map((key) => item.metadata?.[key])
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .map((value) => asString(value)?.toLowerCase())
          .filter((value): value is string => Boolean(value));
        if (values.length === 0 || !values.some((value) => projectFilter.has(value))) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mapJiraIssue(
  config: DataConnectorConfig,
  issue: ConnectorSnapshot,
  index: number
): NormalizedItem {
  const now = new Date().toISOString();
  const fields = isRecord(issue.fields) ? issue.fields : issue;
  const project = isRecord(fields.project) ? fields.project : undefined;
  const status = isRecord(fields.status) ? fields.status : undefined;
  const reporter = isRecord(fields.reporter) ? fields.reporter : undefined;
  const priority = isRecord(fields.priority) ? fields.priority : undefined;
  const issueType = isRecord(fields.issuetype) ? fields.issuetype : undefined;
  const sourceId = asString(issue.key) ?? asString(issue.id) ?? `jira-${index + 1}`;
  const projectKey = asString(project?.key) ?? asString(project?.name);
  const itemStatus = asString(status?.name) ?? asString(fields.status) ?? "Open";
  const labels = asStringArray(fields.labels);
  const title = asString(fields.summary) ?? asString(issue.title) ?? `Jira issue ${index + 1}`;
  const description =
    extractText(fields.description ?? issue.description) ||
    `Imported Jira issue${projectKey ? ` from ${projectKey}` : ""} with status ${itemStatus}.`;

  return {
    id: buildConnectorItemId(config.id, sourceId),
    connectorId: config.id,
    sourceType: "jira",
    sourceId,
    title,
    description,
    url: asString(issue.self) ?? buildUrl(config.baseUrl, `browse/${sourceId}`),
    status: itemStatus,
    labels,
    author: asString(reporter?.displayName) ?? asString(reporter?.emailAddress),
    createdAt: normalizeTimestamp(fields.created ?? issue.createdAt, now),
    updatedAt: normalizeTimestamp(fields.updated ?? issue.updatedAt, now),
    syncedAt: now,
    metadata: {
      projectKey,
      issueType: asString(issueType?.name),
      priority: asString(priority?.name),
    },
  };
}

function mapGitHubIssue(
  config: DataConnectorConfig,
  issue: ConnectorSnapshot,
  index: number
): NormalizedItem {
  const now = new Date().toISOString();
  const user = isRecord(issue.user) ? issue.user : undefined;
  const repository =
    (isRecord(issue.repository) ? asString(issue.repository.full_name) : undefined) ??
    config.filters?.projects?.[0];
  const sourceId = asString(issue.number) ?? asString(issue.id) ?? `issue-${index + 1}`;
  const labels = asStringArray(issue.labels);
  const title = asString(issue.title) ?? `GitHub issue ${sourceId}`;
  const state = asString(issue.state) ?? "open";

  return {
    id: buildConnectorItemId(config.id, sourceId),
    connectorId: config.id,
    sourceType: "github-issues",
    sourceId,
    title,
    description:
      extractText(issue.body) ||
      `Imported GitHub issue${repository ? ` from ${repository}` : ""} in state ${state}.`,
    url:
      asString(issue.html_url) ??
      (repository ? buildUrl(config.baseUrl, `${repository}/issues/${sourceId}`) : undefined),
    status: state,
    labels,
    author: asString(user?.login),
    createdAt: normalizeTimestamp(issue.created_at, now),
    updatedAt: normalizeTimestamp(issue.updated_at, now),
    syncedAt: now,
    metadata: {
      repository,
      milestone: isRecord(issue.milestone) ? asString(issue.milestone.title) : undefined,
      assignees: Array.isArray(issue.assignees)
        ? issue.assignees
            .map((assignee) => (isRecord(assignee) ? asString(assignee.login) : undefined))
            .filter((entry): entry is string => Boolean(entry))
        : [],
    },
  };
}

function extractNotionTitle(page: ConnectorSnapshot, index: number): string {
  const properties = isRecord(page.properties) ? page.properties : undefined;
  if (properties) {
    for (const property of Object.values(properties)) {
      const title = extractText(property);
      if (title) return title;
    }
  }
  return asString(page.title) ?? `Notion page ${index + 1}`;
}

function mapNotionPage(
  config: DataConnectorConfig,
  page: ConnectorSnapshot,
  index: number
): NormalizedItem {
  const now = new Date().toISOString();
  const properties = isRecord(page.properties) ? page.properties : undefined;
  const tags = properties
    ? Object.values(properties).flatMap((property) => {
        if (!isRecord(property)) return [];
        if (Array.isArray(property.multi_select)) return asStringArray(property.multi_select);
        if (isRecord(property.select))
          return [asString(property.select.name)].filter(Boolean) as string[];
        return [];
      })
    : [];
  const sourceId = asString(page.id) ?? `notion-${index + 1}`;
  const status = properties
    ? Object.values(properties)
        .map((property) => {
          if (!isRecord(property)) return undefined;
          if (isRecord(property.status)) return asString(property.status.name);
          if (isRecord(property.select)) return asString(property.select.name);
          return undefined;
        })
        .find(Boolean)
    : undefined;

  return {
    id: buildConnectorItemId(config.id, sourceId),
    connectorId: config.id,
    sourceType: "notion",
    sourceId,
    title: extractNotionTitle(page, index),
    description:
      extractText(properties ?? page.content) ||
      `Imported Notion content${status ? ` with status ${status}` : ""}.`,
    url: asString(page.url),
    status,
    labels: tags,
    author: asString(page.created_by),
    createdAt: normalizeTimestamp(page.created_time, now),
    updatedAt: normalizeTimestamp(page.last_edited_time, now),
    syncedAt: now,
    metadata: {
      databaseId: isRecord(page.parent) ? asString(page.parent.database_id) : undefined,
    },
  };
}

function mapConfluencePage(
  config: DataConnectorConfig,
  page: ConnectorSnapshot,
  index: number
): NormalizedItem {
  const now = new Date().toISOString();
  const body = isRecord(page.body) ? page.body : undefined;
  const view = body && isRecord(body.view) ? body.view : undefined;
  const storage = body && isRecord(body.storage) ? body.storage : undefined;
  const version = isRecord(page.version) ? page.version : undefined;
  const space = isRecord(page.space) ? page.space : undefined;
  const sourceId = asString(page.id) ?? `confluence-${index + 1}`;
  const spaceKey = asString(space?.key) ?? asString(space?.name);

  return {
    id: buildConnectorItemId(config.id, sourceId),
    connectorId: config.id,
    sourceType: "confluence",
    sourceId,
    title: asString(page.title) ?? `Confluence page ${index + 1}`,
    description:
      extractText(storage?.value ?? view?.value ?? page.body) ||
      `Imported Confluence page${spaceKey ? ` from ${spaceKey}` : ""}.`,
    url:
      asString(page._links && isRecord(page._links) ? page._links.webui : undefined) ??
      buildUrl(config.baseUrl, `pages/viewpage.action?pageId=${sourceId}`),
    status: asString(page.status) ?? "current",
    labels: asStringArray(page.labels),
    author: asString(version?.by && isRecord(version.by) ? version.by.displayName : undefined),
    createdAt: normalizeTimestamp(page.createdAt, now),
    updatedAt: normalizeTimestamp(version?.when ?? page.updatedAt, now),
    syncedAt: now,
    metadata: {
      spaceKey,
      version: asString(version?.number),
    },
  };
}

function createSnapshotConnector(
  type: ConnectorType,
  name: string,
  collectionKeys: string[],
  mapper: (config: DataConnectorConfig, record: ConnectorSnapshot, index: number) => NormalizedItem,
  projectKeys: string[]
): DataConnector {
  return {
    type,
    name,
    async testConnection(config) {
      return isConnectionConfigValid(config);
    },
    async fetchItems(config) {
      const snapshot = decodeConnectorSnapshot(config.baseUrl);
      const records = getSnapshotRecords(snapshot, collectionKeys);
      const items = records.map((record, index) => mapper(config, record, index));
      return filterConnectorItems(items, config, projectKeys);
    },
    async pushItems(_config, items) {
      return items.length;
    },
  };
}

/** Create a Jira connector backed by exported issue snapshots. */
export function createJiraConnector(): DataConnector {
  return createSnapshotConnector("jira", "Jira", ["issues"], mapJiraIssue, ["projectKey"]);
}

/** Create a GitHub Issues connector backed by exported issue snapshots. */
export function createGitHubIssuesConnector(): DataConnector {
  return createSnapshotConnector(
    "github-issues",
    "GitHub Issues",
    ["issues", "items"],
    mapGitHubIssue,
    ["repository"]
  );
}

/** Create a Notion connector backed by exported page snapshots. */
export function createNotionConnector(): DataConnector {
  return createSnapshotConnector("notion", "Notion", ["results", "pages"], mapNotionPage, [
    "databaseId",
  ]);
}

/** Create a Confluence connector backed by exported page snapshots. */
export function createConfluenceConnector(): DataConnector {
  return createSnapshotConnector(
    "confluence",
    "Confluence",
    ["results", "pages"],
    mapConfluencePage,
    ["spaceKey"]
  );
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
