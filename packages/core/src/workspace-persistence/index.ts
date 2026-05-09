/**
 * @module workspace-persistence
 *
 * Named innovation projects with team context and persistent storage.
 * Supports PostgreSQL-backed workspaces that maintain full context including
 * subjects, investigation results, ideas, scores, and collaboration state.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  DatabaseDriver,
  Migration,
  QueryCondition,
} from "../storage/drivers/types.js";

// ── Zod Schemas & Types ─────────────────────────────────────────────────────

export const ProjectSettingsSchema = z.object({
  defaultModel: z.string().max(200).optional(),
  defaultAngles: z.array(z.string().max(100)).max(20).optional(),
  autoScore: z.boolean().optional(),
  autoValidate: z.boolean().optional(),
  notificationPrefs: z
    .object({
      email: z.boolean().optional(),
      inApp: z.boolean().optional(),
      digest: z.enum(["none", "daily", "weekly"]).optional(),
    })
    .optional(),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const InnovationProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  ownerId: z.string().min(1).max(200),
  teamMembers: z
    .array(
      z.object({
        userId: z.string().min(1).max(200),
        role: z.enum(["admin", "editor", "viewer"]),
        joinedAt: z.string(),
      })
    )
    .optional(),
  status: z.enum(["active", "archived", "completed"]),
  settings: ProjectSettingsSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type InnovationProject = z.infer<typeof InnovationProjectSchema>;

export const ProjectSessionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  subject: z.string().max(2000),
  investigation: z.unknown().optional(),
  angleResults: z.unknown().optional(),
  synthesis: z.unknown().optional(),
  scores: z.unknown().optional(),
  notes: z.string().max(10000).optional(),
  createdAt: z.string(),
});

export type ProjectSession = z.infer<typeof ProjectSessionSchema>;

export const TeamContextSchema = z.object({
  projectId: z.string().uuid(),
  sharedInsights: z.array(z.string().max(2000)).max(200).optional(),
  pinnedIdeas: z.array(z.string().max(2000)).max(100).optional(),
  tags: z.array(z.string().max(100)).max(100).optional(),
  customAngles: z.array(z.string().max(200)).max(50).optional(),
});

export type TeamContext = z.infer<typeof TeamContextSchema>;

export const ProjectSnapshotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  timestamp: z.string(),
  sessionCount: z.number().int().min(0),
  topIdeas: z.array(z.string().max(2000)).max(50).optional(),
  summary: z.string().max(5000).optional(),
});

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

export const ProjectSearchQuerySchema = z.object({
  query: z.string().max(500),
  status: z.enum(["active", "archived", "completed"]).optional(),
  ownerId: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  dateRange: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
});

export type ProjectSearchQuery = z.infer<typeof ProjectSearchQuerySchema>;

// ── Storage Abstraction ─────────────────────────────────────────────────────

export interface ProjectStore {
  // Projects
  createProject(project: InnovationProject): Promise<InnovationProject>;
  getProject(id: string): Promise<InnovationProject | undefined>;
  updateProject(
    id: string,
    updates: Partial<Omit<InnovationProject, "id" | "createdAt">>
  ): Promise<InnovationProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
  listProjects(filter?: {
    status?: string;
    ownerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<InnovationProject[]>;
  searchProjects(query: ProjectSearchQuery): Promise<InnovationProject[]>;

  // Sessions
  addSession(session: ProjectSession): Promise<ProjectSession>;
  getSession(id: string): Promise<ProjectSession | undefined>;
  getProjectSessions(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ProjectSession[]>;

  // Snapshots
  createSnapshot(snapshot: ProjectSnapshot): Promise<ProjectSnapshot>;
  getProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]>;

  // Team context
  getTeamContext(projectId: string): Promise<TeamContext | undefined>;
  updateTeamContext(
    projectId: string,
    context: Partial<Omit<TeamContext, "projectId">>
  ): Promise<TeamContext>;
}

// ── PostgresProjectStore ────────────────────────────────────────────────────

export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly driver: DatabaseDriver) {}

  async createProject(project: InnovationProject): Promise<InnovationProject> {
    await this.driver.insert({
      table: "innovation_projects",
      data: {
        id: project.id,
        name: project.name,
        description: project.description ?? null,
        owner_id: project.ownerId,
        team_members: JSON.stringify(project.teamMembers ?? []),
        status: project.status,
        settings: JSON.stringify(project.settings ?? {}),
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      },
    });
    return project;
  }

  async getProject(id: string): Promise<InnovationProject | undefined> {
    const row = await this.driver.queryOne<Record<string, unknown>>({
      table: "innovation_projects",
      conditions: [{ field: "id", operator: "eq", value: id }],
    });
    return row ? this.rowToProject(row) : undefined;
  }

  async updateProject(
    id: string,
    updates: Partial<Omit<InnovationProject, "id" | "createdAt">>
  ): Promise<InnovationProject | undefined> {
    const data: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined)
      data.description = updates.description;
    if (updates.ownerId !== undefined) data.owner_id = updates.ownerId;
    if (updates.teamMembers !== undefined)
      data.team_members = JSON.stringify(updates.teamMembers);
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.settings !== undefined)
      data.settings = JSON.stringify(updates.settings);

    const affected = await this.driver.update({
      table: "innovation_projects",
      data,
      conditions: [{ field: "id", operator: "eq", value: id }],
    });
    if (affected === 0) return undefined;
    return this.getProject(id);
  }

  async deleteProject(id: string): Promise<boolean> {
    const affected = await this.driver.delete({
      table: "innovation_projects",
      conditions: [{ field: "id", operator: "eq", value: id }],
    });
    return affected > 0;
  }

  async listProjects(filter?: {
    status?: string;
    ownerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<InnovationProject[]> {
    const conditions: QueryCondition[] = [];
    if (filter?.status)
      conditions.push({ field: "status", operator: "eq", value: filter.status });
    if (filter?.ownerId)
      conditions.push({
        field: "owner_id",
        operator: "eq",
        value: filter.ownerId,
      });

    const rows = await this.driver.query<Record<string, unknown>>({
      table: "innovation_projects",
      conditions,
      orderBy: [{ field: "updated_at", direction: "desc" }],
      limit: filter?.limit ?? 100,
      offset: filter?.offset ?? 0,
    });
    return rows.map((r) => this.rowToProject(r));
  }

  async searchProjects(
    query: ProjectSearchQuery
  ): Promise<InnovationProject[]> {
    const conditions: QueryCondition[] = [];
    if (query.status)
      conditions.push({ field: "status", operator: "eq", value: query.status });
    if (query.ownerId)
      conditions.push({
        field: "owner_id",
        operator: "eq",
        value: query.ownerId,
      });
    if (query.dateRange?.from)
      conditions.push({
        field: "created_at",
        operator: "gte",
        value: query.dateRange.from,
      });
    if (query.dateRange?.to)
      conditions.push({
        field: "created_at",
        operator: "lte",
        value: query.dateRange.to,
      });

    // Use LIKE for full-text search on name and description
    if (query.query) {
      const params: unknown[] = [`%${query.query}%`];
      const clauses: string[] = [];
      if (query.status) {
        params.push(query.status);
        clauses.push(`AND status = $${params.length}`);
      }
      if (query.ownerId) {
        params.push(query.ownerId);
        clauses.push(`AND owner_id = $${params.length}`);
      }
      const rows = await this.driver.rawQuery<Record<string, unknown>>(
        `SELECT * FROM innovation_projects
         WHERE (name ILIKE $1 OR description ILIKE $1)
         ${clauses.join(" ")}
         ORDER BY updated_at DESC
         LIMIT 100`,
        params
      );
      return rows.map((r) => this.rowToProject(r));
    }

    const rows = await this.driver.query<Record<string, unknown>>({
      table: "innovation_projects",
      conditions,
      orderBy: [{ field: "updated_at", direction: "desc" }],
      limit: 100,
    });
    return rows.map((r) => this.rowToProject(r));
  }

  async addSession(session: ProjectSession): Promise<ProjectSession> {
    await this.driver.insert({
      table: "project_sessions",
      data: {
        id: session.id,
        project_id: session.projectId,
        subject: session.subject,
        investigation: JSON.stringify(session.investigation ?? null),
        angle_results: JSON.stringify(session.angleResults ?? null),
        synthesis: JSON.stringify(session.synthesis ?? null),
        scores: JSON.stringify(session.scores ?? null),
        notes: session.notes ?? null,
        created_at: session.createdAt,
      },
    });
    return session;
  }

  async getSession(id: string): Promise<ProjectSession | undefined> {
    const row = await this.driver.queryOne<Record<string, unknown>>({
      table: "project_sessions",
      conditions: [{ field: "id", operator: "eq", value: id }],
    });
    return row ? this.rowToSession(row) : undefined;
  }

  async getProjectSessions(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ProjectSession[]> {
    const rows = await this.driver.query<Record<string, unknown>>({
      table: "project_sessions",
      conditions: [{ field: "project_id", operator: "eq", value: projectId }],
      orderBy: [{ field: "created_at", direction: "desc" }],
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
    return rows.map((r) => this.rowToSession(r));
  }

  async createSnapshot(snapshot: ProjectSnapshot): Promise<ProjectSnapshot> {
    await this.driver.insert({
      table: "project_snapshots",
      data: {
        id: snapshot.id,
        project_id: snapshot.projectId,
        timestamp: snapshot.timestamp,
        session_count: snapshot.sessionCount,
        top_ideas: JSON.stringify(snapshot.topIdeas ?? []),
        summary: snapshot.summary ?? null,
      },
    });
    return snapshot;
  }

  async getProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const rows = await this.driver.query<Record<string, unknown>>({
      table: "project_snapshots",
      conditions: [{ field: "project_id", operator: "eq", value: projectId }],
      orderBy: [{ field: "timestamp", direction: "desc" }],
    });
    return rows.map((r) => this.rowToSnapshot(r));
  }

  async getTeamContext(projectId: string): Promise<TeamContext | undefined> {
    const row = await this.driver.queryOne<Record<string, unknown>>({
      table: "team_contexts",
      conditions: [{ field: "project_id", operator: "eq", value: projectId }],
    });
    return row ? this.rowToTeamContext(row) : undefined;
  }

  async updateTeamContext(
    projectId: string,
    context: Partial<Omit<TeamContext, "projectId">>
  ): Promise<TeamContext> {
    const existing = await this.getTeamContext(projectId);
    if (existing) {
      const data: Record<string, unknown> = {};
      if (context.sharedInsights !== undefined)
        data.shared_insights = JSON.stringify(context.sharedInsights);
      if (context.pinnedIdeas !== undefined)
        data.pinned_ideas = JSON.stringify(context.pinnedIdeas);
      if (context.tags !== undefined) data.tags = JSON.stringify(context.tags);
      if (context.customAngles !== undefined)
        data.custom_angles = JSON.stringify(context.customAngles);

      await this.driver.update({
        table: "team_contexts",
        data,
        conditions: [{ field: "project_id", operator: "eq", value: projectId }],
      });
    } else {
      await this.driver.insert({
        table: "team_contexts",
        data: {
          project_id: projectId,
          shared_insights: JSON.stringify(context.sharedInsights ?? []),
          pinned_ideas: JSON.stringify(context.pinnedIdeas ?? []),
          tags: JSON.stringify(context.tags ?? []),
          custom_angles: JSON.stringify(context.customAngles ?? []),
        },
      });
    }

    return (await this.getTeamContext(projectId))!;
  }

  // ── Row mappers ───────────────────────────────────────────────────────

  private rowToProject(row: Record<string, unknown>): InnovationProject {
    return InnovationProjectSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      ownerId: row.owner_id,
      teamMembers: parseJson(row.team_members as string, []),
      status: row.status,
      settings: parseJson(row.settings as string, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private rowToSession(row: Record<string, unknown>): ProjectSession {
    return ProjectSessionSchema.parse({
      id: row.id,
      projectId: row.project_id,
      subject: row.subject,
      investigation: parseJson(row.investigation as string, undefined),
      angleResults: parseJson(row.angle_results as string, undefined),
      synthesis: parseJson(row.synthesis as string, undefined),
      scores: parseJson(row.scores as string, undefined),
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    });
  }

  private rowToSnapshot(row: Record<string, unknown>): ProjectSnapshot {
    return ProjectSnapshotSchema.parse({
      id: row.id,
      projectId: row.project_id,
      timestamp: row.timestamp,
      sessionCount: row.session_count,
      topIdeas: parseJson(row.top_ideas as string, []),
      summary: row.summary ?? undefined,
    });
  }

  private rowToTeamContext(row: Record<string, unknown>): TeamContext {
    return TeamContextSchema.parse({
      projectId: row.project_id,
      sharedInsights: parseJson(row.shared_insights as string, []),
      pinnedIdeas: parseJson(row.pinned_ideas as string, []),
      tags: parseJson(row.tags as string, []),
      customAngles: parseJson(row.custom_angles as string, []),
    });
  }
}

// ── InMemoryProjectStore ────────────────────────────────────────────────────

export class InMemoryProjectStore implements ProjectStore {
  private projects = new Map<string, InnovationProject>();
  private sessions = new Map<string, ProjectSession>();
  private snapshots = new Map<string, ProjectSnapshot[]>();
  private teamContexts = new Map<string, TeamContext>();

  async createProject(
    project: InnovationProject
  ): Promise<InnovationProject> {
    this.projects.set(project.id, structuredClone(project));
    return project;
  }

  async getProject(id: string): Promise<InnovationProject | undefined> {
    const p = this.projects.get(id);
    return p ? structuredClone(p) : undefined;
  }

  async updateProject(
    id: string,
    updates: Partial<Omit<InnovationProject, "id" | "createdAt">>
  ): Promise<InnovationProject | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(id, updated);
    return structuredClone(updated);
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async listProjects(filter?: {
    status?: string;
    ownerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<InnovationProject[]> {
    let results = Array.from(this.projects.values());
    if (filter?.status)
      results = results.filter((p) => p.status === filter.status);
    if (filter?.ownerId)
      results = results.filter((p) => p.ownerId === filter.ownerId);
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit).map((p) => structuredClone(p));
  }

  async searchProjects(
    query: ProjectSearchQuery
  ): Promise<InnovationProject[]> {
    const lower = query.query.toLowerCase();
    let results = Array.from(this.projects.values()).filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.description?.toLowerCase().includes(lower) ?? false)
    );
    if (query.status)
      results = results.filter((p) => p.status === query.status);
    if (query.ownerId)
      results = results.filter((p) => p.ownerId === query.ownerId);
    if (query.dateRange?.from)
      results = results.filter((p) => p.createdAt >= query.dateRange!.from!);
    if (query.dateRange?.to)
      results = results.filter((p) => p.createdAt <= query.dateRange!.to!);
    return results
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((p) => structuredClone(p));
  }

  async addSession(session: ProjectSession): Promise<ProjectSession> {
    this.sessions.set(session.id, structuredClone(session));
    return session;
  }

  async getSession(id: string): Promise<ProjectSession | undefined> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : undefined;
  }

  async getProjectSessions(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ProjectSession[]> {
    const results = Array.from(this.sessions.values())
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return results.slice(offset, offset + limit).map((s) => structuredClone(s));
  }

  async createSnapshot(snapshot: ProjectSnapshot): Promise<ProjectSnapshot> {
    const list = this.snapshots.get(snapshot.projectId) ?? [];
    list.push(structuredClone(snapshot));
    this.snapshots.set(snapshot.projectId, list);
    return snapshot;
  }

  async getProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    return (this.snapshots.get(projectId) ?? [])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((s) => structuredClone(s));
  }

  async getTeamContext(projectId: string): Promise<TeamContext | undefined> {
    const ctx = this.teamContexts.get(projectId);
    return ctx ? structuredClone(ctx) : undefined;
  }

  async updateTeamContext(
    projectId: string,
    context: Partial<Omit<TeamContext, "projectId">>
  ): Promise<TeamContext> {
    const existing = this.teamContexts.get(projectId) ?? {
      projectId,
      sharedInsights: [],
      pinnedIdeas: [],
      tags: [],
      customAngles: [],
    };
    const updated = { ...existing, ...context };
    this.teamContexts.set(projectId, updated);
    return structuredClone(updated);
  }
}

// ── Global Store Accessors ──────────────────────────────────────────────────

let _store: ProjectStore = new InMemoryProjectStore();

export function getProjectStore(): ProjectStore {
  return _store;
}

export function setProjectStore(store: ProjectStore): void {
  _store = store;
}

// ── Core Functions ──────────────────────────────────────────────────────────

export async function createProject(
  name: string,
  description: string,
  ownerId: string,
  settings?: ProjectSettings
): Promise<InnovationProject> {
  const now = new Date().toISOString();
  const project: InnovationProject = {
    id: randomUUID(),
    name,
    description,
    ownerId,
    teamMembers: [{ userId: ownerId, role: "admin", joinedAt: now }],
    status: "active",
    settings: settings ?? {},
    createdAt: now,
    updatedAt: now,
  };
  return _store.createProject(project);
}

export async function getProject(
  id: string
): Promise<InnovationProject | undefined> {
  return _store.getProject(id);
}

export async function updateProject(
  id: string,
  updates: Partial<Omit<InnovationProject, "id" | "createdAt">>
): Promise<InnovationProject | undefined> {
  return _store.updateProject(id, updates);
}

export async function archiveProject(
  id: string
): Promise<InnovationProject | undefined> {
  return _store.updateProject(id, { status: "archived" });
}

export async function deleteProject(id: string): Promise<boolean> {
  return _store.deleteProject(id);
}

export async function listProjects(filter?: {
  status?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
}): Promise<InnovationProject[]> {
  return _store.listProjects(filter);
}

export async function addSessionToProject(
  projectId: string,
  session: Omit<ProjectSession, "id" | "projectId" | "createdAt">
): Promise<ProjectSession> {
  const full: ProjectSession = {
    id: randomUUID(),
    projectId,
    createdAt: new Date().toISOString(),
    ...session,
  };
  return _store.addSession(full);
}

export async function getProjectSessions(
  projectId: string,
  options?: { limit?: number; offset?: number }
): Promise<ProjectSession[]> {
  return _store.getProjectSessions(projectId, options);
}

export async function searchProjects(
  query: ProjectSearchQuery
): Promise<InnovationProject[]> {
  return _store.searchProjects(query);
}

export async function addTeamMember(
  projectId: string,
  userId: string,
  role: "admin" | "editor" | "viewer"
): Promise<InnovationProject | undefined> {
  const project = await _store.getProject(projectId);
  if (!project) return undefined;

  const members = project.teamMembers ?? [];
  if (members.some((m) => m.userId === userId)) return project;

  members.push({ userId, role, joinedAt: new Date().toISOString() });
  return _store.updateProject(projectId, { teamMembers: members });
}

export async function removeTeamMember(
  projectId: string,
  userId: string
): Promise<InnovationProject | undefined> {
  const project = await _store.getProject(projectId);
  if (!project) return undefined;

  const members = (project.teamMembers ?? []).filter(
    (m) => m.userId !== userId
  );
  return _store.updateProject(projectId, { teamMembers: members });
}

export async function createSnapshot(
  projectId: string
): Promise<ProjectSnapshot | undefined> {
  const project = await _store.getProject(projectId);
  if (!project) return undefined;

  const sessions = await _store.getProjectSessions(projectId);

  const snapshot: ProjectSnapshot = {
    id: randomUUID(),
    projectId,
    timestamp: new Date().toISOString(),
    sessionCount: sessions.length,
    topIdeas: [],
    summary: `Snapshot of "${project.name}" with ${sessions.length} session(s).`,
  };
  return _store.createSnapshot(snapshot);
}

export interface TimelineEntry {
  type: "project_created" | "session_added" | "snapshot_created";
  timestamp: string;
  details: string;
}

export async function getProjectTimeline(
  projectId: string
): Promise<TimelineEntry[]> {
  const project = await _store.getProject(projectId);
  if (!project) return [];

  const timeline: TimelineEntry[] = [
    {
      type: "project_created",
      timestamp: project.createdAt,
      details: `Project "${project.name}" created`,
    },
  ];

  const sessions = await _store.getProjectSessions(projectId);
  for (const s of sessions) {
    timeline.push({
      type: "session_added",
      timestamp: s.createdAt,
      details: `Session added: ${s.subject}`,
    });
  }

  const snapshots = await _store.getProjectSnapshots(projectId);
  for (const snap of snapshots) {
    timeline.push({
      type: "snapshot_created",
      timestamp: snap.timestamp,
      details: snap.summary ?? "Snapshot created",
    });
  }

  return timeline.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export type ExportFormat = "json" | "markdown";

export async function exportProject(
  projectId: string,
  format: ExportFormat = "json"
): Promise<string | undefined> {
  const project = await _store.getProject(projectId);
  if (!project) return undefined;

  const sessions = await _store.getProjectSessions(projectId);
  const teamContext = await _store.getTeamContext(projectId);
  const snapshots = await _store.getProjectSnapshots(projectId);

  if (format === "markdown") {
    const lines: string[] = [
      `# ${project.name}`,
      "",
      project.description ?? "",
      "",
      `**Status:** ${project.status}`,
      `**Owner:** ${project.ownerId}`,
      `**Created:** ${project.createdAt}`,
      "",
      `## Sessions (${sessions.length})`,
      "",
    ];
    for (const s of sessions) {
      lines.push(`### ${s.subject}`);
      lines.push(`- Created: ${s.createdAt}`);
      if (s.notes) lines.push(`- Notes: ${s.notes}`);
      lines.push("");
    }
    if (teamContext?.tags?.length) {
      lines.push(`## Tags`, "", teamContext.tags.join(", "), "");
    }
    return lines.join("\n");
  }

  return JSON.stringify(
    { project, sessions, teamContext, snapshots },
    null,
    2
  );
}

export async function importProject(
  data: string
): Promise<InnovationProject | undefined> {
  try {
    const parsed = JSON.parse(data) as {
      project: InnovationProject;
      sessions?: ProjectSession[];
      teamContext?: TeamContext;
    };

    const now = new Date().toISOString();
    const newId = randomUUID();
    const project: InnovationProject = {
      ...parsed.project,
      id: newId,
      createdAt: now,
      updatedAt: now,
    };
    await _store.createProject(project);

    if (parsed.sessions) {
      for (const s of parsed.sessions) {
        await _store.addSession({
          ...s,
          id: randomUUID(),
          projectId: newId,
        });
      }
    }

    if (parsed.teamContext) {
      await _store.updateTeamContext(newId, parsed.teamContext);
    }

    return project;
  } catch {
    return undefined;
  }
}

// ── Migrations ──────────────────────────────────────────────────────────────

/** Database migrations for the workspace-persistence module. */
export const PROJECT_MIGRATIONS: Migration[] = [
  {
    version: 100,
    name: "create-innovation-projects",
    up: `
      CREATE TABLE IF NOT EXISTS innovation_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL,
        team_members TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        settings TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        investigation TEXT,
        angle_results TEXT,
        synthesis TEXT,
        scores TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        session_count INTEGER NOT NULL DEFAULT 0,
        top_ideas TEXT DEFAULT '[]',
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS team_contexts (
        project_id TEXT PRIMARY KEY,
        shared_insights TEXT DEFAULT '[]',
        pinned_ideas TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        custom_angles TEXT DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_projects_owner ON innovation_projects(owner_id);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON innovation_projects(status);
      CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON project_sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_snapshots_project ON project_snapshots(project_id);
    `,
    down: `
      DROP TABLE IF EXISTS team_contexts;
      DROP TABLE IF EXISTS project_snapshots;
      DROP TABLE IF EXISTS project_sessions;
      DROP TABLE IF EXISTS innovation_projects;
    `,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
