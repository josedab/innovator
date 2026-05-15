import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateDAG,
  executeDAG,
  serializeDAGState,
  type DAGWorkflow,
  type DAGNode,
  type DAGExecutionState,
} from "../dag-engine.js";

// ---- Helpers ----

function makeNode(
  overrides: Partial<DAGNode> & { id: string; type: DAGNode["type"]; name: string }
): DAGNode {
  return {
    dependsOn: [],
    timeout: 300,
    retries: 0,
    continueOnError: false,
    ...overrides,
  } as DAGNode;
}

function makeWorkflow(nodes: DAGNode[], overrides?: Partial<DAGWorkflow>): DAGWorkflow {
  return {
    id: "test-wf",
    name: "Test Workflow",
    version: "1.0.0",
    nodes,
    ...overrides,
  };
}

// ---- validateDAG() ----

describe("validateDAG", () => {
  it("validates a linear chain (A → B → C)", () => {
    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A" }),
      makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
      makeNode({ id: "c", type: "synthesize", name: "C", dependsOn: ["b"] }),
    ]);
    const result = validateDAG(wf);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates a diamond dependency (A → B, A → C, B+C → D)", () => {
    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A" }),
      makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
      makeNode({ id: "c", type: "score", name: "C", dependsOn: ["a"] }),
      makeNode({ id: "d", type: "synthesize", name: "D", dependsOn: ["b", "c"] }),
    ]);
    const result = validateDAG(wf);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects circular dependency", () => {
    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A", dependsOn: ["c"] }),
      makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
      makeNode({ id: "c", type: "synthesize", name: "C", dependsOn: ["b"] }),
    ]);
    const result = validateDAG(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("circular"))).toBe(true);
  });

  it("detects reference to unknown node", () => {
    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A", dependsOn: ["nonexistent"] }),
    ]);
    const result = validateDAG(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown node"))).toBe(true);
  });

  it("detects unknown branch reference", () => {
    const wf = makeWorkflow([
      makeNode({
        id: "cond",
        type: "condition",
        name: "Cond",
        condition: { field: "x", operator: "eq", value: true },
        branches: { trueBranch: ["missing-node"] },
      }),
    ]);
    const result = validateDAG(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("branch references unknown"))).toBe(true);
  });

  it("warns on condition node without condition", () => {
    const wf = makeWorkflow([makeNode({ id: "c", type: "condition", name: "Cond" })]);
    const result = validateDAG(wf);
    expect(result.warnings.some((w) => w.includes("no condition defined"))).toBe(true);
  });

  it("warns on human-review node without gate", () => {
    const wf = makeWorkflow([makeNode({ id: "hr", type: "human-review", name: "HR" })]);
    const result = validateDAG(wf);
    expect(result.warnings.some((w) => w.includes("no gate configuration"))).toBe(true);
  });

  it("detects no root nodes", () => {
    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A", dependsOn: ["b"] }),
      makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
    ]);
    const result = validateDAG(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("No root nodes") || e.includes("Circular"))).toBe(
      true
    );
  });
});

// ---- executeDAG() ----

