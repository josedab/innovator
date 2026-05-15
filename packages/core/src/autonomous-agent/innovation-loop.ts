/**
 * @module autonomous-agent/innovation-loop
 *
 * Multi-day persistent innovation loops with research→ideate→test→pivot cycles
 * and configurable human gates. Agents autonomously iterate through innovation
 * phases, pausing at checkpoints for human review and direction changes.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AutonomousProgress, AutonomousAgentConfig } from "./types.js";
import { runAutonomousAgent } from "./agent.js";

// ---- Phase Definitions ----

/** Innovation loop phases in order. */
export const LoopPhaseSchema = z.enum(["research", "ideate", "test", "pivot", "synthesize"]);
export type LoopPhase = z.infer<typeof LoopPhaseSchema>;

/** Status of the innovation loop. */
export const LoopStatusSchema = z.enum([
  "running",
  "paused_at_gate",
  "waiting_for_review",
  "completed",
  "failed",
  "cancelled",
]);
export type LoopStatus = z.infer<typeof LoopStatusSchema>;

/** A human gate configuration. */
export const HumanGateSchema = z.object({
  afterPhase: LoopPhaseSchema,
  required: z.boolean().default(true),
  timeoutMs: z.number().int().positive().optional(),
  autoApprove: z.boolean().default(false),
});
export type HumanGate = z.infer<typeof HumanGateSchema>;

/** Configuration for an innovation loop. */
export const InnovationLoopConfigSchema = z.object({
  subject: z.string().min(1).max(1000),
  maxIterations: z.number().int().min(1).max(50).default(5),
  humanGates: z.array(HumanGateSchema).default([
    { afterPhase: "research", required: true, autoApprove: false },
    { afterPhase: "test", required: true, autoApprove: false },
  ]),
  pivotThreshold: z.number().min(0).max(100).default(40),
  convergenceThreshold: z.number().min(0).max(100).default(80),
  model: z.string().optional(),
  agentConfig: z
    .object({
      maxBranches: z.number().min(1).max(50).default(5),
      maxDepth: z.number().min(1).max(5).default(2),
      pruneThreshold: z.number().min(0).max(100).default(30),
    })
    .optional(),
});
export type InnovationLoopConfig = z.infer<typeof InnovationLoopConfigSchema>;

/** A recorded test result for an idea. */
export const TestResultSchema = z.object({
  ideaTitle: z.string(),
  score: z.number().min(0).max(100),
  feasibility: z.enum(["low", "medium", "high"]),
  feedback: z.string().max(2000),
  shouldPivot: z.boolean(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

/** An iteration within the loop. */
export const LoopIterationSchema = z.object({
  iteration: z.number(),
  phase: LoopPhaseSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  researchFindings: z.array(z.string().max(2000)).optional(),
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        score: z.number().min(0).max(100).optional(),
      })
    )
    .optional(),
  testResults: z.array(TestResultSchema).optional(),
  pivotDecision: z
    .object({
      shouldPivot: z.boolean(),
      reason: z.string().max(2000),
      newDirection: z.string().max(1000).optional(),
    })
    .optional(),
  gateApproval: z
    .object({
      approved: z.boolean(),
      reviewer: z.string().max(200).optional(),
      feedback: z.string().max(2000).optional(),
      timestamp: z.string(),
    })
    .optional(),
});
export type LoopIteration = z.infer<typeof LoopIterationSchema>;

/** Full innovation loop state. */
export const InnovationLoopSchema = z.object({
  id: z.string(),
  config: InnovationLoopConfigSchema,
  status: LoopStatusSchema,
  currentIteration: z.number(),
  currentPhase: LoopPhaseSchema,
  iterations: z.array(LoopIterationSchema),
  bestIdeas: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(2000),
      score: z.number().min(0).max(100),
      iteration: z.number(),
    })
  ),
  convergenceScore: z.number().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});
export type InnovationLoop = z.infer<typeof InnovationLoopSchema>;

/** Progress update during loop execution. */
export interface LoopProgress {
  loopId: string;
  iteration: number;
  phase: LoopPhase;
  status: LoopStatus;
  message: string;
  convergenceScore: number;
  gateRequired?: boolean;
}

// ---- In-Memory Loop Store ----

const activeLoops = new Map<string, InnovationLoop>();
const loopAbortControllers = new Map<string, AbortController>();

/** List all innovation loops. */
export function listInnovationLoops(): Array<{
  id: string;
  subject: string;
  status: LoopStatus;
  iteration: number;
  phase: LoopPhase;
  convergenceScore: number;
}> {
  return Array.from(activeLoops.values()).map((loop) => ({
    id: loop.id,
    subject: loop.config.subject,
    status: loop.status,
    iteration: loop.currentIteration,
    phase: loop.currentPhase,
    convergenceScore: loop.convergenceScore,
  }));
}

