/**
 * @module storage/drivers/filesystem
 *
 * Filesystem-based DatabaseDriver implementation.
 * Stores data as JSON files in ~/.innovator/ directories.
 * Suitable for single-user, local development use.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DatabaseDriver,
  InsertOptions,
  QueryOptions,
  UpdateOptions,
  DeleteOptions,
  Migration,
  MigrationStatus,
} from "./types.js";
import { ConfigurationError } from "../../errors.js";

export class FilesystemDriver implements DatabaseDriver {
  readonly name = "filesystem";
  readonly type = "filesystem" as const;
  private baseDir: string;
  private connected = false;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), ".innovator", "data");
  }

  async connect(): Promise<void> {
    mkdirSync(this.baseDir, { recursive: true });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private tableDir(table: string): string {
    const dir = join(this.baseDir, table);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private readAll<T = Record<string, unknown>>(table: string): Array<T & { _id: string }> {
    const dir = this.tableDir(table);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files.map((f) => {
      const content = readFileSync(join(dir, f), "utf-8");
      return { ...JSON.parse(content), _id: f.replace(".json", "") };
    });
  }

  async insert(options: InsertOptions): Promise<string> {
    const id = (options.data.id as string) ?? randomUUID();
    const dir = this.tableDir(options.table);
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(options.data, null, 2), "utf-8");
    return id;
  }

  async query<T = Record<string, unknown>>(options: QueryOptions): Promise<T[]> {
    let records = this.readAll<T>(options.table);

    // Apply conditions
    if (options.conditions) {
      for (const cond of options.conditions) {
        records = records.filter((r) => {
          const val = (r as Record<string, unknown>)[cond.field];
          switch (cond.operator) {
            case "eq":
              return val === cond.value;
            case "neq":
              return val !== cond.value;
            case "gt":
              return (val as number) > (cond.value as number);
            case "gte":
              return (val as number) >= (cond.value as number);
            case "lt":
              return (val as number) < (cond.value as number);
            case "lte":
              return (val as number) <= (cond.value as number);
            case "like":
              return typeof val === "string" && val.includes(cond.value as string);
            case "in":
              return Array.isArray(cond.value) && cond.value.includes(val);
            case "not-in":
              return Array.isArray(cond.value) && !cond.value.includes(val);
            case "is-null":
              return val === null || val === undefined;
            case "is-not-null":
              return val !== null && val !== undefined;
            default:
              return true;
          }
        });
      }
    }

    // Apply ordering
    if (options.orderBy) {
      records.sort((a, b) => {
        for (const order of options.orderBy!) {
          const aVal = (a as Record<string, unknown>)[order.field];
          const bVal = (b as Record<string, unknown>)[order.field];
          if (aVal === bVal) continue;
          const cmp = aVal! < bVal! ? -1 : 1;
          return order.direction === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }

    // Apply pagination
    const start = options.offset ?? 0;
    const end = options.limit ? start + options.limit : undefined;
    return records.slice(start, end) as T[];
  }

  async queryOne<T = Record<string, unknown>>(options: QueryOptions): Promise<T | undefined> {
    const results = await this.query<T>({ ...options, limit: 1 });
    return results[0];
  }

  async update(options: UpdateOptions): Promise<number> {
    const matching = await this.query<Record<string, unknown>>({
      table: options.table,
      conditions: options.conditions,
    });

    for (const record of matching) {
      const id = (record as Record<string, unknown>)._id ?? (record as Record<string, unknown>).id;
      if (typeof id !== "string") continue;
      const updated = { ...record, ...options.data };
      const dir = this.tableDir(options.table);
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(updated, null, 2), "utf-8");
    }

    return matching.length;
  }

  async delete(options: DeleteOptions): Promise<number> {
    const matching = await this.query<Record<string, unknown>>({
      table: options.table,
      conditions: options.conditions,
    });

    for (const record of matching) {
      const id = (record as Record<string, unknown>)._id ?? (record as Record<string, unknown>).id;
      if (typeof id !== "string") continue;
      const filepath = join(this.tableDir(options.table), `${id}.json`);
      if (existsSync(filepath)) unlinkSync(filepath);
    }

    return matching.length;
  }

  async beginTransaction(): Promise<void> {
    // Filesystem doesn't support transactions — noop
  }

  async commitTransaction(): Promise<void> {
    // Noop
  }

  async rollbackTransaction(): Promise<void> {
    // Noop — filesystem operations can't be rolled back
  }

  async rawQuery<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<T[]> {
    throw new ConfigurationError("Raw SQL queries not supported by filesystem driver");
  }

  async rawExec(_sql: string, _params?: unknown[]): Promise<void> {
    throw new ConfigurationError("Raw SQL execution not supported by filesystem driver");
  }

  async getMigrationStatus(): Promise<MigrationStatus> {
    return { currentVersion: 0, pendingMigrations: [], appliedMigrations: [] };
  }

  async runMigrations(_migrations: Migration[]): Promise<void> {
    // Filesystem doesn't need migrations
  }

  async rollbackMigration(_version: number): Promise<void> {
    // Noop
  }
}
