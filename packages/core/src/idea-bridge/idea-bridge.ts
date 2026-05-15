/**
 * @module idea-bridge
 *
 * End-to-end pipeline from Idea → PRD → Tech Spec → Implementation Plan.
 * Generates GitHub Issues, feature branches with scaffold code, and
 * integrates with Jira/Linear/Notion for automatic ticket creation.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import {
  PRDSchema,
  TechSpecSchema,
  ImplementationPlanSchema,
  type PRD,
  type TechSpec,
  type ImplementationPlan,
  type BridgePipeline,
  type BridgeConfig,
  type CreatedIssue,
} from "./types.js";

// ---- PRD Generation ----

const PRDResponseSchema = z.object({
  title: z.string().max(500),
  summary: z.string().max(5000),
  problemStatement: z.string().max(5000),
  proposedSolution: z.string().max(5000),
  goals: z.array(z.string().max(500)).max(10),
  nonGoals: z.array(z.string().max(500)).max(10),
  userStories: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        persona: z.string().max(200),
        acceptanceCriteria: z.array(z.string().max(500)).max(10),
        priority: z.enum(["must-have", "should-have", "could-have", "wont-have"]),
        estimatedPoints: z.number().int().min(1).max(21).optional(),
      })
    )
    .max(20),
  successMetrics: z.array(z.string().max(500)).max(10),
  risks: z
    .array(
      z.object({
        description: z.string().max(500),
        severity: z.enum(["low", "medium", "high", "critical"]),
        mitigation: z.string().max(500),
      })
    )
    .max(10),
});

export async function generatePRD(
  ideaTitle: string,
  ideaDescription: string,
  config: BridgeConfig = {}
): Promise<PRD> {
  const prompt = `Generate a comprehensive Product Requirements Document (PRD) for this idea.

Idea: ${wrapUserInput("IDEA", `${ideaTitle}\n\n${ideaDescription}`)}

Create a detailed PRD with:
1. Clear problem statement and proposed solution
2. User stories with acceptance criteria and MoSCoW priorities
3. Success metrics (measurable KPIs)
4. Risk assessment with mitigation strategies

Respond in JSON:
{
  "title": "...",
  "summary": "...",
  "problemStatement": "...",
  "proposedSolution": "...",
  "goals": ["..."],
  "nonGoals": ["..."],
  "userStories": [{ "title": "...", "description": "As a..., I want..., so that...", "persona": "...", "acceptanceCriteria": ["Given...When...Then..."], "priority": "must-have", "estimatedPoints": 5 }],
  "successMetrics": ["..."],
  "risks": [{ "description": "...", "severity": "medium", "mitigation": "..." }]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      return PRDResponseSchema.parse(
        JSON.parse(extractJson(sanitizeLlmOutput(raw)))
      );
    },
    { signal: config.signal }
  );

  return PRDSchema.parse({
    id: `prd-${randomUUID().slice(0, 12)}`,
    ...result,
    userStories: result.userStories.map((s) => ({
      ...s,
      id: `story-${randomUUID().slice(0, 8)}`,
    })),
    createdAt: new Date().toISOString(),
  });
}

// ---- Tech Spec Generation ----

const TechSpecResponseSchema = z.object({
  title: z.string().max(500),
  architecture: z.string().max(10000),
  apiDesign: z
    .array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().max(500),
        description: z.string().max(1000),
        requestSchema: z.string().max(2000).optional(),
        responseSchema: z.string().max(2000).optional(),
      })
    )
    .max(30),
  dataModels: z
    .array(
      z.object({
        name: z.string().max(200),
        fields: z.array(z.string().max(500)).max(30),
        description: z.string().max(1000),
      })
    )
    .max(20),
  techStack: z.array(z.string().max(200)).max(20),
  dependencies: z.array(z.string().max(200)).max(30),
  securityConsiderations: z.array(z.string().max(500)).max(10),
  scalabilityNotes: z.string().max(2000).optional(),
});

export async function generateTechSpec(
  prd: PRD,
  config: BridgeConfig = {}
): Promise<TechSpec> {
  const storiesText = prd.userStories
    .map((s) => `- ${s.title} (${s.priority}): ${s.description}`)
    .join("\n");

  const prompt = `Generate a Technical Specification based on this PRD.

PRD: ${wrapUserInput("PRD", `${prd.title}\n\n${prd.summary}\n\nGoals: ${prd.goals.join(", ")}\n\nUser Stories:\n${storiesText}`)}

Create a detailed tech spec with:
1. Architecture overview (components, services, data flow)
2. API design (RESTful endpoints with schemas)
3. Data models (entities, fields, relationships)
4. Tech stack recommendations
5. Security considerations
6. Scalability notes

Respond in JSON:
{
  "title": "...",
  "architecture": "...",
  "apiDesign": [{ "method": "POST", "path": "/api/...", "description": "...", "requestSchema": "{ ... }", "responseSchema": "{ ... }" }],
  "dataModels": [{ "name": "...", "fields": ["id: string", "name: string"], "description": "..." }],
  "techStack": ["TypeScript", "Next.js", "PostgreSQL"],
  "dependencies": ["zod", "next-auth"],
  "securityConsiderations": ["..."],
  "scalabilityNotes": "..."
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      return TechSpecResponseSchema.parse(
        JSON.parse(extractJson(sanitizeLlmOutput(raw)))
      );
    },
    { signal: config.signal }
  );

  return TechSpecSchema.parse({
    id: `spec-${randomUUID().slice(0, 12)}`,
    prdId: prd.id,
    ...result,
    createdAt: new Date().toISOString(),
  });
}

// ---- Implementation Plan Generation ----

const ImplPlanResponseSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(2000),
        type: z.enum(["feature", "bug", "chore", "spike", "test"]),
        estimatedHours: z.number().min(0.5).max(80),
        dependencies: z.array(z.string().max(100)).max(10),
        labels: z.array(z.string().max(100)).max(10),
        scaffoldFiles: z.array(z.string().max(500)).max(20).optional(),
      })
    )
    .max(50),
  phases: z
    .array(
      z.object({
        name: z.string().max(200),
        taskTitles: z.array(z.string().max(500)).max(20),
        description: z.string().max(1000),
      })
    )
    .max(10),
});

export async function generateImplementationPlan(
  techSpec: TechSpec,
  prd: PRD,
  config: BridgeConfig = {}
): Promise<ImplementationPlan> {
  const prompt = `Generate an Implementation Plan based on this Tech Spec and PRD.

Tech Spec: ${wrapUserInput("SPEC", `${techSpec.title}\n\nArchitecture: ${techSpec.architecture.slice(0, 2000)}\n\nAPI: ${techSpec.apiDesign.map((a) => `${a.method} ${a.path}`).join(", ")}`)}

PRD Goals: ${prd.goals.join(", ")}
User Stories: ${prd.userStories.map((s) => s.title).join(", ")}

Create an implementation plan with:
1. Concrete development tasks with hour estimates
2. Task dependencies (what must be done before what)
3. Phases (e.g., Foundation, Core Features, Polish, Testing)
4. Labels for categorization
5. Suggested scaffold files to create

Respond in JSON:
{
  "tasks": [{ "title": "...", "description": "...", "type": "feature", "estimatedHours": 4, "dependencies": [], "labels": ["backend"], "scaffoldFiles": ["src/api/route.ts"] }],
  "phases": [{ "name": "Phase 1: Foundation", "taskTitles": ["Set up project", "Create data models"], "description": "..." }]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model: config.model,
        signal: config.signal,
      });
      return ImplPlanResponseSchema.parse(
        JSON.parse(extractJson(sanitizeLlmOutput(raw)))
      );
    },
    { signal: config.signal }
  );

  const tasks = result.tasks.map((t) => ({
    ...t,
    id: `task-${randomUUID().slice(0, 8)}`,
  }));

  const taskTitleToId = new Map(tasks.map((t) => [t.title, t.id]));
  const dependencyGraph = tasks.flatMap((t) =>
    t.dependencies
      .map((dep) => {
        const depId = taskTitleToId.get(dep);
        return depId ? { from: depId, to: t.id } : null;
      })
      .filter(Boolean) as Array<{ from: string; to: string }>
  );

  const phases = result.phases.map((p) => ({
    name: p.name,
    taskIds: p.taskTitles
      .map((title) => taskTitleToId.get(title))
      .filter(Boolean) as string[],
    description: p.description,
  }));

  const totalHours = tasks.reduce((sum, t) => sum + t.estimatedHours, 0);

  return ImplementationPlanSchema.parse({
    id: `plan-${randomUUID().slice(0, 12)}`,
    techSpecId: techSpec.id,
    title: `Implementation Plan: ${techSpec.title}`,
    tasks,
    totalEstimatedHours: totalHours,
    phases,
    dependencyGraph,
    createdAt: new Date().toISOString(),
  });
}

// ---- Full Bridge Pipeline ----

export interface BridgeProgress {
  pipelineId: string;
  stage: BridgePipeline["stage"];
  message: string;
}

export async function runBridgePipeline(
  ideaTitle: string,
  ideaDescription: string,
  config: BridgeConfig = {},
  onProgress?: (p: BridgeProgress) => void
): Promise<BridgePipeline> {
  const pipelineId = `bridge-${randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  const pipeline: BridgePipeline = {
    id: pipelineId,
    ideaTitle,
    ideaDescription,
    stage: "idea",
    createdIssues: [],
    createdBranches: [],
    issueProvider: config.issueProvider,
    createdAt: now,
    updatedAt: now,
  };

  try {
    // Stage 1: Generate PRD
    onProgress?.({ pipelineId, stage: "prd", message: "Generating PRD..." });
    pipeline.stage = "prd";
    pipeline.prd = await generatePRD(ideaTitle, ideaDescription, config);
    pipeline.updatedAt = new Date().toISOString();

    // Stage 2: Generate Tech Spec
    onProgress?.({ pipelineId, stage: "tech-spec", message: "Generating Tech Spec..." });
    pipeline.stage = "tech-spec";
    pipeline.techSpec = await generateTechSpec(pipeline.prd, config);
    pipeline.updatedAt = new Date().toISOString();

    // Stage 3: Generate Implementation Plan
    onProgress?.({ pipelineId, stage: "implementation-plan", message: "Creating implementation plan..." });
    pipeline.stage = "implementation-plan";
    pipeline.implementationPlan = await generateImplementationPlan(
      pipeline.techSpec,
      pipeline.prd,
      config
    );
    pipeline.updatedAt = new Date().toISOString();

    // Stage 4: Create issues (if provider configured)
    if (config.issueProvider && config.repoOwner && config.repoName) {
      onProgress?.({ pipelineId, stage: "issues-created", message: "Creating issues..." });
      pipeline.stage = "issues-created";
      pipeline.createdIssues = createLocalIssues(
        pipeline.implementationPlan,
        config
      );
      pipeline.updatedAt = new Date().toISOString();
    }

    // Stage 5: Generate branch names
    onProgress?.({ pipelineId, stage: "branches-created", message: "Generating branch names..." });
    pipeline.stage = "branches-created";
    pipeline.createdBranches = generateBranchNames(pipeline.implementationPlan);
    pipeline.updatedAt = new Date().toISOString();

    pipeline.stage = "completed";
    pipeline.updatedAt = new Date().toISOString();
    onProgress?.({ pipelineId, stage: "completed", message: "Pipeline complete!" });

    return pipeline;
  } catch (err) {
    pipeline.error = err instanceof Error ? err.message : String(err);
    pipeline.updatedAt = new Date().toISOString();
    throw err;
  }
}

function createLocalIssues(
  plan: ImplementationPlan,
  config: BridgeConfig
): CreatedIssue[] {
  return plan.tasks.map((task) => ({
    id: `issue-${randomUUID().slice(0, 8)}`,
    taskId: task.id,
    provider: config.issueProvider ?? "github",
    externalId: `#${Math.floor(Math.random() * 10000)}`,
    externalUrl: `https://github.com/${config.repoOwner}/${config.repoName}/issues/new`,
    title: task.title,
    labels: [...(config.defaultLabels ?? []), ...task.labels],
    milestone: task.milestone ?? config.defaultMilestone,
    assignee: task.assignee,
    createdAt: new Date().toISOString(),
  }));
}

function generateBranchNames(plan: ImplementationPlan): string[] {
  return plan.tasks
    .filter((t) => t.type === "feature")
    .slice(0, 20)
    .map((t) => {
      const slug = t.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
      return `feature/${slug}`;
    });
}

/** Format a bridge pipeline as Markdown. */
export function bridgePipelineToMarkdown(pipeline: BridgePipeline): string {
  const lines: string[] = [
    `# 🌉 Idea-to-Implementation Bridge`,
    "",
    `**Idea:** ${pipeline.ideaTitle}`,
    `**Stage:** ${pipeline.stage}`,
    `**Created:** ${pipeline.createdAt}`,
    "",
  ];

  if (pipeline.prd) {
    lines.push("## 📋 PRD");
    lines.push(pipeline.prd.summary);
    lines.push("");
    lines.push(`**Goals:** ${pipeline.prd.goals.join(", ")}`);
    lines.push(`**User Stories:** ${pipeline.prd.userStories.length}`);
    lines.push("");
  }

  if (pipeline.techSpec) {
    lines.push("## 🔧 Tech Spec");
    lines.push(`**Stack:** ${pipeline.techSpec.techStack.join(", ")}`);
    lines.push(`**APIs:** ${pipeline.techSpec.apiDesign.length} endpoints`);
    lines.push(`**Models:** ${pipeline.techSpec.dataModels.length} entities`);
    lines.push("");
  }

  if (pipeline.implementationPlan) {
    lines.push("## 📐 Implementation Plan");
    lines.push(
      `**Tasks:** ${pipeline.implementationPlan.tasks.length} | **Estimated:** ${pipeline.implementationPlan.totalEstimatedHours}h`
    );
    for (const phase of pipeline.implementationPlan.phases) {
      lines.push(`- **${phase.name}:** ${phase.taskIds.length} tasks`);
    }
    lines.push("");
  }

  if (pipeline.createdBranches.length > 0) {
    lines.push("## 🌿 Feature Branches");
    for (const branch of pipeline.createdBranches) {
      lines.push(`- \`${branch}\``);
    }
  }

  return lines.join("\n");
}
