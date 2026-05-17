import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryProjectStore,
  PostgresProjectStore,
  createProject,
  getProject,
  listProjects,
  addSessionToProject,
  searchProjects,
  addTeamMember,
  removeTeamMember,
  createSnapshot,
  exportProject,
  archiveProject,
  importProject,
  getProjectTimeline,
  setProjectStore,
  InnovationProjectSchema,
} from "../workspace-persistence/index.js";
import type { DatabaseDriver } from "../storage/drivers/types.js";

let store: InstanceType<typeof InMemoryProjectStore>;

beforeEach(() => {
  store = new InMemoryProjectStore();
  setProjectStore(store);
});

describe("InnovationProjectSchema", () => {
  it("validates a valid project", () => {
    const project = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Project",
      description: "A test project",
      ownerId: "user-1",
      teamMembers: [{ userId: "user-1", role: "admin", joinedAt: new Date().toISOString() }],
      status: "active",
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = InnovationProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });
});

describe("InMemoryProjectStore CRUD", () => {
  it("creates and retrieves a project", async () => {
    const project = {
      id: "proj-1",
      name: "My Project",
      description: "Description",
      ownerId: "user-1",
      teamMembers: [],
      status: "active" as const,
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const created = await store.createProject(project);
    expect(created.id).toBe("proj-1");

    const retrieved = await store.getProject("proj-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("My Project");
  });

  it("updates a project", async () => {
    const project = {
      id: "proj-2",
      name: "Original",
      description: "Desc",
      ownerId: "user-1",
      teamMembers: [],
      status: "active" as const,
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.createProject(project);
    const updated = await store.updateProject("proj-2", { name: "Updated" });
    expect(updated?.name).toBe("Updated");
  });

  it("deletes a project", async () => {
    const project = {
      id: "proj-3",
      name: "ToDelete",
      description: "Desc",
      ownerId: "user-1",
      teamMembers: [],
      status: "active" as const,
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.createProject(project);
    const deleted = await store.deleteProject("proj-3");
    expect(deleted).toBe(true);
    const retrieved = await store.getProject("proj-3");
    expect(retrieved).toBeUndefined();
  });

  it("lists projects with optional filter", async () => {
    await store.createProject({
      id: "p1",
      name: "P1",
      description: "",
      ownerId: "u1",
      teamMembers: [],
      status: "active",
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.createProject({
      id: "p2",
      name: "P2",
      description: "",
      ownerId: "u2",
      teamMembers: [],
      status: "active",
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const all = await store.listProjects();
    expect(all).toHaveLength(2);
  });

  it("returns undefined for non-existent project", async () => {
    const result = await store.getProject("nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("createProject", () => {
  it("creates a project with name, description, and owner", async () => {
    const project = await createProject("New Proj", "A new project", "user-1");
    expect(project.name).toBe("New Proj");
    expect(project.ownerId).toBe("user-1");
    expect(project.id).toBeDefined();
    expect(project.status).toBe("active");
  });
});

describe("getProject", () => {
  it("retrieves a created project by ID", async () => {
    const created = await createProject("Find Me", "desc", "user-1");
    const found = await getProject(created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe("Find Me");
  });
});

describe("listProjects", () => {
  it("lists all projects", async () => {
    await createProject("P1", "d1", "u1");
    await createProject("P2", "d2", "u1");
    const projects = await listProjects();
    expect(projects).toHaveLength(2);
  });
});

describe("addSessionToProject", () => {
  it("adds a session to an existing project", async () => {
    const project = await createProject("Session Proj", "desc", "user-1");
    const session = await addSessionToProject(project.id, {
      subject: "AI trends",
      investigation: { findings: [] },
      angleResults: [],
    });
    expect(session).toBeDefined();
    expect(session.projectId).toBe(project.id);
    expect(session.subject).toBe("AI trends");
  });
});

describe("searchProjects", () => {
  it("searches projects by query", async () => {
    await createProject("Machine Learning Tools", "ML tools for developers", "u1");
    await createProject("Web Framework", "React-based framework", "u1");
    const results = await searchProjects({ query: "Machine Learning" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((p) => p.name.includes("Machine Learning"))).toBe(true);
  });
});

describe("addTeamMember", () => {
  it("adds a team member to a project", async () => {
    const project = await createProject("Team Proj", "desc", "user-1");
    const updated = await addTeamMember(project.id, "user-2", "editor");
    expect(updated).toBeDefined();
    expect(updated?.teamMembers?.some((m) => m.userId === "user-2")).toBe(true);
  });
});

describe("removeTeamMember", () => {
  it("removes a team member from a project", async () => {
    const project = await createProject("Team Proj 2", "desc", "user-1");
    await addTeamMember(project.id, "user-3", "editor");
    const updated = await removeTeamMember(project.id, "user-3");
    expect(updated).toBeDefined();
    expect(updated?.teamMembers?.some((m) => m.userId === "user-3")).toBe(false);
  });
});

describe("createSnapshot", () => {
  it("creates a snapshot for a project", async () => {
    const project = await createProject("Snapshot Proj", "desc", "user-1");
    const snapshot = await createSnapshot(project.id);
    expect(snapshot).toBeDefined();
    expect(snapshot?.projectId).toBe(project.id);
  });
});

describe("exportProject", () => {
  it("exports a project as JSON string", async () => {
    const project = await createProject("Export Proj", "desc", "user-1");
    const exported = await exportProject(project.id);
    expect(typeof exported).toBe("string");
    const parsed = JSON.parse(exported!);
    expect(parsed.project.name).toBe("Export Proj");
    expect(parsed.sessions).toEqual([]);
  });

  it("returns undefined for non-existent project", async () => {
    const exported = await exportProject("nonexistent");
    expect(exported).toBeUndefined();
  });

  it("exports a project as markdown format", async () => {
    const project = await createProject("Markdown Proj", "A markdown description", "user-1");
    await addSessionToProject(project.id, {
      subject: "First session",
      notes: "Some notes",
    });
    const exported = await exportProject(project.id, "markdown");
    expect(typeof exported).toBe("string");
    expect(exported).toContain("# Markdown Proj");
    expect(exported).toContain("A markdown description");
    expect(exported).toContain("**Status:** active");
    expect(exported).toContain("**Owner:** user-1");
    expect(exported).toContain("First session");
    expect(exported).toContain("Some notes");
  });
});

describe("archiveProject", () => {
  it("archives an active project", async () => {
    const project = await createProject("Archive Me", "desc", "user-1");
    const archived = await archiveProject(project.id);
    expect(archived).toBeDefined();
    expect(archived!.status).toBe("archived");
  });

  it("returns undefined for non-existent project", async () => {
    const result = await archiveProject("nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("importProject", () => {
  it("imports a project from JSON", async () => {
    const project = await createProject("Import Me", "desc", "user-1");
    const exported = await exportProject(project.id);
    const imported = await importProject(exported!);
    expect(imported).toBeDefined();
    expect(imported!.name).toBe("Import Me");
    // Should have a new ID
    expect(imported!.id).not.toBe(project.id);
  });

  it("returns undefined for invalid JSON", async () => {
    const result = await importProject("not json");
    expect(result).toBeUndefined();
  });
});

describe("getProjectTimeline", () => {
  it("returns timeline entries sorted by timestamp descending", async () => {
    const project = await createProject("Timeline Proj", "desc", "user-1");
    await addSessionToProject(project.id, { subject: "Session 1" });
    await createSnapshot(project.id);

    const timeline = await getProjectTimeline(project.id);
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(timeline.some((e) => e.type === "project_created")).toBe(true);
    expect(timeline.some((e) => e.type === "session_added")).toBe(true);
    expect(timeline.some((e) => e.type === "snapshot_created")).toBe(true);
  });

  it("returns empty for non-existent project", async () => {
    const timeline = await getProjectTimeline("nonexistent");
    expect(timeline).toEqual([]);
  });
});

describe("team context", () => {
  it("creates and retrieves team context", async () => {
    const project = await createProject("Team Ctx", "desc", "user-1");
    const ctx = await store.updateTeamContext(project.id, {
      sharedInsights: ["insight 1"],
      tags: ["tag1", "tag2"],
      pinnedIdeas: ["idea1"],
      customAngles: ["angle1"],
    });
    expect(ctx.projectId).toBe(project.id);
    expect(ctx.sharedInsights).toEqual(["insight 1"]);
    expect(ctx.tags).toEqual(["tag1", "tag2"]);

    const retrieved = await store.getTeamContext(project.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.sharedInsights).toEqual(["insight 1"]);
  });

  it("updates existing team context", async () => {
    const project = await createProject("Team Ctx 2", "desc", "user-1");
    await store.updateTeamContext(project.id, { tags: ["tag1"] });
    await store.updateTeamContext(project.id, { tags: ["tag1", "tag2"] });

    const ctx = await store.getTeamContext(project.id);
    expect(ctx!.tags).toEqual(["tag1", "tag2"]);
  });

  it("returns undefined for project without context", async () => {
    const ctx = await store.getTeamContext("nonexistent-proj-id");
    expect(ctx).toBeUndefined();
  });
});

describe("PostgresProjectStore", () => {
  function createMockDriver(): DatabaseDriver {
    return {
      name: "mock",
      type: "postgresql",
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      insert: async () => "id",
      query: async () => [],
      queryOne: async () => undefined,
      update: async () => 0,
      delete: async () => 0,
      beginTransaction: async () => {},
      commitTransaction: async () => {},
      rollbackTransaction: async () => {},
      rawQuery: async () => [],
      rawExec: async () => {},
      getMigrationStatus: async () => ({
        currentVersion: 0,
        pendingMigrations: [],
        appliedMigrations: [],
      }),
      runMigrations: async () => {},
      rollbackMigration: async () => {},
    };
  }

  it("creates a project via driver insert", async () => {
    const driver = createMockDriver();
    const pgStore = new PostgresProjectStore(driver);
    const now = new Date().toISOString();
    const project = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test",
      description: "desc",
      ownerId: "user-1",
      teamMembers: [],
      status: "active" as const,
      settings: {},
      createdAt: now,
      updatedAt: now,
    };

    const result = await pgStore.createProject(project);
    expect(result).toEqual(project);
  });

  it("returns undefined for non-existent project", async () => {
    const driver = createMockDriver();
    const pgStore = new PostgresProjectStore(driver);
    const result = await pgStore.getProject("nonexistent");
    expect(result).toBeUndefined();
  });

  it("returns undefined when update affects 0 rows", async () => {
    const driver = createMockDriver();
    const pgStore = new PostgresProjectStore(driver);
    const result = await pgStore.updateProject("nonexistent", { name: "New" });
    expect(result).toBeUndefined();
  });

  it("returns false for deleting non-existent project", async () => {
    const driver = createMockDriver();
    const pgStore = new PostgresProjectStore(driver);
    const result = await pgStore.deleteProject("nonexistent");
    expect(result).toBe(false);
  });

  it("returns empty team context for non-existent project", async () => {
    const driver = createMockDriver();
    const pgStore = new PostgresProjectStore(driver);
    const result = await pgStore.getTeamContext("nonexistent");
    expect(result).toBeUndefined();
  });
});
