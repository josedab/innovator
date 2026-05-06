import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorageProvider } from "./memory.js";
import type { SessionRecord } from "../types.js";

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

describe("InMemoryStorageProvider — extended edge cases", () => {
  let provider: InMemoryStorageProvider;

  beforeEach(() => {
    provider = new InMemoryStorageProvider();
  });

  // ---- Session filtering edge cases ----
  describe("session search text matching", () => {
    beforeEach(async () => {
      await provider.sessions.saveSession(
        makeSession({
          id: "s1",
          subject: "AI innovation",
          createdAt: "2024-03-15T00:00:00Z",
          tags: ["ai"],
          notes: "Important note about machine learning",
          angleResults: [
            {
              angleId: "scamper",
              angleName: "SCAMPER",
              ideas: [
                {
                  title: "Idea X",
                  description: "Amazing idea",
                  potentialImpact: "",
                  implementationHint: "",
                },
              ],
              reasoning: "Applied SCAMPER",
            },
          ] as never,
        })
      );
      await provider.sessions.saveSession(
        makeSession({
          id: "s2",
          subject: "Quantum physics",
          createdAt: "2024-06-01T00:00:00Z",
          tags: [],
        })
      );
    });

    it("searches in subject (case-insensitive)", async () => {
      const results = await provider.sessions.querySessions({ search: "ai innovation" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("s1");
    });

    it("searches in notes", async () => {
      const results = await provider.sessions.querySessions({ search: "machine learning" });
      expect(results).toHaveLength(1);
    });

    it("searches in idea titles and descriptions", async () => {
      const results = await provider.sessions.querySessions({ search: "amazing" });
      expect(results).toHaveLength(1);
    });

    it("returns empty for no match", async () => {
      const results = await provider.sessions.querySessions({ search: "nonexistent" });
      expect(results).toHaveLength(0);
    });
  });

  describe("tag intersection (AND logic)", () => {
    beforeEach(async () => {
      await provider.sessions.saveSession(makeSession({ id: "s1", tags: ["ai", "ml"] }));
      await provider.sessions.saveSession(makeSession({ id: "s2", tags: ["ai", "robotics"] }));
      await provider.sessions.saveSession(makeSession({ id: "s3", tags: ["ml"] }));
    });

    it("requires all tags present (AND)", async () => {
      const results = await provider.sessions.querySessions({ tags: ["ai", "ml"] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("s1");
    });

    it("single tag matches multiple sessions", async () => {
      const results = await provider.sessions.querySessions({ tags: ["ai"] });
      expect(results).toHaveLength(2);
    });
  });

  describe("date range boundary behavior", () => {
    beforeEach(async () => {
      await provider.sessions.saveSession(
        makeSession({ id: "s1", createdAt: "2024-01-01T00:00:00Z" })
      );
      await provider.sessions.saveSession(
        makeSession({ id: "s2", createdAt: "2024-06-01T00:00:00Z" })
      );
      await provider.sessions.saveSession(
        makeSession({ id: "s3", createdAt: "2024-12-01T00:00:00Z" })
      );
    });

    it("fromDate is inclusive (>=)", async () => {
      const results = await provider.sessions.querySessions({
        fromDate: "2024-06-01T00:00:00Z",
      });
      expect(results.map((s) => s.id).sort()).toEqual(["s2", "s3"]);
    });

    it("toDate is inclusive (<=)", async () => {
      const results = await provider.sessions.querySessions({
        toDate: "2024-06-01T00:00:00Z",
      });
      expect(results.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    });

    it("exact date matches both fromDate and toDate", async () => {
      const results = await provider.sessions.querySessions({
        fromDate: "2024-06-01T00:00:00Z",
        toDate: "2024-06-01T00:00:00Z",
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("s2");
    });
  });

  // ---- structuredClone isolation ----
  describe("structuredClone isolation", () => {
    it("mutating returned session does not affect stored data", async () => {
      const session = makeSession({ id: "s1", tags: ["original"] });
      await provider.sessions.saveSession(session);

      const retrieved = await provider.sessions.getSession("s1");
      retrieved!.tags.push("mutated");
      retrieved!.subject = "MUTATED";

      const again = await provider.sessions.getSession("s1");
      expect(again!.tags).toEqual(["original"]);
      expect(again!.subject).toBe("Test subject");
    });

    it("mutating input session after save does not affect stored data", async () => {
      const session = makeSession({ id: "s1", tags: ["original"] });
      await provider.sessions.saveSession(session);

      session.tags.push("mutated-after-save");

      const retrieved = await provider.sessions.getSession("s1");
      expect(retrieved!.tags).toEqual(["original"]);
    });
  });

  // ---- Workspace CRUD ----
  describe("workspace CRUD with listing", () => {
    it("saves, gets, lists, and deletes workspaces", async () => {
      const ws1 = {
        id: "ws-1",
        name: "Workspace A",
        description: "desc",
        members: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };
      const ws2 = {
        id: "ws-2",
        name: "Workspace B",
        description: "desc",
        members: [],
        createdAt: "2024-06-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      };

      await provider.workspaces.saveWorkspace(ws1 as never);
      await provider.workspaces.saveWorkspace(ws2 as never);

      const list = await provider.workspaces.listWorkspaces();
      expect(list).toHaveLength(2);
      // Sorted by updatedAt descending
      expect(list[0].id).toBe("ws-2");

      expect(await provider.workspaces.deleteWorkspace("ws-1")).toBe(true);
      expect(await provider.workspaces.getWorkspace("ws-1")).toBeUndefined();
    });
  });

  // ---- API Key findApiKeyByValue ----
  describe("API key findApiKeyByValue", () => {
    it("returns correct key when multiple exist", async () => {
      const key1 = {
        id: "k1",
        key: "sk-aaa",
        name: "Key A",
        tier: "free",
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: {},
        scopes: [],
      };
      const key2 = {
        id: "k2",
        key: "sk-bbb",
        name: "Key B",
        tier: "pro",
        createdAt: new Date().toISOString(),
        enabled: true,
        rateLimit: {},
        scopes: [],
      };
      await provider.apiGateway.saveApiKey(key1 as never);
      await provider.apiGateway.saveApiKey(key2 as never);

      const found = await provider.apiGateway.findApiKeyByValue("sk-bbb");
      expect(found).toBeDefined();
      expect(found!.id).toBe("k2");
    });

    it("returns undefined for nonexistent key value", async () => {
      const found = await provider.apiGateway.findApiKeyByValue("sk-nonexistent");
      expect(found).toBeUndefined();
    });
  });

  // ---- Usage records filtered by keyId + date range ----
  describe("usage records filtering", () => {
    beforeEach(async () => {
      const records = [
        { keyId: "k1", endpoint: "/a", timestamp: "2024-01-01T00:00:00Z", tokens: 10 },
        { keyId: "k1", endpoint: "/b", timestamp: "2024-06-01T00:00:00Z", tokens: 20 },
        { keyId: "k2", endpoint: "/a", timestamp: "2024-06-01T00:00:00Z", tokens: 30 },
      ];
      for (const r of records) {
        await provider.apiGateway.recordUsage(r as never);
      }
    });

    it("filters by keyId", async () => {
      expect(await provider.apiGateway.getUsageRecords("k1")).toHaveLength(2);
      expect(await provider.apiGateway.getUsageRecords("k2")).toHaveLength(1);
    });

    it("filters by keyId + since", async () => {
      const result = await provider.apiGateway.getUsageRecords("k1", "2024-05-01T00:00:00Z");
      expect(result).toHaveLength(1);
    });

    it("returns empty for nonexistent keyId", async () => {
      expect(await provider.apiGateway.getUsageRecords("k-nonexistent")).toHaveLength(0);
    });
  });

  // ---- Collaboration findByCode ----
  describe("collaboration findByCode", () => {
    it("returns session matching join code", async () => {
      const session = {
        id: "collab-1",
        roomCode: "JOIN123",
        status: "active",
        participants: [],
        createdAt: new Date().toISOString(),
      };
      await provider.collaboration.saveSession(session as never);

      const found = await provider.collaboration.findByCode("JOIN123");
      expect(found).toBeDefined();
      expect(found!.id).toBe("collab-1");
    });

    it("returns undefined for wrong code", async () => {
      const found = await provider.collaboration.findByCode("WRONG");
      expect(found).toBeUndefined();
    });
  });

  // ---- Analytics ----
  describe("analytics readEvents and clearEvents", () => {
    it("readEvents returns all tracked events", async () => {
      await provider.analytics.trackEvent({
        id: "e1",
        type: "start",
        timestamp: "2024-01-01T00:00:00Z",
      } as never);
      await provider.analytics.trackEvent({
        id: "e2",
        type: "end",
        timestamp: "2024-06-01T00:00:00Z",
      } as never);

      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(2);
    });

    it("clearEvents empties store", async () => {
      await provider.analytics.trackEvent({
        id: "e1",
        type: "start",
        timestamp: "2024-01-01T00:00:00Z",
      } as never);
      await provider.analytics.clearEvents();
      const events = await provider.analytics.readEvents();
      expect(events).toHaveLength(0);
    });

    it("readEvents with limit", async () => {
      for (let i = 0; i < 5; i++) {
        await provider.analytics.trackEvent({
          id: `e${i}`,
          type: "test",
          timestamp: `2024-0${i + 1}-01T00:00:00Z`,
        } as never);
      }
      const limited = await provider.analytics.readEvents(2);
      expect(limited).toHaveLength(2);
    });
  });

  // ---- Knowledge Graph ----
  describe("knowledge graph roundtrip", () => {
    it("preserves graph structure after save/load", async () => {
      const graph = {
        nodes: [
          { id: "n1", label: "AI", type: "concept" },
          { id: "n2", label: "ML", type: "technology" },
        ],
        edges: [{ source: "n1", target: "n2", type: "related-to" }],
        lastUpdated: "2024-01-01T00:00:00Z",
        sessionCount: 3,
      };
      await provider.knowledgeGraph.saveGraph(graph as never);
      const loaded = await provider.knowledgeGraph.loadGraph();
      expect(loaded).toBeDefined();
      expect((loaded as any).nodes).toHaveLength(2);
      expect((loaded as any).edges).toHaveLength(1);
      expect((loaded as { edges: Array<{ source: string }> }).edges[0].source).toBe("n1");
    });

    it("clone isolation: mutation doesn't affect stored", async () => {
      const graph = { nodes: [{ id: "n1" }], edges: [] };
      await provider.knowledgeGraph.saveGraph(graph as never);
      const loaded = await provider.knowledgeGraph.loadGraph();
      (loaded as { nodes: Array<{ id: string }> }).nodes.push({ id: "n2" });

      const loaded2 = await provider.knowledgeGraph.loadGraph();
      expect((loaded2 as any).nodes).toHaveLength(1);
    });
  });
});
