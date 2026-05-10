/**
 * @module replay-decisions
 *
 * Decision-point extensions for the replay system — records decision points
 * made during pipeline execution, enables branching from any decision point
 * with linked session trees, and provides outcome comparison and visual
 * timeline data generation.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---- Zod Schemas ----

/** Schema for a decision point recorded during pipeline execution. */
export const DecisionPointSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stage: z.enum(["investigating", "generating", "synthesizing"]),
  type: z.enum(["angle-selection", "investigation-direction", "synthesis-strategy", "custom"]),
  description: z.string(),
  chosenOption: z.string(),
  availableOptions: z.array(z.string()),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

/** Schema for a branch created from a decision point. */
export const DecisionBranchSchema = z.object({
  id: z.string(),
  parentDecisionId: z.string(),
  runId: z.string(),
  chosenOption: z.string(),
  outcome: z
    .object({
      summary: z.string(),
      score: z.number(),
      ideaCount: z.number(),
    })
    .optional(),
  createdAt: z.string(),
});

/** Schema for comparing outcomes of two branches. */
export const BranchComparisonSchema = z.object({
  branchA: z.string(),
  branchB: z.string(),
  commonAncestor: z.string(),
  divergencePoint: z.string(),
  outcomeComparison: z.object({
    scoreDiff: z.number(),
    uniqueIdeasA: z.array(z.string()),
    uniqueIdeasB: z.array(z.string()),
    recommendation: z.string(),
  }),
});

/** Schema for a full session tree of runs and branches. */
export const SessionTreeSchema = z.object({
  rootRunId: z.string(),
  branches: z.array(DecisionBranchSchema),
  decisionPoints: z.array(DecisionPointSchema),
  currentPath: z.array(z.string()),
});

/** Schema for a node in the timeline visualization. */
const TimelineNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["decision", "start", "end"]),
  label: z.string(),
  stage: z.string(),
  timestamp: z.string(),
  isBranchPoint: z.boolean(),
  branchCount: z.number(),
});

/** Schema for an edge in the timeline visualization. */
const TimelineEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  isBranch: z.boolean(),
});

/** Schema for timeline visualization data. */
export const TimelineViewSchema = z.object({
  nodes: z.array(TimelineNodeSchema),
  edges: z.array(TimelineEdgeSchema),
  mainPath: z.array(z.string()),
  branches: z.array(
    z.object({
      branchId: z.string(),
      path: z.array(z.string()),
    })
  ),
  stats: z.object({
    totalDecisions: z.number(),
    totalBranches: z.number(),
    maxDepth: z.number(),
    stages: z.record(z.number()),
  }),
});

export type DecisionPoint = z.infer<typeof DecisionPointSchema>;
export type DecisionBranch = z.infer<typeof DecisionBranchSchema>;
export type BranchComparison = z.infer<typeof BranchComparisonSchema>;
export type SessionTree = z.infer<typeof SessionTreeSchema>;
export type TimelineView = z.infer<typeof TimelineViewSchema>;

// ---- In-memory stores ----

const decisionPoints: Map<string, DecisionPoint> = new Map();
const decisionBranches: Map<string, DecisionBranch> = new Map();
// Tracks the current main path per run (list of decision IDs)
const mainPaths: Map<string, string[]> = new Map();

// ---- ID generation ----

function generateDecisionId(): string {
  return `dp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateBranchId(): string {
  return `dbranch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Decision Recording ----

/**
 * Record a decision point made during pipeline execution.
 *
 * @param runId - The run this decision belongs to
 * @param point - The decision point data (id is auto-generated if empty)
 * @returns The recorded decision point
 */
export function recordDecisionPoint(
  runId: string,
  point: Omit<DecisionPoint, "id" | "runId" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  }
): DecisionPoint {
  const dp: DecisionPoint = {
    id: point.id || generateDecisionId(),
    runId,
    stage: point.stage,
    type: point.type,
    description: point.description,
    chosenOption: point.chosenOption,
    availableOptions: point.availableOptions,
    timestamp: point.timestamp || new Date().toISOString(),
    metadata: point.metadata,
  };

  decisionPoints.set(dp.id, dp);

  // Add to main path for this run
  const path = mainPaths.get(runId) ?? [];
  path.push(dp.id);
  mainPaths.set(runId, path);

  return dp;
}

