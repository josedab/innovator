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
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.workflow).toMatchObject({
        nodes: expect.any(Array),
      });
    }
  });

  it("retrieves template by ID", () => {
    const template = getWorkflowTemplate("deep-analysis");
    expect(template).not.toBeNull();
    expect(template!.id).toBe("deep-analysis");
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
    expect(t).not.toBeNull();
    expect(t!.id).toBe("team-collaboration");
    const gates = t!.workflow.nodes.filter((n) => n.type === "human-review");
    expect(gates.length).toBeGreaterThanOrEqual(2);
  });

  it("adaptive-pipeline template has a condition node", () => {
    const t = getWorkflowTemplate("adaptive-pipeline");
    expect(t).not.toBeNull();
    expect(t!.id).toBe("adaptive-pipeline");
    const conditions = t!.workflow.nodes.filter((n) => n.type === "condition");
    expect(conditions.length).toBeGreaterThanOrEqual(1);
    expect(conditions[0].condition).toMatchObject(expect.any(Object));
  });

  it("iterative-refinement template has a loop node", () => {
    const t = getWorkflowTemplate("iterative-refinement");
    expect(t).not.toBeNull();
    expect(t!.id).toBe("iterative-refinement");
    const loops = t!.workflow.nodes.filter((n) => n.type === "loop");
    expect(loops.length).toBeGreaterThanOrEqual(1);
    expect(typeof loops[0].loop).toBe("object");
  });
});
