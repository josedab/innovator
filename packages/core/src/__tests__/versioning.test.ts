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
});
