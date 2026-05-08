import { describe, it, expect, beforeEach } from "vitest";
import {
  executeDAG,
  validateDAG,
  serializeDAGState,
  DAGWorkflowSchema,
  getWorkflowTemplates,
  getWorkflowTemplate,
  registerWorkflowTemplate,
  unregisterWorkflowTemplate,
  getTemplatesByCategory,
  clearCustomTemplates,
} from "../orchestration/index.js";
import type { DAGWorkflow, DAGNode } from "../orchestration/dag-engine.js";
import type { WorkflowTemplate } from "../orchestration/templates.js";

function makeSimpleWorkflow(): DAGWorkflow {
  return DAGWorkflowSchema.parse({
    id: "test-workflow",
    name: "Test Workflow",
    version: "1.0.0",
    nodes: [
      { id: "step-1", type: "investigate", name: "Step 1", dependsOn: [] },
      { id: "step-2", type: "generate", name: "Step 2", dependsOn: ["step-1"] },
      { id: "step-3", type: "synthesize", name: "Step 3", dependsOn: ["step-2"] },
    ],
  });
}

function makeParallelWorkflow(): DAGWorkflow {
  return DAGWorkflowSchema.parse({
    id: "parallel-wf",
    name: "Parallel Workflow",
    nodes: [
      { id: "root", type: "investigate", name: "Root", dependsOn: [] },
      { id: "branch-a", type: "generate", name: "Branch A", dependsOn: ["root"] },
      { id: "branch-b", type: "generate", name: "Branch B", dependsOn: ["root"] },
      { id: "merge", type: "synthesize", name: "Merge", dependsOn: ["branch-a", "branch-b"] },
    ],
  });
}

function makeConditionalWorkflow(): DAGWorkflow {
  return DAGWorkflowSchema.parse({
    id: "conditional-wf",
    name: "Conditional Workflow",
    nodes: [
      { id: "start", type: "investigate", name: "Start", dependsOn: [] },
      {
        id: "check",
        type: "condition",
        name: "Check",
        dependsOn: ["start"],
        condition: { field: "start.output.complexity", operator: "gte", value: 5 },
        branches: { trueBranch: ["deep"], falseBranch: ["quick"] },
      },
      { id: "deep", type: "generate", name: "Deep", dependsOn: ["check"] },
      { id: "quick", type: "generate", name: "Quick", dependsOn: ["check"] },
      {
        id: "end",
        type: "synthesize",
        name: "End",
        dependsOn: ["deep", "quick"],
        continueOnError: true,
      },
    ],
  });
}

