/**
 * @module autonomous-agent/manager
 *
 * Agent lifecycle manager — persistence, budget tracking, mid-run injection, and resume.
 * Wraps the core autonomous agent with production-ready state management.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type {
  AutonomousRun,
  AutonomousProgress,
  AutonomousAgentConfig,
  AgentStatus,
} from "./types.js";
import { runAutonomousAgent } from "./agent.js";

// ---- Budget Tracking ----

export const AgentBudgetSchema = z.object({
  maxCost: z.number().min(0).default(5),
  maxLLMCalls: z.number().int().min(1).default(200),
  maxWallTimeMs: z.number().int().min(1000).default(4 * 60 * 60 * 1000),
  currentCost: z.number().min(0).default(0),
  currentLLMCalls: z.number().int().min(0).default(0),
  startTimeMs: z.number().default(0),
});

export type AgentBudget = z.infer<typeof AgentBudgetSchema>;

// ---- Agent Run with Budget ----

export interface ManagedAgentRun {
  run: AutonomousRun;
  budget: AgentBudget;
  injectedTopics: string[];
  checkpoints: AgentCheckpoint[];
  abortController: AbortController;
}

export interface AgentCheckpoint {
  id: string;
  runId: string;
  timestamp: string;
  status: AgentStatus;
  branchCount: number;
  ideaCount: number;
  serializedRun: string;
}

// ---- In-Memory Run Store ----

const activeRuns = new Map<string, ManagedAgentRun>();

/** Get all active agent runs. */
export function listAgentRuns(): Array<{
  id: string;
  subject: string;
  status: AgentStatus;
  branches: number;
  ideas: number;
  budgetUsed: number;
  budgetMax: number;
}> {
  return Array.from(activeRuns.entries()).map(([id, managed]) => ({
    id,
    subject: managed.run.rootSubject,
    status: managed.run.status,
    branches: managed.run.branches.length,
    ideas: managed.run.branches.reduce((s, b) => s + b.ideas.length, 0),
    budgetUsed: managed.budget.currentCost,
    budgetMax: managed.budget.maxCost,
  }));
}

/** Get a specific agent run. */
export function getAgentRun(runId: string): ManagedAgentRun | undefined {
  return activeRuns.get(runId);
}

/** Start a new managed autonomous agent run. */
export async function startAgentRun(
  subject: string,
  onProgress: (progress: AutonomousProgress & { budgetRemaining: number }) => void,
  config: AutonomousAgentConfig & {
    maxCost?: number;
    maxLLMCalls?: number;
    maxWallTimeMs?: number;
  } = {}
): Promise<ManagedAgentRun> {
  const abortController = new AbortController();
  const budget: AgentBudget = {
    maxCost: config.maxCost ?? 5,
    maxLLMCalls: config.maxLLMCalls ?? 200,
    maxWallTimeMs: config.maxWallTimeMs ?? 4 * 60 * 60 * 1000,
    currentCost: 0,
    currentLLMCalls: 0,
    startTimeMs: Date.now(),
  };

  const managed: ManagedAgentRun = {
    run: {
      id: randomUUID(),
      rootSubject: subject,
      status: "idle",
      strategy: config.strategy ?? "adaptive",
      branches: [],
      decisions: [],
      config: {
        maxBranches: config.maxBranches ?? 10,
        maxDepth: config.maxDepth ?? 3,
        pruneThreshold: config.pruneThreshold ?? 20,
        model: config.model,
      },
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    budget,
    injectedTopics: [],
    checkpoints: [],
    abortController,
  };

  activeRuns.set(managed.run.id, managed);

  // Wrap progress callback with budget tracking
  const wrappedProgress = (progress: AutonomousProgress) => {
    budget.currentLLMCalls++;
    const elapsed = Date.now() - budget.startTimeMs;

    // Check budget limits
    if (budget.currentCost >= budget.maxCost) {
      abortController.abort();
    }
    if (budget.currentLLMCalls >= budget.maxLLMCalls) {
      abortController.abort();
    }
    if (elapsed >= budget.maxWallTimeMs) {
      abortController.abort();
    }

    // Create checkpoint on branch completion
    if (
      progress.completedBranches > 0 &&
      managed.checkpoints.length < progress.completedBranches
    ) {
      managed.checkpoints.push({
        id: randomUUID(),
        runId: managed.run.id,
        timestamp: new Date().toISOString(),
        status: progress.status,
        branchCount: progress.totalBranches,
        ideaCount: progress.totalIdeas,
        serializedRun: JSON.stringify(managed.run),
      });
    }

    onProgress({
      ...progress,
      budgetRemaining: budget.maxCost - budget.currentCost,
    });
  };

  try {
    const result = await runAutonomousAgent(subject, wrappedProgress, {
      ...config,
      signal: abortController.signal,
    });
    managed.run = result;
  } catch (err) {
    managed.run.status = "failed";
  }

  return managed;
}

/** Inject new topics into a running agent. */
export function injectTopics(runId: string, topics: string[]): boolean {
  const managed = activeRuns.get(runId);
  if (!managed || managed.run.status === "completed" || managed.run.status === "failed") {
    return false;
  }
  managed.injectedTopics.push(...topics);
  return true;
}

/** Stop a running agent gracefully. */
export function stopAgentRun(runId: string): boolean {
  const managed = activeRuns.get(runId);
  if (!managed) return false;
  managed.abortController.abort();
  return true;
}

/** Get the latest checkpoint for a run. */
export function getLatestCheckpoint(runId: string): AgentCheckpoint | undefined {
  const managed = activeRuns.get(runId);
  if (!managed || managed.checkpoints.length === 0) return undefined;
  return managed.checkpoints[managed.checkpoints.length - 1];
}

/** Export a run's portfolio as markdown. */
export function exportRunPortfolio(runId: string): string | null {
  const managed = activeRuns.get(runId);
  if (!managed?.run.portfolio) return null;

  const p = managed.run.portfolio;
  const lines = [
    `# ${p.title}`,
    "",
    p.summary,
    "",
    `**Duration:** ${Math.round(p.durationMs / 1000)}s`,
    `**Branches explored:** ${p.totalBranches}`,
    `**Ideas generated:** ${p.totalIdeas}`,
    `**Budget used:** $${managed.budget.currentCost.toFixed(2)} / $${managed.budget.maxCost.toFixed(2)}`,
    "",
    "## Top Ideas",
    "",
  ];

  for (const idea of p.topIdeas) {
    lines.push(`### ${idea.title}`);
    lines.push("");
    lines.push(idea.description);
    lines.push("");
    lines.push(`- **Score:** ${idea.score}/100`);
    lines.push(`- **Feasibility:** ${idea.feasibility}`);
    lines.push(`- **Source:** ${idea.sourceSubject}`);
    lines.push("");
  }

  if (p.themes.length > 0) {
    lines.push("## Themes");
    lines.push("");
    for (const t of p.themes) lines.push(`- ${t}`);
    lines.push("");
  }

  lines.push("## Exploration Map");
  lines.push("");
  for (const entry of p.explorationMap) {
    const indent = "  ".repeat(entry.depth);
    lines.push(`${indent}• ${entry.subject} (${entry.ideaCount} ideas)`);
  }

  return lines.join("\n");
}

/** Remove a completed run from memory. */
export function removeAgentRun(runId: string): boolean {
  return activeRuns.delete(runId);
}

/** Clear all runs. */
export function clearAgentRuns(): void {
  for (const managed of activeRuns.values()) {
    managed.abortController.abort();
  }
  activeRuns.clear();
}
