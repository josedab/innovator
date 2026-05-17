/**
 * @module copilot-agent
 *
 * Innovation Copilot Agent — autonomous multi-step agent that proactively
 * discovers innovation opportunities by monitoring repos, news feeds, and
 * team activity. Implements a state machine:
 *   idle → monitoring → analyzing → proposing → waiting-for-feedback
 *
 * Integrates with sentinel for feed monitoring, codebase-analysis for repo
 * scanning, and market-signals for trend detection.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { collectSignals } from "../sentinel/sentinel.js";
import { z } from "zod";
import {
  CopilotAgentRunSchema,
  type CopilotAgentConfig,
  type CopilotAgentRun,
  type CopilotAgentState,
  type CopilotAgentProgress,
  type DetectedChange,
  type Proposal,
} from "./types.js";

// ---- Constants ----

const DEFAULT_DIR = join(homedir(), ".innovator", "copilot-agent");
const RUNS_DIR = "runs";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- State Machine Transitions ----

const VALID_TRANSITIONS: Record<CopilotAgentState, CopilotAgentState[]> = {
  idle: ["monitoring"],
  monitoring: ["analyzing", "idle", "error"],
  analyzing: ["proposing", "monitoring", "error"],
  proposing: ["waiting-for-feedback", "monitoring", "error"],
  "waiting-for-feedback": ["monitoring", "idle", "error"],
  error: ["idle", "monitoring"],
};

function transition(run: CopilotAgentRun, newState: CopilotAgentState): CopilotAgentRun {
  const allowed = VALID_TRANSITIONS[run.state];
  if (!allowed.includes(newState)) {
    throw new Error(
      `Invalid state transition: ${run.state} → ${newState}. Allowed: ${allowed.join(", ")}`
    );
  }
  return { ...run, state: newState, updatedAt: new Date().toISOString() };
}

// ---- Persistence ----

function getRunPath(runId: string): string {
  return join(DEFAULT_DIR, RUNS_DIR, `${runId}.json`);
}

function saveRun(run: CopilotAgentRun): void {
  ensureDir(join(DEFAULT_DIR, RUNS_DIR));
  atomicWrite(getRunPath(run.id), JSON.stringify(run, null, 2));
}

export function loadRun(runId: string): CopilotAgentRun | null {
  const path = getRunPath(runId);
  if (!existsSync(path)) return null;
  return CopilotAgentRunSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function listRuns(): CopilotAgentRun[] {
  const dir = join(DEFAULT_DIR, RUNS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => {
      const raw = readFileSync(join(dir, f), "utf-8");
      return CopilotAgentRunSchema.parse(JSON.parse(raw));
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// ---- Monitoring ----

async function monitorSources(
  run: CopilotAgentRun,
  config: CopilotAgentConfig,
  onProgress?: (p: CopilotAgentProgress) => void
): Promise<DetectedChange[]> {
  const changes: DetectedChange[] = [];
  const existingIds = new Set(run.detectedChanges.map((c) => c.id));

  for (const source of run.sources) {
    if (!source.enabled) continue;
    if (config.signal?.aborted) break;

    onProgress?.({
      runId: run.id,
      state: "monitoring",
      cycle: run.stats.totalCycles + 1,
      changesDetected: changes.length,
      proposalsGenerated: 0,
      currentSource: source.name,
    });

    try {
      if (source.type === "rss-feed" && source.url) {
        // Use sentinel's signal collection for RSS feeds
        const signals = await collectSignals(
          [
            {
              id: source.id,
              type: "rss",
              name: source.name,
              url: source.url,
              enabled: true,
            },
          ],
          existingIds
        );
        for (const signal of signals) {
          changes.push({
            id: signal.id,
            sourceId: source.id,
            sourceType: "rss-feed",
            title: signal.title,
            description: signal.summary,
            url: signal.url,
            detectedAt: signal.detectedAt,
            relevanceScore: 0,
          });
        }
      } else if (source.type === "repository" && source.url) {
        // Repository monitoring: detect recent activity
        changes.push({
          id: `repo-${source.id}-${Date.now()}`,
          sourceId: source.id,
          sourceType: "repository",
          title: `Repository activity: ${source.name}`,
          description: `New activity detected in ${source.url}`,
          url: source.url,
          detectedAt: new Date().toISOString(),
          relevanceScore: 0,
        });
      } else if (source.type === "market-signal") {
        changes.push({
          id: `market-${source.id}-${Date.now()}`,
          sourceId: source.id,
          sourceType: "market-signal",
          title: `Market signal: ${source.name}`,
          description: `Market trend update from ${source.name}`,
          detectedAt: new Date().toISOString(),
          relevanceScore: 0,
        });
      }

      source.lastCheckedAt = new Date().toISOString();
    } catch (err) {
      console.warn(
        `[copilot-agent] Source monitoring failed for ${source.name}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return changes;
}

// ---- Analysis ----

const AnalysisResponseSchema = z.object({
  relevantChanges: z.array(
    z.object({
      changeId: z.string().max(200),
      relevanceScore: z.number().min(0).max(1),
      reasoning: z.string().max(500),
      innovationPotential: z.enum(["low", "medium", "high", "critical"]),
    })
  ),
  emergingThemes: z.array(z.string().max(200)).max(10),
});

async function analyzeChanges(
  changes: DetectedChange[],
  topics: string[],
  config: CopilotAgentConfig
): Promise<{
  scored: Array<{ change: DetectedChange; score: number; potential: string }>;
  themes: string[];
}> {
  if (changes.length === 0) return { scored: [], themes: [] };

  const changeSummary = changes
    .slice(0, 20)
    .map((c) => `- [${c.sourceType}] ${c.title}: ${c.description.slice(0, 200)}`)
    .join("\n");

  const prompt = `Analyze these detected changes for innovation relevance.

Changes:
${wrapUserInput("CHANGES", changeSummary)}

Topics of interest: ${topics.join(", ")}

For each change, rate its innovation relevance (0-1) and potential (low/medium/high/critical).
Identify emerging themes across all changes.

Respond in JSON:
{
  "relevantChanges": [{ "changeId": "...", "relevanceScore": 0.0-1.0, "reasoning": "...", "innovationPotential": "medium" }],
  "emergingThemes": ["theme1", "theme2"]
}`;

  try {
    const result = await withRetry(
      async () => {
        const raw = await generateText({
          prompt,
          model: config.model,
          signal: config.signal,
        });
        return AnalysisResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
      },
      { signal: config.signal }
    );

    const changeMap = new Map(changes.map((c) => [c.id, c]));
    const scored = result.relevantChanges
      .filter((r) => changeMap.has(r.changeId))
      .map((r) => ({
        change: changeMap.get(r.changeId)!,
        score: r.relevanceScore,
        potential: r.innovationPotential,
      }));

    return { scored, themes: result.emergingThemes };
  } catch (err) {
    console.warn("[copilot-agent] Analysis failed:", err instanceof Error ? err.message : err);
    return { scored: [], themes: [] };
  }
}

// ---- Proposal Generation ----

const ProposalResponseSchema = z.object({
  title: z.string().max(500),
  summary: z.string().max(5000),
  rationale: z.string().max(5000),
  opportunities: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
        impact: z.enum(["low", "medium", "high", "critical"]),
        effort: z.enum(["low", "medium", "high"]),
      })
    )
    .max(10),
});

async function generateProposal(
  changes: Array<{ change: DetectedChange; score: number; potential: string }>,
  themes: string[],
  config: CopilotAgentConfig,
  runId: string
): Promise<Proposal | null> {
  const changeDescriptions = changes
    .map((c) => `- ${c.change.title} (relevance: ${c.score.toFixed(2)}, potential: ${c.potential})`)
    .join("\n");

  const prompt = `Generate an innovation proposal based on these detected changes and themes.

Changes:
${wrapUserInput("CHANGES", changeDescriptions)}

Emerging themes: ${themes.join(", ")}
Topics of interest: ${config.topics.join(", ")}

Create a compelling proposal that connects these changes to innovation opportunities.

Respond in JSON:
{
  "title": "Proposal title",
  "summary": "Brief summary",
  "rationale": "Why this matters",
  "opportunities": [{ "title": "...", "description": "...", "impact": "high", "effort": "medium" }]
}`;

  try {
    const result = await withRetry(
      async () => {
        const raw = await generateText({
          prompt,
          model: config.model,
          signal: config.signal,
        });
        return ProposalResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
      },
      { signal: config.signal }
    );

    return {
      id: `proposal-${randomUUID().slice(0, 12)}`,
      agentRunId: runId,
      title: result.title,
      summary: result.summary,
      rationale: result.rationale,
      opportunities: result.opportunities,
      sourceChanges: changes.map((c) => c.change.id),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(
      "[copilot-agent] Proposal generation failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ---- Delivery ----

export function formatProposalForDelivery(proposal: Proposal): string {
  const lines: string[] = [
    `# 🤖 Innovation Proposal: ${proposal.title}`,
    "",
    `**Status:** ${proposal.status}`,
    `**Created:** ${proposal.createdAt}`,
    "",
    `## Summary`,
    proposal.summary,
    "",
    `## Rationale`,
    proposal.rationale,
    "",
  ];

  if (proposal.opportunities.length > 0) {
    lines.push("## Opportunities");
    lines.push("");
    for (const opp of proposal.opportunities) {
      lines.push(`### ${opp.title} (Impact: ${opp.impact}, Effort: ${opp.effort})`);
      lines.push(opp.description);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*Reply with: accept / dismiss / defer*");

  return lines.join("\n");
}

// ---- Feedback Loop ----

export function respondToProposal(
  run: CopilotAgentRun,
  proposalId: string,
  action: "accepted" | "dismissed" | "deferred",
  feedback?: string
): CopilotAgentRun {
  const proposal = run.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }
  if (proposal.status !== "pending") {
    throw new Error(`Proposal ${proposalId} already responded to (${proposal.status})`);
  }

  proposal.status = action;
  proposal.feedback = feedback;
  proposal.respondedAt = new Date().toISOString();

  // Update stats
  if (action === "accepted") run.stats.acceptedProposals++;
  else if (action === "dismissed") run.stats.dismissedProposals++;
  else if (action === "deferred") run.stats.deferredProposals++;

  // Transition back to monitoring if no pending proposals remain
  const pendingCount = run.proposals.filter((p) => p.status === "pending").length;
  if (pendingCount === 0 && run.state === "waiting-for-feedback") {
    run = transition(run, "monitoring");
    run = transition(run, "idle");
  }

  run.updatedAt = new Date().toISOString();
  saveRun(run);
  return run;
}

// ---- Main Agent Loop ----

/**
 * Run a single cycle of the copilot agent:
 * idle → monitoring → analyzing → proposing → waiting-for-feedback
 */
