/**
 * @module rag/connectors
 *
 * Knowledge source connectors for RAG context grounding.
 * Provides pluggable connectors for GitHub, Confluence, Notion, and local files.
 */

import { z } from "zod";
import type { KnowledgeDocument } from "./types.js";
import { ConfigurationError, ValidationError } from "../errors.js";

// ---- Connector Schemas ----

export const ConnectorTypeSchema = z.enum(["github", "confluence", "notion", "local-file", "url"]);

export const ConnectorConfigSchema = z.object({
  id: z.string().max(100),
  type: ConnectorTypeSchema,
  name: z.string().max(200),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.string()).default({}),
  lastSyncAt: z.string().optional(),
  syncIntervalMinutes: z.number().min(1).max(10080).default(60),
});

export const ConnectorStatusSchema = z.object({
  connectorId: z.string().max(100),
  status: z.enum(["idle", "syncing", "error", "connected"]),
  documentsIndexed: z.number().min(0).default(0),
  lastError: z.string().max(1000).optional(),
  lastSyncAt: z.string().optional(),
});

export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;
export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

// ---- Connector Interface ----

export interface KnowledgeConnector {
  type: ConnectorType;
  fetchDocuments(config: Record<string, string>): Promise<KnowledgeDocument[]>;
}

// ---- Built-in Connectors ----

/**
 * GitHub connector — fetches README and markdown files from repos.
 */
