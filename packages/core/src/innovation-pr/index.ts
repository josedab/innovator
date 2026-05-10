/**
 * @module innovation-pr
 *
 * Innovation-as-PR workflow: take the top-scored idea from a synthesis,
 * generate scaffolding code, create a GitHub branch, commit files,
 * and open a pull request — all in one automated workflow.
 */

import { z } from "zod";
import type { InnovationIdea, Synthesis } from "../types.js";
import { generateScaffold, scaffoldToFileMap, scaffoldToMarkdown } from "../scaffolding/index.js";
import type { IdeaScaffold, ScaffoldOptions } from "../scaffolding/index.js";

// ---- Schemas ----

/** Schema for PR creation configuration. */
export const PRConfigSchema = z.object({
  owner: z.string().min(1).max(200),
  repo: z.string().min(1).max(200),
  baseBranch: z.string().max(200).default("main"),
  branchPrefix: z.string().max(100).default("innovation/"),
  /** Auto-assign reviewers. */
  reviewers: z.array(z.string().max(200)).max(20).optional(),
  /** PR labels. */
  labels: z.array(z.string().max(100)).max(20).default(["innovation", "auto-generated"]),
  /** Draft PR. */
  draft: z.boolean().default(true),
  /** Scaffold stack override. */
  stack: z.enum(["typescript", "python", "go", "rust"]).default("typescript"),
  /** License for scaffold. */
  license: z.enum(["MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "ISC"]).default("MIT"),
});

/** Schema for GitHub API command (for execution by caller). */
export const GitCommandSchema = z.object({
  type: z.enum(["create-branch", "create-file", "create-pr", "add-labels", "request-review"]),
  description: z.string().max(500),
  command: z.string().max(5000),
  apiEndpoint: z.string().max(500).optional(),
  payload: z.record(z.unknown()).optional(),
});

/** Schema for the full PR workflow plan. */
export const PRWorkflowPlanSchema = z.object({
  idea: z.object({
    title: z.string().max(500),
    description: z.string().max(5000),
    sourceAngle: z.string().max(200).optional(),
    feasibility: z.string().max(50).optional(),
  }),
  branchName: z.string().max(300),
  scaffold: z.unknown(),
  prTitle: z.string().max(500),
  prBody: z.string().max(10000),
  commands: z.array(GitCommandSchema).max(100),
  files: z.record(z.string()).optional(),
  createdAt: z.string(),
});

/** Schema for the PR creation result. */
export const PRResultSchema = z.object({
  status: z.enum(["planned", "created", "failed"]),
  branchName: z.string().max(300),
  prTitle: z.string().max(500),
  prUrl: z.string().max(2000).optional(),
  filesCreated: z.number().min(0),
  error: z.string().max(2000).optional(),
  workflowPlan: PRWorkflowPlanSchema,
});

// ---- Types ----

export type PRConfig = z.infer<typeof PRConfigSchema>;
export type GitCommand = z.infer<typeof GitCommandSchema>;
export type PRWorkflowPlan = z.infer<typeof PRWorkflowPlanSchema>;
export type PRResult = z.infer<typeof PRResultSchema>;

// ---- Core Functions ----

/**
 * Select the top idea from a synthesis result.
 *
 * @param synthesis - The synthesis result from the innovation pipeline
 * @returns The highest-ranked idea, or undefined
 */
export function selectTopIdea(synthesis: Synthesis): InnovationIdea | undefined {
  if (!synthesis.topIdeas || synthesis.topIdeas.length === 0) return undefined;

  // Prefer high-feasibility ideas
  const sorted = [...synthesis.topIdeas].sort((a, b) => {
    const feasOrder = { high: 3, medium: 2, low: 1 };
    return (feasOrder[b.feasibility] ?? 0) - (feasOrder[a.feasibility] ?? 0);
  });

  const top = sorted[0];
  return {
    title: top.title,
    description: top.description,
    potentialImpact: top.potentialImpact,
    implementationHint: `Source angle: ${top.sourceAngle}. Feasibility: ${top.feasibility}.`,
  };
}

/**
 * Generate a valid git branch name from an idea title.
 *
 * @param title - The idea title
 * @param prefix - Branch prefix (default: "innovation/")
 * @returns A sanitized branch name
 */
export function generateBranchName(title: string, prefix: string = "innovation/"): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${prefix}${slug}`;
}

/**
 * Generate a PR body from the idea and scaffold.
 *
 * @param idea - The innovation idea
 * @param scaffold - The generated scaffold
 * @param synthesis - Optional synthesis context
 * @returns Formatted PR body markdown
 */
export function generatePRBody(
  idea: InnovationIdea,
  scaffold: IdeaScaffold,
  synthesis?: Synthesis
): string {
  const lines: string[] = [
    "## 💡 Innovation Idea",
    "",
    `> ${idea.description}`,
    "",
    "### Impact",
    idea.potentialImpact,
    "",
    "### Implementation Approach",
    idea.implementationHint,
    "",
    "---",
    "",
    "## 📁 Scaffolded Files",
    "",
    ...scaffold.files.map((f) => `- \`${f.path}\` — ${f.description}`),
    "",
    "## 🏗️ Architecture",
    "",
    scaffold.architectureDiagram,
    "",
    "## 📋 Tech Stack",
    "",
    ...scaffold.techStack.map((t) => `- ${t}`),
    "",
    "## 📦 Dependencies",
    "",
    ...scaffold.dependencies.map((d) => `- **${d.name}** — ${d.purpose}`),
    "",
  ];

  if (synthesis) {
    lines.push(
      "## 🎯 Strategic Context",
      "",
      `**Themes:** ${synthesis.themes.join(", ")}`,
      "",
      `**Recommendation:** ${synthesis.recommendation}`,
      ""
    );
  }

  lines.push(
    "---",
    "",
    "*This PR was auto-generated by [Innovator](https://github.com/innovator). " +
      "Review the scaffolded code and customize as needed.*"
  );

  return lines.join("\n");
}