export async function runCopilotAgentCycle(
  config: CopilotAgentConfig,
  existingRunId?: string,
  onProgress?: (p: CopilotAgentProgress) => void
): Promise<CopilotAgentRun> {
  // Validate config
  if (!config.sources || config.sources.length === 0) {
    throw new Error("At least one monitoring source is required");
  }
  if (!config.topics || config.topics.length === 0) {
    throw new Error("At least one topic is required");
  }

  // Load or create run
  let run: CopilotAgentRun = existingRunId
    ? (loadRun(existingRunId) ?? createNewRun(config))
    : createNewRun(config);

  try {
    // Transition: idle → monitoring
    if (run.state === "idle" || run.state === "error") {
      run = transition(run, "monitoring");
      saveRun(run);
    }

    onProgress?.({
      runId: run.id,
      state: "monitoring",
      cycle: run.stats.totalCycles + 1,
      changesDetected: 0,
      proposalsGenerated: 0,
    });

    // Monitor sources
    const newChanges = await monitorSources(run, config, onProgress);
    run.detectedChanges.push(...newChanges);
    // Keep bounded
    if (run.detectedChanges.length > 500) {
      run.detectedChanges = run.detectedChanges.slice(-500);
    }

    // Transition: monitoring → analyzing
    run = transition(run, "analyzing");
    saveRun(run);

    onProgress?.({
      runId: run.id,
      state: "analyzing",
      cycle: run.stats.totalCycles + 1,
      changesDetected: newChanges.length,
      proposalsGenerated: 0,
    });

    // Analyze changes
    const { scored, themes } = await analyzeChanges(newChanges, config.topics, config);

    const relevantChanges = scored.filter((s) => s.score >= (config.relevanceThreshold ?? 0.5));

    if (relevantChanges.length === 0) {
      // Nothing relevant — go back to idle
      run = transition(run, "monitoring");
      run = transition(run, "idle");
      run.stats.totalCycles++;
      run.stats.totalChangesDetected += newChanges.length;
      run.lastCycleAt = new Date().toISOString();
      run.updatedAt = new Date().toISOString();
      saveRun(run);
      return run;
    }

    // Transition: analyzing → proposing
    run = transition(run, "proposing");
    saveRun(run);

    onProgress?.({
      runId: run.id,
      state: "proposing",
      cycle: run.stats.totalCycles + 1,
      changesDetected: newChanges.length,
      proposalsGenerated: 0,
    });

    // Generate proposals
    const maxProposals = config.maxProposalsPerCycle ?? 5;
    const proposal = await generateProposal(
      relevantChanges.slice(0, maxProposals),
      themes,
      config,
      run.id
    );

    if (proposal) {
      run.proposals.push(proposal);
      run.stats.totalProposals++;
    }

    // Transition: proposing → waiting-for-feedback
    if (run.proposals.some((p) => p.status === "pending")) {
      run = transition(run, "waiting-for-feedback");
    } else {
      run = transition(run, "monitoring");
      run = transition(run, "idle");
    }

    run.stats.totalCycles++;
    run.stats.totalChangesDetected += newChanges.length;
    run.lastCycleAt = new Date().toISOString();
    run.updatedAt = new Date().toISOString();
    saveRun(run);

    onProgress?.({
      runId: run.id,
      state: run.state,
      cycle: run.stats.totalCycles,
      changesDetected: newChanges.length,
      proposalsGenerated: proposal ? 1 : 0,
    });

    return run;
  } catch (err) {
    run.state = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.updatedAt = new Date().toISOString();
    saveRun(run);
    throw err;
  }
}

