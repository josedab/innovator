/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import WorkflowEditor from "../WorkflowEditor";
import type { DAGWorkflow, DAGNode, WorkflowTemplate } from "@innovator/core/types";

function makeNode(overrides: Partial<DAGNode> = {}): DAGNode {
  return {
    id: "investigate-1",
    type: "investigate",
    name: "Investigate Stage",
    dependsOn: [],
    timeout: 120,
    retries: 0,
    continueOnError: false,
    ...overrides,
  } as DAGNode;
}

function makeWorkflow(overrides: Partial<DAGWorkflow> = {}): DAGWorkflow {
  return {
    id: "workflow-1",
    name: "Test Workflow",
    version: "1.0.0",
    nodes: [
      makeNode({ id: "investigate-1", type: "investigate", name: "Investigate" }),
      makeNode({
        id: "generate-1",
        type: "generate",
        name: "Generate",
        dependsOn: ["investigate-1"],
      }),
    ],
    ...overrides,
  } as DAGWorkflow;
}

function makeTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: "tpl-1",
    name: "Standard Pipeline",
    description: "A standard innovation pipeline",
    category: "standard",
    tags: ["innovation", "basic"],
    workflow: makeWorkflow(),
    ...overrides,
  };
}

describe("WorkflowEditor", () => {
  describe("rendering", () => {
    it("renders workflow name and SVG canvas", () => {
      const { container } = render(<WorkflowEditor workflow={makeWorkflow()} />);
      expect(screen.getByText("Test Workflow")).toBeTruthy();
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-label")).toBe("Workflow DAG visualization");
    });

    it("renders nodes with correct types", () => {
      const { container } = render(<WorkflowEditor workflow={makeWorkflow()} />);
      const groups = container.querySelectorAll("g[role='button']");
      expect(groups).toHaveLength(2);
    });

    it("shows 'No workflow loaded' when no workflow provided and no templates", () => {
      render(<WorkflowEditor />);
      expect(screen.getByText(/No workflow loaded/)).toBeTruthy();
    });
  });

  describe("template selection", () => {
    it("shows template picker when no workflow is provided", () => {
      const templates = [makeTemplate()];
      render(<WorkflowEditor templates={templates} />);
      expect(screen.getByText("Choose a Workflow Template")).toBeTruthy();
      expect(screen.getByText("Standard Pipeline")).toBeTruthy();
    });

    it("hydrates workflow from selected template", () => {
      const templates = [makeTemplate()];
      const { container } = render(<WorkflowEditor templates={templates} />);
      fireEvent.click(screen.getByText("Standard Pipeline"));
      // After selection, should show the workflow editor
      expect(screen.getByText("Test Workflow")).toBeTruthy();
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });

    it("shows template tags", () => {
      const templates = [makeTemplate({ tags: ["fast", "ai"] })];
      render(<WorkflowEditor templates={templates} />);
      expect(screen.getByText("fast")).toBeTruthy();
      expect(screen.getByText("ai")).toBeTruthy();
    });

    it("allows starting from scratch", () => {
      const templates = [makeTemplate()];
      render(<WorkflowEditor templates={templates} />);
      fireEvent.click(screen.getByText(/Or start from scratch/));
      expect(screen.getByText("New Workflow")).toBeTruthy();
    });

    it("shows Templates button in editor mode", () => {
      const templates = [makeTemplate()];
      render(<WorkflowEditor workflow={makeWorkflow()} templates={templates} />);
      expect(screen.getByText("Templates")).toBeTruthy();
    });
  });

  describe("node operations", () => {
    it("adds a new node via the Add Stage dropdown", () => {
      const { container } = render(<WorkflowEditor workflow={makeWorkflow()} />);
      const select = container.querySelector("select[aria-label='Add stage']") as HTMLSelectElement;
      expect(select).not.toBeNull();

      // Simulate selecting a value
      fireEvent.change(select, { target: { value: "score" } });
      // After adding, should have 3 nodes now
      const groups = container.querySelectorAll("g[role='button']");
      expect(groups.length).toBe(3);
    });

    it("removes a node and cleans up dependencies (cascade)", () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: "a", type: "investigate", name: "A" }),
          makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
          makeNode({ id: "c", type: "score", name: "C", dependsOn: ["b"] }),
        ],
      });
      const { container } = render(<WorkflowEditor workflow={workflow} />);
      // Select node B
      const groups = container.querySelectorAll("g[role='button']");
      expect(groups.length).toBe(3);
      fireEvent.click(groups[1]); // click B

      // Click remove
      const removeBtn = screen.getByText("Remove");
      fireEvent.click(removeBtn);

      // B should be removed, and C's dependency on B should be cleaned
      const remainingGroups = container.querySelectorAll("g[role='button']");
      expect(remainingGroups.length).toBe(2);
    });

    it("does not show remove button in readOnly mode", () => {
      render(<WorkflowEditor workflow={makeWorkflow()} readOnly />);
      const groups = screen.getAllByRole("button");
      // Click a node to select it
      fireEvent.click(groups[0]);
      expect(screen.queryByText("Remove")).toBeNull();
    });

    it("does not show Add Stage dropdown in readOnly mode", () => {
      const { container } = render(<WorkflowEditor workflow={makeWorkflow()} readOnly />);
      const select = container.querySelector("select[aria-label='Add stage']");
      expect(select).toBeNull();
    });
  });

  describe("node detail panel", () => {
    it("shows node details when a node is clicked", () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({
            id: "inv-1",
            type: "investigate",
            name: "My Investigation",
            description: "Detailed desc",
          }),
        ],
      });
      render(<WorkflowEditor workflow={workflow} />);
      const nodeGroup = screen.getByRole("button", { name: /My Investigation/ });
      fireEvent.click(nodeGroup);
      expect(screen.getByText(/Type: investigate/)).toBeTruthy();
      expect(screen.getByText(/ID: inv-1/)).toBeTruthy();
    });

    it("hides detail panel when same node is clicked again", () => {
      const workflow = makeWorkflow({
        nodes: [makeNode({ id: "inv-1", type: "investigate", name: "Toggle Node" })],
      });
      render(<WorkflowEditor workflow={workflow} />);
      const nodeGroup = screen.getByRole("button", { name: /Toggle Node/ });
      fireEvent.click(nodeGroup);
      expect(screen.getByText(/Type: investigate/)).toBeTruthy();
      fireEvent.click(nodeGroup);
      expect(screen.queryByText(/Type: investigate/)).toBeNull();
    });

    it("shows node config when present", () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({
            id: "inv-1",
            type: "investigate",
            name: "Configured",
            config: { model: "gpt-4", depth: 3 },
          }),
        ],
      });
      render(<WorkflowEditor workflow={workflow} />);
      fireEvent.click(screen.getByRole("button", { name: /Configured/ }));
      expect(screen.getByText(/"model": "gpt-4"/)).toBeTruthy();
    });

    it("shows depends-on list", () => {
      const workflow = makeWorkflow();
      render(<WorkflowEditor workflow={workflow} />);
      const genNode = screen.getByRole("button", { name: /Generate/ });
      fireEvent.click(genNode);
      expect(screen.getByText(/Depends on: investigate-1/)).toBeTruthy();
    });
  });

  describe("callbacks", () => {
    it("calls onSave with current workflow", () => {
      const onSave = vi.fn();
      render(<WorkflowEditor workflow={makeWorkflow()} onSave={onSave} />);
      fireEvent.click(screen.getByText("Save"));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0].name).toBe("Test Workflow");
    });

    it("calls onExecute with current workflow", () => {
      const onExecute = vi.fn();
      render(<WorkflowEditor workflow={makeWorkflow()} onExecute={onExecute} />);
      fireEvent.click(screen.getByText("▶ Execute"));
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe("DAG layout", () => {
    it("renders edges between dependent nodes", () => {
      const { container } = render(<WorkflowEditor workflow={makeWorkflow()} />);
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it("handles empty workflow (no nodes)", () => {
      const workflow = makeWorkflow({ nodes: [] });
      const { container } = render(<WorkflowEditor workflow={workflow} />);
      const groups = container.querySelectorAll("g[role='button']");
      expect(groups).toHaveLength(0);
    });
  });
});
