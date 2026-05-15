import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));

import {
  listInnovationLoops,
  getInnovationLoop,
  clearInnovationLoops,
  cancelInnovationLoop,
  innovationLoopToMarkdown,
  InnovationLoopConfigSchema,
  InnovationLoopSchema,
  LoopPhaseSchema,
  HumanGateSchema,
} from "../autonomous-agent/innovation-loop.js";
import type { InnovationLoopConfig, InnovationLoop } from "../autonomous-agent/innovation-loop.js";

beforeEach(() => {
  clearInnovationLoops();
});

describe("InnovationLoopConfigSchema", () => {
  it("validates a minimal config", () => {
    const config = InnovationLoopConfigSchema.parse({
      subject: "AI in healthcare",
    });
    expect(config.subject).toBe("AI in healthcare");
    expect(config.maxIterations).toBe(5);
    expect(config.pivotThreshold).toBe(40);
    expect(config.convergenceThreshold).toBe(80);
  });

  it("validates full config with human gates", () => {
    const config = InnovationLoopConfigSchema.parse({
      subject: "Climate tech",
      maxIterations: 10,
      humanGates: [
        { afterPhase: "research", required: true, autoApprove: false },
        { afterPhase: "test", required: true, autoApprove: false },
        { afterPhase: "pivot", required: false, autoApprove: true },
      ],
      pivotThreshold: 30,
      convergenceThreshold: 90,
      model: "gpt-4.1",
    });
    expect(config.humanGates).toHaveLength(3);
    expect(config.maxIterations).toBe(10);
  });

  it("rejects empty subject", () => {
    expect(() => InnovationLoopConfigSchema.parse({ subject: "" })).toThrow();
  });

  it("rejects too many iterations", () => {
    expect(() =>
      InnovationLoopConfigSchema.parse({ subject: "test", maxIterations: 100 })
    ).toThrow();
  });
});

describe("LoopPhaseSchema", () => {
  it("accepts valid phases", () => {
    expect(LoopPhaseSchema.parse("research")).toBe("research");
    expect(LoopPhaseSchema.parse("ideate")).toBe("ideate");
    expect(LoopPhaseSchema.parse("test")).toBe("test");
    expect(LoopPhaseSchema.parse("pivot")).toBe("pivot");
    expect(LoopPhaseSchema.parse("synthesize")).toBe("synthesize");
  });

  it("rejects invalid phase", () => {
    expect(() => LoopPhaseSchema.parse("invalid")).toThrow();
  });
});

describe("HumanGateSchema", () => {
  it("validates gate config", () => {
    const gate = HumanGateSchema.parse({
      afterPhase: "research",
      required: true,
      autoApprove: false,
      timeoutMs: 3600000,
    });
    expect(gate.afterPhase).toBe("research");
    expect(gate.timeoutMs).toBe(3600000);
  });

  it("applies defaults", () => {
    const gate = HumanGateSchema.parse({ afterPhase: "test" });
    expect(gate.required).toBe(true);
    expect(gate.autoApprove).toBe(false);
  });
});

describe("listInnovationLoops", () => {
  it("returns empty list initially", () => {
    expect(listInnovationLoops()).toEqual([]);
  });
});

describe("getInnovationLoop", () => {
  it("returns undefined for non-existent loop", () => {
    expect(getInnovationLoop("nonexistent")).toBeUndefined();
  });
});

describe("cancelInnovationLoop", () => {
  it("returns false for non-existent loop", () => {
    expect(cancelInnovationLoop("nonexistent")).toBe(false);
  });
});

describe("innovationLoopToMarkdown", () => {
  it("generates markdown from a loop", () => {
    const loop: InnovationLoop = {
      id: "test-loop",
      config: InnovationLoopConfigSchema.parse({ subject: "Test Subject" }),
      status: "completed",
      currentIteration: 2,
      currentPhase: "synthesize",
      iterations: [
        {
          iteration: 1,
          phase: "research",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          researchFindings: ["Finding 1", "Finding 2"],
          ideas: [{ title: "Idea A", description: "Desc A", score: 75 }],
        },
      ],
      bestIdeas: [{ title: "Best Idea", description: "Great idea", score: 85, iteration: 1 }],
      convergenceScore: 85,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const md = innovationLoopToMarkdown(loop);
    expect(md).toContain("# Innovation Loop: Test Subject");
    expect(md).toContain("**Convergence:** 85/100");
    expect(md).toContain("Best Ideas");
    expect(md).toContain("Best Idea");
    expect(md).toContain("Iteration History");
  });
});

describe("InnovationLoopSchema", () => {
  it("validates a complete loop state", () => {
    const loop = InnovationLoopSchema.parse({
      id: "loop-1",
      config: { subject: "Test" },
      status: "running",
      currentIteration: 1,
      currentPhase: "research",
      iterations: [],
      bestIdeas: [],
      convergenceScore: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(loop.id).toBe("loop-1");
    expect(loop.status).toBe("running");
  });
});