describe("DAG Engine", () => {
  describe("validateDAG", () => {
    it("validates a simple valid workflow", () => {
      const wf = makeSimpleWorkflow();
      const result = validateDAG(wf);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates a parallel workflow", () => {
      const wf = makeParallelWorkflow();
      const result = validateDAG(wf);
      expect(result.valid).toBe(true);
    });

    it("detects circular dependencies", () => {
      const wf = DAGWorkflowSchema.parse({
        id: "cycle",
        name: "Cycle",
        nodes: [
          { id: "a", type: "investigate", name: "A", dependsOn: ["b"] },
          { id: "b", type: "generate", name: "B", dependsOn: ["a"] },
        ],
      });
      const result = validateDAG(wf);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Circular"))).toBe(true);
    });

    it("detects unknown dependency references", () => {
      const wf = DAGWorkflowSchema.parse({
        id: "bad-ref",
        name: "Bad Ref",
        nodes: [{ id: "a", type: "investigate", name: "A", dependsOn: ["nonexistent"] }],
      });
      const result = validateDAG(wf);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("unknown node"))).toBe(true);
    });

    it("warns about condition nodes without conditions", () => {
      const wf = DAGWorkflowSchema.parse({
        id: "no-cond",
        name: "No Condition",
        nodes: [{ id: "a", type: "condition", name: "A", dependsOn: [] }],
      });
      const result = validateDAG(wf);
      expect(result.warnings.some((w) => w.includes("no condition"))).toBe(true);
    });

    it("warns about human-review nodes without gate config", () => {
      const wf = DAGWorkflowSchema.parse({
        id: "no-gate",
        name: "No Gate",
        nodes: [{ id: "a", type: "human-review", name: "A", dependsOn: [] }],
      });
      const result = validateDAG(wf);
      expect(result.warnings.some((w) => w.includes("no gate"))).toBe(true);
    });
  });

  describe("executeDAG", () => {
    it("executes a simple linear workflow", async () => {
      const wf = makeSimpleWorkflow();
      const state = await executeDAG(wf);
      expect(state.status).toBe("completed");
      expect(state.nodeResults.size).toBe(3);
      for (const result of state.nodeResults.values()) {
        expect(result.status).toBe("completed");
      }
    });

    it("executes parallel branches", async () => {
      const wf = makeParallelWorkflow();
      const state = await executeDAG(wf);
      expect(state.status).toBe("completed");
      expect(state.nodeResults.get("branch-a")?.status).toBe("completed");
      expect(state.nodeResults.get("branch-b")?.status).toBe("completed");
      expect(state.nodeResults.get("merge")?.status).toBe("completed");
    });

    it("handles abort signal", async () => {
      const wf = makeSimpleWorkflow();
      const controller = new AbortController();
      controller.abort();
      const state = await executeDAG(wf, { signal: controller.signal });
      expect(state.status).toBe("cancelled");
    });

    it("executes with custom executor", async () => {
      const wf = makeSimpleWorkflow();
      const executed: string[] = [];
      const state = await executeDAG(wf, {
        executor: async (node) => {
          executed.push(node.id);
          return { executed: true };
        },
      });
      expect(state.status).toBe("completed");
      expect(executed).toContain("step-1");
      expect(executed).toContain("step-2");
      expect(executed).toContain("step-3");
    });

    it("reports progress via callback", async () => {
      const wf = makeSimpleWorkflow();
      const progressEvents: string[] = [];
      await executeDAG(wf, {
        onProgress: (_state, nodeResult) => {
          progressEvents.push(`${nodeResult.nodeId}:${nodeResult.status}`);
        },
      });
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some((e) => e.includes("completed"))).toBe(true);
    });

    it("handles human-review gate with auto-approve", async () => {
      const wf = DAGWorkflowSchema.parse({
        id: "gate-test",
        name: "Gate Test",
        nodes: [
          { id: "start", type: "investigate", name: "Start", dependsOn: [] },
          {
            id: "gate",
            type: "human-review",
            name: "Gate",
            dependsOn: ["start"],
            gate: { prompt: "Approve?", autoApprove: true, timeout: 60 },
          },
          { id: "end", type: "synthesize", name: "End", dependsOn: ["gate"] },
        ],
      });
      const state = await executeDAG(wf);
      expect(state.status).toBe("completed");
      expect(state.nodeResults.get("gate")?.output).toEqual(
        expect.objectContaining({ approved: true })
      );
    });

    it("handles human-review gate with handler", async () => {
      const wf = DAGWorkflowSchema.parse({
        id: "gate-handler-test",
        name: "Gate Handler",
        nodes: [
          { id: "start", type: "investigate", name: "Start", dependsOn: [] },
          {
            id: "gate",
            type: "human-review",
            name: "Gate",
            dependsOn: ["start"],
            gate: { prompt: "Approve?", autoApprove: false, timeout: 60 },
          },
        ],
      });
      const state = await executeDAG(wf, {
        onGate: async (_nodeId, _prompt) => ({ approved: true, feedback: "LGTM" }),
      });
      expect(state.status).toBe("completed");
      const gateResult = state.nodeResults.get("gate");
      expect(gateResult?.output).toEqual(
        expect.objectContaining({ approved: true, feedback: "LGTM" })
      );
    });

    it("handles node retries", async () => {
      let callCount = 0;
      const wf = DAGWorkflowSchema.parse({
        id: "retry-test",
        name: "Retry",
        nodes: [{ id: "flaky", type: "custom", name: "Flaky", dependsOn: [], retries: 2 }],
      });
      const state = await executeDAG(wf, {
        executor: async () => {
          callCount++;
          if (callCount < 3) throw new Error("transient error");
          return { ok: true };
        },
      });
      expect(state.status).toBe("completed");
      expect(callCount).toBe(3);
    });

    it("handles continueOnError", async () => {
      const wf = DAGWorkflowSchema.parse({
        id: "continue-test",
        name: "Continue",
        nodes: [
          { id: "fail", type: "custom", name: "Fail", dependsOn: [], continueOnError: true },
          { id: "after", type: "synthesize", name: "After", dependsOn: ["fail"] },
        ],
      });
      const state = await executeDAG(wf, {
        executor: async (node) => {
          if (node.id === "fail") throw new Error("boom");
          return {};
        },
      });
      expect(state.status).toBe("completed");
      expect(state.nodeResults.get("fail")?.output).toEqual(
        expect.objectContaining({ continued: true })
      );
      expect(state.nodeResults.get("after")?.status).toBe("completed");
    });
  });

  describe("serializeDAGState", () => {
    it("serializes execution state to JSON-safe object", async () => {
      const wf = makeSimpleWorkflow();
      const state = await executeDAG(wf);
      const serialized = serializeDAGState(state);
      expect(serialized.workflowId).toBe("test-workflow");
      expect(serialized.status).toBe("completed");
      expect(serialized.nodeResults).toBeDefined();
      // Must be JSON-serializable
      expect(() => JSON.stringify(serialized)).not.toThrow();
    });
  });
});

