/**
 * @module saas/storage
 *
 * Pluggable storage adapter for SaaS session persistence.
 * Supports in-memory (dev) and Postgres (production) backends.
 */

import { z } from "zod";
import type { PlaygroundSession } from "../playground/index.js";
import type { Tenant, UsageRecord, SaasApiKey } from "./index.js";

// ---- Storage Interface ----

export interface StorageAdapter {
  // Sessions
  saveSession(session: PlaygroundSession): Promise<void>;
  getSession(id: string): Promise<PlaygroundSession | null>;
  getSessionByShareId(shareId: string): Promise<PlaygroundSession | null>;
  getUserSessions(userId: string, limit?: number): Promise<PlaygroundSession[]>;
  updateSession(id: string, update: Partial<PlaygroundSession>): Promise<void>;
  deleteExpiredSessions(): Promise<number>;

  // Tenants
  saveTenant(tenant: Tenant): Promise<void>;
  getTenant(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  updateTenant(id: string, update: Partial<Tenant>): Promise<void>;

  // Usage
  getUsage(tenantId: string, period: string): Promise<UsageRecord | null>;
  saveUsage(record: UsageRecord): Promise<void>;
  incrementUsage(tenantId: string, period: string, field: string, amount: number): Promise<void>;

  // Health
  ping(): Promise<boolean>;
}

// ---- In-Memory Adapter (Development) ----

export class InMemoryStorageAdapter implements StorageAdapter {
  private sessions = new Map<string, PlaygroundSession>();
  private shareIndex = new Map<string, string>();
  private tenants = new Map<string, Tenant>();
  private usage = new Map<string, UsageRecord>();

  async saveSession(session: PlaygroundSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
    if (session.shareId) {
      this.shareIndex.set(session.shareId, session.id);
    }
  }

  async getSession(id: string): Promise<PlaygroundSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async getSessionByShareId(shareId: string): Promise<PlaygroundSession | null> {
    const id = this.shareIndex.get(shareId);
    if (!id) return null;
    return this.sessions.get(id) ?? null;
  }

  async getUserSessions(userId: string, limit = 20): Promise<PlaygroundSession[]> {
    return Array.from(this.sessions.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async updateSession(id: string, update: Partial<PlaygroundSession>): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, update);
    }
  }