describe("executeDAG", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("executes a single-node workflow", async () => {
    const executor = vi.fn().mockResolvedValue({ result: "done" });
    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A" })]);

    const state = await executeDAG(wf, { executor });

    expect(state.status).toBe("completed");
    expect(state.nodeResults.get("a")?.status).toBe("completed");
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("executes nodes in dependency order", async () => {
    const order: string[] = [];
    const executor = vi.fn().mockImplementation(async (node: DAGNode) => {
      order.push(node.id);
      return {};
    });

    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A" }),
      makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
    ]);

    await executeDAG(wf, { executor });

    expect(order).toEqual(["a", "b"]);
  });

  it("respects maxConcurrency limit", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const executor = vi.fn().mockImplementation(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
      return {};
    });

    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A" }),
      makeNode({ id: "b", type: "generate", name: "B" }),
      makeNode({ id: "c", type: "score", name: "C" }),
      makeNode({ id: "d", type: "filter", name: "D" }),
    ]);

    await executeDAG(wf, { executor, maxConcurrency: 2 });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("handles conditional branching (true path)", async () => {
    const executor = vi.fn().mockResolvedValue({});
    const wf = makeWorkflow([
      makeNode({
        id: "cond",
        type: "condition",
        name: "Cond",
        condition: { field: "flag", operator: "eq", value: true },
        branches: {
          trueBranch: ["true-path"],
          falseBranch: ["false-path"],
        },
      }),
      makeNode({ id: "true-path", type: "generate", name: "True", dependsOn: ["cond"] }),
      makeNode({ id: "false-path", type: "generate", name: "False", dependsOn: ["cond"] }),
    ]);

    const state = await executeDAG(wf, {
      executor,
      context: { flag: true },
    });

    expect(state.nodeResults.get("cond")?.status).toBe("completed");
    expect(state.nodeResults.get("false-path")?.status).toBe("skipped");
    expect(state.nodeResults.get("true-path")?.status).toBe("completed");
  });

  it("handles conditional branching (false path)", async () => {
    const executor = vi.fn().mockResolvedValue({});
    const wf = makeWorkflow([
      makeNode({
        id: "cond",
        type: "condition",
        name: "Cond",
        condition: { field: "flag", operator: "eq", value: true },
        branches: {
          trueBranch: ["true-path"],
          falseBranch: ["false-path"],
        },
      }),
      makeNode({ id: "true-path", type: "generate", name: "True", dependsOn: ["cond"] }),
      makeNode({ id: "false-path", type: "generate", name: "False", dependsOn: ["cond"] }),
    ]);

    const state = await executeDAG(wf, {
      executor,
      context: { flag: false },
    });

    expect(state.nodeResults.get("true-path")?.status).toBe("skipped");
    expect(state.nodeResults.get("false-path")?.status).toBe("completed");
  });

  it("executes loop with maxIterations cap", async () => {
    const executor = vi.fn().mockResolvedValue({});
    const wf = makeWorkflow([
      makeNode({
        id: "loop-node",
        type: "loop",
        name: "Loop",
        loop: {
          maxIterations: 3,
          loopBody: ["body-node"],
        },
      }),
      makeNode({ id: "body-node", type: "generate", name: "Body", dependsOn: ["loop-node"] }),
    ]);

    const state = await executeDAG(wf, { executor });

    expect(state.nodeResults.get("loop-node")?.status).toBe("completed");
    // The loop executor runs body-node 3 times internally
    expect(state.nodeResults.get("loop-node")?.output?.iterations as number).toBeGreaterThanOrEqual(
      3
    );
  });

  it("loop exits early on exitCondition", async () => {
    let callCount = 0;
    const executor = vi
      .fn()
      .mockImplementation(async (_node: DAGNode, ctx: Record<string, unknown>) => {
        callCount++;
        if (callCount >= 2) {
          ctx.done = true;
        }
        return {};
      });

    const wf = makeWorkflow([
      makeNode({
        id: "loop-node",
        type: "loop",
        name: "Loop",
        loop: {
          maxIterations: 10,
          loopBody: ["body-node"],
          exitCondition: { field: "done", operator: "eq", value: true },
        },
      }),
      makeNode({ id: "body-node", type: "generate", name: "Body", dependsOn: ["loop-node"] }),
    ]);

    const state = await executeDAG(wf, { executor });

    expect(state.nodeResults.get("loop-node")?.output?.iterations).toBeLessThan(10);
  });

  it("gate node blocks until approval via handler", async () => {
    const gateHandler = vi.fn().mockResolvedValue({ approved: true, feedback: "LGTM" });
    const wf = makeWorkflow([
      makeNode({
        id: "gate",
        type: "human-review",
        name: "Gate",
        gate: {
          prompt: "Approve?",
          timeout: 60,
          autoApprove: false,
          requiredApprovers: 1,
        },
      }),
    ]);

    const state = await executeDAG(wf, { onGate: gateHandler });

    expect(gateHandler).toHaveBeenCalledWith("gate", "Approve?", expect.any(Object));
    expect(state.nodeResults.get("gate")?.status).toBe("completed");
    expect(state.nodeResults.get("gate")?.output?.approved).toBe(true);
  });

  it("gate node auto-approves when configured", async () => {
    const wf = makeWorkflow([
      makeNode({
        id: "gate",
        type: "human-review",
        name: "Gate",
        gate: {
          prompt: "Approve?",
          timeout: 60,
          autoApprove: true,
          requiredApprovers: 1,
        },
      }),
    ]);

    const state = await executeDAG(wf);

    expect(state.nodeResults.get("gate")?.status).toBe("completed");
    expect(state.nodeResults.get("gate")?.output?.auto).toBe(true);
  });

  it("gate node fails when rejected", async () => {
    const gateHandler = vi.fn().mockResolvedValue({ approved: false, feedback: "Rejected" });
    const wf = makeWorkflow([
      makeNode({
        id: "gate",
        type: "human-review",
        name: "Gate",
        gate: { prompt: "Approve?", timeout: 60, autoApprove: false, requiredApprovers: 1 },
      }),
    ]);

    const state = await executeDAG(wf, { onGate: gateHandler });

    expect(state.nodeResults.get("gate")?.status).toBe("failed");
  });

  it("retries with exponential backoff on failure", async () => {
    const executor = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValueOnce({ ok: true });

    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A", retries: 2 })]);

    const state = await executeDAG(wf, { executor });

    expect(state.nodeResults.get("a")?.status).toBe("completed");
    expect(state.nodeResults.get("a")?.retryCount).toBe(2);
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it("marks node failed after exhausting retries", async () => {
    const executor = vi.fn().mockRejectedValue(new Error("always fails"));

    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A", retries: 1 })]);

    const state = await executeDAG(wf, { executor });

    expect(state.nodeResults.get("a")?.status).toBe("failed");
    expect(state.status).toBe("failed");
  });

  it("continues on error when continueOnError is true", async () => {
    const executor = vi.fn().mockRejectedValue(new Error("fail"));

    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A", continueOnError: true }),
    ]);

    const state = await executeDAG(wf, { executor });

    expect(state.nodeResults.get("a")?.status).toBe("completed");
    expect(state.nodeResults.get("a")?.output?.continued).toBe(true);
  });

  it("calls onProgress callback", async () => {
    const onProgress = vi.fn();
    const executor = vi.fn().mockResolvedValue({});

    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A" })]);

    await executeDAG(wf, { executor, onProgress });

    expect(onProgress).toHaveBeenCalled();
  });

  it("respects AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A" })]);

    const state = await executeDAG(wf, { signal: controller.signal });

    expect(state.status).toBe("cancelled");
  });

  it("enforces maxConcurrency with many independent nodes", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const executor = vi.fn().mockImplementation(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 20));
      currentConcurrent--;
      return {};
    });

    // 6 independent nodes, maxConcurrency of 2
    const wf = makeWorkflow(
      Array.from({ length: 6 }, (_, i) =>
        makeNode({ id: `n${i}`, type: "investigate", name: `N${i}` })
      )
    );

    await executeDAG(wf, { executor, maxConcurrency: 2 });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(executor).toHaveBeenCalledTimes(6);
  });

  it("marks workflow as failed when a node fails and blocks dependents", async () => {
    const executor = vi
      .fn()
      .mockImplementation(async (node: DAGNode) => {
        if (node.id === "fail") throw new Error("Node failure");
        return {};
      });

    const wf = makeWorkflow([
      makeNode({ id: "ok", type: "investigate", name: "OK" }),
      makeNode({ id: "fail", type: "generate", name: "Fail" }),
      makeNode({ id: "after-fail", type: "score", name: "After", dependsOn: ["fail"] }),
    ]);

    const state = await executeDAG(wf, { executor });

    expect(state.status).toBe("failed");
    expect(state.nodeResults.get("fail")?.status).toBe("failed");
    expect(state.nodeResults.get("ok")?.status).toBe("completed");
    // after-fail should remain pending since its dependency failed
    expect(state.nodeResults.get("after-fail")?.status).toBe("pending");
  });

  it("validates cycle detection at runtime via executeDAG", async () => {
    const wf = makeWorkflow([
      makeNode({ id: "a", type: "investigate", name: "A", dependsOn: ["b"] }),
      makeNode({ id: "b", type: "generate", name: "B", dependsOn: ["a"] }),
    ]);

    await expect(executeDAG(wf)).rejects.toThrow(/[Cc]ircular/);
  });

  it("passes workflow variables into execution context", async () => {
    let capturedCtx: Record<string, unknown> = {};
    const executor = vi.fn().mockImplementation(async (_node: DAGNode, ctx: Record<string, unknown>) => {
      capturedCtx = { ...ctx };
      return {};
    });

    const wf = makeWorkflow(
      [makeNode({ id: "a", type: "investigate", name: "A" })],
      { variables: { myVar: "hello" } }
    );

    await executeDAG(wf, { executor, context: { extra: "world" } });

    expect(capturedCtx.myVar).toBe("hello");
    expect(capturedCtx.extra).toBe("world");
  });

  it("records duration on completed nodes", async () => {
    const executor = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {};
    });

    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A" })]);
    const state = await executeDAG(wf, { executor });

    const result = state.nodeResults.get("a")!;
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
  });

  it("sets completedAt on the workflow state", async () => {
    const executor = vi.fn().mockResolvedValue({});
    const wf = makeWorkflow([makeNode({ id: "a", type: "investigate", name: "A" })]);

    const state = await executeDAG(wf, { executor });

    expect(state.completedAt).toBeTruthy();
    expect(new Date(state.completedAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(state.startedAt).getTime()
    );
  });
});