/**
 * Build a complete PR workflow plan: scaffold, branch, files, and commands.
 * Does NOT execute any commands — returns a plan for the caller to execute.
 *
 * @param idea - The innovation idea
 * @param config - PR configuration
 * @param synthesis - Optional synthesis context
 * @returns A workflow plan with all commands needed
 */
export function buildPRWorkflow(
  idea: InnovationIdea,
  config: PRConfig,
  synthesis?: Synthesis
): PRWorkflowPlan {
  const scaffoldOptions: ScaffoldOptions = {
    idea,
    license: config.license,
    stack: config.stack,
    githubOwner: config.owner,
    synthesis,
  };

  const scaffold = generateScaffold(scaffoldOptions);
  const branchName = generateBranchName(idea.title, config.branchPrefix);
  const prTitle = `💡 Innovation: ${idea.title}`;
  const prBody = generatePRBody(idea, scaffold, synthesis);
  const files = scaffoldToFileMap(scaffold);

  const commands: GitCommand[] = [];

  // 1. Create branch
  commands.push({
    type: "create-branch",
    description: `Create branch ${branchName} from ${config.baseBranch}`,
    command: `git checkout -b ${branchName} ${config.baseBranch}`,
    apiEndpoint: `POST /repos/${config.owner}/${config.repo}/git/refs`,
    payload: { ref: `refs/heads/${branchName}`, sha: `{${config.baseBranch}_sha}` },
  });

  // 2. Create files
  for (const [path, content] of Object.entries(files)) {
    commands.push({
      type: "create-file",
      description: `Create ${path}`,
      command: `echo '...' > ${path}`,
      apiEndpoint: `PUT /repos/${config.owner}/${config.repo}/contents/${path}`,
      payload: {
        message: `feat: scaffold ${path}`,
        content: Buffer.from(content).toString("base64"),
        branch: branchName,
      },
    });
  }

  // 3. Create PR
  commands.push({
    type: "create-pr",
    description: `Open PR: ${prTitle}`,
    command: `gh pr create --title "${prTitle}" --body "..." --head ${branchName} --base ${config.baseBranch}${config.draft ? " --draft" : ""}`,
    apiEndpoint: `POST /repos/${config.owner}/${config.repo}/pulls`,
    payload: {
      title: prTitle,
      body: prBody,
      head: branchName,
      base: config.baseBranch,
      draft: config.draft,
    },
  });

  // 4. Add labels
  if (config.labels.length > 0) {
    commands.push({
      type: "add-labels",
      description: `Add labels: ${config.labels.join(", ")}`,
      command: `gh pr edit --add-label "${config.labels.join(",")}"`,
      apiEndpoint: `POST /repos/${config.owner}/${config.repo}/issues/{pr_number}/labels`,
      payload: { labels: config.labels },
    });
  }

  // 5. Request reviewers
  if (config.reviewers && config.reviewers.length > 0) {
    commands.push({
      type: "request-review",
      description: `Request review from: ${config.reviewers.join(", ")}`,
      command: `gh pr edit --add-reviewer "${config.reviewers.join(",")}"`,
      apiEndpoint: `POST /repos/${config.owner}/${config.repo}/pulls/{pr_number}/requested_reviewers`,
      payload: { reviewers: config.reviewers },
    });
  }

  return {
    idea: {
      title: idea.title,
      description: idea.description,
      sourceAngle: idea.implementationHint,
    },
    branchName,
    scaffold,
    prTitle,
    prBody,
    commands,
    files,
    createdAt: new Date().toISOString(),
  };
}

