/**
 * @module autonomous-agent
 *
 * Long-running agentic innovation loop that self-directs exploration,
 * branches investigations, and delivers curated innovation portfolios.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import { ANGLE_IDS, type AngleId } from "../types.js";
import type {
  AutonomousAgentConfig,
  AutonomousProgress,
  AutonomousRun,
  AgentDecision,
  InvestigationBranch,
  InnovationPortfolio,
  AgentStatus,
} from "./types.js";

export type {
  AutonomousAgentConfig,
  AutonomousProgress,
  AutonomousRun,
  AgentDecision,
  InvestigationBranch,
  InnovationPortfolio,
  AgentStatus,
};
export {
  ExplorationStrategySchema,
  AgentStatusSchema,
  InvestigationBranchSchema,
  AgentDecisionSchema,
  InnovationPortfolioSchema,
  AutonomousRunSchema,
} from "./types.js";
export type { ExplorationStrategy } from "./types.js";

// ---- Prompt Builders ----

function buildDecisionPrompt(
  rootSubject: string,
  currentBranch: InvestigationBranch,
  allBranches: InvestigationBranch[],
  strategy: string
): string {
  const completedCount = allBranches.filter((b) => b.status === "completed").length;
  const pendingCount = allBranches.filter((b) => b.status === "pending").length;
  const totalIdeas = allBranches.reduce((s, b) => s + b.ideas.length, 0);

  return `You are an autonomous innovation strategist directing a multi-branch exploration.

ROOT SUBJECT: ${wrapUserInput("SUBJECT", rootSubject)}
STRATEGY: ${strategy}
CURRENT BRANCH: ${wrapUserInput("BRANCH", currentBranch.subject)}
BRANCH DEPTH: ${currentBranch.depth}
IDEAS FOUND SO FAR: ${totalIdeas}
COMPLETED BRANCHES: ${completedCount}
PENDING BRANCHES: ${pendingCount}

${currentBranch.summary ? `CURRENT FINDINGS:\n${currentBranch.summary}` : ""}

Decide the next action. Options:
- "explore": Continue investigating this branch deeper
- "branch": Fork into 2-3 related sub-topics for parallel exploration
- "validate": Run validation on current branch ideas to check feasibility/novelty
- "refine": Improve existing ideas based on validation feedback
- "prune": Abandon this branch (low potential)
- "synthesize": Enough data collected, create final portfolio

Respond with JSON only:
{
  "action": "explore" | "branch" | "validate" | "refine" | "prune" | "synthesize",
  "reasoning": "Why this decision...",
  "newSubjects": ["sub-topic 1", "sub-topic 2"]
}

If action is "branch", provide 2-3 newSubjects. Otherwise, newSubjects can be empty.`;
}

function buildPortfolioPrompt(rootSubject: string, branches: InvestigationBranch[]): string {
  const branchSummaries = branches
    .filter((b) => b.status === "completed" && b.ideas.length > 0)
    .map((b) => ({
      subject: b.subject,
      ideaCount: b.ideas.length,
      topIdeas: b.ideas.slice(0, 3).map((i) => ({
        title: i.title,
        description: i.description,
        score: i.score,
      })),
    }));

  return `You are a portfolio curator for an innovation exploration.

ROOT SUBJECT: ${wrapUserInput("SUBJECT", rootSubject)}

EXPLORATION RESULTS:
"""
${sanitizeLlmOutput(JSON.stringify(branchSummaries, null, 2))}
"""

Curate the top innovations into a portfolio. Identify cross-cutting themes.

Respond with JSON only:
{
  "title": "Portfolio title",
  "summary": "Executive summary of findings",
  "topIdeas": [
    {
      "title": "...",
      "description": "...",
      "sourceSubject": "which branch subject",
      "score": 0-100,
      "feasibility": "low" | "medium" | "high"
    }
  ],
  "themes": ["theme1", "theme2"]
}`;
}

const DecisionResponseSchema = z.object({
  action: z.enum(["explore", "branch", "prune", "synthesize", "pause", "validate", "refine"]),
  reasoning: z.string().max(2000),
  newSubjects: z.array(z.string().max(1000)).max(10).default([]),
});

// ---- Validation & Refinement Prompts ----

function buildValidationPrompt(rootSubject: string, branch: InvestigationBranch): string {
  const ideaSummaries = branch.ideas.map((i) => ({
    title: i.title,
    description: i.description,
    score: i.score,
  }));

  return `You are a critical innovation validator reviewing ideas for feasibility and novelty.

ROOT SUBJECT: ${wrapUserInput("SUBJECT", rootSubject)}
BRANCH: ${wrapUserInput("BRANCH", branch.subject)}

IDEAS TO VALIDATE:
"""
${sanitizeLlmOutput(JSON.stringify(ideaSummaries, null, 2))}
"""

For each idea, assess:
1. Feasibility (is this implementable with current technology?)
2. Novelty (is this truly innovative or a rehash?)
3. Market fit (does this solve a real problem?)

Respond with JSON only:
{
  "validations": [
    {
      "title": "idea title",
      "feasibilityScore": 0-100,
      "noveltyScore": 0-100,
      "marketFitScore": 0-100,
      "issues": ["issue 1", "issue 2"],
      "verdict": "pass" | "refine" | "reject"
    }
  ],
  "overallStrength": 0-100
}`;
}

function buildRefinementPrompt(
  rootSubject: string,
  branch: InvestigationBranch,
  validationFeedback: string
): string {
  return `You are an innovation refinement specialist. Improve ideas based on validation feedback.

ROOT SUBJECT: ${wrapUserInput("SUBJECT", rootSubject)}
BRANCH: ${wrapUserInput("BRANCH", branch.subject)}

ORIGINAL IDEAS:
"""
${sanitizeLlmOutput(
  JSON.stringify(
    branch.ideas.map((i) => ({ title: i.title, description: i.description })),
    null,
    2
  )
)}
"""

VALIDATION FEEDBACK:
"""
${sanitizeLlmOutput(validationFeedback)}
"""

Refine the ideas that received "refine" verdict. Drop rejected ideas. Keep passing ideas.

Respond with JSON only:
{
  "refinedIdeas": [
    {
      "title": "refined title",
      "description": "improved description",
      "potentialImpact": "impact statement",
      "implementationHint": "how to implement",
      "score": 0-100
    }
  ],
  "refinementNotes": "what was changed and why"
}`;
}

const ValidationResponseSchema = z.object({
  validations: z.array(
    z.object({
      title: z.string().max(500),
      feasibilityScore: z.number().min(0).max(100),
      noveltyScore: z.number().min(0).max(100),
      marketFitScore: z.number().min(0).max(100),
      issues: z.array(z.string().max(500)).max(10),
      verdict: z.enum(["pass", "refine", "reject"]),
    })
  ),
  overallStrength: z.number().min(0).max(100),
});

const RefinementResponseSchema = z.object({
  refinedIdeas: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
      potentialImpact: z.string().max(2000),
      implementationHint: z.string().max(2000),
      score: z.number().min(0).max(100).optional(),
    })
  ),
  refinementNotes: z.string().max(2000),
});

const PortfolioResponseSchema = z.object({
  title: z.string().max(500),
  summary: z.string().max(5000),
  topIdeas: z.array(
    z.object({
      title: z.string().max(500),
      description: z.string().max(5000),
      sourceSubject: z.string().max(1000),
      score: z.number().min(0).max(100),
      feasibility: z.enum(["low", "medium", "high"]),
    })
  ),
  themes: z.array(z.string().max(500)).max(20),
});

// ---- Core Agent ----

function createBranch(
  subject: string,
  parentId: string | null,
  depth: number
): InvestigationBranch {
  return {
    id: randomUUID(),
    parentId,
    subject,
    depth,
    status: "pending",
    ideas: [],
    subBranches: [],
    createdAt: new Date().toISOString(),
  };
}

async function exploreBranch(
  branch: InvestigationBranch,
  model?: string,
  signal?: AbortSignal
): Promise<InvestigationBranch> {
  const investigation = await investigate(branch.subject, model, signal);
  branch.summary = investigation.summary;

  // Generate ideas using 2-3 random angles for variety
  const angles = [...ANGLE_IDS].sort(() => Math.random() - 0.5).slice(0, 3) as AngleId[];
  for (const angleId of angles) {
    if (signal?.aborted) break;
    try {
      const result = await generateForAngle(branch.subject, investigation, angleId, model, signal);
      for (const idea of result.ideas) {
        branch.ideas.push({
          title: idea.title,
          description: idea.description,
          potentialImpact: idea.potentialImpact,
          implementationHint: idea.implementationHint,
        });
      }
    } catch {
      // Continue with remaining angles on failure
    }
  }

  branch.status = "completed";
  branch.completedAt = new Date().toISOString();
  return branch;
}

/**
 * Run an autonomous innovation exploration that self-directs branching investigations.
 *
 * @param subject - The root topic to explore
 * @param onProgress - Callback for real-time progress updates
 * @param config - Agent configuration (max branches, depth, strategy)
 * @returns The completed AutonomousRun with portfolio
 */