export const GitHubConnector: KnowledgeConnector = {
  type: "github",
  async fetchDocuments(config): Promise<KnowledgeDocument[]> {
    const { repo, token, branch } = config;
    if (!repo)
      throw new ConfigurationError("GitHub connector requires 'repo' config (owner/repo)", "repo");

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "innovator-rag",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const url = `https://api.github.com/repos/${repo}/readme${branch ? `?ref=${branch}` : ""}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new ConfigurationError(`GitHub API ${res.status}: ${res.statusText}`);
      const data = (await res.json()) as { content?: string; name?: string; path?: string };
      const content = data.content ? Buffer.from(data.content, "base64").toString("utf-8") : "";

      return [
        {
          id: `github-${repo}-readme`,
          title: `${repo} README`,
          source: `github:${repo}`,
          type: "markdown",
          content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { repo, path: data.path ?? "README.md" },
        },
      ];
    } catch (err) {
      throw new ConfigurationError(
        `GitHub connector error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

/**
 * Confluence connector (stub) — returns mock structure for pages.
 */
export const ConfluenceConnector: KnowledgeConnector = {
  type: "confluence",
  async fetchDocuments(config): Promise<KnowledgeDocument[]> {
    const { baseUrl, spaceKey, token } = config;
    if (!baseUrl || !spaceKey) {
      throw new ConfigurationError("Confluence connector requires 'baseUrl' and 'spaceKey' config");
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const url = `${baseUrl}/rest/api/content?spaceKey=${spaceKey}&limit=10&expand=body.storage`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new ConfigurationError(`Confluence API ${res.status}`);

      const data = (await res.json()) as {
        results?: Array<{
          id: string;
          title: string;
          body?: { storage?: { value?: string } };
        }>;
      };

      return (data.results ?? []).map((page) => ({
        id: `confluence-${page.id}`,
        title: page.title,
        source: `confluence:${spaceKey}/${page.id}`,
        type: "html" as const,
        content: page.body?.storage?.value ?? "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { spaceKey, pageId: page.id },
      }));
    } catch (err) {
      throw new ConfigurationError(
        `Confluence connector error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

/**
 * Notion connector (stub) — fetches pages from a Notion database.
 */
export const NotionConnector: KnowledgeConnector = {
  type: "notion",
  async fetchDocuments(config): Promise<KnowledgeDocument[]> {
    const { apiKey, databaseId } = config;
    if (!apiKey || !databaseId) {
      throw new ConfigurationError("Notion connector requires 'apiKey' and 'databaseId' config");
    }

    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 10 }),
      });

      if (!res.ok) throw new ConfigurationError(`Notion API ${res.status}`);
      const data = (await res.json()) as {
        results?: Array<{
          id: string;
          properties?: Record<string, { title?: Array<{ plain_text: string }> }>;
        }>;
      };

      return (data.results ?? []).map((page) => {
        const titleProp = Object.values(page.properties ?? {}).find((p) => p.title);
        const title = titleProp?.title?.[0]?.plain_text ?? "Untitled";
        return {
          id: `notion-${page.id}`,
          title,
          source: `notion:${databaseId}/${page.id}`,
          type: "text" as const,
          content: title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { databaseId, pageId: page.id },
        };
      });
    } catch (err) {
      throw new ConfigurationError(
        `Notion connector error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

/**
 * Local file connector — reads files from the local filesystem.
 */
export const LocalFileConnector: KnowledgeConnector = {
  type: "local-file",
  async fetchDocuments(config): Promise<KnowledgeDocument[]> {
    const { path } = config;
    if (!path) throw new ConfigurationError("Local file connector requires 'path' config", "path");

    const fs = await import("node:fs");
    const nodePath = await import("node:path");

    if (!fs.existsSync(path)) {
      throw new ValidationError(`File not found: ${path}`);
    }

    const stat = fs.statSync(path);
    if (stat.isFile()) {
      const content = fs.readFileSync(path, "utf-8");
      const ext = nodePath.extname(path).toLowerCase();
      const type = ext === ".md" ? "markdown" : ext === ".html" ? "html" : "text";
      return [
        {
          id: `local-${nodePath.basename(path)}`,
          title: nodePath.basename(path),
          source: `file:${path}`,
          type: type as "markdown" | "html" | "text",
          content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { path },
        },
      ];
    }

    // Directory: read all text/md files
    const files = fs.readdirSync(path).filter((f: string) => /\.(md|txt|html)$/.test(f));
    return files.slice(0, 50).map((file: string) => {
      const filePath = nodePath.join(path, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const ext = nodePath.extname(file).toLowerCase();
      const type = ext === ".md" ? "markdown" : ext === ".html" ? "html" : "text";
      return {
        id: `local-${file}`,
        title: file,
        source: `file:${filePath}`,
        type: type as "markdown" | "html" | "text",
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { path: filePath },
      };
    });
  },
};

// ---- Connector Registry ----

const connectorRegistry = new Map<ConnectorType, KnowledgeConnector>([
  ["github", GitHubConnector],
  ["confluence", ConfluenceConnector],
  ["notion", NotionConnector],
  ["local-file", LocalFileConnector],
]);

const connectorConfigs = new Map<string, ConnectorConfig>();
const connectorStatuses = new Map<string, ConnectorStatus>();

/**
 * Register a knowledge source connector.
 */
export function registerConnector(config: ConnectorConfig): void {
  connectorConfigs.set(config.id, config);
  connectorStatuses.set(config.id, {
    connectorId: config.id,
    status: "idle",
    documentsIndexed: 0,
  });
}

/**
 * List all registered connectors.
 */
export function listConnectors(): Array<ConnectorConfig & { status: ConnectorStatus }> {
  return [...connectorConfigs.values()].map((c) => ({
    ...c,
    status: connectorStatuses.get(c.id) ?? {
      connectorId: c.id,
      status: "idle",
      documentsIndexed: 0,
    },
  }));
}

/**
 * Sync a connector, fetching documents from the source.
 */
export async function syncConnector(connectorId: string): Promise<KnowledgeDocument[]> {
  const config = connectorConfigs.get(connectorId);
  if (!config) throw new ValidationError(`Connector not found: ${connectorId}`);

  const connector = connectorRegistry.get(config.type);
  if (!connector)
    throw new ConfigurationError(`No connector implementation for type: ${config.type}`);

  const status = connectorStatuses.get(connectorId)!;
  status.status = "syncing";

  try {
    const docs = await connector.fetchDocuments(config.config);
    status.status = "connected";
    status.documentsIndexed = docs.length;
    status.lastSyncAt = new Date().toISOString();
    status.lastError = undefined;
    config.lastSyncAt = status.lastSyncAt;
    return docs;
  } catch (err) {
    status.status = "error";
    status.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/**
 * Remove a connector.
 */
export function removeConnector(connectorId: string): boolean {
  connectorConfigs.delete(connectorId);
  connectorStatuses.delete(connectorId);
  return true;
}

/**
 * Build context injection text from search results for LLM prompts.
 */
export function buildContextInjection(
  searchResults: Array<{
    chunk: { content: string };
    document: { title: string; source: string };
    score: number;
  }>,
  maxLength: number = 3000
): string {
  if (searchResults.length === 0) return "";

  const lines: string[] = ["RELEVANT CONTEXT FROM KNOWLEDGE BASE:", ""];

  let currentLength = lines.join("\n").length;
  for (const result of searchResults) {
    const entry = `[Source: ${result.document.title} (${result.document.source}), Relevance: ${Math.round(result.score * 100)}%]\n${result.chunk.content}\n`;
    if (currentLength + entry.length > maxLength) break;
    lines.push(entry);
    currentLength += entry.length;
  }

  return lines.join("\n");
}

/** Clear all connector data (for testing). */
export function clearConnectors(): void {
  connectorConfigs.clear();
  connectorStatuses.clear();
}
