/**
 * @module storage/drivers/postgresql
 *
 * PostgreSQL/Supabase DatabaseDriver implementation.
 * Uses the pg module (or Supabase client) for database operations.
 * Supports full CRUD, transactions, and migrations.
 *
 * Note: pg is an optional dependency — this driver uses dynamic imports
 * so it only loads when explicitly instantiated.
 */

import { randomUUID } from "node:crypto";
import type {
  DatabaseDriver,
  InsertOptions,
  QueryOptions,
  QueryCondition,
  UpdateOptions,
  DeleteOptions,
  Migration,
  MigrationStatus,
} from "./types.js";

export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionString?: string;
}

/** Validate a SQL identifier (table/column name) to prevent injection. */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertSafeIdentifier(name: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(name) || name.length > 128) {
    throw new Error(`Invalid ${label}: "${name}". Identifiers must be alphanumeric/underscore and ≤128 chars.`);
  }
}

export class PostgreSQLDriver implements DatabaseDriver {
  readonly name = "postgresql";
  readonly type = "postgresql" as const;
  private config: PostgreSQLConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any = null;
  private connected = false;

  constructor(config: PostgreSQLConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pg: any = await Function('return import("pg")')();
      const Pool = pg.Pool ?? pg.default?.Pool;

      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionString: this.config.connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
      });

      // Verify connection
      const client = await this.pool.connect();
      client.release();
      this.connected = true;
    } catch (error) {
      throw new Error(
        `PostgreSQL connection failed: ${error instanceof Error ? error.message : "Unknown error"}. ` +
          "Install pg: npm install pg"
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private buildWhere(conditions: QueryCondition[]): { clause: string; params: unknown[] } {
    if (conditions.length === 0) return { clause: "", params: [] };

    const parts: string[] = [];
    const params: unknown[] = [];

    for (const cond of conditions) {
      assertSafeIdentifier(cond.field, "field name");
      const idx = params.length + 1;
      switch (cond.operator) {
        case "eq":
          parts.push(`"${cond.field}" = $${idx}`);
          params.push(cond.value);
          break;
        case "neq":
          parts.push(`"${cond.field}" != $${idx}`);
          params.push(cond.value);
          break;
        case "gt":
          parts.push(`"${cond.field}" > $${idx}`);
          params.push(cond.value);
          break;
        case "gte":
          parts.push(`"${cond.field}" >= $${idx}`);
          params.push(cond.value);
          break;
        case "lt":
          parts.push(`"${cond.field}" < $${idx}`);
          params.push(cond.value);
          break;
        case "lte":
          parts.push(`"${cond.field}" <= $${idx}`);
          params.push(cond.value);
          break;
        case "like":
          parts.push(`"${cond.field}" ILIKE $${idx}`);
          params.push(`%${cond.value}%`);
          break;
        case "in":
          parts.push(`"${cond.field}" = ANY($${idx})`);
          params.push(cond.value);
          break;
        case "not-in":
          parts.push(`"${cond.field}" != ALL($${idx})`);
          params.push(cond.value);
          break;
        case "is-null":
          parts.push(`"${cond.field}" IS NULL`);
          break;
        case "is-not-null":
          parts.push(`"${cond.field}" IS NOT NULL`);
          break;
      }
    }

    return { clause: ` WHERE ${parts.join(" AND ")}`, params };
  }

  async insert(options: InsertOptions): Promise<string> {
    assertSafeIdentifier(options.table, "table name");
    const id = (options.data.id as string) ?? randomUUID();
    const data = { ...options.data, id };
    const fields = Object.keys(data);
    for (const f of fields) assertSafeIdentifier(f, "field name");
    const values = Object.values(data).map((v) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : v
    );
    const placeholders = fields.map((_, i) => `$${i + 1}`);

    const sql = `INSERT INTO "${options.table}" (${fields.map((f) => `"${f}"`).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id`;
    const result = await this.pool.query(sql, values);
    return result.rows[0]?.id ?? id;
  }

  async query<T = Record<string, unknown>>(options: QueryOptions): Promise<T[]> {
    assertSafeIdentifier(options.table, "table name");
    if (options.select) {
      for (const f of options.select) assertSafeIdentifier(f, "select field");
    }
    const select = options.select?.map((f) => `"${f}"`).join(", ") ?? "*";
    let sql = `SELECT ${select} FROM "${options.table}"`;
    const { clause, params } = this.buildWhere(options.conditions ?? []);
    sql += clause;

    if (options.orderBy?.length) {
      for (const o of options.orderBy) assertSafeIdentifier(o.field, "orderBy field");
      const orders = options.orderBy.map((o) => `"${o.field}" ${o.direction.toUpperCase()}`);
      sql += ` ORDER BY ${orders.join(", ")}`;
    }

    if (options.limit) sql += ` LIMIT ${Number(options.limit)}`;
    if (options.offset) sql += ` OFFSET ${Number(options.offset)}`;

    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(options: QueryOptions): Promise<T | undefined> {
    const results = await this.query<T>({ ...options, limit: 1 });
    return results[0];
  }

  async update(options: UpdateOptions): Promise<number> {
    assertSafeIdentifier(options.table, "table name");
    const { clause, params: whereParams } = this.buildWhere(options.conditions);
    const fields = Object.keys(options.data);
    for (const f of fields) assertSafeIdentifier(f, "update field");
    const values = Object.values(options.data).map((v) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : v
    );

    const sets = fields.map((f, i) => `"${f}" = $${whereParams.length + i + 1}`);
    const sql = `UPDATE "${options.table}" SET ${sets.join(", ")}${clause}`;

    const result = await this.pool.query(sql, [...whereParams, ...values]);
    return result.rowCount ?? 0;
  }

  async delete(options: DeleteOptions): Promise<number> {
    assertSafeIdentifier(options.table, "table name");
    const { clause, params } = this.buildWhere(options.conditions);
    const sql = `DELETE FROM "${options.table}"${clause}`;
    const result = await this.pool.query(sql, params);
    return result.rowCount ?? 0;
  }

  async beginTransaction(): Promise<void> {
    await this.pool.query("BEGIN");
  }

  async commitTransaction(): Promise<void> {
    await this.pool.query("COMMIT");
  }

  async rollbackTransaction(): Promise<void> {
    await this.pool.query("ROLLBACK");
  }

  async rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async rawExec(sql: string, params?: unknown[]): Promise<void> {
    await this.pool.query(sql, params);
  }

  async getMigrationStatus(): Promise<MigrationStatus> {
    // Ensure migrations table exists
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS _innovator_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const applied = await this.pool.query(
      "SELECT version, name, applied_at FROM _innovator_migrations ORDER BY version"
    );

    const currentVersion =
      applied.rows.length > 0
        ? Math.max(...applied.rows.map((r: { version: number }) => r.version))
        : 0;

    return {
      currentVersion,
      pendingMigrations: [],
      appliedMigrations: applied.rows.map(
        (r: { version: number; name: string; applied_at: string }) => ({
          version: r.version,
          name: r.name,
          appliedAt: r.applied_at,
        })
      ),
    };
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    const status = await this.getMigrationStatus();

    const pending = migrations
      .filter((m) => m.version > status.currentVersion)
      .sort((a, b) => a.version - b.version);

    for (const migration of pending) {
      try {
        await this.pool.query("BEGIN");
        await this.pool.query(migration.up);
        await this.pool.query("INSERT INTO _innovator_migrations (version, name) VALUES ($1, $2)", [
          migration.version,
          migration.name,
        ]);
        await this.pool.query("COMMIT");
      } catch (error) {
        await this.pool.query("ROLLBACK");
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  async rollbackMigration(version: number): Promise<void> {
    // This would need the migration's down SQL — left as a placeholder
    await this.pool.query("DELETE FROM _innovator_migrations WHERE version = $1", [version]);
  }
}
