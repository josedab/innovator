/**
 * @module storage/migrate
 *
 * CLI migration tool: reads existing file-based data (~/.innovator/)
 * and imports it into a SQLite database.
 *
 * Usage: npx innovator migrate [--db <path>]
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MigrationResult {
  sessions: number;
  workspaces: number;
  analyticsEvents: number;
  knowledgeGraph: boolean;
  errors: string[];
}

/**
 * Migrate file-based data to the given storage provider.
 */
export async function migrateFileDataToStorage(
  storage: import("./types.js").StorageProvider
): Promise<MigrationResult> {
  const result: MigrationResult = {
    sessions: 0,
    workspaces: 0,
    analyticsEvents: 0,
    knowledgeGraph: false,
    errors: [],
  };

  const baseDir = join(homedir(), ".innovator");

  // --- Sessions ---
  const historyDir = join(baseDir, "history");
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(historyDir, file), "utf-8");
        const session = JSON.parse(raw);
        await storage.sessions.saveSession(session);
        result.sessions++;
      } catch (e) {
        result.errors.push(`Session ${file}: ${(e as Error).message}`);
      }
    }
  }

  // --- Workspaces ---
  const workspacesDir = join(baseDir, "workspaces");
  if (existsSync(workspacesDir)) {
    const files = readdirSync(workspacesDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(workspacesDir, file), "utf-8");
        const workspace = JSON.parse(raw);
        await storage.workspaces.saveWorkspace(workspace);
        result.workspaces++;
      } catch (e) {
        result.errors.push(`Workspace ${file}: ${(e as Error).message}`);
      }
    }
  }

  // --- Analytics ---
  const eventsFile = join(baseDir, "analytics", "events.jsonl");
  if (existsSync(eventsFile)) {
    const lines = readFileSync(eventsFile, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        await storage.analytics.trackEvent(event);
        result.analyticsEvents++;
      } catch (e) {
        result.errors.push(`Analytics event: ${(e as Error).message}`);
      }
    }
  }

  // --- Knowledge Graph ---
  const graphFile = join(baseDir, "knowledge-graph", "graph.json");
  if (existsSync(graphFile)) {
    try {
      const raw = readFileSync(graphFile, "utf-8");
      const graph = JSON.parse(raw);
      await storage.knowledgeGraph.saveGraph(graph);
      result.knowledgeGraph = true;
    } catch (e) {
      result.errors.push(`Knowledge graph: ${(e as Error).message}`);
    }
  }

  return result;
}
