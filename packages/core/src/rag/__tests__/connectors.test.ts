import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerConnector,
  listConnectors,
  removeConnector,
  syncConnector,
  buildContextInjection,
  clearConnectors,
  GitHubConnector,
  ConfluenceConnector,
  NotionConnector,
  LocalFileConnector,
  type ConnectorConfig,
} from "../connectors.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("rag connectors", () => {
  beforeEach(() => {
    clearConnectors();
    vi.clearAllMocks();
  });

  describe("registerConnector / listConnectors / removeConnector", () => {
    it("registers a connector", () => {
      const config: ConnectorConfig = {
        id: "gh1",
        type: "github",
        name: "My GitHub",
        enabled: true,
        config: { repo: "owner/repo" },
        syncIntervalMinutes: 60,
      };
      registerConnector(config);
      const list = listConnectors();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("gh1");
      expect(list[0].status.status).toBe("idle");
    });

    it("listConnectors returns all registered", () => {
      registerConnector({
        id: "c1",
        type: "github",
        name: "A",
        enabled: true,
        config: {},
        syncIntervalMinutes: 60,
      });
      registerConnector({
        id: "c2",
        type: "notion",
        name: "B",
        enabled: true,
        config: {},
        syncIntervalMinutes: 60,
      });
      expect(listConnectors()).toHaveLength(2);
    });

    it("removeConnector removes a connector", () => {
      registerConnector({
        id: "c1",
        type: "github",
        name: "A",
        enabled: true,
        config: {},
        syncIntervalMinutes: 60,
      });
      const removed = removeConnector("c1");
      expect(removed).toBe(true);
      expect(listConnectors()).toHaveLength(0);
    });

    it("removeConnector returns true even for non-existent", () => {
      expect(removeConnector("nonexistent")).toBe(true);
    });
  });

  describe("GitHubConnector", () => {
    it("fetches README via GitHub API", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: Buffer.from("# Hello World").toString("base64"),
          name: "README.md",
          path: "README.md",
        }),
      });

      const docs = await GitHubConnector.fetchDocuments({ repo: "owner/repo" });
      expect(docs).toHaveLength(1);
      expect(docs[0].content).toBe("# Hello World");
      expect(docs[0].source).toBe("github:owner/repo");
    });

    it("includes auth header when token provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: "", name: "README.md" }),
      });

      await GitHubConnector.fetchDocuments({ repo: "o/r", token: "ghp_xxx" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer ghp_xxx" }),
        })
      );
    });

    it("throws on 404", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(GitHubConnector.fetchDocuments({ repo: "o/r" })).rejects.toThrow("GitHub");
    });

    it("throws when repo not provided", async () => {
      await expect(GitHubConnector.fetchDocuments({})).rejects.toThrow("requires 'repo'");
    });
  });

  describe("ConfluenceConnector", () => {
    it("fetches pages from Confluence API", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ id: "p1", title: "Page 1", body: { storage: { value: "<p>Content</p>" } } }],
        }),
      });

      const docs = await ConfluenceConnector.fetchDocuments({
        baseUrl: "https://wiki.example.com",
        spaceKey: "ENG",
      });
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe("Page 1");
    });

    it("throws on auth failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(
        ConfluenceConnector.fetchDocuments({
          baseUrl: "https://wiki.example.com",
          spaceKey: "ENG",
        })
      ).rejects.toThrow("Confluence");
    });

    it("throws when missing config", async () => {
      await expect(ConfluenceConnector.fetchDocuments({})).rejects.toThrow(
        "requires 'baseUrl' and 'spaceKey'"
      );
    });
  });

  describe("NotionConnector", () => {
    it("fetches pages from Notion database", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "page1",
              properties: {
                Name: { title: [{ plain_text: "My Page" }] },
              },
            },
          ],
        }),
      });

      const docs = await NotionConnector.fetchDocuments({
        apiKey: "ntn_xxx",
        databaseId: "db1",
      });
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe("My Page");
    });

    it("handles pages with no title property", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ id: "page1", properties: {} }],
        }),
      });

      const docs = await NotionConnector.fetchDocuments({
        apiKey: "ntn_xxx",
        databaseId: "db1",
      });
      expect(docs[0].title).toBe("Untitled");
    });

    it("throws when missing config", async () => {
      await expect(NotionConnector.fetchDocuments({})).rejects.toThrow(
        "requires 'apiKey' and 'databaseId'"
      );
    });
  });

  describe("LocalFileConnector", () => {
    it("throws when path not provided", async () => {
      await expect(LocalFileConnector.fetchDocuments({})).rejects.toThrow("requires 'path'");
    });

    it("throws when file not found", async () => {
      await expect(
        LocalFileConnector.fetchDocuments({ path: "/nonexistent/path/file.md" })
      ).rejects.toThrow();
    });
  });

  describe("syncConnector", () => {
    it("transitions status: idle → syncing → connected on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: Buffer.from("content").toString("base64"),
          name: "README.md",
        }),
      });

      registerConnector({
        id: "gh1",
        type: "github",
        name: "My GH",
        enabled: true,
        config: { repo: "o/r" },
        syncIntervalMinutes: 60,
      });

      // Check initial idle status
      expect(listConnectors()[0].status.status).toBe("idle");

      const docs = await syncConnector("gh1");
      expect(docs.length).toBeGreaterThan(0);

      // Check connected status after sync
      const updated = listConnectors()[0];
      expect(updated.status.status).toBe("connected");
      expect(updated.status.documentsIndexed).toBeGreaterThan(0);
    });

    it("transitions to error status on failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });

      registerConnector({
        id: "gh1",
        type: "github",
        name: "My GH",
        enabled: true,
        config: { repo: "o/r" },
        syncIntervalMinutes: 60,
      });

      await expect(syncConnector("gh1")).rejects.toThrow();
      expect(listConnectors()[0].status.status).toBe("error");
      expect(listConnectors()[0].status.lastError).toBeTruthy();
    });

    it("throws for non-existent connector", async () => {
      await expect(syncConnector("nonexistent")).rejects.toThrow("Connector not found");
    });
  });

  describe("buildContextInjection", () => {
    it("formats search results with source and relevance", () => {
      const results = [
        {
          chunk: { content: "Some relevant content" },
          document: { title: "Doc 1", source: "github:repo" },
          score: 0.95,
        },
      ];
      const injection = buildContextInjection(results);
      expect(injection).toContain("RELEVANT CONTEXT");
      expect(injection).toContain("Doc 1");
      expect(injection).toContain("95%");
      expect(injection).toContain("Some relevant content");
    });

    it("truncates at maxLength (default 3000)", () => {
      const results = Array.from({ length: 50 }, (_, i) => ({
        chunk: { content: "x".repeat(200) },
        document: { title: `Doc ${i}`, source: "src" },
        score: 0.5,
      }));
      const injection = buildContextInjection(results);
      expect(injection.length).toBeLessThanOrEqual(3200); // some header overhead
    });

    it("respects custom maxLength", () => {
      const results = [
        {
          chunk: { content: "x".repeat(500) },
          document: { title: "Doc", source: "src" },
          score: 0.5,
        },
      ];
      const injection = buildContextInjection(results, 100);
      expect(injection.length).toBeLessThanOrEqual(200);
    });

    it("returns empty string for empty results", () => {
      expect(buildContextInjection([])).toBe("");
    });
  });

  describe("clearConnectors", () => {
    it("removes all connectors", () => {
      registerConnector({
        id: "c1",
        type: "github",
        name: "A",
        enabled: true,
        config: {},
        syncIntervalMinutes: 60,
      });
      clearConnectors();
      expect(listConnectors()).toHaveLength(0);
    });
  });
});
