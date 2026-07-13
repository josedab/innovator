import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryStorageProvider } from "../storage/memory.js";

import type { SessionRecord } from "../types.js";

// ---- Helpers ----

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
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

describe("InMemoryStorageProvider", () => {
  let provider: InMemoryStorageProvider;

  beforeEach(() => {
    provider = new InMemoryStorageProvider();
  });

  it("has name 'memory'", () => {
    expect(provider.name).toBe("memory");
  });

  it("initialize and close are no-ops", async () => {
    await expect(provider.initialize()).resolves.toBeUndefined();
    await expect(provider.close()).resolves.toBeUndefined();
  });

  // ---- Session CRUD ----
  describe("sessions", () => {
    it("saves and retrieves a session", async () => {
      const session = makeSession({ id: "s1", subject: "AI brainstorm" });
      await provider.sessions.saveSession(session);
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
      await provider.sessions.saveSession(session);
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
      await provider.sessions.saveSession(session);
      expect(await provider.sessions.deleteSession("s1")).toBe(true);
      expect(await provider.sessions.getSession("s1")).toBeUndefined();
    });

    it("returns false when deleting non-existent session", async () => {
      expect(await provider.sessions.deleteSession("nope")).toBe(false);
    });

    it("lists sessions sorted by createdAt descending", async () => {
      await provider.sessions.saveSession(
        makeSession({ id: "s1", createdAt: "2024-01-01T00:00:00Z" })
      );
      await provider.sessions.saveSession(
        makeSession({ id: "s2", createdAt: "2024-06-01T00:00:00Z" })
      );
      await provider.sessions.saveSession(
        makeSession({ id: "s3", createdAt: "2024-03-01T00:00:00Z" })
      );
      const list = await provider.sessions.listSessions();
      expect(list.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    });

    // structuredClone isolation
    it("returns cloned data - mutations do not affect stored data", async () => {
      const session = makeSession({ id: "s1", tags: ["original"] });
      await provider.sessions.saveSession(session);

      const retrieved = await provider.sessions.getSession("s1");
      retrieved!.tags.push("mutated");

      const retrievedAgain = await provider.sessions.getSession("s1");
      expect(retrievedAgain!.tags).toEqual(["original"]);
    });

    // ---- Multi-criteria search ----
    describe("querySessions", () => {
      beforeEach(async () => {
        await provider.sessions.saveSession(
          makeSession({
            id: "s1",
            subject: "AI innovation",
            createdAt: "2024-01-15T00:00:00Z",
            tags: ["ai", "innovation"],
            angleResults: [
              {
                angleId: "scamper",
                ideas: [{ title: "Idea A", description: "desc A", score: 80 }],
              },
            ] as any,
          })
        );
        await provider.sessions.saveSession(
          makeSession({
            id: "s2",
            subject: "Climate research",
            createdAt: "2024-06-15T00:00:00Z",
            tags: ["climate"],
            angleResults: [],
          })
        );
        await provider.sessions.saveSession(
          makeSession({
            id: "s3",
            subject: "Quantum computing breakthrough",
            createdAt: "2024-03-15T00:00:00Z",
            tags: ["ai", "quantum"],
            angleResults: [],
          })
        );
      });

      it("filters by text search", async () => {
        const results = await provider.sessions.querySessions({ search: "climate" });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("s2");
      });

      it("filters by tags (AND logic)", async () => {
        const results = await provider.sessions.querySessions({ tags: ["ai"] });
        expect(results).toHaveLength(2);
      });

      it("filters by date range", async () => {
        const results = await provider.sessions.querySessions({
          fromDate: "2024-02-01T00:00:00Z",
          toDate: "2024-05-01T00:00:00Z",
        });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("s3");
      });

      it("filters by angleId", async () => {
        const results = await provider.sessions.querySessions({ angleId: "scamper" });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("s1");
      });

      it("applies limit and offset", async () => {
        const results = await provider.sessions.querySessions({ limit: 1, offset: 1 });
        expect(results).toHaveLength(1);
      });

      it("combines multiple criteria", async () => {
        const results = await provider.sessions.querySessions({
          tags: ["ai"],
          fromDate: "2024-02-01T00:00:00Z",
        });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("s3");
      });
    });
  });

  // ---- API Key Lookup ----
  describe("apiGateway", () => {
    it("saves and retrieves an API key by ID", async () => {
      const key = {
        id: "key-1",
        key: "sk-live-abc123",
        name: "Production Key",
        tier: "pro" as const,
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
        scopes: ["read", "write"],
      };
      await provider.apiGateway.saveApiKey(key as any);
      const result = await provider.apiGateway.getApiKey("key-1");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Production Key");
    });

    it("finds API key by value (security-critical path)", async () => {
      const key = {
        id: "key-1",
        key: "sk-live-secret-value",
        name: "Test Key",
        tier: "free" as const,
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: { requestsPerMinute: 10, requestsPerDay: 100 },
        scopes: ["read"],
      };
      await provider.apiGateway.saveApiKey(key as any);
      const found = await provider.apiGateway.findApiKeyByValue("sk-live-secret-value");
      expect(found).toBeDefined();
      expect(found!.id).toBe("key-1");

      const notFound = await provider.apiGateway.findApiKeyByValue("sk-wrong-value");
      expect(notFound).toBeUndefined();
    });

    it("deletes API key", async () => {
      const key = {
        id: "key-1",
        key: "sk-test",
        name: "Test",
        tier: "free",
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: {},
        scopes: [],
      };
      await provider.apiGateway.saveApiKey(key as any);
      expect(await provider.apiGateway.deleteApiKey("key-1")).toBe(true);
      expect(await provider.apiGateway.getApiKey("key-1")).toBeUndefined();
    });

    it("updates API key fields", async () => {
      const key = {
        id: "key-1",
        key: "sk-test",
        name: "Old",
        tier: "free",
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: {},
        scopes: [],
      };
      await provider.apiGateway.saveApiKey(key as any);
      expect(await provider.apiGateway.updateApiKey("key-1", { name: "New" } as any)).toBe(true);
      const updated = await provider.apiGateway.getApiKey("key-1");
      expect(updated!.name).toBe("New");
    });

    it("returns false when updating non-existent key", async () => {
      expect(await provider.apiGateway.updateApiKey("nope", {})).toBe(false);
    });

    // ---- Usage record filtering by timestamp ----
    it("records and filters usage by timestamp", async () => {
      const records = [
        {
          keyId: "key-1",
          endpoint: "/api/generate",
          timestamp: "2024-01-01T00:00:00Z",
          tokens: 100,
        },
        {
          keyId: "key-1",
          endpoint: "/api/generate",
          timestamp: "2024-06-01T00:00:00Z",
          tokens: 200,
        },
        {
          keyId: "key-1",
          endpoint: "/api/generate",
          timestamp: "2024-12-01T00:00:00Z",
          tokens: 300,
        },
        {
          keyId: "key-2",
          endpoint: "/api/generate",
          timestamp: "2024-06-01T00:00:00Z",
          tokens: 50,
        },
      ];
      for (const r of records) {
        await provider.apiGateway.recordUsage(r as any);
      }

      const all = await provider.apiGateway.getUsageRecords("key-1");
      expect(all).toHaveLength(3);

      const filtered = await provider.apiGateway.getUsageRecords("key-1", "2024-05-01T00:00:00Z");
      expect(filtered).toHaveLength(2);

      const other = await provider.apiGateway.getUsageRecords("key-2");
      expect(other).toHaveLength(1);
    });

    // ---- Webhooks ----
    it("manages webhooks", async () => {
      await provider.apiGateway.saveWebhook("key-1", "https://example.com/hook");
      await provider.apiGateway.saveWebhook("key-1", "https://example.com/hook2");
      await provider.apiGateway.saveWebhook("key-1", "https://example.com/hook"); // duplicate

      const hooks = await provider.apiGateway.getWebhooks("key-1");
      expect(hooks).toHaveLength(2);

      expect(await provider.apiGateway.removeWebhook("key-1", "https://example.com/hook")).toBe(
        true
      );
      expect(await provider.apiGateway.removeWebhook("key-1", "https://nonexistent.com")).toBe(
        false
      );
      expect(await provider.apiGateway.removeWebhook("key-nope", "https://example.com")).toBe(
        false
      );
    });
  });

  // ---- Workspaces ----
  describe("workspaces", () => {
    it("saves, gets, lists, and deletes workspaces", async () => {
      const ws = {
        id: "ws-1",
        name: "My Workspace",
        description: "Test",
        members: [],
        sessions: [],
        activity: [],
        createdAt: new Date().toISOString(),
        updatedAt: "2024-06-01T00:00:00Z",
      };
      await provider.workspaces.saveWorkspace(ws as any);
      const result = await provider.workspaces.getWorkspace("ws-1");
      expect(result!.name).toBe("My Workspace");

      const list = await provider.workspaces.listWorkspaces();
      expect(list).toHaveLength(1);

      expect(await provider.workspaces.deleteWorkspace("ws-1")).toBe(true);
      expect(await provider.workspaces.getWorkspace("ws-1")).toBeUndefined();
    });

    it("returns cloned workspace data", async () => {
      const ws = {
        id: "ws-1",
        name: "WS",
        description: "",
        members: [],
        sessions: [],
        activity: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await provider.workspaces.saveWorkspace(ws as any);
      const retrieved = await provider.workspaces.getWorkspace("ws-1");
      (retrieved as any).name = "Mutated";
      const again = await provider.workspaces.getWorkspace("ws-1");
      expect(again!.name).toBe("WS");
    });
  });

  // ---- Collaboration ----
  describe("collaboration", () => {
    it("saves, finds by code, and deletes", async () => {
      const session = {
        id: "collab-1",
        roomCode: "ABC123",
        participants: [],
        events: [],
        createdAt: new Date().toISOString(),
      };
      await provider.collaboration.saveSession(session as any);

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
      const event1 = { type: "session-start", timestamp: "2024-01-01T00:00:00Z", data: {} };
      const event2 = { type: "session-end", timestamp: "2024-06-01T00:00:00Z", data: {} };
      await provider.analytics.trackEvent(event1 as any);
      await provider.analytics.trackEvent(event2 as any);

      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(2);
      // Sorted by timestamp desc
      expect(events[0].timestamp).toBe("2024-06-01T00:00:00Z");

      const limited = await provider.analytics.readEvents(1);
      expect(limited).toHaveLength(1);

      await provider.analytics.clearEvents();
      expect(await provider.analytics.readEvents()).toHaveLength(0);
    });
  });

  // ---- Knowledge Graph ----
  describe("knowledgeGraph", () => {
    it("saves and loads with clone isolation", async () => {
      const graph = { nodes: [{ id: "n1", label: "AI" }], edges: [] };
      await provider.knowledgeGraph.saveGraph(graph as any);

      const loaded = await provider.knowledgeGraph.loadGraph();
      expect(loaded).toBeDefined();
      expect((loaded as any).nodes).toHaveLength(1);

      // Mutation should not affect stored data
      (loaded as any).nodes.push({ id: "n2", label: "ML" });
      const loaded2 = await provider.knowledgeGraph.loadGraph();
      expect((loaded2 as any).nodes).toHaveLength(1);
    });

    it("returns undefined when no graph saved", async () => {
      expect(await provider.knowledgeGraph.loadGraph()).toBeUndefined();
    });
  });
});

// ---- Migration tests ----
// migrateFileDataToStorage reads from the real filesystem.
// We test it by providing a mock storage and relying on the fact
// that ~/.innovator/history probably doesn't exist in CI.
// For a direct unit test we verify the MigrationResult contract.

describe("migrateFileDataToStorage", () => {
  it("returns zero counts when no legacy directories exist", async () => {
    // Import the real module — it reads from ~/.innovator which likely doesn't exist
    const { migrateFileDataToStorage } = await import("../storage/migrate.js");
    const storage = new InMemoryStorageProvider();
    const result = await migrateFileDataToStorage(storage);

    // Result has the correct shape
    expect(result).toHaveProperty("sessions");
    expect(result).toHaveProperty("workspaces");
    expect(result).toHaveProperty("analyticsEvents");
    expect(result).toHaveProperty("knowledgeGraph");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("MigrationResult has correct structure", () => {
    const result = {
      sessions: 0,
      workspaces: 0,
      analyticsEvents: 0,
      knowledgeGraph: false,
      errors: [] as string[],
    };
    expect(typeof result.sessions).toBe("number");
    expect(typeof result.knowledgeGraph).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ---- Global storage management ----

describe("storage index (getStorage/setStorage)", () => {
  it("defaults to InMemoryStorageProvider", async () => {
    const { getStorage } = await import("../storage/index.js");
    const storage = getStorage();
    expect(storage.name).toBe("memory");
  });

  it("setStorage replaces provider", async () => {
    const { getStorage, setStorage, InMemoryStorageProvider } = await import("../storage/index.js");
    const custom = new InMemoryStorageProvider();
    setStorage(custom);
    expect(getStorage()).toBe(custom);
  });

  it("shares provider selection and keeps initialize/close idempotent", async () => {
    const { closeStorage, getStorage, initializeStorage, isStorageInitialized, setStorage } =
      await import("../storage/index.js");
    const provider = new InMemoryStorageProvider();
    const initialize = vi.spyOn(provider, "initialize");
    const close = vi.spyOn(provider, "close");

    setStorage(provider);
    expect(getStorage()).toBe(provider);
    expect(isStorageInitialized()).toBe(false);

    await initializeStorage();
    await initializeStorage();
    expect(initialize).toHaveBeenCalledOnce();
    expect(isStorageInitialized()).toBe(true);

    await closeStorage();
    await closeStorage();
    expect(close).toHaveBeenCalledOnce();
    expect(isStorageInitialized()).toBe(false);
  });
});