export async function runAutonomousAgent(
  subject: string,
  onProgress: (progress: AutonomousProgress) => void,
  config: AutonomousAgentConfig = {}
): Promise<AutonomousRun> {
  const maxBranches = config.maxBranches ?? 10;
  const maxDepth = config.maxDepth ?? 3;
  const pruneThreshold = config.pruneThreshold ?? 20;
  const strategy = config.strategy ?? "adaptive";
  const model = config.model;
  const signal = config.signal;

  const run: AutonomousRun = {
    id: randomUUID(),
    rootSubject: subject,
    status: "exploring",
    strategy,
    branches: [],
    decisions: [],
    config: { maxBranches, maxDepth, pruneThreshold, model },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const emitProgress = () => {
    try {
      onProgress({
        runId: run.id,
        status: run.status,
        activeBranch: run.branches.find((b) => b.status === "active")?.id,
        completedBranches: run.branches.filter((b) => b.status === "completed").length,
        totalBranches: run.branches.length,
        totalIdeas: run.branches.reduce((s, b) => s + b.ideas.length, 0),
        currentDecision: run.decisions[run.decisions.length - 1],
      });
    } catch {
      // Client may have disconnected
    }
  };

  // Create root branch
  const rootBranch = createBranch(subject, null, 0);
  run.branches.push(rootBranch);
  emitProgress();

  // Processing queue
  const queue: string[] = [rootBranch.id];

  while (queue.length > 0 && run.branches.length < maxBranches) {
    if (signal?.aborted) {
      run.status = "failed";
      emitProgress();
      return run;
    }

    const branchId = queue.shift()!;
    const branch = run.branches.find((b) => b.id === branchId);
    if (!branch || branch.status !== "pending") continue;

    // Explore the branch
    branch.status = "active";
    run.updatedAt = new Date().toISOString();
    emitProgress();

    try {
      await exploreBranch(branch, model, signal);
    } catch (err) {
      branch.status = "pruned";
      branch.summary = `Exploration failed: ${err instanceof Error ? err.message : "unknown error"}`;
      continue;
    }

    emitProgress();

    // Ask agent to decide next action
    if (branch.depth < maxDepth && run.branches.length < maxBranches) {
      run.status = "branching";
      emitProgress();

      try {
        const decisionPrompt = buildDecisionPrompt(subject, branch, run.branches, strategy);
        const raw = await withRetry(
          async () => {
            const text = await generateText({ prompt: decisionPrompt, model, signal });
            return text;
          },
          { signal }
        );

        const jsonStr = extractJson(raw);
        const parsed = DecisionResponseSchema.parse(JSON.parse(jsonStr));

        const decision: AgentDecision = {
          id: randomUUID(),
          branchId: branch.id,
          action: parsed.action,
          reasoning: parsed.reasoning,
          newSubjects: parsed.newSubjects,
          timestamp: new Date().toISOString(),
        };
        run.decisions.push(decision);

        if (parsed.action === "branch" && parsed.newSubjects.length > 0) {
          for (const newSubject of parsed.newSubjects) {
            if (run.branches.length >= maxBranches) break;
            const newBranch = createBranch(newSubject, branch.id, branch.depth + 1);
            run.branches.push(newBranch);
            branch.subBranches.push(newBranch.id);
            queue.push(newBranch.id);
          }
        } else if (parsed.action === "validate" && branch.ideas.length > 0) {
          run.status = "validating";
          emitProgress();
          try {
            const valPrompt = buildValidationPrompt(subject, branch);
            const valRaw = await withRetry(
              async () => generateText({ prompt: valPrompt, model, signal }),
              { signal }
            );
            const valJson = extractJson(valRaw);
            const valParsed = ValidationResponseSchema.parse(JSON.parse(valJson));

            // Score ideas and mark those needing refinement
            let needsRefinement = false;
            for (const v of valParsed.validations) {
              const idea = branch.ideas.find((i) => i.title === v.title);
              if (idea) {
                idea.score = Math.round(
                  (v.feasibilityScore + v.noveltyScore + v.marketFitScore) / 3
                );
              }
              if (v.verdict === "refine") needsRefinement = true;
              if (v.verdict === "reject") {
                const idx = branch.ideas.findIndex((i) => i.title === v.title);
                if (idx >= 0) branch.ideas.splice(idx, 1);
              }
            }

            // Auto-trigger refinement if ideas need it
            if (needsRefinement) {
              run.status = "refining";
              emitProgress();
              try {
                const refPrompt = buildRefinementPrompt(
                  subject,
                  branch,
                  JSON.stringify(valParsed.validations)
                );
                const refRaw = await withRetry(
                  async () => generateText({ prompt: refPrompt, model, signal }),
                  { signal }
                );
                const refJson = extractJson(refRaw);
                const refParsed = RefinementResponseSchema.parse(JSON.parse(refJson));

                branch.ideas = refParsed.refinedIdeas.map((idea) => ({
                  title: idea.title,
                  description: idea.description,
                  potentialImpact: idea.potentialImpact,
                  implementationHint: idea.implementationHint,
                  score: idea.score,
                }));
              } catch (refErr) {
                // Refinement failed — keep validated ideas as-is
                const reason = refErr instanceof Error ? refErr.message : "unknown error";
                run.decisions.push({
                  id: randomUUID(),
                  branchId: branch.id,
                  action: "explore",
                  reasoning: `Refinement skipped: ${reason}`,
                  newSubjects: [],
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (valErr) {
            // Validation failed — continue without scoring
            const reason = valErr instanceof Error ? valErr.message : "unknown error";
            run.decisions.push({
              id: randomUUID(),
              branchId: branch.id,
              action: "explore",
              reasoning: `Validation skipped: ${reason}`,
              newSubjects: [],
              timestamp: new Date().toISOString(),
            });
          }
        } else if (parsed.action === "synthesize") {
          break;
        } else if (parsed.action === "prune") {
          // Do nothing, move to next in queue
        }
      } catch (decisionErr) {
        // Decision failed — log reason and continue with queue
        const reason = decisionErr instanceof Error ? decisionErr.message : "unknown error";
        run.decisions.push({
          id: randomUUID(),
          branchId: branch.id,
          action: "explore",
          reasoning: `Decision failed: ${reason}`,
          newSubjects: [],
          timestamp: new Date().toISOString(),
        });
      }

      run.status = "exploring";
      emitProgress();
    }
  }

  // Synthesize portfolio
  run.status = "synthesizing";
  emitProgress();

  const startTime = Date.now();
  try {
    const portfolioPrompt = buildPortfolioPrompt(subject, run.branches);
    const raw = await withRetry(
      async () => {
        const text = await generateText({ prompt: portfolioPrompt, model, signal });
        return text;
      },
      { signal }
    );

    const jsonStr = extractJson(raw);
    const parsed = PortfolioResponseSchema.parse(JSON.parse(jsonStr));

    const completedBranches = run.branches.filter((b) => b.status === "completed");
    run.portfolio = {
      id: randomUUID(),
      title: parsed.title,
      summary: parsed.summary,
      topIdeas: parsed.topIdeas.map((idea) => ({
        ...idea,
        sourceBranchId:
          completedBranches.find((b) => b.subject === idea.sourceSubject)?.id ??
          completedBranches[0]?.id ??
          "",
      })),
      themes: parsed.themes,
      explorationMap: run.branches.map((b) => ({
        branchId: b.id,
        subject: b.subject,
        depth: b.depth,
        ideaCount: b.ideas.length,
      })),
      totalBranches: run.branches.length,
      totalIdeas: run.branches.reduce((s, b) => s + b.ideas.length, 0),
      durationMs: Date.now() - new Date(run.startedAt).getTime(),
      createdAt: new Date().toISOString(),
    };
  } catch {
    run.portfolio = {
      id: randomUUID(),
      title: `Innovation Portfolio: ${subject}`,
      summary: "Portfolio synthesis failed. Raw exploration data is available in branches.",
      topIdeas: [],
      themes: [],
      explorationMap: run.branches.map((b) => ({
        branchId: b.id,
        subject: b.subject,
        depth: b.depth,
        ideaCount: b.ideas.length,
      })),
      totalBranches: run.branches.length,
      totalIdeas: run.branches.reduce((s, b) => s + b.ideas.length, 0),
      durationMs: Date.now() - new Date(run.startedAt).getTime(),
      createdAt: new Date().toISOString(),
    };
  }

  run.status = "completed";
  run.completedAt = new Date().toISOString();
  run.updatedAt = new Date().toISOString();
  emitProgress();

  return run;
}

/**
 * Format an autonomous run as markdown.
 */
export function autonomousRunToMarkdown(run: AutonomousRun): string {
  const lines: string[] = [
    `# Autonomous Innovation: ${run.rootSubject}`,
    "",
    `**Status:** ${run.status}`,
    `**Strategy:** ${run.strategy}`,
    `**Branches:** ${run.branches.length}`,
    `**Total Ideas:** ${run.branches.reduce((s, b) => s + b.ideas.length, 0)}`,
    "",
  ];

  if (run.portfolio) {
    lines.push("## Portfolio", "");
    lines.push(`### ${run.portfolio.title}`, "");
    lines.push(run.portfolio.summary, "");
    lines.push("### Top Ideas", "");
    for (const idea of run.portfolio.topIdeas) {
      lines.push(`- **${idea.title}** (score: ${idea.score}, feasibility: ${idea.feasibility})`);
      lines.push(`  ${idea.description.slice(0, 200)}...`);
    }
    lines.push("");
    lines.push("### Themes", "");
    for (const theme of run.portfolio.themes) {
      lines.push(`- ${theme}`);
    }
    lines.push("");
  }

  lines.push("## Exploration Map", "");
  for (const branch of run.branches) {
    const indent = "  ".repeat(branch.depth);
    const statusIcon =
      branch.status === "completed" ? "✅" : branch.status === "pruned" ? "✂️" : "⏳";
    lines.push(`${indent}${statusIcon} ${branch.subject} (${branch.ideas.length} ideas)`);
  }

  return lines.join("\n");
}
