/**
 * Tests for the Visual Innovation Orchestrator (visual-schema).
 */
import { describe, it, expect } from "vitest";
import {
  VisualDAGNodeSchema,
  VisualEdgeSchema,
  VisualWorkflowSchema,
  getVisualTemplate,
  listVisualTemplates,
  VISUAL_TEMPLATES,
} from "../visual-schema.js";
import { validateWorkflowDefinition } from "../workflow-schema.js";

describe("visual-schema", () => {
  describe("VisualDAGNodeSchema", () => {
    it("validates a minimal node", () => {
      const node = VisualDAGNodeSchema.parse({
        id: "n1",
        type: "investigate",
        name: "Investigation",
        position: { x: 100, y: 200 },
      });

      expect(node.id).toBe("n1");
      expect(node.type).toBe("investigate");
      expect(node.position.x).toBe(100);
      expect(node.status).toBe("idle");
    });

    it("validates a node with approval gate", () => {
      const node = VisualDAGNodeSchema.parse({
        id: "review",
        type: "human-review",
        name: "Expert Review",
        position: { x: 0, y: 0 },
        approval: {
          prompt: "Is this ready?",
          minApprovals: 2,
          timeoutMs: 3600000,
        },
      });

      expect(node.approval).toBeDefined();
      expect(node.approval!.minApprovals).toBe(2);
    });

    it("validates a node with conditional branch", () => {
      const node = VisualDAGNodeSchema.parse({
        id: "check",
        type: "condition",
        name: "Quality Check",
        position: { x: 0, y: 0 },
        branch: {
          condition: "score",
          operator: "gte",
          value: 80,
          trueTargets: ["proceed"],
          falseTargets: ["refine"],
        },
      });

      expect(node.branch!.operator).toBe("gte");
    });

    it("validates a node with loop config", () => {
      const node = VisualDAGNodeSchema.parse({
        id: "refine",
        type: "loop",
        name: "Refinement",
        position: { x: 0, y: 0 },
        loop: {
          maxIterations: 3,
          loopSteps: ["generate", "score"],
        },
      });

      expect(node.loop!.maxIterations).toBe(3);
    });

    it("rejects invalid node type", () => {
      expect(() =>
        VisualDAGNodeSchema.parse({
          id: "n1",
          type: "invalid-type",
          name: "Bad",
          position: { x: 0, y: 0 },
        })
      ).toThrow();
    });
  });

  describe("VisualEdgeSchema", () => {
    it("validates a minimal edge", () => {
      const edge = VisualEdgeSchema.parse({
        id: "e1",
        source: "n1",
        target: "n2",
      });

      expect(edge.id).toBe("e1");
      expect(edge.source).toBe("n1");
      expect(edge.target).toBe("n2");
    });

    it("validates a branch edge", () => {
      const edge = VisualEdgeSchema.parse({
        id: "e1",
        source: "check",
        target: "proceed",
        type: "branch-true",
        label: "Pass",
        animated: true,
      });

      expect(edge.type).toBe("branch-true");
      expect(edge.label).toBe("Pass");
      expect(edge.animated).toBe(true);
    });
  });

  describe("VisualWorkflowSchema", () => {
    it("validates a simple workflow", () => {
      const wf = VisualWorkflowSchema.parse({
        id: "wf-1",
        name: "Test Workflow",
        nodes: [{ id: "n1", type: "investigate", name: "Start", position: { x: 0, y: 0 } }],
        edges: [],
      });

      expect(wf.name).toBe("Test Workflow");
      expect(wf.version).toBe("1.0.0");
    });

    it("rejects workflow with no nodes", () => {
      expect(() =>
        VisualWorkflowSchema.parse({ id: "wf", name: "Empty", nodes: [], edges: [] })
      ).toThrow();
    });
  });

  describe("visual templates", () => {
    it("has 5 built-in templates", () => {
      expect(VISUAL_TEMPLATES).toHaveLength(5);
    });

    it("retrieves template by ID", () => {
      const template = getVisualTemplate("quick-explore");
      expect(template).toBeDefined();
      expect(template!.name).toBe("Quick Explore");
      expect(template!.category).toBe("exploration");
    });

    it("returns undefined for unknown template", () => {
      expect(getVisualTemplate("nonexistent")).toBeUndefined();
    });

    it("lists all templates", () => {
      const templates = listVisualTemplates();
      expect(templates).toHaveLength(5);

      const ids = templates.map((t) => t.id);
      expect(ids).toContain("quick-explore");
      expect(ids).toContain("deep-dive");
      expect(ids).toContain("competitive-analysis");
      expect(ids).toContain("product-launch");
      expect(ids).toContain("patent-scan");
    });

    it("each template has valid nodes and edges", () => {
      for (const template of VISUAL_TEMPLATES) {
        expect(template.workflow.nodes.length).toBeGreaterThan(0);
        expect(template.estimatedDurationMinutes).toBeGreaterThan(0);
        expect(template.difficulty).toBeDefined();

        // All edge sources/targets should reference existing nodes
        const nodeIds = new Set(template.workflow.nodes.map((n) => n.id));
        for (const edge of template.workflow.edges) {
          expect(nodeIds.has(edge.source)).toBe(true);
          expect(nodeIds.has(edge.target)).toBe(true);
        }
      }
    });

    it("patent-scan template has conditional branch", () => {
      const patent = getVisualTemplate("patent-scan")!;
      const conditionNode = patent.workflow.nodes.find((n) => n.type === "condition");
      expect(conditionNode).toBeDefined();
      expect(conditionNode!.branch).toBeDefined();
    });

    it("deep-dive template has human-review gate", () => {
      const deepDive = getVisualTemplate("deep-dive")!;
      const reviewNode = deepDive.workflow.nodes.find((n) => n.type === "human-review");
      expect(reviewNode).toBeDefined();
      expect(reviewNode!.approval).toBeDefined();
    });
  });
});

describe("workflow-schema validation", () => {
  it("validates a correct workflow definition", () => {
    const result = validateWorkflowDefinition({
      name: "Test Pipeline",
      steps: [
        { id: "s1", name: "Investigate", type: "investigate", inputs: [], outputs: [] },
        { id: "s2", name: "Generate", type: "generate", inputs: [], outputs: [] },
      ],
      connections: [{ from: "s1", to: "s2" }],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects unknown step references in connections", () => {
    const result = validateWorkflowDefinition({
      name: "Bad",
      steps: [{ id: "s1", name: "Investigate", type: "investigate", inputs: [], outputs: [] }],
      connections: [{ from: "s1", to: "nonexistent" }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
  });
});