// ---- evaluateCondition (tested via executeDAG) ----

describe("evaluateCondition (via conditional execution)", () => {
  const conditionNode = (operator: string, value: unknown, field = "score") =>
    makeNode({
      id: "cond",
      type: "condition",
      name: "Cond",
      condition: { field, operator: operator as never, value },
      branches: { trueBranch: ["t"], falseBranch: ["f"] },
    });

  const buildWf = (operator: string, value: unknown, field = "score") =>
    makeWorkflow([
      conditionNode(operator, value, field),
      makeNode({ id: "t", type: "generate", name: "T", dependsOn: ["cond"] }),
      makeNode({ id: "f", type: "generate", name: "F", dependsOn: ["cond"] }),
    ]);

  it("eq: matches equal values", async () => {
    const state = await executeDAG(buildWf("eq", 10), {
      context: { score: 10 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
    expect(state.nodeResults.get("f")?.status).toBe("skipped");
  });

  it("neq: matches non-equal values", async () => {
    const state = await executeDAG(buildWf("neq", 10), {
      context: { score: 5 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("gt: greater than", async () => {
    const state = await executeDAG(buildWf("gt", 5), {
      context: { score: 10 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("lt: less than", async () => {
    const state = await executeDAG(buildWf("lt", 10), {
      context: { score: 5 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("gte: greater than or equal", async () => {
    const state = await executeDAG(buildWf("gte", 10), {
      context: { score: 10 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("lte: less than or equal", async () => {
    const state = await executeDAG(buildWf("lte", 10), {
      context: { score: 10 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("contains: string contains substring", async () => {
    const state = await executeDAG(buildWf("contains", "world", "greeting"), {
      context: { greeting: "hello world" },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("exists: field exists and is non-null", async () => {
    const state = await executeDAG(buildWf("exists", true), {
      context: { score: 42 },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });

  it("exists: false for undefined field", async () => {
    const state = await executeDAG(buildWf("exists", true, "missing"), {
      context: {},
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("f")?.status).toBe("completed");
  });

  it("handles nested dot notation paths", async () => {
    const state = await executeDAG(buildWf("eq", "deep", "a.b.c"), {
      context: { a: { b: { c: "deep" } } },
      executor: vi.fn().mockResolvedValue({}),
    });
    expect(state.nodeResults.get("t")?.status).toBe("completed");
  });
});

// ---- serializeDAGState() ----

describe("serializeDAGState", () => {
  it("round-trips state through serialization", () => {
    const state: DAGExecutionState = {
      workflowId: "wf-1",
      workflowName: "Test",
      status: "completed",
      startedAt: "2025-01-01T00:00:00Z",
      completedAt: "2025-01-01T00:01:00Z",
      nodeResults: new Map([
        ["a", { nodeId: "a", status: "completed", retryCount: 0, output: { x: 1 } }],
      ]),
      context: { key: "value" },
      currentNodes: [],
      pendingApprovals: [],
    };

    const serialized = serializeDAGState(state);

    expect(serialized.workflowId).toBe("wf-1");
    expect(serialized.workflowName).toBe("Test");
    expect(serialized.status).toBe("completed");
    expect(serialized.startedAt).toBe("2025-01-01T00:00:00Z");
    expect(serialized.completedAt).toBe("2025-01-01T00:01:00Z");
    expect((serialized.nodeResults as Record<string, unknown>)["a"]).toBeDefined();
    expect(serialized.currentNodes).toEqual([]);
    expect(serialized.pendingApprovals).toEqual([]);
  });

  it("serializes Map to plain object", () => {
    const state: DAGExecutionState = {
      workflowId: "wf-2",
      workflowName: "Test2",
      status: "running",
      startedAt: "2025-01-01T00:00:00Z",
      nodeResults: new Map([
        ["x", { nodeId: "x", status: "running", retryCount: 0 }],
        ["y", { nodeId: "y", status: "pending", retryCount: 0 }],
      ]),
      context: {},
      currentNodes: ["x"],
      pendingApprovals: [],
    };

    const serialized = serializeDAGState(state);
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    expect(parsed.nodeResults.x.nodeId).toBe("x");
    expect(parsed.nodeResults.y.nodeId).toBe("y");
  });
});
