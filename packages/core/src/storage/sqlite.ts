/**
 * @module storage/sqlite
 *
 * SQLite-backed StorageProvider using better-sqlite3 (Node) or
 * @libsql/client (Turso / Edge Runtime).
 *
 * This module uses dynamic imports so it only pulls in the SQLite
 * dependency when actually instantiated.
 */

import type {
  StorageProvider,
  SessionStorage,
  WorkspaceStorage,
  ApiGatewayStorage,
  CollaborationStorage,
  AnalyticsStorage,
  KnowledgeGraphStorage,
} from "./types.js";
import type { SessionRecord, HistoryQuery, CollaborativeSession } from "../types.js";
import type { Workspace } from "../workspaces/index.js";
import type { ApiKey, UsageRecord } from "../api-gateway/index.js";
import type { AnalyticsEvent } from "../analytics/index.js";
import type { KnowledgeGraph } from "../knowledge-graph/index.js";
import { ConfigurationError } from "../errors.js";

// ---- Generic DB interface to abstract better-sqlite3 vs libsql ----

export interface SQLiteDB {
  exec(sql: string): void;
  run(sql: string, ...params: unknown[]): void;
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  close(): void;
}

// ---- Adapter for better-sqlite3 ----

export function createBetterSqliteDB(filepath: string): SQLiteDB {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(filepath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return {
    exec(sql: string) {
      db.exec(sql);
    },
    run(sql: string, ...params: unknown[]) {
      db.prepare(sql).run(...params);
    },
    get<T>(sql: string, ...params: unknown[]): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, ...params: unknown[]): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    close() {
      db.close();
    },
  };
}

// ---- Adapter for @libsql/client (Turso / Edge) ----

export interface TursoConfig {
  url: string;
  authToken?: string;
}

export async function createTursoDB(config: TursoConfig): Promise<SQLiteDB> {
  // @libsql/client is an optional peer dependency — dynamic require to avoid hard TS dependency
  let createClient: (config: { url: string; authToken?: string }) => LibsqlClient;

  /** Minimal interface for @libsql/client instance. */
  interface LibsqlClient {
    executeMultiple(sql: string): Promise<void>;
    execute(query: {
      sql: string;
      args: Array<string | number | null>;
    }): Promise<{ rows: unknown[] }>;
    close(): void;
  }

  try {
    const mod = (await Function('return import("@libsql/client")')()) as {
      createClient: typeof createClient;
    };
    createClient = mod.createClient;
  } catch {
    throw new ConfigurationError(
      "Turso adapter requires @libsql/client. Install it with: npm install @libsql/client"
    );
  }
  const client = createClient({ url: config.url, authToken: config.authToken });

  return {
    exec(sql: string) {
      // Fire-and-forget for DDL
      client.executeMultiple(sql);
    },
    run(sql: string, ...params: unknown[]) {
      client.execute({ sql, args: params as Array<string | number | null> });
    },
    get<T>(_sql: string, ..._params: unknown[]): T | undefined {
      // Sync shim — callers should use the async wrappers in SQLiteStorage
      throw new ConfigurationError("Use async methods with Turso adapter");
    },
    all<T>(_sql: string, ..._params: unknown[]): T[] {
      throw new ConfigurationError("Use async methods with Turso adapter");
    },
    close() {
      client.close();
    },
  };
}

// ---- Schema DDL ----

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL  -- JSON blob of full SessionRecord
);

CREATE TABLE IF NOT EXISTS session_tags (
  session_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL  -- JSON blob
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_value TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL  -- JSON blob
);

CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  tokens_used INTEGER,
  status_code INTEGER NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS webhooks (
  key_id TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (key_id, url)
);

CREATE TABLE IF NOT EXISTS collaborative_sessions (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  data TEXT NOT NULL  -- JSON blob
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  data TEXT  -- JSON blob
);

