/**
 * @module storage/drivers/types
 *
 * DatabaseDriver interface — a lower-level abstraction for database backends.
 * While StorageProvider is domain-specific (sessions, workspaces, etc.),
 * DatabaseDriver provides generic CRUD, query builder, and transaction support
 * for building StorageProviders on top of any database.
 */

import { z } from "zod";

// ---- Query Builder Types ----

export const QueryOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "in",
  "not-in",
  "is-null",
  "is-not-null",
]);
export type QueryOperator = z.infer<typeof QueryOperatorSchema>;

export interface QueryCondition {
  field: string;
  operator: QueryOperator;
  value: unknown;
}

export interface QueryOptions {
  table: string;
  conditions?: QueryCondition[];
  orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  limit?: number;
  offset?: number;
  select?: string[];
}

export interface InsertOptions {
  table: string;
  data: Record<string, unknown>;
}

export interface UpdateOptions {
  table: string;
  data: Record<string, unknown>;
  conditions: QueryCondition[];
}

export interface DeleteOptions {
  table: string;
  conditions: QueryCondition[];
}

// ---- Migration ----

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export interface MigrationStatus {
  currentVersion: number;
  pendingMigrations: Migration[];
  appliedMigrations: Array<{ version: number; name: string; appliedAt: string }>;
}

// ---- DatabaseDriver Interface ----

export interface DatabaseDriver {
  readonly name: string;
  readonly type: "filesystem" | "sqlite" | "postgresql" | "supabase";

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // CRUD
  insert(options: InsertOptions): Promise<string>;
  query<T = Record<string, unknown>>(options: QueryOptions): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(options: QueryOptions): Promise<T | undefined>;
  update(options: UpdateOptions): Promise<number>;
  delete(options: DeleteOptions): Promise<number>;

  // Transactions
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;

  // Raw queries (for complex operations)
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  rawExec(sql: string, params?: unknown[]): Promise<void>;

  // Migrations
  getMigrationStatus(): Promise<MigrationStatus>;
  runMigrations(migrations: Migration[]): Promise<void>;
  rollbackMigration(version: number): Promise<void>;
}
