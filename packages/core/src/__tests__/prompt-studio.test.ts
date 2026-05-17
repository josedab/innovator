import { describe, it, expect, beforeEach } from "vitest";

import {
  createPromptTemplate,
  getPromptTemplate,
  listPromptTemplates,
  deletePromptTemplate,
  updatePromptTemplate,
  getVersionHistory,
  getTemplateVersion,
  revertToVersion,
  diffTemplateVersions,
  recordPromptExecution,
  getPromptPerformance,
  getPromptAnalytics,
  interpolateTemplate,
  promptAnalyticsToMarkdown,
  clearPromptStudio,
} from "../prompt-studio/index.js";

describe("prompt-studio", () => {
  beforeEach(() => {
    clearPromptStudio();
  });

  // ---- Template Management ----

  describe("createPromptTemplate", () => {
    it("creates a template with generated id and timestamps", () => {
      const template = createPromptTemplate({
        name: "Test Template",
        template: "Hello {name}",
        variables: [{ name: "name", required: true }],
        tags: ["test"],
        scope: "investigation",
      });

      expect(template.id).toMatch(/^pt-/);
      expect(template.name).toBe("Test Template");
      expect(template.createdAt).toBeTruthy();
      expect(template.updatedAt).toBeTruthy();
    });

    it("stores template retrievable by id", () => {
      const created = createPromptTemplate({
        name: "Lookup Test",
        template: "test",
        variables: [],
        tags: [],
        scope: "custom",
      });

      const retrieved = getPromptTemplate(created.id);
      expect(retrieved).toEqual(created);
    });

    it("initializes version history with v1", () => {
      const template = createPromptTemplate({
        name: "Version Test",
        template: "v1 content",
        variables: [],
        tags: [],
        scope: "synthesis",
      });

      const history = getVersionHistory(template.id);
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe(1);
      expect(history[0].template).toBe("v1 content");
      expect(history[0].changeMessage).toBe("Initial version");
    });
  });

  describe("listPromptTemplates", () => {
    it("returns empty array when no templates exist", () => {
      expect(listPromptTemplates()).toEqual([]);
    });

    it("filters by scope", () => {
      createPromptTemplate({
        name: "A",
        template: "a",
        variables: [],
        tags: [],
        scope: "investigation",
      });
      createPromptTemplate({
        name: "B",
        template: "b",
        variables: [],
        tags: [],
        scope: "generation",
      });

      const results = listPromptTemplates({ scope: "investigation" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("A");
    });

    it("filters by tag (case-insensitive)", () => {
      createPromptTemplate({
        name: "Tagged",
        template: "t",
        variables: [],
        tags: ["AI"],
        scope: "custom",
      });
      createPromptTemplate({
        name: "Other",
        template: "o",
        variables: [],
        tags: ["ml"],
        scope: "custom",
      });

      const results = listPromptTemplates({ tag: "ai" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Tagged");
    });

    it("filters by query in name or description", () => {
      createPromptTemplate({
        name: "Alpha Tool",
        template: "t",
        variables: [],
        tags: [],
        scope: "custom",
      });
      createPromptTemplate({
        name: "Beta",
        description: "Alpha related",
        template: "t",
        variables: [],
        tags: [],
        scope: "custom",
      });
      createPromptTemplate({
        name: "Gamma",
        template: "t",
        variables: [],
        tags: [],
        scope: "custom",
      });

      const results = listPromptTemplates({ query: "alpha" });
      expect(results).toHaveLength(2);
    });
  });

  describe("deletePromptTemplate", () => {
    it("removes template and returns true", () => {
      const t = createPromptTemplate({
        name: "Delete Me",
        template: "x",
        variables: [],
        tags: [],
        scope: "custom",
      });
      expect(deletePromptTemplate(t.id)).toBe(true);
      expect(getPromptTemplate(t.id)).toBeUndefined();
    });

    it("returns false for non-existent id", () => {
      expect(deletePromptTemplate("no-such-id")).toBe(false);
    });
  });

  // ---- Version Management ----

  describe("updatePromptTemplate", () => {
    it("updates template and adds version entry", () => {
      const t = createPromptTemplate({
        name: "Versioned",
        template: "v1",
        variables: [],
        tags: [],
        scope: "custom",
      });
      const updated = updatePromptTemplate(t.id, "v2 content", "Updated prompt", "alice");

      expect(updated?.template).toBe("v2 content");
      const history = getVersionHistory(t.id);
      expect(history).toHaveLength(2);
      expect(history[1].version).toBe(2);
      expect(history[1].author).toBe("alice");
    });

    it("returns undefined for non-existent template", () => {
      expect(updatePromptTemplate("nope", "content", "msg")).toBeUndefined();
    });
  });

  describe("getTemplateVersion", () => {
    it("returns specific version entry", () => {
      const t = createPromptTemplate({
        name: "V",
        template: "first",
        variables: [],
        tags: [],
        scope: "custom",
      });
      updatePromptTemplate(t.id, "second", "v2");

      expect(getTemplateVersion(t.id, 1)?.template).toBe("first");
      expect(getTemplateVersion(t.id, 2)?.template).toBe("second");
      expect(getTemplateVersion(t.id, 99)).toBeUndefined();
    });
  });

  describe("revertToVersion", () => {
    it("reverts template to an older version", () => {
      const t = createPromptTemplate({
        name: "Revert",
        template: "original",
        variables: [],
        tags: [],
        scope: "custom",
      });
      updatePromptTemplate(t.id, "changed", "change");

      const reverted = revertToVersion(t.id, 1);
      expect(reverted?.template).toBe("original");

      const history = getVersionHistory(t.id);
      expect(history).toHaveLength(3);
      expect(history[2].changeMessage).toContain("Reverted");
    });

    it("returns undefined for non-existent version", () => {
      const t = createPromptTemplate({
        name: "X",
        template: "x",
        variables: [],
        tags: [],
        scope: "custom",
      });
      expect(revertToVersion(t.id, 99)).toBeUndefined();
    });
  });

  describe("diffTemplateVersions", () => {
    it("computes additions, deletions, and unchanged lines", () => {
      const t = createPromptTemplate({
        name: "Diff",
        template: "line1\nline2\nline3",
        variables: [],
        tags: [],
        scope: "custom",
      });
      updatePromptTemplate(t.id, "line1\nline4\nline3", "modified");

      const diff = diffTemplateVersions(t.id, 1, 2);
      expect(diff?.additions).toContain("line4");
      expect(diff?.deletions).toContain("line2");
      expect(diff?.unchanged).toContain("line1");
      expect(diff?.unchanged).toContain("line3");
    });

    it("returns undefined when version doesn't exist", () => {
      const t = createPromptTemplate({
        name: "D",
        template: "x",
        variables: [],
        tags: [],
        scope: "custom",
      });
      expect(diffTemplateVersions(t.id, 1, 99)).toBeUndefined();
    });
  });

  // ---- Performance Recording ----

  describe("recordPromptExecution", () => {
    it("records execution and computes performance metrics", () => {
      const t = createPromptTemplate({
        name: "Perf",
        template: "p",
        variables: [],
        tags: [],
        scope: "custom",
      });

      recordPromptExecution(t.id, 1, {
        qualityScore: 80,
        responseTimeMs: 500,
        tokenCount: 100,
        success: true,
      });
      recordPromptExecution(t.id, 1, {
        qualityScore: 90,
        responseTimeMs: 400,
        tokenCount: 120,
        success: true,
      });
      recordPromptExecution(t.id, 1, {
        qualityScore: 70,
        responseTimeMs: 600,
        tokenCount: 80,
        success: false,
      });

      const perf = getPromptPerformance(t.id, 1);
      expect(perf).toBeDefined();
      expect(perf!.usageCount).toBe(3);
      expect(perf!.avgQualityScore).toBeCloseTo(80, 0);
      expect(perf!.successRate).toBeCloseTo(2 / 3, 2);
    });

    it("throws ValidationError for invalid quality score", () => {
      const t = createPromptTemplate({
        name: "Val",
        template: "p",
        variables: [],
        tags: [],
        scope: "custom",
      });
      expect(() =>
        recordPromptExecution(t.id, 1, {
          qualityScore: 150,
          responseTimeMs: 100,
          tokenCount: 10,
          success: true,
        })
      ).toThrow("Quality score must be between 0 and 100");
    });

    it("throws ValidationError for invalid version", () => {
      const t = createPromptTemplate({
        name: "Val2",
        template: "p",
        variables: [],
        tags: [],
        scope: "custom",
      });
      expect(() =>
        recordPromptExecution(t.id, 0, {
          qualityScore: 50,
          responseTimeMs: 100,
          tokenCount: 10,
          success: true,
        })
      ).toThrow("Version must be a positive integer");
    });

    it("throws ValidationError for negative response time", () => {
      const t = createPromptTemplate({
        name: "Val3",
        template: "p",
        variables: [],
        tags: [],
        scope: "custom",
      });
      expect(() =>
        recordPromptExecution(t.id, 1, {
          qualityScore: 50,
          responseTimeMs: -1,
          tokenCount: 10,
          success: true,
        })
      ).toThrow("Response time must be non-negative");
    });

    it("throws ValidationError for empty template ID", () => {
      expect(() =>
        recordPromptExecution("", 1, {
          qualityScore: 50,
          responseTimeMs: 100,
          tokenCount: 10,
          success: true,
        })
      ).toThrow("Template ID is required");
    });
  });

  // ---- Analytics ----

  describe("getPromptAnalytics", () => {
    it("returns undefined for non-existent template", () => {
      expect(getPromptAnalytics("nope")).toBeUndefined();
    });

    it("generates recommendations for single-version templates", () => {
      const t = createPromptTemplate({
        name: "Solo",
        template: "s",
        variables: [],
        tags: [],
        scope: "custom",
      });
      const analytics = getPromptAnalytics(t.id);

      expect(analytics).toBeDefined();
      expect(analytics!.totalVersions).toBe(1);
      expect(analytics!.recommendations).toContain(
        "Create variations to run A/B tests and find improvements"
      );
    });

    it("computes overall improvement across versions", () => {
      const t = createPromptTemplate({
        name: "Improving",
        template: "v1",
        variables: [],
        tags: [],
        scope: "custom",
      });
      recordPromptExecution(t.id, 1, {
        qualityScore: 50,
        responseTimeMs: 500,
        tokenCount: 100,
        success: true,
      });

      updatePromptTemplate(t.id, "v2", "improved");
      recordPromptExecution(t.id, 2, {
        qualityScore: 75,
        responseTimeMs: 400,
        tokenCount: 90,
        success: true,
      });

      const analytics = getPromptAnalytics(t.id);
      expect(analytics!.overallImprovement).toBeGreaterThan(0);
      expect(analytics!.bestVersion).toBeDefined();
    });
  });

  // ---- Template Interpolation ----

  describe("interpolateTemplate", () => {
    it("replaces variables with provided values", () => {
      const t = createPromptTemplate({
        name: "Interp",
        template: "Hello {name}, you are {role}",
        variables: [
          { name: "name", required: true },
          { name: "role", required: true },
        ],
        tags: [],
        scope: "custom",
      });

      const result = interpolateTemplate(t, { name: "Alice", role: "admin" });
      expect(result).toBe("Hello Alice, you are admin");
    });

    it("uses default values when variable not provided", () => {
      const t = createPromptTemplate({
        name: "Defaults",
        template: "Hello {name}",
        variables: [{ name: "name", required: false, defaultValue: "World" }],
        tags: [],
        scope: "custom",
      });

      const result = interpolateTemplate(t, {});
      expect(result).toBe("Hello World");
    });

    it("throws ValidationError for missing required variable", () => {
      const t = createPromptTemplate({
        name: "Required",
        template: "Hello {name}",
        variables: [{ name: "name", required: true }],
        tags: [],
        scope: "custom",
      });

      expect(() => interpolateTemplate(t, {})).toThrow('Required variable "name" is missing');
    });
  });

  // ---- Markdown Export ----

  describe("promptAnalyticsToMarkdown", () => {
    it("generates valid markdown", () => {
      const t = createPromptTemplate({
        name: "MD Test",
        template: "x",
        variables: [],
        tags: [],
        scope: "custom",
      });
      recordPromptExecution(t.id, 1, {
        qualityScore: 85,
        responseTimeMs: 300,
        tokenCount: 50,
        success: true,
      });

      const analytics = getPromptAnalytics(t.id)!;
      const md = promptAnalyticsToMarkdown(analytics);

      expect(md).toContain("# 📊 Prompt Analytics: MD Test");
      expect(md).toContain("**Versions:** 1");
    });
  });
});