CREATE TABLE IF NOT EXISTS knowledge_graph (
  id TEXT PRIMARY KEY DEFAULT 'main',
  data TEXT NOT NULL  -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(subject);
CREATE INDEX IF NOT EXISTS idx_usage_key_ts ON usage_records(key_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(type);
CREATE INDEX IF NOT EXISTS idx_collab_code ON collaborative_sessions(room_code);
`;

// ---- SQLite Session Storage ----

class SQLiteSessionStorage implements SessionStorage {
  constructor(private db: SQLiteDB) {}

  async saveSession(session: SessionRecord): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO sessions (id, subject, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?)`,
      session.id,
      session.subject,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session)
    );
    // Insert tags
    this.db.run(`DELETE FROM session_tags WHERE session_id = ?`, session.id);
    for (const tag of session.tags ?? []) {
      this.db.run(`INSERT INTO session_tags (session_id, tag) VALUES (?, ?)`, session.id, tag);
    }
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = this.db.get<{ data: string }>(`SELECT data FROM sessions WHERE id = ?`, id);
    return row ? (JSON.parse(row.data) as SessionRecord) : undefined;
  }

  async updateSession(id: string, updates: { tags?: string[]; notes?: string }): Promise<boolean> {
    const session = await this.getSession(id);
    if (!session) return false;
    if (updates.tags !== undefined) session.tags = updates.tags;
    if (updates.notes !== undefined) session.notes = updates.notes;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    return true;
  }

  async deleteSession(id: string): Promise<boolean> {
    this.db.run(`DELETE FROM session_tags WHERE session_id = ?`, id);
    this.db.run(`DELETE FROM sessions WHERE id = ?`, id);
    return true;
  }

  async listSessions(): Promise<SessionRecord[]> {
    const rows = this.db.all<{ data: string }>(
      `SELECT data FROM sessions ORDER BY created_at DESC`
    );
    return rows.map((r) => JSON.parse(r.data) as SessionRecord);
  }

  async querySessions(query: HistoryQuery): Promise<SessionRecord[]> {
    let sessions = await this.listSessions();

    if (query.search) {
      const search = query.search.toLowerCase();
      sessions = sessions.filter(
        (s) =>
          s.subject.toLowerCase().includes(search) ||
          s.investigation?.summary?.toLowerCase().includes(search) ||
          s.notes?.toLowerCase().includes(search) ||
          s.angleResults.some((ar) =>
            ar.ideas.some(
              (idea) =>
                idea.title.toLowerCase().includes(search) ||
                idea.description.toLowerCase().includes(search)
            )
          )
      );
    }
    if (query.tags?.length) {
      sessions = sessions.filter((s) => query.tags!.every((tag) => s.tags.includes(tag)));
    }
    if (query.fromDate) {
      sessions = sessions.filter((s) => s.createdAt >= query.fromDate!);
    }
    if (query.toDate) {
      sessions = sessions.filter((s) => s.createdAt <= query.toDate!);
    }
    if (query.angleId) {
      sessions = sessions.filter((s) => s.angleResults.some((ar) => ar.angleId === query.angleId));
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return sessions.slice(offset, offset + limit);
  }
}

// ---- SQLite Workspace Storage ----