/**
 * Get all decision points for a run, ordered by timestamp.
 *
 * @param runId - The run ID
 * @returns Array of decision points
 */
export function getDecisionPoints(runId: string): DecisionPoint[] {
  return Array.from(decisionPoints.values())
    .filter((dp) => dp.runId === runId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Get a single decision point by ID.
 *
 * @param decisionId - The decision point ID
 * @returns The decision point or undefined
 */
export function getDecisionPoint(decisionId: string): DecisionPoint | undefined {
  return decisionPoints.get(decisionId);
}

// ---- Branching from Decisions ----

/**
 * Create a new branch exploring an alternative choice at a decision point.
 * Uses LLM to evaluate the alternative option and produce an outcome summary.
 *
 * @param decisionId - The decision point to branch from
 * @param alternativeOption - The alternative option to explore
 * @param model - Optional model override
 * @param signal - Optional AbortSignal
 * @returns The created DecisionBranch
 */
export async function branchFromDecision(
  decisionId: string,
  alternativeOption: string,
  model?: string,
  signal?: AbortSignal
): Promise<DecisionBranch | undefined> {
  const dp = decisionPoints.get(decisionId);
  if (!dp) return undefined;

  if (!dp.availableOptions.includes(alternativeOption)) {
    // Still allow branching with novel options not in the original set
  }

  const branchId = generateBranchId();
  const branch: DecisionBranch = {
    id: branchId,
    parentDecisionId: decisionId,
    runId: dp.runId,
    chosenOption: alternativeOption,
    createdAt: new Date().toISOString(),
  };

  // Use LLM to evaluate the alternative path
  const prompt = `You are an innovation analysis expert. A pipeline decision was made during the "${dp.stage}" stage.

Decision: ${dp.description}
Original choice: ${dp.chosenOption}
Alternative being explored: ${alternativeOption}
Available options were: ${dp.availableOptions.join(", ")}

Evaluate what the outcome would likely be if the alternative "${alternativeOption}" had been chosen instead.

You MUST respond with valid JSON only:
{
  "summary": "Brief summary of the likely outcome with this alternative",
  "score": <0.0-1.0, estimated quality score>,
  "ideaCount": <estimated number of ideas this path would produce>
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { summary: string; score: number; ideaCount: number };
    branch.outcome = {
      summary: parsed.summary,
      score: Math.max(0, Math.min(1, parsed.score)),
      ideaCount: Math.max(0, Math.round(parsed.ideaCount)),
    };
  } catch {
    // Branch created without outcome evaluation
  }

  decisionBranches.set(branchId, branch);
  return branch;
}

/**
 * Get the full session tree for a run, including all decision points and branches.
 *
 * @param runId - The root run ID
 * @returns The session tree
 */
export function getSessionTree(runId: string): SessionTree {
  const points = getDecisionPoints(runId);
  const branches = Array.from(decisionBranches.values()).filter((b) => b.runId === runId);
  const currentPath = mainPaths.get(runId) ?? [];

  return {
    rootRunId: runId,
    branches,
    decisionPoints: points,
    currentPath,
  };
}

/**
 * Promote a branch to become the main path at its decision point.
 * Updates the main path to reflect the branch's chosen option.
 *
 * @param branchId - The branch to adopt
 * @param runId - The run to update
 * @returns true if successful
 */
export function adoptBranch(branchId: string, runId: string): boolean {
  const branch = decisionBranches.get(branchId);
  if (!branch || branch.runId !== runId) return false;

  const dp = decisionPoints.get(branch.parentDecisionId);
  if (!dp) return false;

  // Update the decision point's chosen option
  dp.chosenOption = branch.chosenOption;

  // Trim the main path to the adopted decision and rebuild from there
  const path = mainPaths.get(runId) ?? [];
  const dpIndex = path.indexOf(branch.parentDecisionId);
  if (dpIndex >= 0) {
    mainPaths.set(runId, path.slice(0, dpIndex + 1));
  }

  return true;
}

// ---- Outcome Comparison ----

/**
 * Compare outcomes of two branches using LLM-powered analysis.
 *
 * @param branchIdA - First branch ID
 * @param branchIdB - Second branch ID
 * @param model - Optional model override
 * @param signal - Optional AbortSignal
 * @returns A BranchComparison
 */
export async function compareBranches(
  branchIdA: string,
  branchIdB: string,
  model?: string,
  signal?: AbortSignal
): Promise<BranchComparison | undefined> {
  const branchA = decisionBranches.get(branchIdA);
  const branchB = decisionBranches.get(branchIdB);
  if (!branchA || !branchB) return undefined;

  const dpA = decisionPoints.get(branchA.parentDecisionId);
  const dpB = decisionPoints.get(branchB.parentDecisionId);
  if (!dpA || !dpB) return undefined;

  // Determine common ancestor
  const commonAncestor = branchA.runId === branchB.runId ? branchA.runId : "";
  const divergencePoint =
    branchA.parentDecisionId === branchB.parentDecisionId
      ? branchA.parentDecisionId
      : branchA.parentDecisionId;

  const outcomeA = branchA.outcome ?? { summary: "No outcome data", score: 0, ideaCount: 0 };
  const outcomeB = branchB.outcome ?? { summary: "No outcome data", score: 0, ideaCount: 0 };

  const prompt = `You are an innovation analysis expert. Compare these two branch outcomes from an innovation pipeline.

Branch A (chose "${branchA.chosenOption}"):
- Summary: ${outcomeA.summary}
- Score: ${outcomeA.score}
- Idea count: ${outcomeA.ideaCount}

Branch B (chose "${branchB.chosenOption}"):
- Summary: ${outcomeB.summary}
- Score: ${outcomeB.score}
- Idea count: ${outcomeB.ideaCount}

You MUST respond with valid JSON only:
{
  "uniqueIdeasA": ["ideas unique to branch A"],
  "uniqueIdeasB": ["ideas unique to branch B"],
  "recommendation": "Which branch produced better results and why"
}`;

  let uniqueIdeasA: string[] = [];
  let uniqueIdeasB: string[] = [];
  let recommendation = `Branch ${outcomeA.score >= outcomeB.score ? "A" : "B"} scored higher (${Math.max(outcomeA.score, outcomeB.score).toFixed(2)} vs ${Math.min(outcomeA.score, outcomeB.score).toFixed(2)}).`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as {
      uniqueIdeasA: string[];
      uniqueIdeasB: string[];
      recommendation: string;
    };
    uniqueIdeasA = parsed.uniqueIdeasA ?? [];
    uniqueIdeasB = parsed.uniqueIdeasB ?? [];
    recommendation = parsed.recommendation ?? recommendation;
  } catch {
    // Fall back to score-based comparison
  }

  return {
    branchA: branchIdA,
    branchB: branchIdB,
    commonAncestor,
    divergencePoint,
    outcomeComparison: {
      scoreDiff: outcomeA.score - outcomeB.score,
      uniqueIdeasA,
      uniqueIdeasB,
      recommendation,
    },
  };
}

/**
 * Export a branch comparison as formatted markdown.
 */
export function branchComparisonToMarkdown(comparison: BranchComparison): string {
  const oc = comparison.outcomeComparison;
  const lines: string[] = [
    "# Branch Comparison Report",
    "",
    `**Branch A:** ${comparison.branchA}`,
    `**Branch B:** ${comparison.branchB}`,
    `**Common Ancestor:** ${comparison.commonAncestor}`,
    `**Divergence Point:** ${comparison.divergencePoint}`,
    "",
    "## Outcome Comparison",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Score Difference (A − B) | ${oc.scoreDiff >= 0 ? "+" : ""}${oc.scoreDiff.toFixed(2)} |`,
    `| Unique Ideas in A | ${oc.uniqueIdeasA.length} |`,
    `| Unique Ideas in B | ${oc.uniqueIdeasB.length} |`,
    "",
  ];

  if (oc.uniqueIdeasA.length > 0) {
    lines.push("## Unique Ideas — Branch A", "");
    for (const idea of oc.uniqueIdeasA) {
      lines.push(`- ${idea}`);
    }
    lines.push("");
  }

  if (oc.uniqueIdeasB.length > 0) {
    lines.push("## Unique Ideas — Branch B", "");
    for (const idea of oc.uniqueIdeasB) {
      lines.push(`- ${idea}`);
    }
    lines.push("");
  }

  lines.push("## Recommendation", "", oc.recommendation, "");

  return lines.join("\n");
}

// ---- Timeline Visualization ----

/**
 * Build a timeline view data structure for visual rendering of a run's
 * decision points and branches.
 *
 * @param runId - The run ID
 * @returns TimelineView data structure
 */
export function buildTimelineView(runId: string): TimelineView {
  const points = getDecisionPoints(runId);
  const branches = Array.from(decisionBranches.values()).filter((b) => b.runId === runId);
  const currentPath = mainPaths.get(runId) ?? [];

  // Build nodes
  const nodes: TimelineView["nodes"] = [];
  const edges: TimelineView["edges"] = [];

  // Start node
  const startNodeId = `start-${runId}`;
  nodes.push({
    id: startNodeId,
    type: "start",
    label: "Run Start",
    stage: "",
    timestamp: points[0]?.timestamp ?? new Date().toISOString(),
    isBranchPoint: false,
    branchCount: 0,
  });

  // Decision point nodes
  let prevNodeId = startNodeId;
  for (const dp of points) {
    const dpBranches = branches.filter((b) => b.parentDecisionId === dp.id);
    nodes.push({
      id: dp.id,
      type: "decision",
      label: dp.description,
      stage: dp.stage,
      timestamp: dp.timestamp,
      isBranchPoint: dpBranches.length > 0,
      branchCount: dpBranches.length,
    });

    edges.push({
      from: prevNodeId,
      to: dp.id,
      label: dp === points[0] ? undefined : undefined,
      isBranch: false,
    });

    // Branch edges
    for (const branch of dpBranches) {
      const branchNodeId = `branch-node-${branch.id}`;
      nodes.push({
        id: branchNodeId,
        type: "decision",
        label: `Branch: ${branch.chosenOption}`,
        stage: dp.stage,
        timestamp: branch.createdAt,
        isBranchPoint: false,
        branchCount: 0,
      });
      edges.push({
        from: dp.id,
        to: branchNodeId,
        label: branch.chosenOption,
        isBranch: true,
      });
    }

    prevNodeId = dp.id;
  }

  // End node
  const endNodeId = `end-${runId}`;
  nodes.push({
    id: endNodeId,
    type: "end",
    label: "Run End",
    stage: "",
    timestamp: new Date().toISOString(),
    isBranchPoint: false,
    branchCount: 0,
  });
  edges.push({ from: prevNodeId, to: endNodeId, isBranch: false });

  // Stage counts
  const stages: Record<string, number> = {};
  for (const dp of points) {
    stages[dp.stage] = (stages[dp.stage] ?? 0) + 1;
  }

  // Compute max depth (longest path from root through branches)
  let maxDepth = points.length;
  const branchPaths: TimelineView["branches"] = [];
  for (const branch of branches) {
    const dpIndex = points.findIndex((dp) => dp.id === branch.parentDecisionId);
    const path = points.slice(0, dpIndex + 1).map((dp) => dp.id);
    path.push(`branch-node-${branch.id}`);
    branchPaths.push({ branchId: branch.id, path });
    maxDepth = Math.max(maxDepth, path.length);
  }

  return {
    nodes,
    edges,
    mainPath: [startNodeId, ...currentPath, endNodeId],
    branches: branchPaths,
    stats: {
      totalDecisions: points.length,
      totalBranches: branches.length,
      maxDepth,
      stages,
    },
  };
}

/**
 * Export a timeline view as formatted markdown.
 */
export function timelineViewToMarkdown(view: TimelineView): string {
  const lines: string[] = [
    "# Innovation Timeline",
    "",
    "## Stats",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Decisions | ${view.stats.totalDecisions} |`,
    `| Total Branches | ${view.stats.totalBranches} |`,
    `| Max Depth | ${view.stats.maxDepth} |`,
    "",
  ];

  if (Object.keys(view.stats.stages).length > 0) {
    lines.push("### Decisions by Stage", "");
    for (const [stage, count] of Object.entries(view.stats.stages)) {
      lines.push(`- **${stage}**: ${count}`);
    }
    lines.push("");
  }

  lines.push("## Main Path", "");
  const mainNodes = view.nodes.filter((n) => view.mainPath.includes(n.id));
  for (let i = 0; i < mainNodes.length; i++) {
    const node = mainNodes[i];
    const prefix = i === 0 ? "🟢" : i === mainNodes.length - 1 ? "🏁" : "🔷";
    const branchInfo =
      node.branchCount > 0
        ? ` *(${node.branchCount} branch${node.branchCount > 1 ? "es" : ""})*`
        : "";
    lines.push(`${i + 1}. ${prefix} **${node.label}**${branchInfo}`);
    if (node.stage) {
      lines.push(`   - Stage: ${node.stage}`);
    }
  }
  lines.push("");

  if (view.branches.length > 0) {
    lines.push("## Branches", "");
    for (const branch of view.branches) {
      const branchNodes = view.nodes.filter((n) => branch.path.includes(n.id));
      const leafNode = branchNodes[branchNodes.length - 1];
      lines.push(`### ${branch.branchId}`);
      lines.push(`- Diverges at: ${branch.path[branch.path.length - 2] ?? "root"}`);
      lines.push(`- Explores: ${leafNode?.label ?? "unknown"}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---- Persistence ----

const DECISIONS_DIR = join(homedir(), ".innovator", "replay-decisions");
const DECISIONS_FILE = join(DECISIONS_DIR, "decisions.jsonl");

function ensureDecisionsDir(): void {
  if (!existsSync(DECISIONS_DIR)) mkdirSync(DECISIONS_DIR, { recursive: true });
}

/** Persist a decision point to JSONL storage. */
export function persistDecisionPoint(decisionId: string): boolean {
  const dp = decisionPoints.get(decisionId);
  if (!dp) return false;

  ensureDecisionsDir();
  const entry = { type: "decision-point" as const, timestamp: new Date().toISOString(), data: dp };
  appendFileSync(DECISIONS_FILE, JSON.stringify(entry) + "\n", "utf-8");
  return true;
}

/** Persist a decision branch to JSONL storage. */
export function persistDecisionBranch(branchId: string): boolean {
  const branch = decisionBranches.get(branchId);
  if (!branch) return false;

  ensureDecisionsDir();
  const entry = {
    type: "decision-branch" as const,
    timestamp: new Date().toISOString(),
    data: branch,
  };
  appendFileSync(DECISIONS_FILE, JSON.stringify(entry) + "\n", "utf-8");
  return true;
}

/** Load all persisted decision points from JSONL storage. */
export function loadPersistedDecisionPoints(): DecisionPoint[] {
  ensureDecisionsDir();
  if (!existsSync(DECISIONS_FILE)) return [];

  const content = readFileSync(DECISIONS_FILE, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const points: DecisionPoint[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { type: string; data: unknown };
      if (entry.type === "decision-point") {
        const parsed = DecisionPointSchema.safeParse(entry.data);
        if (parsed.success) {
          points.push(parsed.data);
          decisionPoints.set(parsed.data.id, parsed.data);
          // Rebuild main path
          const path = mainPaths.get(parsed.data.runId) ?? [];
          if (!path.includes(parsed.data.id)) {
            path.push(parsed.data.id);
            mainPaths.set(parsed.data.runId, path);
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return points;
}

/** Load all persisted decision branches from JSONL storage. */
export function loadPersistedDecisionBranches(): DecisionBranch[] {
  ensureDecisionsDir();
  if (!existsSync(DECISIONS_FILE)) return [];

  const content = readFileSync(DECISIONS_FILE, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const branches: DecisionBranch[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { type: string; data: unknown };
      if (entry.type === "decision-branch") {
        const parsed = DecisionBranchSchema.safeParse(entry.data);
        if (parsed.success) {
          branches.push(parsed.data);
          if (!decisionBranches.has(parsed.data.id)) {
            decisionBranches.set(parsed.data.id, parsed.data);
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return branches;
}

// ---- Testing Utilities ----

/** Clear all in-memory decision data (for testing). */
export function clearDecisionData(): void {
  decisionPoints.clear();
  decisionBranches.clear();
  mainPaths.clear();
}