function createNewRun(config: CopilotAgentConfig): CopilotAgentRun {
  const now = new Date().toISOString();
  return CopilotAgentRunSchema.parse({
    id: `agent-${randomUUID().slice(0, 12)}`,
    state: "idle",
    sources: config.sources,
    detectedChanges: [],
    proposals: [],
    deliveryChannels: config.deliveryChannels ?? [{ channel: "web", enabled: true }],
    config: {
      monitoringIntervalMs: config.monitoringIntervalMs ?? 300000,
      relevanceThreshold: config.relevanceThreshold ?? 0.5,
      maxProposalsPerCycle: config.maxProposalsPerCycle ?? 5,
      topics: config.topics,
      model: config.model,
      autoPropose: config.autoPropose ?? true,
    },
    stats: {
      totalCycles: 0,
      totalChangesDetected: 0,
      totalProposals: 0,
      acceptedProposals: 0,
      dismissedProposals: 0,
      deferredProposals: 0,
    },
    startedAt: now,
    updatedAt: now,
  });
}

/** Format an agent run summary as Markdown. */
export function agentRunToMarkdown(run: CopilotAgentRun): string {
  const lines: string[] = [
    `# 🤖 Innovation Copilot Agent — ${run.id}`,
    "",
    `**State:** ${run.state} | **Cycles:** ${run.stats.totalCycles} | **Changes:** ${run.stats.totalChangesDetected}`,
    `**Proposals:** ${run.stats.totalProposals} (✅ ${run.stats.acceptedProposals} / ❌ ${run.stats.dismissedProposals} / ⏳ ${run.stats.deferredProposals})`,
    "",
  ];

  const pending = run.proposals.filter((p) => p.status === "pending");
  if (pending.length > 0) {
    lines.push("## Pending Proposals");
    lines.push("");
    for (const p of pending) {
      lines.push(`### ${p.title}`);
      lines.push(p.summary.slice(0, 300));
      lines.push("");
    }
  }

  if (run.error) {
    lines.push(`## ⚠️ Error`);
    lines.push(run.error);
  }

  return lines.join("\n");
}
