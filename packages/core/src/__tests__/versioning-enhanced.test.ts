import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock LLM dependencies (same pattern as versioning.test.ts)
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
  clearVersionHistory,
  cherryPickVersion,
  detectConflicts,
  buildTimeline,
  compareSideBySide,
  revertToVersion,
  tagVersion,
  getVersionsByTag,
  buildVersionGraph,
} from "../versioning/index.js";
import type { InnovationIdea } from "../types.js";

const testIdea: InnovationIdea = {
  title: "AI-Powered Code Review",
  description: "An automated code review system using LLMs",
  potentialImpact: "Reduce code review time by 50%",
  implementationHint: "Use transformer models fine-tuned on code",
};

describe("versioning – enhanced functions", () => {
  beforeEach(() => {
    clearVersionHistory();
  });

  // ---- cherryPickVersion ----

  describe("cherryPickVersion", () => {
    it("applies source version changes onto target branch", () => {
      const v1 = createVersion("idea-1", testIdea, "alice");
      createBranch(v1.id, "feature");

      // Diverge feature branch so heads differ
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { description: "Feature desc" });

      // Commit a change on main
      const v2 = commitVersion(v1.id, { title: "Updated on main" }, "alice")!;

      const picked = cherryPickVersion(v2.id, "feature", "bob", "cherry-pick title change");
      expect(picked).not.toBeUndefined();
      expect(picked!.branchName).toBe("feature");
      expect(picked!.title).toBe("Updated on main");
      expect(picked!.author).toBe("bob");
      expect(picked!.message).toBe("cherry-pick title change");
    });

    it("returns undefined for nonexistent source version", () => {
      expect(cherryPickVersion("nonexistent", "main")).toBeUndefined();
    });

    it("returns undefined for nonexistent target branch", () => {
      const v1 = createVersion("idea-1", testIdea);
      expect(cherryPickVersion(v1.id, "no-such-branch")).toBeUndefined();
    });

    it("uses default message when none provided", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");

      // Diverge feature so cherry-pick creates a new version
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { description: "Feature desc" });

      const v2 = commitVersion(v1.id, { title: "New title" })!;

      const picked = cherryPickVersion(v2.id, "feature");
      expect(picked).not.toBeUndefined();
      expect(picked!.message).toContain("Cherry-pick");
      expect(picked!.message).toContain(v2.id);
    });

    it("deduplicates when cherry-picking identical content", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");
      const v2 = commitVersion(v1.id, { title: "Change" })!;

      const pick1 = cherryPickVersion(v2.id, "feature");
      const pick2 = cherryPickVersion(v2.id, "feature");
      // Second pick should return existing version (content-addressable dedup)
      expect(pick1!.id).toBe(pick2!.id);
    });
  });

  // ---- detectConflicts ----

  describe("detectConflicts", () => {
    it("reports no conflicts when branches are identical", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");

      const report = detectConflicts("main", "feature", "idea-1");
      expect(report.conflictingFields).toHaveLength(0);
      expect(report.autoResolvable).toBe(true);
    });

    it("detects conflicting fields when both branches diverge", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");

      // Diverge on main
      commitVersion(v1.id, { title: "Main title" });

      // Diverge on feature
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { title: "Feature title" });

      const report = detectConflicts("main", "feature", "idea-1");
      expect(report.conflictingFields.length).toBeGreaterThan(0);
      expect(report.autoResolvable).toBe(false);
      const titleConflict = report.conflictingFields.find((f) => f.field === "title");
      expect(titleConflict).not.toBeUndefined();
      expect(titleConflict!.valueA).toBe("Main title");
      expect(titleConflict!.valueB).toBe("Feature title");
    });

    it("returns empty conflicts for nonexistent branches", () => {
      createVersion("idea-1", testIdea);
      const report = detectConflicts("main", "nonexistent", "idea-1");
      expect(report.conflictingFields).toHaveLength(0);
      expect(report.autoResolvable).toBe(true);
    });

    it("includes divergence point ID when ancestor exists", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");

      commitVersion(v1.id, { title: "Main diverge" });
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { title: "Feature diverge" });

      const report = detectConflicts("main", "feature", "idea-1");
      expect(report.divergencePointId).toBe(v1.id);
    });
  });

  // ---- buildTimeline ----

  describe("buildTimeline", () => {
    it("returns chronologically sorted timeline entries", () => {
      const v1 = createVersion("idea-1", testIdea, "alice");
      commitVersion(v1.id, { title: "V2" }, "bob");

      const timeline = buildTimeline("idea-1");
      expect(timeline.length).toBeGreaterThanOrEqual(2);
      // Timestamps should be non-decreasing
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].timestamp).toBeGreaterThanOrEqual(timeline[i - 1].timestamp);
      }
    });

    it("includes entries from multiple branches", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { title: "Feature work" });

      const timeline = buildTimeline("idea-1");
      const branches = new Set(timeline.map((e) => e.branchName));
      expect(branches.has("main")).toBe(true);
      expect(branches.has("feature")).toBe(true);
    });

    it("returns empty array for unknown idea", () => {
      expect(buildTimeline("nonexistent")).toEqual([]);
    });

    it("marks merge commits with isMerge flag", async () => {
      const v1 = createVersion("idea-1", testIdea);
      // Simulate a merge commit by creating a version with "Merge " prefix message
      commitVersion(v1.id, { title: "Updated" }, undefined, "Merge experiment into main");

      const timeline = buildTimeline("idea-1");
      const mergeEntry = timeline.find((e) => e.isMerge);
      expect(mergeEntry).not.toBeUndefined();
    });
  });

  // ---- compareSideBySide ----

  describe("compareSideBySide", () => {
    it("compares two versions field by field", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "Changed Title" })!;

      const result = compareSideBySide(v1.id, v2.id);
      expect(result).not.toBeUndefined();
      expect(result!.versionIdA).toBe(v1.id);
      expect(result!.versionIdB).toBe(v2.id);
      expect(result!.fields).toHaveLength(4); // title, description, potentialImpact, implementationHint

      const titleField = result!.fields.find((f) => f.field === "title");
      expect(titleField!.changed).toBe(true);
      expect(titleField!.valueA).toBe(testIdea.title);
      expect(titleField!.valueB).toBe("Changed Title");
    });

    it("shows unchanged fields as not changed", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "New Title" })!;

      const result = compareSideBySide(v1.id, v2.id)!;
      const descField = result.fields.find((f) => f.field === "description");
      expect(descField!.changed).toBe(false);
      expect(descField!.valueA).toBe(descField!.valueB);
    });

    it("returns undefined when a version does not exist", () => {
      const v1 = createVersion("idea-1", testIdea);
      expect(compareSideBySide(v1.id, "nonexistent")).toBeUndefined();
      expect(compareSideBySide("nonexistent", v1.id)).toBeUndefined();
    });

    it("includes word-level diff entries", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, {
        description: "A completely different description text",
      })!;

      const result = compareSideBySide(v1.id, v2.id)!;
      const descField = result.fields.find((f) => f.field === "description");
      expect(descField!.diff.length).toBeGreaterThan(0);
      const diffTypes = descField!.diff.map((d) => d.type);
      expect(diffTypes.some((t) => t === "added" || t === "removed")).toBe(true);
    });
  });

  // ---- revertToVersion ----

  describe("revertToVersion", () => {
    it("creates a new version with the content of a historical version", () => {
      const v1 = createVersion("idea-1", testIdea, "alice");
      const v2 = commitVersion(v1.id, { title: "V2 Title" }, "alice")!;

      const reverted = revertToVersion(v1.id, "bob", "Reverting to original");
      expect(reverted).not.toBeUndefined();
      expect(reverted!.title).toBe(testIdea.title);
      expect(reverted!.description).toBe(testIdea.description);
      expect(reverted!.parentId).toBe(v2.id); // parent is current head
      expect(reverted!.author).toBe("bob");
      expect(reverted!.message).toBe("Reverting to original");
    });

    it("returns undefined for nonexistent version", () => {
      expect(revertToVersion("nonexistent")).toBeUndefined();
    });

    it("uses default message when none provided", () => {
      const v1 = createVersion("idea-1", testIdea);
      commitVersion(v1.id, { title: "Changed" });

      const reverted = revertToVersion(v1.id);
      expect(reverted).not.toBeUndefined();
      expect(reverted!.message).toContain("Revert to version");
      expect(reverted!.message).toContain(v1.id);
    });

    it("creates a new unique version ID (not reusing the old one)", () => {
      const v1 = createVersion("idea-1", testIdea);
      commitVersion(v1.id, { title: "Changed" });

      const reverted = revertToVersion(v1.id);
      expect(reverted!.id).not.toBe(v1.id);
    });
  });

  // ---- tagVersion / getVersionsByTag ----

  describe("tagVersion and getVersionsByTag", () => {
    it("tags a version and retrieves it by tag", () => {
      const v1 = createVersion("idea-1", testIdea);
      const tagged = tagVersion(v1.id, "v1.0");
      expect(tagged).toBe(true);

      const versions = getVersionsByTag("v1.0");
      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe(v1.id);
    });

    it("returns false when tagging nonexistent version", () => {
      expect(tagVersion("nonexistent", "v1.0")).toBe(false);
    });

    it("returns empty array for unknown tag", () => {
      expect(getVersionsByTag("no-such-tag")).toEqual([]);
    });

    it("allows multiple versions under the same tag", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "V2" })!;

      tagVersion(v1.id, "release");
      tagVersion(v2.id, "release");

      const versions = getVersionsByTag("release");
      expect(versions).toHaveLength(2);
      const ids = versions.map((v) => v.id);
      expect(ids).toContain(v1.id);
      expect(ids).toContain(v2.id);
    });

    it("allows a version to have multiple tags", () => {
      const v1 = createVersion("idea-1", testIdea);
      tagVersion(v1.id, "alpha");
      tagVersion(v1.id, "beta");

      expect(getVersionsByTag("alpha")).toHaveLength(1);
      expect(getVersionsByTag("beta")).toHaveLength(1);
    });
  });

  // ---- buildVersionGraph ----

  describe("buildVersionGraph", () => {
    it("returns nodes and edges for a linear history", () => {
      const v1 = createVersion("idea-1", testIdea);
      const v2 = commitVersion(v1.id, { title: "V2" })!;

      const graph = buildVersionGraph("idea-1");
      expect(graph.ideaId).toBe("idea-1");
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);

      const edge = graph.edges.find((e) => e.from === v1.id && e.to === v2.id);
      expect(edge).not.toBeUndefined();
    });

    it("includes nodes from multiple branches", () => {
      const v1 = createVersion("idea-1", testIdea);
      createBranch(v1.id, "feature");
      const featureLog = getVersionLog("idea-1", "feature");
      commitVersion(featureLog[0].id, { title: "Feature commit" });

      const graph = buildVersionGraph("idea-1");
      const branchNames = new Set(graph.nodes.map((n) => n.branchName));
      expect(branchNames.has("main")).toBe(true);
      expect(branchNames.has("feature")).toBe(true);
    });

    it("returns empty graph for unknown idea", () => {
      const graph = buildVersionGraph("nonexistent");
      expect(graph.ideaId).toBe("nonexistent");
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
    });

    it("root node has no incoming edge", () => {
      const v1 = createVersion("idea-1", testIdea);
      commitVersion(v1.id, { title: "V2" });

      const graph = buildVersionGraph("idea-1");
      const incomingTargets = new Set(graph.edges.map((e) => e.to));
      // The root node should not appear as a target of any edge
      expect(incomingTargets.has(v1.id)).toBe(false);
    });
  });
});
