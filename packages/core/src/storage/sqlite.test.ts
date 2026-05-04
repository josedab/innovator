import { describe, it, expect, beforeEach } from "vitest";
import { SQLiteStorageProvider, type SQLiteDB } from "./sqlite.js";

/**
 * In-memory mock of the SQLiteDB interface that mimics better-sqlite3 behavior
 * using a simple Map-based store with SQL string parsing for basic operations.
 */
function createMockSQLiteDB(): SQLiteDB {
  const rows = new Map<string, Record<string, unknown>[]>();

  function getTable(name: string): Record<string, unknown>[] {
    if (!rows.has(name)) rows.set(name, []);
    return rows.get(name)!;
  }

  // Resolve value placeholders: ? → params, 'literal' → literal
  function resolveValues(valueParts: string[], params: unknown[]): unknown[] {
    const result: unknown[] = [];
    let paramIdx = 0;
    for (const part of valueParts) {
      const trimmed = part.trim();
      const literalMatch = trimmed.match(/^'([^']*)'$/);
      if (literalMatch) {
        result.push(literalMatch[1]);
      } else if (trimmed === "?") {
        result.push(params[paramIdx++]);
      } else {
        result.push(params[paramIdx++]);
      }
    }
    return result;
  }

  function matchesWhere(
    row: Record<string, unknown>,
    whereClause: string,
    params: unknown[]
  ): boolean {
    const conditions = whereClause.split(/\s+AND\s+/i);
    let paramIdx = 0;
    for (const cond of conditions) {
      const eqMatch = cond.match(/(\w+)\s*=\s*(?:\?|'([^']*)')/);
      const gteMatch = cond.match(/(\w+)\s*>=\s*\?/);
      if (eqMatch) {
        const col = eqMatch[1];
        const val = eqMatch[2] !== undefined ? eqMatch[2] : params[paramIdx++];
        if (row[col] !== val) return false;
      } else if (gteMatch) {
        if (String(row[gteMatch[1]]) < String(params[paramIdx++])) return false;
      }
    }
    return true;
  }

  return {
    exec(sql: string) {
      const createMatches = sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g);
      for (const match of createMatches) {
        if (!rows.has(match[1])) rows.set(match[1], []);
      }
    },

    run(sql: string, ...params: unknown[]) {
      const insertMatch = sql.match(
        /INSERT\s+(?:OR\s+(\w+)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
      );
      if (insertMatch) {
        const mode = insertMatch[1]?.toUpperCase();
        const table = insertMatch[2];
        const cols = insertMatch[3].split(",").map((c) => c.trim());
        const valueParts = insertMatch[4].split(",");
        const values = resolveValues(valueParts, params);
        const data = getTable(table);

        if (mode === "REPLACE") {
          const pkCol = cols[0];
          const pkVal = values[0];
          const idx = data.findIndex((r) => r[pkCol] === pkVal);
          if (idx !== -1) data.splice(idx, 1);
        }

        if (mode === "IGNORE") {
          // Check composite key uniqueness
          const existingMatch = data.some((r) => cols.every((col, i) => r[col] === values[i]));
          if (existingMatch) return;
        }

        const row: Record<string, unknown> = {};
        cols.forEach((col, i) => {
          row[col] = values[i] ?? null;
        });
        if (table === "usage_records" && !row.id) {
          row.id = data.length + 1;
        }
        data.push(row);
        return;
      }

      const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
      if (deleteMatch) {
        const table = deleteMatch[1];
        const data = getTable(table);
        if (!deleteMatch[2]) {
          data.length = 0;
          return;
        }
        const toRemove: number[] = [];
        data.forEach((row, idx) => {
          if (matchesWhere(row, deleteMatch[2], params)) toRemove.push(idx);
        });
        for (let i = toRemove.length - 1; i >= 0; i--) {
          data.splice(toRemove[i], 1);
        }
        return;
      }
    },

    get<T>(sql: string, ...params: unknown[]): T | undefined {
      const results = this.all<T>(sql, ...params);
      return results[0];
    },

    all<T>(sql: string, ...params: unknown[]): T[] {
      const selectMatch = sql.match(
        /SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\?|\d+))?$/i
      );
      if (!selectMatch) return [];

      const table = selectMatch[2];
      const data = getTable(table);
      let results = [...data];

      if (selectMatch[3]) {
        results = results.filter((row) => matchesWhere(row, selectMatch[3], params));
      }

      if (selectMatch[4]) {
        const orderMatch = selectMatch[4].match(/(\w+)\s*(DESC|ASC)?/i);
        if (orderMatch) {
          const col = orderMatch[1];
          const desc = orderMatch[2]?.toUpperCase() === "DESC";
          results.sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            return desc ? bv.localeCompare(av) : av.localeCompare(bv);
          });
        }
      }

      if (selectMatch[5]) {
        const limit =
          selectMatch[5] === "?" ? Number(params[params.length - 1]) : Number(selectMatch[5]);
        results = results.slice(0, limit);
      }

      const colStr = selectMatch[1].trim();
      if (colStr !== "*") {
        const cols = colStr.split(",").map((c) => c.trim().split(/\s+as\s+/i));
        results = results.map((row) => {
          const out: Record<string, unknown> = {};
          for (const [original, alias] of cols) {
            out[alias ?? original] = row[original];
          }
          return out;
        }) as Record<string, unknown>[];
      }

      return results as T[];
    },

    close() {
      // no-op for mock
    },
  };
}