/**
 * One-click workflow: select top idea, scaffold, and build PR plan.
 *
 * @param synthesis - The synthesis from the innovation pipeline
 * @param config - PR configuration
 * @returns PR result with status and workflow plan
 */
export function innovationToPR(synthesis: Synthesis, config: PRConfig): PRResult {
  const idea = selectTopIdea(synthesis);
  if (!idea) {
    return {
      status: "failed",
      branchName: "",
      prTitle: "",
      filesCreated: 0,
      error: "No ideas found in synthesis",
      workflowPlan: {
        idea: { title: "", description: "" },
        branchName: "",
        scaffold: null,
        prTitle: "",
        prBody: "",
        commands: [],
        createdAt: new Date().toISOString(),
      },
    };
  }

  try {
    const plan = buildPRWorkflow(idea, config, synthesis);
    return {
      status: "planned",
      branchName: plan.branchName,
      prTitle: plan.prTitle,
      filesCreated: Object.keys(plan.files ?? {}).length,
      workflowPlan: plan,
    };
  } catch (err) {
    return {
      status: "failed",
      branchName: "",
      prTitle: "",
      filesCreated: 0,
      error: err instanceof Error ? err.message : "Unknown error",
      workflowPlan: {
        idea: { title: idea.title, description: idea.description },
        branchName: "",
        scaffold: null,
        prTitle: "",
        prBody: "",
        commands: [],
        createdAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Generate a `gh` CLI script to execute the PR workflow.
 *
 * @param plan - The PR workflow plan
 * @returns Shell script string
 */
export function workflowToScript(plan: PRWorkflowPlan): string {
  const lines: string[] = [
    "#!/bin/bash",
    "set -e",
    "",
    `# Innovation-as-PR: ${plan.idea.title}`,
    `# Generated at ${plan.createdAt}`,
    "",
    `echo "Creating branch: ${plan.branchName}"`,
  ];

  for (const cmd of plan.commands) {
    lines.push(`# ${cmd.description}`);
    lines.push(cmd.command);
    lines.push("");
  }

  lines.push('echo "✅ PR workflow complete"');
  return lines.join("\n");
}

// ---- Re-exports ----

export {
  type ImplementationStep,
  type ImplementationPlan,
  type FeedbackItem,
  type RefinedIdea,
  ImplementationStepSchema,
  ImplementationPlanSchema,
  FeedbackItemSchema,
  RefinedIdeaSchema,
  generateImplementationPlan,
  refineIdeaFromFeedback,
  planToGitHubIssues,
} from "./implementation-plan.js";
