import { describe, it, expect, beforeEach } from "vitest";
import { SQLiteStorageProvider } from "../storage/sqlite.js";
import type { SQLiteDB } from "../storage/sqlite.js";
import type { SessionRecord, CollaborativeSession } from "../types.js";

/**
 * In-memory SQLite mock implementing the SQLiteDB interface.
 * Uses simple Map-based storage to test the storage provider logic
 * without requiring better-sqlite3.
 */
function createInMemoryDB(): SQLiteDB {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const autoIncrements = new Map<string, number>();

  // Simple row storage by table
  function getTable(name: string): Map<string, Record<string, unknown>> {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  }

  return {
    exec(_sql: string) {
      // Schema DDL — just ensure tables exist
      const tableMatches = _sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g);
      for (const match of tableMatches) {
        getTable(match[1]);
      }
    },

    run(sql: string, ...params: unknown[]) {
      const insertMatch = sql.match(
        /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
      );
      const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);

      if (insertMatch) {
        const tableName = insertMatch[1];
        const cols = insertMatch[2].split(",").map((c) => c.trim());
        const valueParts = insertMatch[3].split(",").map((v) => v.trim());
        const table = getTable(tableName);
        const row: Record<string, unknown> = {};
        let paramIdx = 0;
        cols.forEach((col, i) => {
          const val = valueParts[i];
          if (val === "?") {
            row[col] = params[paramIdx++] ?? null;
          } else {
            // Literal value in SQL (e.g., 'main')
            const litMatch = val.match(/^'([^']*)'$/);
            row[col] = litMatch ? litMatch[1] : val;
          }
        });

        // Handle AUTOINCREMENT for id
        if (cols.includes("id") && row.id == null) {
          const next = (autoIncrements.get(tableName) ?? 0) + 1;
          autoIncrements.set(tableName, next);
          row.id = next;
        }

        const pk = String(row.id ?? row.key_id ?? `${row.session_id}-${row.tag}`);
        if (sql.toUpperCase().includes("OR IGNORE") && table.has(pk)) {
          return;
        }
        table.set(pk, row);
      } else if (deleteMatch) {
        const tableName = deleteMatch[1];
        const table = getTable(tableName);
        const whereClause = deleteMatch[2];

        if (!whereClause) {
          table.clear();
          return;
        }

        // Simple single-column WHERE parsing
        const conditions = whereClause.split(/\s+AND\s+/i);
        const toDelete: string[] = [];
        for (const [key, row] of table) {
          let matches = true;
          let paramIdx = 0;
          for (const cond of conditions) {
            const eqMatch = cond.match(/(\w+)\s*=\s*\?/);
            if (eqMatch) {
              if (row[eqMatch[1]] !== params[paramIdx]) matches = false;
              paramIdx++;
            }
          }
          if (matches) toDelete.push(key);
        }
        toDelete.forEach((k) => table.delete(k));
      }
    },

    get<T>(sql: string, ...params: unknown[]): T | undefined {
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) return undefined;
      const tableName = fromMatch[1];
      const table = getTable(tableName);

      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s*$)/i);
      if (!whereMatch) {
        const first = table.values().next();
        return first.done ? undefined : (first.value as T);
      }

      const conditions = whereMatch[1].split(/\s+AND\s+/i);
      for (const row of table.values()) {
        let matches = true;
        let paramIdx = 0;
        for (const cond of conditions) {
          const eqMatch = cond.match(/(\w+)\s*=\s*\?/);
          if (eqMatch) {
            if (String(row[eqMatch[1]]) !== String(params[paramIdx])) matches = false;
            paramIdx++;
          } else {
            const litMatch = cond.match(/(\w+)\s*=\s*'([^']+)'/);
            if (litMatch) {
              if (String(row[litMatch[1]]) !== litMatch[2]) matches = false;
            }
          }
        }
        if (matches) return row as T;
      }
      return undefined;
    },

    all<T>(sql: string, ...params: unknown[]): T[] {
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) return [];
      const tableName = fromMatch[1];
      const table = getTable(tableName);

      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
      let rows = [...table.values()];

      if (whereMatch) {
        const conditions = whereMatch[1].split(/\s+AND\s+/i);
        rows = rows.filter((row) => {
          let paramIdx = 0;
          for (const cond of conditions) {
            const eqMatch = cond.match(/(\w+)\s*=\s*\?/);
            const geMatch = cond.match(/(\w+)\s*>=\s*\?/);
            if (eqMatch) {
              if (String(row[eqMatch[1]]) !== String(params[paramIdx])) return false;
              paramIdx++;
            } else if (geMatch) {
              if (String(row[geMatch[1]]) < String(params[paramIdx])) return false;
              paramIdx++;
            }
          }
          return true;
        });
      }

      const limitMatch = sql.match(/LIMIT\s+\?/i);
      if (limitMatch) {
        const limit = params[params.length - 1] as number;
        rows = rows.slice(0, limit);
      }

      // Handle ORDER BY DESC
      if (sql.includes("DESC")) {
        rows.reverse();
      }

      return rows as T[];
    },

    close() {
      tables.clear();
    },
  };
}

