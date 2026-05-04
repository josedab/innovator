import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExistsSync, mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}));

vi.mock("node:os", () => ({
  homedir: () => "/mock-home",
}));

import { migrateFileDataToStorage } from "./migrate.js";
import { InMemoryStorageProvider } from "./memory.js";

describe("migrateFileDataToStorage", () => {
  let storage: InMemoryStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new InMemoryStorageProvider();
    // Default: all directories/files don't exist
    mockExistsSync.mockReturnValue(false);
  });

  it("migrates sessions from history/*.json", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("history")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["session1.json", "session2.json", "readme.txt"]);
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes("session1.json")) {
        return JSON.stringify({
          id: "s1",
          subject: "AI",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          angleResults: [],
          tags: [],
        });
      }
      if (path.includes("session2.json")) {
        return JSON.stringify({
          id: "s2",
          subject: "Quantum",
          createdAt: "2024-02-01T00:00:00Z",
          updatedAt: "2024-02-01T00:00:00Z",
          angleResults: [],
          tags: [],
        });
      }
      return "{}";
    });

    const result = await migrateFileDataToStorage(storage);
    expect(result.sessions).toBe(2);
    expect(result.errors).toHaveLength(0);

    const sessions = await storage.sessions.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("migrates workspaces", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("workspaces")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["ws1.json"]);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ id: "ws1", name: "WS1", updatedAt: "2024-01-01T00:00:00Z" })
    );

    const result = await migrateFileDataToStorage(storage);
    expect(result.workspaces).toBe(1);
  });

  it("migrates analytics JSONL", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("events.jsonl")) return true;
      return false;
    });
    const lines = [
      JSON.stringify({ id: "e1", type: "start", timestamp: "2024-01-01T00:00:00Z" }),
      JSON.stringify({ id: "e2", type: "end", timestamp: "2024-02-01T00:00:00Z" }),
    ].join("\n");
    mockReadFileSync.mockReturnValue(lines);

    const result = await migrateFileDataToStorage(storage);
    expect(result.analyticsEvents).toBe(2);
  });

  it("migrates knowledge graph", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("graph.json")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        nodes: [{ id: "n1", label: "AI" }],
        edges: [],
        lastUpdated: "2024-01-01T00:00:00Z",
      })
    );

    const result = await migrateFileDataToStorage(storage);
    expect(result.knowledgeGraph).toBe(true);
  });

  it("partial migration: corrupt files log errors, continues with rest", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("history")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["good.json", "bad.json"]);
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes("bad.json")) return "not valid json {{{";
      return JSON.stringify({
        id: "s1",
        subject: "Good",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        angleResults: [],
        tags: [],
      });
    });

    const result = await migrateFileDataToStorage(storage);
    expect(result.sessions).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("bad.json");
  });

  it("empty directories produce zero counts with no errors", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("history") || path.includes("workspaces")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue([]);

    const result = await migrateFileDataToStorage(storage);
    expect(result.sessions).toBe(0);
    expect(result.workspaces).toBe(0);
    expect(result.analyticsEvents).toBe(0);
    expect(result.knowledgeGraph).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it("missing ~/.innovator/ directory produces graceful empty result", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await migrateFileDataToStorage(storage);
    expect(result.sessions).toBe(0);
    expect(result.workspaces).toBe(0);
    expect(result.analyticsEvents).toBe(0);
    expect(result.knowledgeGraph).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it("duplicate migration (run twice) is idempotent", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("history")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["s1.json"]);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        id: "s1",
        subject: "Test",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        angleResults: [],
        tags: [],
      })
    );

    await migrateFileDataToStorage(storage);
    const result2 = await migrateFileDataToStorage(storage);
    expect(result2.sessions).toBe(1);

    // Should overwrite, not duplicate
    const sessions = await storage.sessions.listSessions();
    expect(sessions).toHaveLength(1);
  });

  it("non-.json files are skipped", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes("history")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["file.txt", "readme.md", "data.json"]);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        id: "s1",
        subject: "Test",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        angleResults: [],
        tags: [],
      })
    );

    const result = await migrateFileDataToStorage(storage);
    expect(result.sessions).toBe(1);
  });
});
