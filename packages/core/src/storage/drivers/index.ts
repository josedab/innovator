/**
 * @module storage/drivers
 *
 * Database driver abstraction layer.
 * Exports the DatabaseDriver interface and concrete driver implementations
 * for filesystem, SQLite, and PostgreSQL backends.
 */

export type {
  DatabaseDriver,
  QueryOperator,
  QueryCondition,
  QueryOptions,
  InsertOptions,
  UpdateOptions,
  DeleteOptions,
  Migration,
  MigrationStatus,
} from "./types.js";
export { QueryOperatorSchema } from "./types.js";

export { FilesystemDriver } from "./filesystem.js";
export { PostgreSQLDriver } from "./postgresql.js";
export type { PostgreSQLConfig } from "./postgresql.js";

// ---- Default Migrations ----

import type { Migration } from "./types.js";

/** Core schema migrations for Innovator. */
export const CORE_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "create-core-tables",
    up: `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        model TEXT,
        angles TEXT,
        investigation TEXT,
        results TEXT,
        synthesis TEXT,
        scores TEXT,
        tags TEXT DEFAULT '[]',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        members TEXT DEFAULT '[]',
        presets TEXT DEFAULT '[]',
        angles TEXT DEFAULT '[]',
        sessions TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_graph (
        id TEXT PRIMARY KEY DEFAULT 'default',
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS workspaces;
      DROP TABLE IF EXISTS analytics_events;
      DROP TABLE IF EXISTS knowledge_graph;
    `,
  },
  {
    version: 2,
    name: "create-api-gateway-tables",
    up: `
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT,
        key_value TEXT UNIQUE NOT NULL,
        tier TEXT DEFAULT 'free',
        rate_limit INTEGER DEFAULT 100,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        key_id TEXT NOT NULL,
        endpoint TEXT,
        tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        key_id TEXT NOT NULL,
        url TEXT NOT NULL,
        PRIMARY KEY (key_id, url)
      );
    `,
    down: `
      DROP TABLE IF EXISTS api_keys;
      DROP TABLE IF EXISTS usage_records;
      DROP TABLE IF EXISTS webhooks;
    `,
  },
  {
    version: 3,
    name: "create-collaboration-tables",
    up: `
      CREATE TABLE IF NOT EXISTS collaborative_sessions (
        id TEXT PRIMARY KEY,
        room_code TEXT UNIQUE,
        host TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS collaborative_sessions;
    `,
  },
  {
    version: 4,
    name: "create-decision-journal-tables",
    up: `
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        idea_title TEXT NOT NULL,
        idea_id TEXT,
        angle_id TEXT,
        session_id TEXT,
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        rationale TEXT NOT NULL,
        history TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        revisit_reminders TEXT DEFAULT '[]',
        outcome TEXT,
        decided_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS decisions;
    `,
  },
  {
    version: 5,
    name: "create-tournament-tables",
    up: `
      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        format TEXT NOT NULL,
        state TEXT DEFAULT 'setup',
        participants TEXT DEFAULT '[]',
        matches TEXT DEFAULT '[]',
        current_round INTEGER DEFAULT 0,
        total_rounds INTEGER DEFAULT 0,
        winner_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS tournaments;
    `,
  },
  {
    version: 6,
    name: "create-schedule-tables",
    up: `
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        cron_expression TEXT NOT NULL,
        timezone TEXT DEFAULT 'UTC',
        action TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        delivery TEXT DEFAULT '[]',
        max_runs INTEGER,
        run_count INTEGER DEFAULT 0,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schedule_runs (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        result_summary TEXT,
        error TEXT,
        duration_ms INTEGER
      );
    `,
    down: `
      DROP TABLE IF EXISTS schedules;
      DROP TABLE IF EXISTS schedule_runs;
    `,
  },
];
