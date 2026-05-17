import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ANGLE_IDS } from "../types.js";

export const InvestigationStepSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  description: z.string().max(2000),
  angles: z.array(z.string().max(100)).max(8),
  estimatedDurationMs: z.number().int().min(0),
  dependencies: z.array(z.string().max(100)).max(10),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["pending", "in-progress", "completed", "skipped"]).default("pending"),
});
export type InvestigationStep = z.infer<typeof InvestigationStepSchema>;

export const InvestigationPlanSchema = z.object({
  id: z.string().max(100),
  objective: z.string().max(2000),
  steps: z.array(InvestigationStepSchema).max(20),
  estimatedTotalMs: z.number().int().min(0),
  createdAt: z.string(),
  status: z.enum(["draft", "executing", "completed", "failed"]).default("draft"),
});
export type InvestigationPlan = z.infer<typeof InvestigationPlanSchema>;

const PRIORITY_ORDER: Record<InvestigationStep["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ANGLE_HINTS: Array<{
  match: RegExp;
  angles: string[];
}> = [
  { match: /market|customer|user|segment|buyer|persona|competition/i, angles: ["perspectives", "trend-collision", "cross-domain"] },
  { match: /technical|feasib|constraint|cost|risk|implementation|operat/i, angles: ["constraints", "first-principles", "inversion"] },
  { match: /generate|idea|concept|prototype|feature|solution/i, angles: ["scamper", "what-if", "cross-domain"] },
  { match: /validate|test|assumption|experiment|evidence/i, angles: ["inversion", "first-principles", "constraints"] },
  { match: /strategy|prioriti|roadmap|portfolio|recommend/i, angles: ["perspectives", "trend-collision", "first-principles"] },
  { match: /adjacent|partnership|ecosystem|platform|integration/i, angles: ["cross-domain", "what-if", "perspectives"] },
];

function normalizeClauses(objective: string): string[] {
  const cleaned = objective.replace(/\s+/g, " ").trim();
  const clauses = cleaned
    .split(/\b(?:and|while|with|plus|then)\b|[,;:]+/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 10);

  return clauses.length > 0 ? clauses : [cleaned];
}

function buildStepId(index: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `step-${index + 1}-${slug}`.slice(0, 100);
}

function estimateDuration(priority: InvestigationStep["priority"], angleCount: number): number {
  const base = {
    critical: 60,
    high: 45,
    medium: 30,
    low: 20,
  }[priority];
  return (base + angleCount * 10) * 60 * 1000;
}

function inferPriority(title: string, description: string): InvestigationStep["priority"] {
  const text = `${title} ${description}`;
  if (/frame|scope|success|assumption|validate/i.test(text)) return "critical";
  if (/market|technical|risk|roadmap|prioriti/i.test(text)) return "high";
  if (/idea|prototype|concept|adjacent|synthesis/i.test(text)) return "medium";
  return "low";
}

export function selectAnglesForStep(
  step: Pick<InvestigationStep, "title" | "description">,
  availableAngles: readonly string[] = ANGLE_IDS
): string[] {
  const scored = new Map<string, number>();
  for (const angleId of availableAngles) {
    scored.set(angleId, 0);
  }

  const text = `${step.title} ${step.description}`;
  for (const hint of ANGLE_HINTS) {
    if (!hint.match.test(text)) continue;
    hint.angles.forEach((angleId, index) => {
      if (!scored.has(angleId)) return;
      scored.set(angleId, (scored.get(angleId) ?? 0) + 3 - index);
    });
  }

  if ((scored.get("first-principles") ?? 0) === 0) {
    scored.set("first-principles", (scored.get("first-principles") ?? 0) + 1);
  }
  if ((scored.get("perspectives") ?? 0) === 0) {
    scored.set("perspectives", (scored.get("perspectives") ?? 0) + 1);
  }

  return Array.from(scored.entries())
    .sort((left, right) => {
      if (right[1] === left[1]) return left[0].localeCompare(right[0]);
      return right[1] - left[1];
    })
    .slice(0, Math.min(4, availableAngles.length))
    .map(([angleId]) => angleId);
}