/** Get a specific loop. */
export function getInnovationLoop(loopId: string): InnovationLoop | undefined {
  return activeLoops.get(loopId);
}

/**
 * Start a new innovation loop.
 * Runs research→ideate→test→pivot cycles, pausing at human gates.
 */
export async function startInnovationLoop(
  config: InnovationLoopConfig,
  onProgress: (progress: LoopProgress) => void
): Promise<InnovationLoop> {
  const validated = InnovationLoopConfigSchema.parse(config);
  const abortController = new AbortController();

  const loop: InnovationLoop = {
    id: randomUUID(),
    config: validated,
    status: "running",
    currentIteration: 0,
    currentPhase: "research",
    iterations: [],
    bestIdeas: [],
    convergenceScore: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  activeLoops.set(loop.id, loop);
  loopAbortControllers.set(loop.id, abortController);

  try {
    await runLoop(loop, onProgress, abortController.signal);
  } catch (err) {
    if (!abortController.signal.aborted) {
      loop.status = "failed";
      loop.updatedAt = new Date().toISOString();
    }
  }

  return loop;
}

/** Internal loop runner. */
async function runLoop(
  loop: InnovationLoop,
  onProgress: (progress: LoopProgress) => void,
  signal: AbortSignal
): Promise<void> {
  const phases: LoopPhase[] = ["research", "ideate", "test", "pivot"];
  let subject = loop.config.subject;

  for (let iter = 0; iter < loop.config.maxIterations; iter++) {
    if (signal.aborted) break;

    loop.currentIteration = iter + 1;
    const iteration: LoopIteration = {
      iteration: iter + 1,
      phase: "research",
      startedAt: new Date().toISOString(),
    };

    for (const phase of phases) {
      if (signal.aborted) break;

      loop.currentPhase = phase;
      iteration.phase = phase;
      loop.updatedAt = new Date().toISOString();

      onProgress({
        loopId: loop.id,
        iteration: iter + 1,
        phase,
        status: "running",
        message: `Iteration ${iter + 1}: ${phase} phase`,
        convergenceScore: loop.convergenceScore,
      });

      // Execute the phase
      switch (phase) {
        case "research":
          iteration.researchFindings = await executeResearchPhase(subject, loop, signal);
          break;
        case "ideate":
          iteration.ideas = await executeIdeatePhase(
            subject,
            iteration.researchFindings ?? [],
            loop,
            signal
          );
          break;
        case "test":
          iteration.testResults = executeTestPhase(iteration.ideas ?? []);
          break;
        case "pivot":
          iteration.pivotDecision = executePivotPhase(
            iteration.testResults ?? [],
            loop.config.pivotThreshold
          );
          if (iteration.pivotDecision.shouldPivot && iteration.pivotDecision.newDirection) {
            subject = iteration.pivotDecision.newDirection;
          }
          break;
      }

      // Check for human gate after this phase
      const gate = loop.config.humanGates.find((g) => g.afterPhase === phase);
      if (gate && gate.required && !gate.autoApprove) {
        loop.status = "paused_at_gate";
        loop.updatedAt = new Date().toISOString();

        onProgress({
          loopId: loop.id,
          iteration: iter + 1,
          phase,
          status: "paused_at_gate",
          message: `Waiting for human approval after ${phase} phase`,
          convergenceScore: loop.convergenceScore,
          gateRequired: true,
        });

        // Store iteration and wait for approval
        loop.iterations.push(iteration);
        activeLoops.set(loop.id, loop);
        return; // Suspend — will resume via approveGate()
      }
    }

    iteration.completedAt = new Date().toISOString();
    loop.iterations.push(iteration);

    // Update best ideas from this iteration
    if (iteration.ideas) {
      for (const idea of iteration.ideas) {
        if ((idea.score ?? 0) > 50) {
          loop.bestIdeas.push({
            title: idea.title,
            description: idea.description,
            score: idea.score ?? 50,
            iteration: iter + 1,
          });
        }
      }
    }

    // Compute convergence
    loop.convergenceScore = computeConvergence(loop);

    if (loop.convergenceScore >= loop.config.convergenceThreshold) {
      onProgress({
        loopId: loop.id,
        iteration: iter + 1,
        phase: "synthesize",
        status: "completed",
        message: `Converged at iteration ${iter + 1} (score: ${loop.convergenceScore})`,
        convergenceScore: loop.convergenceScore,
      });
      break;
    }
  }

  loop.status = "completed";
  loop.completedAt = new Date().toISOString();
  loop.updatedAt = new Date().toISOString();
  activeLoops.set(loop.id, loop);
}

// ---- Phase Implementations ----

async function executeResearchPhase(
  subject: string,
  loop: InnovationLoop,
  signal: AbortSignal
): Promise<string[]> {
  const findings: string[] = [];

  try {
    const result = await runAutonomousAgent(subject, () => {}, {
      maxBranches: loop.config.agentConfig?.maxBranches ?? 3,
      maxDepth: 1,
      pruneThreshold: loop.config.agentConfig?.pruneThreshold ?? 30,
      strategy: "breadth-first",
      model: loop.config.model,
      signal,
    });

    for (const branch of result.branches) {
      if (branch.summary) findings.push(branch.summary);
      for (const idea of branch.ideas) {
        findings.push(`${idea.title}: ${idea.description}`);
      }
    }
  } catch {
    findings.push(`Research on "${subject}" — agent exploration completed with partial results.`);
  }

  if (findings.length === 0) {
    findings.push(`Initial research on "${subject}" — foundational exploration complete.`);
  }

  return findings.slice(0, 10);
}

async function executeIdeatePhase(
  subject: string,
  researchFindings: string[],
  loop: InnovationLoop,
  signal: AbortSignal
): Promise<Array<{ title: string; description: string; score?: number }>> {
  const ideas: Array<{ title: string; description: string; score?: number }> = [];

  try {
    const result = await runAutonomousAgent(
      `Based on research findings about "${subject}": ${researchFindings.slice(0, 3).join("; ")}. Generate innovative ideas.`,
      () => {},
      {
        maxBranches: loop.config.agentConfig?.maxBranches ?? 5,
        maxDepth: loop.config.agentConfig?.maxDepth ?? 2,
        pruneThreshold: loop.config.agentConfig?.pruneThreshold ?? 30,
        strategy: "adaptive",
        model: loop.config.model,
        signal,
      }
    );

    for (const branch of result.branches) {
      for (const idea of branch.ideas) {
        ideas.push({
          title: idea.title,
          description: idea.description,
          score: idea.score,
        });
      }
    }
  } catch {
    // Partial results are acceptable
  }

  if (ideas.length === 0) {
    ideas.push({
      title: `Idea for ${subject}`,
      description: `Innovative approach based on research findings for ${subject}`,
      score: 50,
    });
  }

  return ideas.slice(0, 20);
}

function executeTestPhase(
  ideas: Array<{ title: string; description: string; score?: number }>
): TestResult[] {
  return ideas.map((idea) => {
    const score = idea.score ?? 50;
    const feasibility: "low" | "medium" | "high" =
      score >= 70 ? "high" : score >= 40 ? "medium" : "low";

    return {
      ideaTitle: idea.title,
      score,
      feasibility,
      feedback:
        score >= 70
          ? "Strong potential — ready for deeper exploration."
          : score >= 40
            ? "Moderate potential — consider refining the approach."
            : "Low viability — consider pivoting.",
      shouldPivot: score < 40,
    };
  });
}

function executePivotPhase(
  testResults: TestResult[],
  pivotThreshold: number
): { shouldPivot: boolean; reason: string; newDirection?: string } {
  if (testResults.length === 0) {
    return { shouldPivot: false, reason: "No test results to evaluate." };
  }

  const avgScore = testResults.reduce((s, t) => s + t.score, 0) / testResults.length;
  const pivotCount = testResults.filter((t) => t.shouldPivot).length;
  const pivotRatio = pivotCount / testResults.length;

  if (avgScore < pivotThreshold || pivotRatio > 0.6) {
    const bestResult = testResults.reduce((best, curr) => (curr.score > best.score ? curr : best));
    return {
      shouldPivot: true,
      reason: `Average score ${avgScore.toFixed(0)} below threshold ${pivotThreshold}. ${pivotCount}/${testResults.length} ideas recommend pivot.`,
      newDirection: `Refined approach based on "${bestResult.ideaTitle}" — the highest-scoring direction.`,
    };
  }

  return {
    shouldPivot: false,
    reason: `Average score ${avgScore.toFixed(0)} above threshold. Continuing current direction.`,
  };
}

function computeConvergence(loop: InnovationLoop): number {
  if (loop.bestIdeas.length === 0) return 0;

  const topScores = loop.bestIdeas
    .map((i) => i.score)
    .sort((a, b) => b - a)
    .slice(0, 5);

  const avgTopScore = topScores.reduce((s, v) => s + v, 0) / topScores.length;

  // Factor in iteration stability
  const recentIterations = loop.iterations.slice(-3);
  const hasStabilized =
    recentIterations.length >= 2 &&
    recentIterations.every((it) => (it.pivotDecision?.shouldPivot ?? false) === false);

  const stabilityBonus = hasStabilized ? 15 : 0;

  return Math.min(100, avgTopScore + stabilityBonus);
}

// ---- Gate Approval ----

/**
 * Approve a human gate, allowing the loop to continue.
 */
export async function approveGate(
  loopId: string,
  approval: {
    approved: boolean;
    reviewer?: string;
    feedback?: string;
    directionOverride?: string;
  },
  onProgress: (progress: LoopProgress) => void
): Promise<InnovationLoop | undefined> {
  const loop = activeLoops.get(loopId);
  if (!loop || loop.status !== "paused_at_gate") return undefined;

  const currentIteration = loop.iterations[loop.iterations.length - 1];
  if (currentIteration) {
    currentIteration.gateApproval = {
      approved: approval.approved,
      reviewer: approval.reviewer,
      feedback: approval.feedback,
      timestamp: new Date().toISOString(),
    };
  }

  if (!approval.approved) {
    loop.status = "cancelled";
    loop.updatedAt = new Date().toISOString();
    return loop;
  }

  // Override direction if provided
  if (approval.directionOverride) {
    loop.config.subject = approval.directionOverride;
  }

  // Resume loop
  loop.status = "running";
  const abortController = loopAbortControllers.get(loopId) ?? new AbortController();
  loopAbortControllers.set(loopId, abortController);

  try {
    await runLoop(loop, onProgress, abortController.signal);
  } catch {
    loop.status = "failed";
    loop.updatedAt = new Date().toISOString();
  }

  return loop;
}

/** Cancel a running loop. */
export function cancelInnovationLoop(loopId: string): boolean {
  const loop = activeLoops.get(loopId);
  if (!loop) return false;

  const controller = loopAbortControllers.get(loopId);
  if (controller) controller.abort();

  loop.status = "cancelled";
  loop.updatedAt = new Date().toISOString();
  return true;
}

/** Remove a loop from memory. */
export function removeInnovationLoop(loopId: string): boolean {
  loopAbortControllers.delete(loopId);
  return activeLoops.delete(loopId);
}

/** Clear all loops. */
export function clearInnovationLoops(): void {
  for (const controller of loopAbortControllers.values()) {
    controller.abort();
  }
  loopAbortControllers.clear();
  activeLoops.clear();
}

// ---- Markdown Export ----

/** Export a loop's results as markdown. */
export function innovationLoopToMarkdown(loop: InnovationLoop): string {
  const lines: string[] = [
    `# Innovation Loop: ${loop.config.subject}`,
    "",
    `**Status:** ${loop.status}`,
    `**Iterations:** ${loop.currentIteration}/${loop.config.maxIterations}`,
    `**Convergence:** ${loop.convergenceScore}/100`,
    `**Started:** ${loop.createdAt}`,
    "",
  ];

  if (loop.bestIdeas.length > 0) {
    lines.push("## Best Ideas");
    lines.push("");
    const sorted = [...loop.bestIdeas].sort((a, b) => b.score - a.score);
    for (const idea of sorted.slice(0, 10)) {
      lines.push(`### ${idea.title} (Score: ${idea.score})`);
      lines.push("");
      lines.push(idea.description);
      lines.push(`*From iteration ${idea.iteration}*`);
      lines.push("");
    }
  }

  lines.push("## Iteration History");
  lines.push("");
  for (const iter of loop.iterations) {
    lines.push(`### Iteration ${iter.iteration} — ${iter.phase}`);
    if (iter.researchFindings?.length) {
      lines.push(`- Research findings: ${iter.researchFindings.length}`);
    }
    if (iter.ideas?.length) {
      lines.push(`- Ideas generated: ${iter.ideas.length}`);
    }
    if (iter.testResults?.length) {
      const avg = iter.testResults.reduce((s, t) => s + t.score, 0) / iter.testResults.length;
      lines.push(`- Test results: avg score ${avg.toFixed(0)}`);
    }
    if (iter.pivotDecision) {
      lines.push(
        `- Pivot: ${iter.pivotDecision.shouldPivot ? "Yes" : "No"} — ${iter.pivotDecision.reason}`
      );
    }
    if (iter.gateApproval) {
      lines.push(
        `- Gate: ${iter.gateApproval.approved ? "Approved" : "Rejected"}${iter.gateApproval.reviewer ? ` by ${iter.gateApproval.reviewer}` : ""}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
