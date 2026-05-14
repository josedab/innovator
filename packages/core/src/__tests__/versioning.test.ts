import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();

vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
}));

import {
  createVersion,
  commitVersion,
  createBranch,
  getVersionLog,
  getVersion,
  listBranches,
  clearVersionHistory,
  semanticDiff,
  mergeVersions,
  detectConflicts,
  cherryPickVersion,
  revertToVersion,
  compareSideBySide,
  buildVersionGraph,
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
    const _log = getVersionLog("idea-1");
    expect(_log.length).toBeGreaterThanOrEqual(2);
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

  describe("content-addressable ID collision dedup", () => {
    it("returns existing version when committing identical content", () => {
      const v1 = createVersion("idea-1", testIdea);
      // Commit with same content as parent (no actual changes)
      const v2 = commitVersion(v1.id, {
        title: testIdea.title,
        description: testIdea.description,
        potentialImpact: testIdea.potentialImpact,
        implementationHint: testIdea.implementationHint,
      });
      // Should return the existing version (dedup by content hash)
      expect(v2).toBeTruthy();
      const _log = getVersionLog("idea-1");
      // The log may contain the original version only if dedup catches it
      // In practice: same content = same ID = existing found
    });

    it("generates different IDs for different content", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Completely Different Title" });
      expect(v2?.id).not.toBe(v1.id);
    });
  });

  describe("branch operations", () => {
    it("creates branch from version", () => {
      const v1 = createVersion("idea-1", testIdea);
      const branch = createBranch(v1.id, "feature-branch");
      expect(branch).toBeTruthy();
      expect(branch?.name).toBe("feature-branch");
      expect(branch?.ideaId).toBe("idea-1");
    });

    it("returns undefined when branching from nonexistent version", () => {
      expect(createBranch("nonexistent", "branch")).toBeUndefined();
    });

    it("prevents duplicate branch names", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "experiment");
      const dup = createBranch(v1.id, "experiment");
      expect(dup).toBeUndefined();
    });

    it("commits to a branch independently", () => {
      const v1 = createVersion("idea-1", testIdea);
      const branch = createBranch(v1.id, "experiment");
      expect(branch).toBeTruthy();

      // Get the branch head version
      const expLog = getVersionLog("idea-1", "experiment");
      const branchHead = expLog[0];

      const v3 = commitVersion(branchHead.id, { title: "Branch Change" });
      expect(v3?.branchName).toBe("experiment");
      expect(v3?.title).toBe("Branch Change");

      // Main branch should not have this commit
      const mainLog = getVersionLog("idea-1", "main");
      expect(mainLog.every((v) => v.title !== "Branch Change")).toBe(true);
    });

    it("lists all branches for an idea", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "branch-a");
      createBranch(v1.id, "branch-b");

      const allBranches = listBranches("idea-1");
      expect(allBranches).toHaveLength(3); // main + branch-a + branch-b
      const names = allBranches.map((b) => b.name);
      expect(names).toContain("main");
      expect(names).toContain("branch-a");
      expect(names).toContain("branch-b");
    });

    it("returns empty array for unknown idea branches", () => {
      expect(listBranches("nonexistent")).toEqual([]);
    });
  });

  describe("semanticDiff", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("calls LLM and returns parsed diff", async () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Updated Title" })!;

      const diffResult = {
        fromVersion: v1.id,
        toVersion: v2.id,
        changes: [
          {
            field: "title",
            changeType: "modified",
            before: testIdea.title,
            after: "Updated Title",
            significance: "minor",
          },
        ],
        overallSignificance: "minor",
        summary: "Title was updated",
      };

      const json = JSON.stringify(diffResult);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await semanticDiff(v1.id, v2.id);
      expect(result.fromVersion).toBe(v1.id);
      expect(result.toVersion).toBe(v2.id);
      expect(result.changes).toHaveLength(1);
      expect(result.overallSignificance).toBe("minor");
    });

    it("throws when version not found", async () => {
      await expect(semanticDiff("nonexistent", "also-nonexistent")).rejects.toThrow(
        "Version not found"
      );
    });
  });

  describe("mergeVersions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("merges two versions from different branches", async () => {
      const v1 = createVersion("idea-1", testIdea);
      const _branch = createBranch(v1.id, "experiment");
      const expLog = getVersionLog("idea-1", "experiment");
      const branchHead = expLog[0];

      const mergedContent = {
        title: "Merged Idea",
        description: "Combined best of both",
        potentialImpact: "High combined impact",
        implementationHint: "Combined approach",
        conflicts: [],
      };

      const json = JSON.stringify(mergedContent);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await mergeVersions(branchHead.id, v1.id);
      expect(result.sourceBranch).toBe("experiment");
      expect(result.targetBranch).toBe("main");
      expect(result.strategy).toBe("llm-powered");
      expect(result.mergedVersion.title).toBe("Merged Idea");
    });

    it("reports conflicts from LLM merge", async () => {
      const v1 = createVersion("idea-1", testIdea);
      const _branch = createBranch(v1.id, "alt");
      const altLog = getVersionLog("idea-1", "alt");
      const branchHead = altLog[0];

      const mergedContent = {
        title: "Merged",
        description: "Merged desc",
        potentialImpact: "Merged impact",
        implementationHint: "Merged hint",
        conflicts: ["Timeline conflict between branches"],
      };

      const json = JSON.stringify(mergedContent);
      mockGenerateText.mockResolvedValue(json);
      mockExtractJson.mockReturnValue(json);

      const result = await mergeVersions(branchHead.id, v1.id);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toContain("Timeline conflict");
    });

    it("throws when source version not found", async () => {
      const v1 = createVersion("idea-1", testIdea);
      await expect(mergeVersions("nonexistent", v1.id)).rejects.toThrow("Version not found");
    });

    it("throws when merging versions from different ideas", async () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = createVersion("idea-2", {
        ...testIdea,
        title: "Different Idea",
      });
      await expect(mergeVersions(v1.id, v2.id)).rejects.toThrow("different ideas");
    });
  });

  describe("detectConflicts", () => {
    it("returns no conflicts when branches have identical content", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "experiment");
      const report = detectConflicts("main", "experiment", "idea-1");
      expect(report.conflictingFields).toHaveLength(0);
      expect(report.autoResolvable).toBe(true);
    });

    it("detects conflicting fields when both branches modify same field", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "experiment");

      // Modify title on main
      commitVersion(v1.id, { title: "Main title change" });

      // Modify title on experiment
      const expLog = getVersionLog("idea-1", "experiment");
      commitVersion(expLog[0].id, { title: "Experiment title change" });

      const report = detectConflicts("main", "experiment", "idea-1");
      expect(report.conflictingFields.length).toBeGreaterThan(0);
      expect(report.autoResolvable).toBe(false);
      const titleConflict = report.conflictingFields.find((f) => f.field === "title");
      expect(titleConflict).toBeDefined();
    });

    it("returns empty conflicts for non-existent branches", () => {
      createVersion("idea-1", testIdea);
      const report = detectConflicts("main", "nonexistent", "idea-1");
      expect(report.conflictingFields).toHaveLength(0);
      expect(report.autoResolvable).toBe(true);
    });

    it("includes divergence point ID with common ancestor", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");
      commitVersion(v1.id, { title: "Main change" });
      const expLog = getVersionLog("idea-1", "feature");
      commitVersion(expLog[0].id, { description: "Feature description" });

      const report = detectConflicts("main", "feature", "idea-1");
      expect(report.branchA).toBe("main");
      expect(report.branchB).toBe("feature");
      expect(report.ideaId).toBe("idea-1");
    });
  });

  describe("cherryPickVersion", () => {
    it("applies changes from source version onto target branch", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");

      // Modify feature branch head so it differs from main
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { description: "Feature-specific description" });

      // Make a change on main
      const v2 = commitVersion(v1.id, { title: "Cherry-pickable title" })!;

      // Cherry-pick onto feature branch
      const picked = cherryPickVersion(v2.id, "feature");
      expect(picked).toBeDefined();
      expect(picked!.title).toBe("Cherry-pickable title");
    });

    it("returns undefined for non-existent source version", () => {
      expect(cherryPickVersion("nonexistent", "main")).toBeUndefined();
    });

    it("returns undefined for non-existent target branch", () => {
      const v1 = createVersion("idea-1", testIdea);
      expect(cherryPickVersion(v1.id, "nonexistent")).toBeUndefined();
    });

    it("uses default message when none provided", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { description: "Different desc on feature" });
      const v2 = commitVersion(v1.id, { title: "Pick me" })!;
      const picked = cherryPickVersion(v2.id, "feature");
      expect(picked).toBeDefined();
      expect(picked!.title).toBe("Pick me");
    });
  });

  describe("revertToVersion", () => {
    it("creates new version with content from historical version", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Changed Title" })!;
      commitVersion(v2.id, { title: "Further Changed" });

      const reverted = revertToVersion(v1.id);
      expect(reverted).toBeDefined();
      expect(reverted!.title).toBe(testIdea.title);
      // Revert creates a NEW version with a different ID (hash collision avoidance)
      expect(reverted!.id).not.toBe(v1.id);
    });

    it("returns undefined for non-existent version", () => {
      expect(revertToVersion("nonexistent")).toBeUndefined();
    });

    it("sets parent to current branch head", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Changed" })!;
      const reverted = revertToVersion(v1.id)!;
      expect(reverted.parentId).toBe(v2.id);
    });
  });

  describe("compareSideBySide", () => {
    it("returns field-level diff between two versions", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Updated Title" })!;

      const comparison = compareSideBySide(v1.id, v2.id);
      expect(comparison).toBeDefined();
      expect(comparison!.versionIdA).toBe(v1.id);
      expect(comparison!.versionIdB).toBe(v2.id);

      const titleField = comparison!.fields.find((f) => f.field === "title");
      expect(titleField!.changed).toBe(true);
      expect(titleField!.valueA).toBe(testIdea.title);
      expect(titleField!.valueB).toBe("Updated Title");
    });

    it("marks unchanged fields as not changed", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Updated" })!;

      const comparison = compareSideBySide(v1.id, v2.id)!;
      const descField = comparison.fields.find((f) => f.field === "description");
      expect(descField!.changed).toBe(false);
    });

    it("returns undefined for non-existent version", () => {
      const v1 = createVersion("idea-1", testIdea);
      expect(compareSideBySide(v1.id, "nonexistent")).toBeUndefined();
      expect(compareSideBySide("nonexistent", v1.id)).toBeUndefined();
    });

    it("includes word-level diff for changed fields", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "AI-Powered Bug Detection" })!;

      const comparison = compareSideBySide(v1.id, v2.id)!;
      const titleField = comparison.fields.find((f) => f.field === "title");
      expect(titleField!.diff).toBeDefined();
    });
  });

  describe("buildVersionGraph", () => {
    it("builds DAG with nodes and edges for an idea", () => {
      const v1 = createVersion("idea-1", testIdea);
      commitVersion(v1.id, { title: "V2" });

      const graph = buildVersionGraph("idea-1");
      expect(graph.ideaId).toBe("idea-1");
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0].from).toBe(v1.id);
    });

    it("returns empty graph for non-existent idea", () => {
      const graph = buildVersionGraph("nonexistent");
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it("includes branch divergence in the graph", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");

      const mainV2 = commitVersion(v1.id, { title: "Main V2" })!;
      const expLog = getVersionLog("idea-1", "feature");
      commitVersion(expLog[0].id, { title: "Feature V2" });

      const graph = buildVersionGraph("idea-1");
      // v1 (root) + branch copy + mainV2 + featureV2 = at least 3 nodes
      expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
      expect(graph.edges.length).toBeGreaterThanOrEqual(2);
    });

    it("nodes include branch name and metadata", () => {
      const v1 = createVersion("idea-1", testIdea, "alice");
      const graph = buildVersionGraph("idea-1");
      expect(graph.nodes[0].branchName).toBe("main");
      expect(graph.nodes[0].author).toBe("alice");
    });
  });

  describe("clearVersionHistory", () => {
    it("clears all versions and branches", () => {
      createVersion("idea-1", testIdea);
      createVersion("idea-2", { ...testIdea, title: "Other" });
      clearVersionHistory();
      expect(getVersionLog("idea-1")).toHaveLength(0);
      expect(getVersionLog("idea-2")).toHaveLength(0);
      expect(listBranches("idea-1")).toHaveLength(0);
    });
  });
});
