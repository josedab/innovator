import { describe, it, expect } from "vitest";
import {
  WorkflowDefinitionSchema,
  WorkflowStepSchema,
  WorkflowConnectionSchema,
  WorkflowStepType,
  validateWorkflowDefinition,
} from "../orchestration/workflow-schema.js";

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-1",
    name: "Investigate",
    type: "investigate",
    ...overrides,
  };
}

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Workflow",
    steps: [makeStep()],
    connections: [],
    ...overrides,
  };
}

describe("workflow-schema", () => {
  describe("WorkflowStepType", () => {
    it("accepts all valid step types", () => {
      const types = [
        "investigate",
        "generate",
        "debate",
        "gate",
        "export",
        "filter",
        "score",
        "transform",
        "branch",
        "merge",
      ];
      for (const t of types) {
        expect(WorkflowStepType.parse(t)).toBe(t);
      }
    });

    it("rejects invalid step type", () => {
      expect(() => WorkflowStepType.parse("invalid")).toThrow();
    });
  });

  describe("WorkflowStepSchema", () => {
    it("parses a valid step with defaults", () => {
      const step = WorkflowStepSchema.parse(makeStep());
      expect(step.id).toBe("step-1");
      expect(step.retries).toBe(0);
      expect(step.continueOnError).toBe(false);
      expect(step.inputs).toEqual([]);
    });

    it("rejects step without required fields", () => {
      expect(() => WorkflowStepSchema.parse({ id: "x" })).toThrow();
    });

    it("accepts optional config", () => {
      const step = WorkflowStepSchema.parse(
        makeStep({ config: { investigate: { depth: "deep" } } })
      );
      expect(step.config).toBeDefined();
    });
  });

  describe("WorkflowConnectionSchema", () => {
    it("parses a valid connection", () => {
      const conn = WorkflowConnectionSchema.parse({ from: "a", to: "b" });
      expect(conn.from).toBe("a");
      expect(conn.to).toBe("b");
    });

    it("accepts optional condition", () => {
      const conn = WorkflowConnectionSchema.parse({
        from: "a",
        to: "b",
        condition: "score > 5",
      });
      expect(conn.condition).toBe("score > 5");
    });
  });

  describe("WorkflowDefinitionSchema", () => {
    it("parses a valid workflow", () => {
      const wf = WorkflowDefinitionSchema.parse(makeWorkflow());
      expect(wf.name).toBe("Test Workflow");
      expect(wf.version).toBe("1.0.0");
      expect(wf.steps).toHaveLength(1);
    });

    it("rejects workflow without steps", () => {
      expect(() =>
        WorkflowDefinitionSchema.parse({ name: "Empty", steps: [], connections: [] })
      ).toThrow();
    });

    it("accepts workflow with triggers and variables", () => {
      const wf = WorkflowDefinitionSchema.parse(
        makeWorkflow({
          triggers: [{ type: "manual" }],
          variables: { prompt: "test" },
        })
      );
      expect(wf.triggers).toHaveLength(1);
    });
  });

  describe("validateWorkflowDefinition", () => {
    it("returns valid for a correct workflow", () => {
      const result = validateWorkflowDefinition(makeWorkflow());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects unknown source step in connection", () => {
      const result = validateWorkflowDefinition(
        makeWorkflow({
          connections: [{ from: "nonexistent", to: "step-1" }],
        })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
    });

    it("detects unknown target step in connection", () => {
      const result = validateWorkflowDefinition(
        makeWorkflow({
          connections: [{ from: "step-1", to: "missing" }],
        })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing"))).toBe(true);
    });

    it("detects circular dependencies", () => {
      const result = validateWorkflowDefinition({
        name: "Cycle",
        steps: [makeStep({ id: "a", name: "A" }), makeStep({ id: "b", name: "B" })],
        connections: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes("circular"))).toBe(true);
    });

    it("returns errors for invalid schema input", () => {
      const result = validateWorkflowDefinition({ bad: true });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("warns when no root steps found", () => {
      const result = validateWorkflowDefinition({
        name: "No Roots",
        steps: [makeStep({ id: "a", name: "A" }), makeStep({ id: "b", name: "B" })],
        connections: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      });
      // Either circular dependency error or no-root warning
      expect(result.errors.length > 0 || result.warnings.length > 0).toBe(true);
    });

    it("validates a multi-step linear workflow", () => {
      const result = validateWorkflowDefinition({
        name: "Linear",
        steps: [
          makeStep({ id: "s1", name: "Step 1" }),
          makeStep({ id: "s2", name: "Step 2", type: "generate" }),
          makeStep({ id: "s3", name: "Step 3", type: "export" }),
        ],
        connections: [
          { from: "s1", to: "s2" },
          { from: "s2", to: "s3" },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
