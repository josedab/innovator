/**
 * Tests for the Smart Prompt Studio module.
 */

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
} from "../index.js";
import type { PromptTemplate } from "../index.js";

// ---- Helpers ----

function createTestTemplate(
  overrides?: Partial<Omit<PromptTemplate, "id" | "createdAt" | "updatedAt">>
) {
  return createPromptTemplate({
    name: "Test Template",
    template: "Hello {name}, welcome to {product}!",
    variables: [
      { name: "name", required: true },
      { name: "product", required: true, defaultValue: "Innovator" },
    ],
    tags: ["test", "greeting"],
    scope: "investigation",
    ...overrides,
  });
}

// ---- Tests ----

beforeEach(() => {
  clearPromptStudio();
});

describe("prompt-studio", () => {
  describe("createPromptTemplate", () => {
    it("creates a template with generated ID and timestamps", () => {
      const tpl = createTestTemplate();
      expect(tpl.id).toMatch(/^pt-/);
      expect(tpl.name).toBe("Test Template");
      expect(tpl.template).toContain("{name}");
      expect(tpl.variables).toHaveLength(2);
      expect(tpl.tags).toEqual(["test", "greeting"]);
      expect(tpl.scope).toBe("investigation");
      expect(tpl.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(tpl.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("initializes version history with version 1", () => {
      const tpl = createTestTemplate();
      const history = getVersionHistory(tpl.id);
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe(1);
      expect(history[0].changeMessage).toBe("Initial version");
    });
  });

  describe("getPromptTemplate", () => {
    it("retrieves a created template", () => {
      const tpl = createTestTemplate();
      const retrieved = getPromptTemplate(tpl.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(tpl.id);
    });

    it("returns undefined for non-existent ID", () => {
      expect(getPromptTemplate("nonexistent")).toBeUndefined();
    });
  });

  describe("updatePromptTemplate", () => {
    it("updates template content and creates version history entry", () => {
      const tpl = createTestTemplate();
      const updated = updatePromptTemplate(
        tpl.id,
        "Updated: Hello {name}!",
        "Simplified greeting",
        "author@test.com"
      );
      expect(updated).toBeDefined();
      expect(updated!.template).toBe("Updated: Hello {name}!");

      const history = getVersionHistory(tpl.id);
      expect(history).toHaveLength(2);
      expect(history[1].version).toBe(2);
      expect(history[1].changeMessage).toBe("Simplified greeting");
      expect(history[1].author).toBe("author@test.com");
    });

    it("returns undefined for non-existent template", () => {
      const result = updatePromptTemplate("fake-id", "new", "msg");
      expect(result).toBeUndefined();
    });
  });

  describe("getVersionHistory", () => {
    it("returns ordered versions after multiple updates", () => {
      const tpl = createTestTemplate();
      updatePromptTemplate(tpl.id, "v2", "Second");
      updatePromptTemplate(tpl.id, "v3", "Third");

      const history = getVersionHistory(tpl.id);
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
    });

    it("returns empty array for non-existent template", () => {
      expect(getVersionHistory("nonexistent")).toEqual([]);
    });
  });

  describe("getTemplateVersion", () => {
    it("retrieves a specific version", () => {
      const tpl = createTestTemplate();
      updatePromptTemplate(tpl.id, "v2 content", "Update");

      const v1 = getTemplateVersion(tpl.id, 1);
      expect(v1).toBeDefined();
      expect(v1!.template).toContain("{name}");

      const v2 = getTemplateVersion(tpl.id, 2);
      expect(v2).toBeDefined();
      expect(v2!.template).toBe("v2 content");
    });

    it("returns undefined for non-existent version", () => {
      const tpl = createTestTemplate();
      expect(getTemplateVersion(tpl.id, 99)).toBeUndefined();
    });
  });

  describe("listPromptTemplates", () => {
    it("lists all templates", () => {
      createTestTemplate({ name: "A" });
      createTestTemplate({ name: "B" });
      expect(listPromptTemplates()).toHaveLength(2);
    });

    it("filters by scope", () => {
      createTestTemplate({ scope: "investigation" });
      createTestTemplate({ scope: "generation" });

      const result = listPromptTemplates({ scope: "investigation" });
      expect(result).toHaveLength(1);
      expect(result[0].scope).toBe("investigation");
    });

    it("filters by tag", () => {
      createTestTemplate({ tags: ["alpha"] });
      createTestTemplate({ tags: ["beta"] });

      const result = listPromptTemplates({ tag: "alpha" });
      expect(result).toHaveLength(1);
    });

    it("filters by query (name match)", () => {
      createTestTemplate({ name: "Marketing Prompt" });
      createTestTemplate({ name: "Technical Prompt" });

      const result = listPromptTemplates({ query: "marketing" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Marketing Prompt");
    });

    it("returns empty array when no templates exist", () => {
      expect(listPromptTemplates()).toEqual([]);
    });
  });

  describe("deletePromptTemplate", () => {
    it("removes template and its history", () => {
      const tpl = createTestTemplate();
      expect(deletePromptTemplate(tpl.id)).toBe(true);
      expect(getPromptTemplate(tpl.id)).toBeUndefined();
      expect(getVersionHistory(tpl.id)).toEqual([]);
    });

    it("returns false for non-existent template", () => {
      expect(deletePromptTemplate("nonexistent")).toBe(false);
    });
  });

  describe("revertToVersion", () => {
    it("reverts to a previous version", () => {
      const tpl = createTestTemplate();
      const originalTemplate = tpl.template;
      updatePromptTemplate(tpl.id, "v2 content", "Update");

      const reverted = revertToVersion(tpl.id, 1);
      expect(reverted).toBeDefined();
      expect(reverted!.template).toBe(originalTemplate);

      const history = getVersionHistory(tpl.id);
      expect(history).toHaveLength(3); // v1, v2, revert
      expect(history[2].changeMessage).toContain("Reverted to version 1");
    });
  });

  describe("diffTemplateVersions", () => {
    it("computes diff between two versions", () => {
      const tpl = createTestTemplate({ template: "line1\nline2\nline3" });
      updatePromptTemplate(tpl.id, "line1\nmodified\nline3\nline4", "Change");

      const diff = diffTemplateVersions(tpl.id, 1, 2);
      expect(diff).toBeDefined();
      expect(diff!.unchanged).toContain("line1");
      expect(diff!.unchanged).toContain("line3");
      expect(diff!.additions).toContain("modified");
      expect(diff!.additions).toContain("line4");
      expect(diff!.deletions).toContain("line2");
    });
  });

  describe("performance tracking", () => {
    it("records execution and calculates performance", () => {
      const tpl = createTestTemplate();
      recordPromptExecution(tpl.id, 1, {
        qualityScore: 80,
        responseTimeMs: 500,
        tokenCount: 200,
        success: true,
      });
      recordPromptExecution(tpl.id, 1, {
        qualityScore: 90,
        responseTimeMs: 400,
        tokenCount: 180,
        success: true,
      });

      const perf = getPromptPerformance(tpl.id, 1);
      expect(perf).toBeDefined();
      expect(perf!.usageCount).toBe(2);
      expect(perf!.avgQualityScore).toBe(85);
      expect(perf!.successRate).toBe(1);
      expect(perf!.avgTokenCount).toBe(190);
    });

    it("returns undefined when no performance data exists", () => {
      const tpl = createTestTemplate();
      expect(getPromptPerformance(tpl.id, 1)).toBeUndefined();
    });
  });

  describe("getPromptAnalytics", () => {
    it("returns analytics for a template with performance data", () => {
      const tpl = createTestTemplate();
      recordPromptExecution(tpl.id, 1, {
        qualityScore: 80,
        responseTimeMs: 500,
        tokenCount: 200,
        success: true,
      });

      const analytics = getPromptAnalytics(tpl.id);
      expect(analytics).toBeDefined();
      expect(analytics!.templateId).toBe(tpl.id);
      expect(analytics!.totalVersions).toBe(1);
      expect(analytics!.currentVersion).toBe(1);
      expect(analytics!.versionPerformance).toHaveLength(1);
    });

    it("returns undefined for non-existent template", () => {
      expect(getPromptAnalytics("nonexistent")).toBeUndefined();
    });
  });

  describe("interpolateTemplate", () => {
    it("interpolates variables", () => {
      const tpl = createTestTemplate();
      const result = interpolateTemplate(tpl, { name: "Alice", product: "TestApp" });
      expect(result).toBe("Hello Alice, welcome to TestApp!");
    });

    it("uses default values for missing optional variables", () => {
      const tpl = createTestTemplate();
      const result = interpolateTemplate(tpl, { name: "Bob" });
      expect(result).toBe("Hello Bob, welcome to Innovator!");
    });

    it("throws for missing required variable without default", () => {
      const tpl = createTestTemplate({
        template: "Hello {name}!",
        variables: [{ name: "name", required: true }],
      });
      expect(() => interpolateTemplate(tpl, {})).toThrow('Required variable "name" is missing');
    });
  });

  describe("promptAnalyticsToMarkdown", () => {
    it("renders analytics as markdown with all sections", () => {
      const tpl = createTestTemplate();
      recordPromptExecution(tpl.id, 1, {
        qualityScore: 85,
        responseTimeMs: 300,
        tokenCount: 150,
        success: true,
      });

      const analytics = getPromptAnalytics(tpl.id)!;
      const md = promptAnalyticsToMarkdown(analytics);

      expect(md).toContain("Prompt Analytics");
      expect(md).toContain("Test Template");
      expect(md).toContain("Versions");
      expect(md).toContain("Performance by Version");
    });
  });

  describe("edge cases", () => {
    it("handles duplicate template IDs gracefully (IDs are auto-generated)", () => {
      const t1 = createTestTemplate({ name: "Same Name" });
      const t2 = createTestTemplate({ name: "Same Name" });
      expect(t1.id).not.toBe(t2.id);
      expect(listPromptTemplates()).toHaveLength(2);
    });
  });
});
