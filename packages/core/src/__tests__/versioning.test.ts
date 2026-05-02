import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));

import {
  createVersion,
  commitVersion,
  createBranch,
  getVersionLog,
  getVersion,
  listBranches,
  clearVersionHistory,
} from "../versioning/index.js";
import type { InnovationIdea } from "../types.js";

const testIdea: InnovationIdea = {
  title: "AI-Powered Code Review",
  description: "An automated code review system using LLMs",
  potentialImpact: "Reduce code review time by 50%",
  implementationHint: "Use transformer models fine-tuned on code",
};

describe("versioning", () => {
  beforeEach(() => {
    clearVersionHistory();
  });

  it("creates initial version with content-addressable ID", () => {
    const version = createVersion("idea-1", testIdea, "author-1");
    expect(version.id).toBeTruthy();
    expect(version.ideaId).toBe("idea-1");
    expect(version.branchName).toBe("main");
    expect(version.title).toBe(testIdea.title);
  });

  it("creates deterministic IDs for same content", () => {
    const v1 = createVersion("idea-1", testIdea);
    clearVersionHistory();
    const v2 = createVersion("idea-1", testIdea);
    expect(v1.id).toBe(v2.id);
  });

  it("commits new version as child of parent", () => {
    const v1 = createVersion("idea-1", testIdea);
    const v2 = commitVersion(v1.id, {
      title: "AI-Powered Code Review v2",
    });
    expect(v2).toBeTruthy();
    expect(v2?.parentId).toBe(v1.id);
    expect(v2?.title).toBe("AI-Powered Code Review v2");
    expect(v2?.description).toBe(testIdea.description); // unchanged
  });

  it("returns undefined for nonexistent parent", () => {
    expect(commitVersion("nonexistent", { title: "test" })).toBeUndefined();
  });

  it("creates and lists branches", () => {
    const v1 = createVersion("idea-1", testIdea);
    const branch = createBranch(v1.id, "experiment");
    expect(branch).toBeTruthy();
    expect(branch?.name).toBe("experiment");

    const allBranches = listBranches("idea-1");
    expect(allBranches).toHaveLength(2); // main + experiment
  });

  it("prevents duplicate branch names", () => {
    const v1 = createVersion("idea-1", testIdea);
    createBranch(v1.id, "experiment");
    const duplicate = createBranch(v1.id, "experiment");
    expect(duplicate).toBeUndefined();
  });

  it("retrieves version log for an idea", () => {
    const v1 = createVersion("idea-1", testIdea);
    commitVersion(v1.id, { title: "Updated" });
    const log = getVersionLog("idea-1");
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it("filters version log by branch", () => {
    const v1 = createVersion("idea-1", testIdea);
    createBranch(v1.id, "experiment");
    const mainLog = getVersionLog("idea-1", "main");
    const expLog = getVersionLog("idea-1", "experiment");
    expect(mainLog.length).toBeGreaterThan(0);
    expect(expLog.length).toBeGreaterThan(0);
  });

  it("retrieves specific version by ID", () => {
    const v1 = createVersion("idea-1", testIdea);
    const retrieved = getVersion(v1.id);
    expect(retrieved?.title).toBe(testIdea.title);
  });
});
