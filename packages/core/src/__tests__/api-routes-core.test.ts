import { describe, it, expect } from "vitest";
import { getWorkflowTemplates, getWorkflowTemplate, validateDAG } from "../orchestration/index.js";

/**
 * Tests for workflow and playground API routes.
 * Since API routes require Next.js request objects, we test
 * the underlying core functions they delegate to.
 */

describe("Workflows API - Core Functions", () => {
  it("lists all templates", () => {
    const templates = getWorkflowTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
    for (const t of templates) {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.workflow).toBeDefined();
    }
  });

  it("retrieves template by ID", () => {
    const template = getWorkflowTemplate("deep-analysis");
    expect(template).toBeDefined();
    expect(template!.category).toBe("advanced");
  });

  it("validates all built-in templates pass validation", () => {
    for (const t of getWorkflowTemplates()) {
      const result = validateDAG(t.workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("all template workflows have at least one root node", () => {
    for (const t of getWorkflowTemplates()) {
      const roots = t.workflow.nodes.filter((n) => n.dependsOn.length === 0);
      expect(roots.length).toBeGreaterThan(0);
    }
  });

  it("all templates have unique IDs", () => {
    const templates = getWorkflowTemplates();
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("team-collaboration template has human-review gates", () => {
    const t = getWorkflowTemplate("team-collaboration");
    expect(t).toBeDefined();
    const gates = t!.workflow.nodes.filter((n) => n.type === "human-review");
    expect(gates.length).toBeGreaterThanOrEqual(2);
  });

  it("adaptive-pipeline template has a condition node", () => {
    const t = getWorkflowTemplate("adaptive-pipeline");
    expect(t).toBeDefined();
    const conditions = t!.workflow.nodes.filter((n) => n.type === "condition");
    expect(conditions.length).toBeGreaterThanOrEqual(1);
    expect(conditions[0].condition).toBeDefined();
  });

  it("iterative-refinement template has a loop node", () => {
    const t = getWorkflowTemplate("iterative-refinement");
    expect(t).toBeDefined();
    const loops = t!.workflow.nodes.filter((n) => n.type === "loop");
    expect(loops.length).toBeGreaterThanOrEqual(1);
    expect(loops[0].loop).toBeDefined();
  });
});
