/**
 * @module storage/types
 *
 * Storage provider interface and related types.
 * All persistent modules (history, workspaces, api-gateway, collaboration,
 * analytics, knowledge-graph) delegate to a StorageProvider so backends
 * can be swapped without touching business logic.
 */

import type {
  SessionRecord,
  HistoryQuery,
  CollaborativeSession,
  CollaborativeEvent,
} from "../types.js";
import type { Workspace, ActivityEvent, MemberRole } from "../workspaces/index.js";
import type { ApiKey, BillingTier, UsageRecord, UsageSummary } from "../api-gateway/index.js";
import type { AnalyticsEvent, AnalyticsEventType } from "../analytics/index.js";
import type { EntityNode, RelationshipEdge, KnowledgeGraph } from "../knowledge-graph/index.js";

// ---- Session / History ----

export interface SessionStorage {
  saveSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  updateSession(id: string, updates: { tags?: string[]; notes?: string }): Promise<boolean>;
  deleteSession(id: string): Promise<boolean>;
  listSessions(): Promise<SessionRecord[]>;
  querySessions(query: HistoryQuery): Promise<SessionRecord[]>;
}

// ---- Workspace ----

export interface WorkspaceStorage {
  saveWorkspace(workspace: Workspace): Promise<void>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  deleteWorkspace(id: string): Promise<boolean>;
  listWorkspaces(): Promise<Workspace[]>;
}

// ---- API Gateway ----

export interface ApiGatewayStorage {
  saveApiKey(apiKey: ApiKey): Promise<void>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  findApiKeyByValue(keyValue: string): Promise<ApiKey | undefined>;
  listApiKeys(): Promise<ApiKey[]>;
  deleteApiKey(id: string): Promise<boolean>;
  updateApiKey(id: string, updates: Partial<ApiKey>): Promise<boolean>;
  recordUsage(record: UsageRecord): Promise<void>;
  getUsageRecords(keyId: string, since?: string): Promise<UsageRecord[]>;
  saveWebhook(keyId: string, url: string): Promise<void>;
  getWebhooks(keyId: string): Promise<string[]>;
  removeWebhook(keyId: string, url: string): Promise<boolean>;
}

// ---- Collaboration ----

export interface CollaborationStorage {
  saveSession(session: CollaborativeSession): Promise<void>;
  getSession(id: string): Promise<CollaborativeSession | undefined>;
  findByCode(roomCode: string): Promise<CollaborativeSession | undefined>;
  deleteSession(id: string): Promise<boolean>;
}

// ---- Analytics ----

export interface AnalyticsStorage {
  trackEvent(event: AnalyticsEvent): Promise<void>;
  readEvents(limit?: number): Promise<AnalyticsEvent[]>;
  clearEvents(): Promise<void>;
}

// ---- Knowledge Graph ----

export interface KnowledgeGraphStorage {
  saveGraph(graph: KnowledgeGraph): Promise<void>;
  loadGraph(): Promise<KnowledgeGraph | undefined>;
}

// ---- Unified StorageProvider ----

export interface StorageProvider {
  readonly name: string;
  sessions: SessionStorage;
  workspaces: WorkspaceStorage;
  apiGateway: ApiGatewayStorage;
  collaboration: CollaborationStorage;
  analytics: AnalyticsStorage;
  knowledgeGraph: KnowledgeGraphStorage;

  /** Run any necessary migrations / table creation. */
  initialize(): Promise<void>;

  /** Gracefully close connections. */
  close(): Promise<void>;
}