describe("Workflow Templates", () => {
  beforeEach(() => {
    clearCustomTemplates();
  });

  it("returns built-in templates", () => {
    const templates = getWorkflowTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
  });

  it("finds template by ID", () => {
    const template = getWorkflowTemplate("rapid-innovation");
    expect(template).toBeDefined();
    expect(template!.name).toContain("Rapid");
  });

  it("returns undefined for unknown template ID", () => {
    expect(getWorkflowTemplate("nonexistent")).toBeUndefined();
  });

  it("all built-in templates have valid DAG workflows", () => {
    for (const t of getWorkflowTemplates()) {
      const result = validateDAG(t.workflow);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("filters templates by category", () => {
    const advanced = getTemplatesByCategory("advanced");
    expect(advanced.length).toBeGreaterThan(0);
    expect(advanced.every((t) => t.category === "advanced")).toBe(true);
  });

  it("registers and retrieves custom templates", () => {
    const custom: WorkflowTemplate = {
      id: "custom-test",
      name: "Custom",
      description: "Test",
      category: "standard",
      tags: [],
      workflow: makeSimpleWorkflow(),
    };
    registerWorkflowTemplate(custom);
    expect(getWorkflowTemplate("custom-test")).toBeDefined();
    expect(getWorkflowTemplates().length).toBeGreaterThan(5);
  });

  it("unregisters custom templates", () => {
    const custom: WorkflowTemplate = {
      id: "to-remove",
      name: "Remove Me",
      description: "Test",
      category: "standard",
      tags: [],
      workflow: makeSimpleWorkflow(),
    };
    registerWorkflowTemplate(custom);
    expect(unregisterWorkflowTemplate("to-remove")).toBe(true);
    expect(getWorkflowTemplate("to-remove")).toBeUndefined();
  });

  it("rejects template IDs that are too long", () => {
    const custom: WorkflowTemplate = {
      id: "a".repeat(101),
      name: "Too Long",
      description: "Test",
      category: "standard",
      tags: [],
      workflow: makeSimpleWorkflow(),
    };
    expect(() => registerWorkflowTemplate(custom)).toThrow();
  });

  it("clearCustomTemplates removes only custom templates", () => {
    registerWorkflowTemplate({
      id: "temp",
      name: "Temp",
      description: "Test",
      category: "standard",
      tags: [],
      workflow: makeSimpleWorkflow(),
    });
    clearCustomTemplates();
    expect(getWorkflowTemplate("temp")).toBeUndefined();
    expect(getWorkflowTemplate("rapid-innovation")).toBeDefined();
  });
});