export function decomposeObjective(objective: string): InvestigationStep[] {
  const clauses = normalizeClauses(objective);
  const steps: InvestigationStep[] = [];

  const baseDefinitions: Array<{ title: string; description: string }> = [
    {
      title: "Frame the objective",
      description: `Clarify the desired outcome, constraints, and success criteria for: ${objective}`,
    },
  ];

  if (/market|customer|user|segment|compet/i.test(objective)) {
    baseDefinitions.push({
      title: "Map demand and stakeholder signals",
      description: "Assess customer needs, adoption friction, and external forces that shape opportunity size.",
    });
  }

  if (/technical|build|launch|implement|prototype|product|system|platform/i.test(objective)) {
    baseDefinitions.push({
      title: "Assess feasibility and delivery constraints",
      description: "Identify enabling capabilities, operational blockers, and the minimum viable path to execution.",
    });
  }

  clauses.slice(0, 3).forEach((clause, index) => {
    baseDefinitions.push({
      title: `Investigate workstream ${index + 1}`,
      description: `Explore the specific sub-problem: ${clause}`,
    });
  });

  baseDefinitions.push(
    {
      title: "Generate strategic options",
      description: "Translate evidence into a focused set of experiments, bets, or product directions.",
    },
    {
      title: "Prioritize the next moves",
      description: "Rank opportunities by impact, effort, and learning value so execution can start immediately.",
    }
  );

  const uniqueDefinitions = baseDefinitions.filter(
    (definition, index, all) => all.findIndex((candidate) => candidate.title === definition.title) === index
  );

  uniqueDefinitions.slice(0, 20).forEach((definition, index) => {
    const priority = inferPriority(definition.title, definition.description);
    const dependencies = index === 0 ? [] : index === uniqueDefinitions.length - 1 ? [buildStepId(index - 1, uniqueDefinitions[index - 1].title)] : [buildStepId(0, uniqueDefinitions[0].title)];
    const provisionalStep: InvestigationStep = {
      id: buildStepId(index, definition.title),
      title: definition.title,
      description: definition.description,
      angles: [],
      estimatedDurationMs: 0,
      dependencies,
      priority,
      status: "pending",
    };
    const angles = selectAnglesForStep(provisionalStep, ANGLE_IDS);
    steps.push(
      InvestigationStepSchema.parse({
        ...provisionalStep,
        angles,
        estimatedDurationMs: estimateDuration(priority, angles.length),
      })
    );
  });

  return steps.map((step, index, all) => {
    if (index <= 1) return step;
    if (index === all.length - 1) {
      return {
        ...step,
        dependencies: all.slice(1, all.length - 1).map((candidate) => candidate.id).slice(0, 10),
      };
    }
    return {
      ...step,
      dependencies: [all[0].id],
    };
  });
}

export function createInvestigationPlan(objective: string): InvestigationPlan {
  const steps = decomposeObjective(objective);
  return InvestigationPlanSchema.parse({
    id: `plan-${randomUUID().slice(0, 8)}`,
    objective,
    steps,
    estimatedTotalMs: steps.reduce((sum, step) => sum + step.estimatedDurationMs, 0),
    createdAt: new Date().toISOString(),
    status: "draft",
  });
}

export function getNextStep(plan: InvestigationPlan): InvestigationStep | undefined {
  const completedIds = new Set(
    plan.steps.filter((step) => step.status === "completed" || step.status === "skipped").map((step) => step.id)
  );

  return [...plan.steps]
    .filter(
      (step) =>
        step.status === "pending" &&
        step.dependencies.every((dependency) => completedIds.has(dependency))
    )
    .sort((left, right) => {
      const priorityDelta = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return left.estimatedDurationMs - right.estimatedDurationMs;
    })[0];
}

export function completeStep(
  plan: InvestigationPlan,
  stepId: string,
  result?: string
): InvestigationPlan {
  let updated = false;
  const steps = plan.steps.map((step) => {
    if (step.id !== stepId) return step;
    updated = true;
    const description = result
      ? `${step.description}\n\nResult: ${result}`.slice(0, 2000)
      : step.description;
    return InvestigationStepSchema.parse({
      ...step,
      description,
      status: "completed",
    });
  });

  if (!updated) return plan;

  const everyDone = steps.every((step) => step.status === "completed" || step.status === "skipped");
  return InvestigationPlanSchema.parse({
    ...plan,
    steps,
    status: everyDone ? "completed" : "executing",
  });
}

export function planToMarkdown(plan: InvestigationPlan): string {
  const lines: string[] = [
    `# Investigation Plan`,
    "",
    `**Objective:** ${plan.objective}`,
    `**Status:** ${plan.status}`,
    `**Estimated Total:** ${Math.round(plan.estimatedTotalMs / 60000)} minutes`,
    "",
    "## Steps",
    "",
  ];

  for (const step of plan.steps) {
    lines.push(`### ${step.title}`);
    lines.push(`- ID: ${step.id}`);
    lines.push(`- Priority: ${step.priority}`);
    lines.push(`- Status: ${step.status}`);
    lines.push(`- Angles: ${step.angles.join(", ")}`);
    lines.push(`- Estimate: ${Math.round(step.estimatedDurationMs / 60000)} minutes`);
    if (step.dependencies.length > 0) {
      lines.push(`- Dependencies: ${step.dependencies.join(", ")}`);
    }
    lines.push(`- ${step.description}`);
    lines.push("");
  }

  return lines.join("\n");
}