class SQLiteWorkspaceStorage implements WorkspaceStorage {
  constructor(private db: SQLiteDB) {}

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO workspaces (id, name, updated_at, data) VALUES (?, ?, ?, ?)`,
      workspace.id,
      workspace.name,
      workspace.updatedAt,
      JSON.stringify(workspace)
    );
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const row = this.db.get<{ data: string }>(`SELECT data FROM workspaces WHERE id = ?`, id);
    return row ? (JSON.parse(row.data) as Workspace) : undefined;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    this.db.run(`DELETE FROM workspaces WHERE id = ?`, id);
    return true;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = this.db.all<{ data: string }>(
      `SELECT data FROM workspaces ORDER BY updated_at DESC`
    );
    return rows.map((r) => JSON.parse(r.data) as Workspace);
  }
}

// ---- SQLite API Gateway Storage ----

class SQLiteApiGatewayStorage implements ApiGatewayStorage {
  constructor(private db: SQLiteDB) {}

  async saveApiKey(apiKey: ApiKey): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO api_keys (id, key_value, name, tier, enabled, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      apiKey.id,
      apiKey.key,
      apiKey.name,
      apiKey.tier,
      apiKey.enabled ? 1 : 0,
      apiKey.createdAt,
      JSON.stringify(apiKey)
    );
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const row = this.db.get<{ data: string }>(`SELECT data FROM api_keys WHERE id = ?`, id);
    return row ? (JSON.parse(row.data) as ApiKey) : undefined;
  }

  async findApiKeyByValue(keyValue: string): Promise<ApiKey | undefined> {
    const row = this.db.get<{ data: string }>(
      `SELECT data FROM api_keys WHERE key_value = ?`,
      keyValue
    );
    return row ? (JSON.parse(row.data) as ApiKey) : undefined;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const rows = this.db.all<{ data: string }>(`SELECT data FROM api_keys`);
    return rows.map((r) => JSON.parse(r.data) as ApiKey);
  }

  async deleteApiKey(id: string): Promise<boolean> {
    this.db.run(`DELETE FROM api_keys WHERE id = ?`, id);
    return true;
  }

  async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<boolean> {
    const key = await this.getApiKey(id);
    if (!key) return false;
    const updated = { ...key, ...updates };
    await this.saveApiKey(updated);
    return true;
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    this.db.run(
      `INSERT INTO usage_records (key_id, endpoint, timestamp, duration_ms, tokens_used, status_code, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      record.keyId,
      record.endpoint,
      record.timestamp,
      record.durationMs,
      record.tokensUsed ?? null,
      record.statusCode,
      record.error ?? null
    );
  }

  async getUsageRecords(keyId: string, since?: string): Promise<UsageRecord[]> {
    if (since) {
      return this.db
        .all<{
          key_id: string;
          endpoint: string;
          timestamp: string;
          duration_ms: number;
          tokens_used: number | null;
          status_code: number;
          error: string | null;
        }>(
          `SELECT key_id, endpoint, timestamp, duration_ms, tokens_used, status_code, error
           FROM usage_records WHERE key_id = ? AND timestamp >= ? ORDER BY timestamp DESC`,
          keyId,
          since
        )
        .map((r) => ({
          keyId: r.key_id,
          endpoint: r.endpoint,
          timestamp: r.timestamp,
          durationMs: r.duration_ms,
          tokensUsed: r.tokens_used ?? undefined,
          statusCode: r.status_code,
          error: r.error ?? undefined,
        }));
    }
    return this.db
      .all<{
        key_id: string;
        endpoint: string;
        timestamp: string;
        duration_ms: number;
        tokens_used: number | null;
        status_code: number;
        error: string | null;
      }>(
        `SELECT key_id, endpoint, timestamp, duration_ms, tokens_used, status_code, error
         FROM usage_records WHERE key_id = ? ORDER BY timestamp DESC`,
        keyId
      )
      .map((r) => ({
        keyId: r.key_id,
        endpoint: r.endpoint,
        timestamp: r.timestamp,
        durationMs: r.duration_ms,
        tokensUsed: r.tokens_used ?? undefined,
        statusCode: r.status_code,
        error: r.error ?? undefined,
      }));
  }

  async saveWebhook(keyId: string, url: string): Promise<void> {
    this.db.run(`INSERT OR IGNORE INTO webhooks (key_id, url) VALUES (?, ?)`, keyId, url);
  }

  async getWebhooks(keyId: string): Promise<string[]> {
    return this.db
      .all<{ url: string }>(`SELECT url FROM webhooks WHERE key_id = ?`, keyId)
      .map((r) => r.url);
  }

  async removeWebhook(keyId: string, url: string): Promise<boolean> {
    this.db.run(`DELETE FROM webhooks WHERE key_id = ? AND url = ?`, keyId, url);
    return true;
  }
}

// ---- SQLite Collaboration Storage ----

class SQLiteCollaborationStorage implements CollaborationStorage {
  constructor(private db: SQLiteDB) {}