  async deleteExpiredSessions(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt && new Date(session.expiresAt) < now) {
        this.sessions.delete(id);
        if (session.shareId) this.shareIndex.delete(session.shareId);
        count++;
      }
    }
    return count;
  }

  async saveTenant(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.id, { ...tenant });
  }

  async getTenant(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) ?? null;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    return Array.from(this.tenants.values()).find((t) => t.slug === slug) ?? null;
  }

  async updateTenant(id: string, update: Partial<Tenant>): Promise<void> {
    const tenant = this.tenants.get(id);
    if (tenant) {
      Object.assign(tenant, update, { updatedAt: new Date().toISOString() });
    }
  }

  async getUsage(tenantId: string, period: string): Promise<UsageRecord | null> {
    return this.usage.get(`${tenantId}:${period}`) ?? null;
  }

  async saveUsage(record: UsageRecord): Promise<void> {
    this.usage.set(`${record.tenantId}:${record.period}`, { ...record });
  }

  async incrementUsage(
    tenantId: string,
    period: string,
    field: string,
    amount: number
  ): Promise<void> {
    const key = `${tenantId}:${period}`;
    const record = this.usage.get(key);
    if (record && field in record) {
      (record as Record<string, unknown>)[field] =
        ((record as Record<string, unknown>)[field] as number) + amount;
      record.lastUpdated = new Date().toISOString();
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

// ---- Postgres Adapter (Production) ----

export const PostgresConfigSchema = z.object({
  connectionString: z.string().min(1),
  maxConnections: z.number().int().min(1).max(100).default(10),
  ssl: z.boolean().default(true),
});

export type PostgresConfig = z.infer<typeof PostgresConfigSchema>;

/**
 * Postgres storage adapter stub.
 * In production, this would use `pg` or `@vercel/postgres`.
 * The interface is implemented so the system can swap in Postgres
 * by setting DATABASE_URL environment variable.
 */
export class PostgresStorageAdapter implements StorageAdapter {
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  private async query<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
    // In production: use pg Pool to execute queries
    // const pool = new Pool({ connectionString: this.config.connectionString });
    // const result = await pool.query(sql, params);
    // return result.rows as T[];
    throw new Error("PostgresStorageAdapter requires pg driver. Install with: npm install pg");
  }

  async saveSession(session: PlaygroundSession): Promise<void> {
    await this.query(
      `INSERT INTO playground_sessions (id, user_id, subject, status, share_id, created_at, expires_at, tier, result, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET status = $4, result = $9`,
      [
        session.id,
        session.userId,
        session.subject,
        session.status,
        session.shareId,
        session.createdAt,
        session.expiresAt,
        session.tier,
        JSON.stringify(session.result),
        JSON.stringify(session.metadata),
      ]
    );
  }

  async getSession(id: string): Promise<PlaygroundSession | null> {
    const rows = await this.query<PlaygroundSession>(
      "SELECT * FROM playground_sessions WHERE id = $1",
      [id]
    );
    return rows[0] ?? null;
  }

  async getSessionByShareId(shareId: string): Promise<PlaygroundSession | null> {
    const rows = await this.query<PlaygroundSession>(
      "SELECT * FROM playground_sessions WHERE share_id = $1",
      [shareId]
    );
    return rows[0] ?? null;
  }

  async getUserSessions(userId: string, limit = 20): Promise<PlaygroundSession[]> {
    return this.query<PlaygroundSession>(
      "SELECT * FROM playground_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [userId, limit]
    );
  }

  async updateSession(id: string, update: Partial<PlaygroundSession>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(update)) {
      setClauses.push(`${toSnakeCase(key)} = $${idx}`);
      values.push(typeof value === "object" ? JSON.stringify(value) : value);
      idx++;
    }

    values.push(id);
    await this.query(
      `UPDATE playground_sessions SET ${setClauses.join(", ")} WHERE id = $${idx}`,
      values
    );
  }

  async deleteExpiredSessions(): Promise<number> {
    const rows = await this.query<{ count: number }>(
      "DELETE FROM playground_sessions WHERE expires_at < NOW() RETURNING 1 as count"
    );
    return rows.length;
  }

  async saveTenant(tenant: Tenant): Promise<void> {
    await this.query(
      `INSERT INTO tenants (id, name, slug, owner_id, plan_id, status, billing_email, stripe_customer_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET name = $2, plan_id = $5, status = $6, updated_at = $10`,
      [
        tenant.id,
        tenant.name,
        tenant.slug,
        tenant.ownerId,
        tenant.planId,
        tenant.status,
        tenant.billingEmail,
        tenant.stripeCustomerId,
        tenant.createdAt,
        tenant.updatedAt,
      ]
    );
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const rows = await this.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const rows = await this.query<Tenant>("SELECT * FROM tenants WHERE slug = $1", [slug]);
    return rows[0] ?? null;
  }

  async updateTenant(id: string, update: Partial<Tenant>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(update)) {
      setClauses.push(`${toSnakeCase(key)} = $${idx}`);
      values.push(value);
      idx++;
    }

    values.push(id);
    await this.query(
      `UPDATE tenants SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
      values
    );
  }

  async getUsage(tenantId: string, period: string): Promise<UsageRecord | null> {
    const rows = await this.query<UsageRecord>(
      "SELECT * FROM usage_records WHERE tenant_id = $1 AND period = $2",
      [tenantId, period]
    );
    return rows[0] ?? null;
  }

  async saveUsage(record: UsageRecord): Promise<void> {
    await this.query(
      `INSERT INTO usage_records (tenant_id, period, sessions_used, angles_generated, api_requests, storage_used_bytes, llm_tokens_used, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, period) DO UPDATE SET sessions_used = $3, api_requests = $5, last_updated = $8`,
      [
        record.tenantId,
        record.period,
        record.sessionsUsed,
        record.anglesGenerated,
        record.apiRequests,
        record.storageUsedBytes,
        record.llmTokensUsed,
        record.lastUpdated,
      ]
    );
  }

  async incrementUsage(
    tenantId: string,
    period: string,
    field: string,
    amount: number
  ): Promise<void> {
    const column = toSnakeCase(field);
    await this.query(
      `UPDATE usage_records SET ${column} = ${column} + $1, last_updated = NOW()
       WHERE tenant_id = $2 AND period = $3`,
      [amount, tenantId, period]
    );
  }

  async ping(): Promise<boolean> {
    try {
      await this.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// ---- SQL Migration ----

export const POSTGRES_MIGRATION = `
-- Playground sessions
CREATE TABLE IF NOT EXISTS playground_sessions (
  id UUID PRIMARY KEY,
  user_id VARCHAR(200),
  subject TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  share_id VARCHAR(50) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  result JSONB,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON playground_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_share ON playground_sessions(share_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON playground_sessions(expires_at);

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  owner_id VARCHAR(200) NOT NULL,
  plan_id VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  billing_email VARCHAR(200),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ
);

-- Usage records
CREATE TABLE IF NOT EXISTS usage_records (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  period VARCHAR(7) NOT NULL,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  angles_generated INTEGER NOT NULL DEFAULT 0,
  api_requests INTEGER NOT NULL DEFAULT 0,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  llm_tokens_used BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period)
);

-- Authenticated users
CREATE TABLE IF NOT EXISTS auth_users (
  id VARCHAR(200) PRIMARY KEY,
  github_id INTEGER UNIQUE,
  login VARCHAR(100) NOT NULL,
  name VARCHAR(200),
  email VARCHAR(200),
  avatar_url TEXT,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
`;

// ---- Factory ----

let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (storageInstance) return storageInstance;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    storageInstance = new PostgresStorageAdapter(
      PostgresConfigSchema.parse({ connectionString: dbUrl })
    );
  } else {
    storageInstance = new InMemoryStorageAdapter();
  }

  return storageInstance;
}

export function setStorage(adapter: StorageAdapter): void {
  storageInstance = adapter;
}
