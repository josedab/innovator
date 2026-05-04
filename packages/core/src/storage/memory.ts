/**
 * @module storage/memory
 *
 * In-memory StorageProvider implementation.
 * Provides backward compatibility — all data lives in process memory
 * and is lost on restart. Suitable for development and testing.
 */

import type {
  StorageProvider,
  SessionStorage,
  WorkspaceStorage,
  ApiGatewayStorage,
  CollaborationStorage,
  AnalyticsStorage,
  KnowledgeGraphStorage,
} from "./types.js";
import type { SessionRecord, HistoryQuery, CollaborativeSession } from "../types.js";
import type { Workspace } from "../workspaces/index.js";
import type { ApiKey, UsageRecord } from "../api-gateway/index.js";
import type { AnalyticsEvent } from "../analytics/index.js";
import type { KnowledgeGraph } from "../knowledge-graph/index.js";

// ---- Session Storage ----

class MemorySessionStorage implements SessionStorage {
  private store = new Map<string, SessionRecord>();

  async saveSession(session: SessionRecord): Promise<void> {
    this.store.set(session.id, structuredClone(session));
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const s = this.store.get(id);
    return s ? structuredClone(s) : undefined;
  }

  async updateSession(id: string, updates: { tags?: string[]; notes?: string }): Promise<boolean> {
    const session = this.store.get(id);
    if (!session) return false;
    if (updates.tags !== undefined) session.tags = updates.tags;
    if (updates.notes !== undefined) session.notes = updates.notes;
    session.updatedAt = new Date().toISOString();
    return true;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async listSessions(): Promise<SessionRecord[]> {
    return Array.from(this.store.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async querySessions(query: HistoryQuery): Promise<SessionRecord[]> {
    let sessions = Array.from(this.store.values());

    if (query.search) {
      const search = query.search.toLowerCase();
      sessions = sessions.filter(
        (s) =>
          s.subject.toLowerCase().includes(search) ||
          s.investigation?.summary?.toLowerCase().includes(search) ||
          s.notes?.toLowerCase().includes(search) ||
          s.angleResults.some((ar) =>
            ar.ideas.some(
              (idea) =>
                idea.title.toLowerCase().includes(search) ||
                idea.description.toLowerCase().includes(search)
            )
          )
      );
    }
    if (query.tags?.length) {
      sessions = sessions.filter((s) => query.tags!.every((tag) => s.tags.includes(tag)));
    }
    if (query.fromDate) {
      sessions = sessions.filter((s) => s.createdAt >= query.fromDate!);
    }
    if (query.toDate) {
      sessions = sessions.filter((s) => s.createdAt <= query.toDate!);
    }
    if (query.angleId) {
      sessions = sessions.filter((s) => s.angleResults.some((ar) => ar.angleId === query.angleId));
    }

    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return sessions.slice(offset, offset + limit);
  }
}

// ---- Workspace Storage ----

class MemoryWorkspaceStorage implements WorkspaceStorage {
  private store = new Map<string, Workspace>();

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.store.set(workspace.id, structuredClone(workspace));
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const w = this.store.get(id);
    return w ? structuredClone(w) : undefined;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return Array.from(this.store.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

// ---- API Gateway Storage ----

class MemoryApiGatewayStorage implements ApiGatewayStorage {
  private keys = new Map<string, ApiKey>();
  private usage: UsageRecord[] = [];
  private webhooks = new Map<string, string[]>();

  async saveApiKey(apiKey: ApiKey): Promise<void> {
    this.keys.set(apiKey.id, structuredClone(apiKey));
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    return this.keys.get(id);
  }

  async findApiKeyByValue(keyValue: string): Promise<ApiKey | undefined> {
    for (const k of this.keys.values()) {
      if (k.key === keyValue) return k;
    }
    return undefined;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    return Array.from(this.keys.values());
  }

  async deleteApiKey(id: string): Promise<boolean> {
    return this.keys.delete(id);
  }

  async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<boolean> {
    const key = this.keys.get(id);
    if (!key) return false;
    Object.assign(key, updates);
    return true;
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    this.usage.push(record);
  }

  async getUsageRecords(keyId: string, since?: string): Promise<UsageRecord[]> {
    return this.usage.filter((r) => r.keyId === keyId && (!since || r.timestamp >= since));
  }

  async saveWebhook(keyId: string, url: string): Promise<void> {
    const urls = this.webhooks.get(keyId) ?? [];
    if (!urls.includes(url)) urls.push(url);
    this.webhooks.set(keyId, urls);
  }

  async getWebhooks(keyId: string): Promise<string[]> {
    return this.webhooks.get(keyId) ?? [];
  }

  async removeWebhook(keyId: string, url: string): Promise<boolean> {
    const urls = this.webhooks.get(keyId);
    if (!urls) return false;
    const idx = urls.indexOf(url);
    if (idx === -1) return false;
    urls.splice(idx, 1);
    return true;
  }
}

// ---- Collaboration Storage ----

class MemoryCollaborationStorage implements CollaborationStorage {
  private store = new Map<string, CollaborativeSession>();

  async saveSession(session: CollaborativeSession): Promise<void> {
    this.store.set(session.id, structuredClone(session));
  }

  async getSession(id: string): Promise<CollaborativeSession | undefined> {
    return this.store.get(id);
  }

  async findByCode(roomCode: string): Promise<CollaborativeSession | undefined> {
    for (const s of this.store.values()) {
      if (s.roomCode === roomCode) return s;
    }
    return undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

// ---- Analytics Storage ----

class MemoryAnalyticsStorage implements AnalyticsStorage {
  private events: AnalyticsEvent[] = [];

  async trackEvent(event: AnalyticsEvent): Promise<void> {
    this.events.push(event);
  }

  async readEvents(limit?: number): Promise<AnalyticsEvent[]> {
    const sorted = [...this.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return limit ? sorted.slice(0, limit) : sorted;
  }

  async clearEvents(): Promise<void> {
    this.events.length = 0;
  }
}

// ---- Knowledge Graph Storage ----

class MemoryKnowledgeGraphStorage implements KnowledgeGraphStorage {
  private graph: KnowledgeGraph | undefined;

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    this.graph = structuredClone(graph);
  }

  async loadGraph(): Promise<KnowledgeGraph | undefined> {
    return this.graph ? structuredClone(this.graph) : undefined;
  }
}

// ---- Provider ----

export class InMemoryStorageProvider implements StorageProvider {
  readonly name = "memory";
  readonly sessions = new MemorySessionStorage();
  readonly workspaces = new MemoryWorkspaceStorage();
  readonly apiGateway = new MemoryApiGatewayStorage();
  readonly collaboration = new MemoryCollaborationStorage();
  readonly analytics = new MemoryAnalyticsStorage();
  readonly knowledgeGraph = new MemoryKnowledgeGraphStorage();

  async initialize(): Promise<void> {
    // No-op for in-memory storage
  }

  async close(): Promise<void> {
    // No-op for in-memory storage
  }
}
