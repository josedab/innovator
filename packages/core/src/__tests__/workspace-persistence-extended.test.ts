import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryProjectStore,
  createProject,
  getProject,
  exportProject,
  importProject,
  getProjectTimeline,
  addSessionToProject,
  createSnapshot,
  setProjectStore,
  getProjectSessions,
} from "../workspace-persistence/index.js";

let store: InstanceType<typeof InMemoryProjectStore>;

beforeEach(() => {
  store = new InMemoryProjectStore();
  setProjectStore(store);
});

describe("importProject", () => {
  it("successfully imports a valid JSON export", async () => {
    const original = await createProject("Import Test", "desc", "user-1");
    const exported = await exportProject(original.id);
    expect(exported).toBeDefined();

    const imported = await importProject(exported!);
    expect(imported).toBeDefined();
    expect(imported!.id).not.toBe(original.id);
    expect(imported!.name).toBe("Import Test");

    const retrieved = await getProject(imported!.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Import Test");
  });

  it("imports project with sessions", async () => {
    const original = await createProject("Session Import", "desc", "user-1");
    await addSessionToProject(original.id, { subject: "AI trends" });
    await addSessionToProject(original.id, { subject: "Web3 research" });
    const exported = await exportProject(original.id);

    const imported = await importProject(exported!);
    expect(imported).toBeDefined();

    const sessions = await getProjectSessions(imported!.id);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.subject).sort()).toEqual(["AI trends", "Web3 research"].sort());
  });

  it("imports project with teamContext", async () => {
    const original = await createProject("Team Import", "desc", "user-1");
    await store.updateTeamContext(original.id, {
      sharedInsights: ["insight1"],
      tags: ["tag1", "tag2"],
    });
    const exported = await exportProject(original.id);

    const imported = await importProject(exported!);
    expect(imported).toBeDefined();

    const ctx = await store.getTeamContext(imported!.id);
    expect(ctx).toBeDefined();
    expect(ctx!.sharedInsights).toContain("insight1");
    expect(ctx!.tags).toEqual(expect.arrayContaining(["tag1", "tag2"]));
  });

  it("returns undefined for malformed JSON", async () => {
    const result = await importProject("not json");
    expect(result).toBeUndefined();
  });

  it("creates project even with minimal data since spread handles missing fields", async () => {
    // importProject is permissive: `...parsed.project` spreads fine for null/undefined
    const result = await importProject(JSON.stringify({ project: { name: "Minimal" } }));
    expect(result).toBeDefined();
    expect(result!.id).toBeDefined();
  });

  it("returns undefined for empty string input", async () => {
    const result = await importProject("");
    expect(result).toBeUndefined();
  });
});

describe("getProjectTimeline", () => {
  it("returns timeline with project_created entry for a new project", async () => {
    const project = await createProject("Timeline Test", "desc", "user-1");
    const timeline = await getProjectTimeline(project.id);

    expect(timeline.length).toBeGreaterThanOrEqual(1);
    const created = timeline.find((e) => e.type === "project_created");
    expect(created).toBeDefined();
    expect(created!.details).toContain("Timeline Test");
  });

  it("returns timeline including session_added entries", async () => {
    const project = await createProject("Session Timeline", "desc", "user-1");
    await addSessionToProject(project.id, { subject: "AI exploration" });
    await addSessionToProject(project.id, { subject: "Market analysis" });

    const timeline = await getProjectTimeline(project.id);
    const sessionEntries = timeline.filter((e) => e.type === "session_added");
    expect(sessionEntries).toHaveLength(2);
    expect(sessionEntries.some((e) => e.details.includes("AI exploration"))).toBe(true);
    expect(sessionEntries.some((e) => e.details.includes("Market analysis"))).toBe(true);
  });

  it("returns timeline including snapshot_created entries", async () => {
    const project = await createProject("Snapshot Timeline", "desc", "user-1");
    await createSnapshot(project.id);

    const timeline = await getProjectTimeline(project.id);
    const snapshotEntries = timeline.filter((e) => e.type === "snapshot_created");
    expect(snapshotEntries).toHaveLength(1);
  });

  it("returns empty array for non-existent project ID", async () => {
    const timeline = await getProjectTimeline("nonexistent-id");
    expect(timeline).toEqual([]);
  });

  it("timeline is sorted by timestamp descending", async () => {
    const project = await createProject("Sort Timeline", "desc", "user-1");
    await addSessionToProject(project.id, { subject: "First session" });
    await addSessionToProject(project.id, { subject: "Second session" });
    await createSnapshot(project.id);

    const timeline = await getProjectTimeline(project.id);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].timestamp >= timeline[i].timestamp).toBe(true);
    }
  });
});