// ---- Helpers ----

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: `session-${Math.random().toString(36).slice(2, 6)}`,
    subject: "Test subject",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    angleResults: [],
    tags: [],
    ...overrides,
  };
}

describe("SQLiteStorageProvider", () => {
  let db: SQLiteDB;
  let provider: SQLiteStorageProvider;

  beforeEach(async () => {
    db = createMockSQLiteDB();
    provider = new SQLiteStorageProvider(db);
    await provider.initialize();
  });

  it("has name 'sqlite'", () => {
    expect(provider.name).toBe("sqlite");
  });

  describe("initialize", () => {
    it("creates tables on initialize (idempotent)", async () => {
      // Second init should not throw
      await expect(provider.initialize()).resolves.toBeUndefined();
    });
  });

  describe("close", () => {
    it("closes the database", async () => {
      await expect(provider.close()).resolves.toBeUndefined();
    });
  });

  // ---- Session CRUD ----
  describe("sessions", () => {
    it("saves and retrieves a session", async () => {
      const session = makeSession({ id: "s1", subject: "AI brainstorm" });
      await provider.sessions.saveSession(session as never);
      const result = await provider.sessions.getSession("s1");
      expect(result).toBeDefined();
      expect(result!.subject).toBe("AI brainstorm");
    });

    it("returns undefined for non-existent session", async () => {
      const result = await provider.sessions.getSession("non-existent");
      expect(result).toBeUndefined();
    });

    it("updates session tags and notes", async () => {
      const session = makeSession({ id: "s1" });
      await provider.sessions.saveSession(session as never);
      const updated = await provider.sessions.updateSession("s1", {
        tags: ["innovation", "ai"],
        notes: "Great session",
      });
      expect(updated).toBe(true);

      const result = await provider.sessions.getSession("s1");
      expect(result!.tags).toEqual(["innovation", "ai"]);
      expect(result!.notes).toBe("Great session");
    });

    it("returns false when updating non-existent session", async () => {
      const result = await provider.sessions.updateSession("nope", { tags: ["x"] });
      expect(result).toBe(false);
    });

    it("deletes a session", async () => {
      const session = makeSession({ id: "s1" });
      await provider.sessions.saveSession(session as never);
      expect(await provider.sessions.deleteSession("s1")).toBe(true);
      expect(await provider.sessions.getSession("s1")).toBeUndefined();
    });

    it("lists sessions sorted by createdAt descending", async () => {
      await provider.sessions.saveSession(
        makeSession({ id: "s1", createdAt: "2024-01-01T00:00:00Z" }) as never
      );
      await provider.sessions.saveSession(
        makeSession({ id: "s2", createdAt: "2024-06-01T00:00:00Z" }) as never
      );
      await provider.sessions.saveSession(
        makeSession({ id: "s3", createdAt: "2024-03-01T00:00:00Z" }) as never
      );
      const list = await provider.sessions.listSessions();
      expect(list.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    });

    it("saves session with special characters in subject", async () => {
      const session = makeSession({
        id: "s-special",
        subject: "O'Brien's \"innovation\" & <tags>",
      });
      await provider.sessions.saveSession(session as never);
      const result = await provider.sessions.getSession("s-special");
      expect(result!.subject).toBe("O'Brien's \"innovation\" & <tags>");
    });
  });

  // ---- API Gateway ----
  describe("apiGateway", () => {
    const makeKey = (overrides: Record<string, unknown> = {}) => ({
      id: "key-1",
      key: "sk-live-abc123",
      name: "Test Key",
      tier: "pro" as const,
      createdAt: new Date().toISOString(),
      enabled: true,
      rateLimit: { requestsPerMinute: 100 },
      scopes: ["read"],
      ...overrides,
    });

    it("saves and retrieves API key by ID", async () => {
      const key = makeKey();
      await provider.apiGateway.saveApiKey(key as never);
      const result = await provider.apiGateway.getApiKey("key-1");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Test Key");
    });

    it("finds API key by value", async () => {
      await provider.apiGateway.saveApiKey(makeKey() as never);
      const found = await provider.apiGateway.findApiKeyByValue("sk-live-abc123");
      expect(found).toBeDefined();
      expect(found!.id).toBe("key-1");

      const notFound = await provider.apiGateway.findApiKeyByValue("sk-wrong");
      expect(notFound).toBeUndefined();
    });

    it("updates API key", async () => {
      await provider.apiGateway.saveApiKey(makeKey() as never);
      const result = await provider.apiGateway.updateApiKey("key-1", { name: "Updated" } as never);
      expect(result).toBe(true);
      const updated = await provider.apiGateway.getApiKey("key-1");
      expect(updated!.name).toBe("Updated");
    });

    it("returns false when updating non-existent key", async () => {
      expect(await provider.apiGateway.updateApiKey("nope", {} as never)).toBe(false);
    });

    it("deletes API key", async () => {
      await provider.apiGateway.saveApiKey(makeKey() as never);
      expect(await provider.apiGateway.deleteApiKey("key-1")).toBe(true);
      expect(await provider.apiGateway.getApiKey("key-1")).toBeUndefined();
    });

    it("lists API keys", async () => {
      await provider.apiGateway.saveApiKey(makeKey({ id: "k1", key: "sk-1" }) as never);
      await provider.apiGateway.saveApiKey(makeKey({ id: "k2", key: "sk-2" }) as never);
      const list = await provider.apiGateway.listApiKeys();
      expect(list).toHaveLength(2);
    });

    it("records and retrieves usage", async () => {
      const record = {
        keyId: "key-1",
        endpoint: "/api/generate",
        timestamp: "2024-06-01T00:00:00Z",
        durationMs: 150,
        tokensUsed: 100,
        statusCode: 200,
      };
      await provider.apiGateway.recordUsage(record as never);
      const records = await provider.apiGateway.getUsageRecords("key-1");
      expect(records).toHaveLength(1);
      expect(records[0].endpoint).toBe("/api/generate");
    });

    it("filters usage records by since timestamp", async () => {
      await provider.apiGateway.recordUsage({
        keyId: "key-1",
        endpoint: "/api/a",
        timestamp: "2024-01-01T00:00:00Z",
        durationMs: 10,
        statusCode: 200,
      } as never);
      await provider.apiGateway.recordUsage({
        keyId: "key-1",
        endpoint: "/api/b",
        timestamp: "2024-06-01T00:00:00Z",
        durationMs: 20,
        statusCode: 200,
      } as never);

      const filtered = await provider.apiGateway.getUsageRecords("key-1", "2024-05-01T00:00:00Z");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].endpoint).toBe("/api/b");
    });

    // Webhooks
    it("manages webhooks", async () => {
      await provider.apiGateway.saveWebhook("key-1", "https://example.com/hook");
      await provider.apiGateway.saveWebhook("key-1", "https://example.com/hook2");
      // Duplicate is ignored
      await provider.apiGateway.saveWebhook("key-1", "https://example.com/hook");

      const hooks = await provider.apiGateway.getWebhooks("key-1");
      expect(hooks).toHaveLength(2);

      expect(await provider.apiGateway.removeWebhook("key-1", "https://example.com/hook")).toBe(
        true
      );
      const remaining = await provider.apiGateway.getWebhooks("key-1");
      expect(remaining).toHaveLength(1);
    });
  });

  // ---- Workspaces ----
  describe("workspaces", () => {
    it("saves, gets, lists, and deletes", async () => {
      const ws = {
        id: "ws-1",
        name: "Test Workspace",
        description: "Testing",
        members: [],
        updatedAt: "2024-06-01T00:00:00Z",
        createdAt: new Date().toISOString(),
      };
      await provider.workspaces.saveWorkspace(ws as never);
      const result = await provider.workspaces.getWorkspace("ws-1");
      expect(result!.name).toBe("Test Workspace");

      const list = await provider.workspaces.listWorkspaces();
      expect(list).toHaveLength(1);

      expect(await provider.workspaces.deleteWorkspace("ws-1")).toBe(true);
      expect(await provider.workspaces.getWorkspace("ws-1")).toBeUndefined();
    });
  });

  // ---- Collaboration ----
  describe("collaboration", () => {
    it("saves, finds by code, and deletes", async () => {
      const session = {
        id: "collab-1",
        roomCode: "ABC123",
        status: "active",
        participants: [],
        createdAt: new Date().toISOString(),
      };
      await provider.collaboration.saveSession(session as never);
      const found = await provider.collaboration.findByCode("ABC123");
      expect(found).toBeDefined();
      expect(found!.id).toBe("collab-1");

      expect(await provider.collaboration.findByCode("WRONG")).toBeUndefined();
      expect(await provider.collaboration.deleteSession("collab-1")).toBe(true);
    });
  });

  // ---- Analytics ----
  describe("analytics", () => {
    it("tracks, reads, and clears events", async () => {
      await provider.analytics.trackEvent({
        id: "e1",
        type: "session-start",
        timestamp: "2024-01-01T00:00:00Z",
      } as never);
      await provider.analytics.trackEvent({
        id: "e2",
        type: "session-end",
        timestamp: "2024-06-01T00:00:00Z",
      } as never);

      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(2);
      expect(events[0].timestamp).toBe("2024-06-01T00:00:00Z");

      const limited = await provider.analytics.readEvents(1);
      expect(limited).toHaveLength(1);

      await provider.analytics.clearEvents();
      expect(await provider.analytics.readEvents()).toHaveLength(0);
    });
  });

  // ---- Knowledge Graph ----
  describe("knowledgeGraph", () => {
    it("saves and loads graph", async () => {
      const graph = {
        nodes: [{ id: "n1", label: "AI", type: "concept" }],
        edges: [],
        lastUpdated: new Date().toISOString(),
        sessionCount: 1,
      };
      await provider.knowledgeGraph.saveGraph(graph as never);
      const loaded = await provider.knowledgeGraph.loadGraph();
      expect(loaded).toBeDefined();
      expect(loaded!.nodes).toHaveLength(1);
    });

    it("returns undefined when no graph saved", async () => {
      expect(await provider.knowledgeGraph.loadGraph()).toBeUndefined();
    });

    it("overwrites graph on second save", async () => {
      const graph1 = { nodes: [{ id: "n1" }], edges: [] };
      const graph2 = { nodes: [{ id: "n1" }, { id: "n2" }], edges: [] };
      await provider.knowledgeGraph.saveGraph(graph1 as never);
      await provider.knowledgeGraph.saveGraph(graph2 as never);
      const loaded = await provider.knowledgeGraph.loadGraph();
      expect(loaded!.nodes).toHaveLength(2);
    });
  });
});