  async saveSession(session: CollaborativeSession): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO collaborative_sessions (id, room_code, status, data)
       VALUES (?, ?, ?, ?)`,
      session.id,
      session.roomCode,
      session.status,
      JSON.stringify(session)
    );
  }

  async getSession(id: string): Promise<CollaborativeSession | undefined> {
    const row = this.db.get<{ data: string }>(
      `SELECT data FROM collaborative_sessions WHERE id = ?`,
      id
    );
    return row ? (JSON.parse(row.data) as CollaborativeSession) : undefined;
  }

  async findByCode(roomCode: string): Promise<CollaborativeSession | undefined> {
    const row = this.db.get<{ data: string }>(
      `SELECT data FROM collaborative_sessions WHERE room_code = ?`,
      roomCode
    );
    return row ? (JSON.parse(row.data) as CollaborativeSession) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    this.db.run(`DELETE FROM collaborative_sessions WHERE id = ?`, id);
    return true;
  }
}

// ---- SQLite Analytics Storage ----

class SQLiteAnalyticsStorage implements AnalyticsStorage {
  constructor(private db: SQLiteDB) {}

  async trackEvent(event: AnalyticsEvent): Promise<void> {
    this.db.run(
      `INSERT INTO analytics_events (id, type, timestamp, data) VALUES (?, ?, ?, ?)`,
      event.id,
      event.type,
      event.timestamp,
      event.data ? JSON.stringify(event.data) : null
    );
  }

  async readEvents(limit?: number): Promise<AnalyticsEvent[]> {
    const sql = limit
      ? `SELECT id, type, timestamp, data FROM analytics_events ORDER BY timestamp DESC LIMIT ?`
      : `SELECT id, type, timestamp, data FROM analytics_events ORDER BY timestamp DESC`;
    const params = limit ? [limit] : [];
    return this.db
      .all<{ id: string; type: string; timestamp: string; data: string | null }>(sql, ...params)
      .map((r) => ({
        id: r.id,
        type: r.type as AnalyticsEvent["type"],
        timestamp: r.timestamp,
        data: r.data ? JSON.parse(r.data) : undefined,
      }));
  }

  async clearEvents(): Promise<void> {
    this.db.run(`DELETE FROM analytics_events`);
  }
}

// ---- SQLite Knowledge Graph Storage ----

class SQLiteKnowledgeGraphStorage implements KnowledgeGraphStorage {
  constructor(private db: SQLiteDB) {}

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    this.db.run(
      `INSERT OR REPLACE INTO knowledge_graph (id, data) VALUES ('main', ?)`,
      JSON.stringify(graph)
    );
  }

  async loadGraph(): Promise<KnowledgeGraph | undefined> {
    const row = this.db.get<{ data: string }>(`SELECT data FROM knowledge_graph WHERE id = 'main'`);
    return row ? (JSON.parse(row.data) as KnowledgeGraph) : undefined;
  }
}

// ---- Provider ----

export class SQLiteStorageProvider implements StorageProvider {
  readonly name = "sqlite";
  readonly sessions: SessionStorage;
  readonly workspaces: WorkspaceStorage;
  readonly apiGateway: ApiGatewayStorage;
  readonly collaboration: CollaborationStorage;
  readonly analytics: AnalyticsStorage;
  readonly knowledgeGraph: KnowledgeGraphStorage;

  constructor(private db: SQLiteDB) {
    this.sessions = new SQLiteSessionStorage(db);
    this.workspaces = new SQLiteWorkspaceStorage(db);
    this.apiGateway = new SQLiteApiGatewayStorage(db);
    this.collaboration = new SQLiteCollaborationStorage(db);
    this.analytics = new SQLiteAnalyticsStorage(db);
    this.knowledgeGraph = new SQLiteKnowledgeGraphStorage(db);
  }

  async initialize(): Promise<void> {
    this.db.exec(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/**
 * Create and configure a SQLite storage provider from a file path.
 * Convenience helper that handles the common case.
 */
export async function createSQLiteStorage(filepath: string): Promise<StorageProvider> {
  const db = createBetterSqliteDB(filepath);
  const provider = new SQLiteStorageProvider(db);
  await provider.initialize();
  return provider;
}