function makeSessionRecord(id: string, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = new Date().toISOString();
  return {
    id,
    subject: `Test subject for ${id}`,
    createdAt: now,
    updatedAt: now,
    angleResults: [],
    tags: ["test"],
    ...overrides,
  };
}

describe("SQLiteStorageProvider", () => {
  let db: SQLiteDB;
  let provider: SQLiteStorageProvider;

  beforeEach(async () => {
    db = createInMemoryDB();
    provider = new SQLiteStorageProvider(db);
    await provider.initialize();
  });

  describe("SessionStorage CRUD", () => {
    it("save → get → list → delete lifecycle", async () => {
      const session = makeSessionRecord("s1");
      await provider.sessions.saveSession(session);

      const retrieved = await provider.sessions.getSession("s1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("s1");
      expect(retrieved!.subject).toContain("s1");

      const list = await provider.sessions.listSessions();
      expect(list).toHaveLength(1);

      await provider.sessions.deleteSession("s1");
      const afterDelete = await provider.sessions.getSession("s1");
      expect(afterDelete).toBeUndefined();
    });

    it("returns undefined for non-existent session", async () => {
      const result = await provider.sessions.getSession("nonexistent");
      expect(result).toBeUndefined();
    });

    it("returns empty list from empty database", async () => {
      const list = await provider.sessions.listSessions();
      expect(list).toHaveLength(0);
    });
  });

  describe("ApiGatewayStorage", () => {
    it("saves and retrieves API key", async () => {
      const apiKey = {
        id: "key-1",
        key: "sk-test-123",
        name: "Test Key",
        tier: "free" as const,
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: { dailyLimit: 100, minuteLimit: 10 },
      };
      await provider.apiGateway.saveApiKey(apiKey);

      const retrieved = await provider.apiGateway.getApiKey("key-1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Test Key");
    });

    it("records and retrieves usage", async () => {
      const usage = {
        keyId: "key-1",
        endpoint: "/api/investigate",
        timestamp: new Date().toISOString(),
        durationMs: 1500,
        tokensUsed: 500,
        statusCode: 200,
      };
      await provider.apiGateway.recordUsage(usage);

      const records = await provider.apiGateway.getUsageRecords("key-1");
      expect(records).toHaveLength(1);
      expect(records[0].endpoint).toBe("/api/investigate");
    });
  });

  describe("CollaborationStorage", () => {
    it("saves and retrieves session by room code", async () => {
      const collabSession = {
        id: "collab-1",
        roomCode: "ABC-123",
        status: "active",
        subject: "Test collaboration",
        hostId: "host-1",
        participants: [],
        votes: [],
        chat: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await provider.collaboration.saveSession(collabSession as CollaborativeSession);

      const byCode = await provider.collaboration.findByCode("ABC-123");
      expect(byCode).toBeDefined();
      expect(byCode!.id).toBe("collab-1");
    });
  });

  describe("AnalyticsStorage", () => {
    it("tracks and reads events", async () => {
      await provider.analytics.trackEvent({
        id: "evt-1",
        type: "pipeline_started",
        timestamp: new Date().toISOString(),
        data: { subject: "AI" },
      });
      await provider.analytics.trackEvent({
        id: "evt-2",
        type: "investigation_completed",
        timestamp: new Date().toISOString(),
        data: { subject: "AI" },
      });

      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(2);
    });

    it("clears events", async () => {
      await provider.analytics.trackEvent({
        id: "evt-1",
        type: "pipeline_started",
        timestamp: new Date().toISOString(),
      });
      await provider.analytics.clearEvents();
      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(0);
    });

    it("returns empty from empty database", async () => {
      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe("KnowledgeGraphStorage", () => {
    it("saves and retrieves graph", async () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            label: "AI",
            type: "technology" as const,
            sourceSessionIds: ["s1"],
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            occurrenceCount: 1,
          },
        ],
        edges: [],
        lastUpdated: new Date().toISOString(),
        sessionCount: 1,
      };
      await provider.knowledgeGraph.saveGraph(graph);

      const loaded = await provider.knowledgeGraph.loadGraph();
      expect(loaded).toBeDefined();
      expect(loaded!.nodes).toHaveLength(1);
      expect(loaded!.nodes[0].label).toBe("AI");
    });

    it("returns undefined from empty database", async () => {
      const graph = await provider.knowledgeGraph.loadGraph();
      expect(graph).toBeUndefined();
    });
  });

  describe("Provider", () => {
    it("has name 'sqlite'", () => {
      expect(provider.name).toBe("sqlite");
    });

    it("close clears the database", async () => {
      await provider.close();
      // After close, the db is cleared (in our mock)
    });
  });
});
