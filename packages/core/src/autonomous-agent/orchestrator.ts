import { randomUUID } from "node:crypto";
import { z } from "zod";

const StepTypeSchema = z.enum(["investigate", "generate", "synthesize", "evaluate", "refine"]);
const StepStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
const PlanStatusSchema = z.enum(["planning", "executing", "paused", "completed", "failed"]);

export const ObjectiveSchema = z.object({
  id: z.string(),
  description: z.string().max(2000),
  constraints: z.array(z.string().max(500)).max(10).optional(),
  targetOutcomes: z.array(z.string().max(500)).max(10).optional(),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const ExecutionStepSchema = z.object({
  id: z.string(),
  planId: z.string(),
  type: StepTypeSchema,
  description: z.string().max(1000),
  status: StepStatusSchema,
  result: z.string().max(5000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  tokenCost: z.number().optional(),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

const PlanBranchSchema = z.object({
  id: z.string(),
  parentStepId: z.string(),
  reason: z.string().max(500),
  steps: z.array(ExecutionStepSchema).max(20),
});

export const OrchestrationPlanSchema = z.object({
  id: z.string(),
  objectiveId: z.string(),
  steps: z.array(ExecutionStepSchema).max(50),
  branches: z.array(PlanBranchSchema).max(10).optional(),
  status: PlanStatusSchema,
  totalTokenBudget: z.number(),
  usedTokens: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>;

const StrategyFindingSchema = z.object({
  area: z.string().max(200),
  insight: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(500)).max(5),
});

const StrategyRecommendationSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(1000),
  priority: z.enum(["critical", "high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
});

export const StrategyOutputSchema = z.object({
  id: z.string(),
  planId: z.string(),
  title: z.string().max(500),
  executiveSummary: z.string().max(3000),
  findings: z.array(StrategyFindingSchema).max(20),
  recommendations: z.array(StrategyRecommendationSchema).max(10),
  confidenceAssessment: z.object({
    overall: z.number().min(0).max(1),
    dataQuality: z.enum(["low", "medium", "high"]),
    coverageGaps: z.array(z.string().max(500)).max(5),
  }),
  generatedAt: z.string(),
});
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;

const objectives = new Map<string, Objective>();
const plans = new Map<string, OrchestrationPlan>();
const outputs = new Map<string, StrategyOutput>();

const STEP_TOKEN_COST: Record<ExecutionStep["type"], number> = {
  investigate: 140,
  generate: 220,
  synthesize: 180,
  evaluate: 120,
  refine: 100,
};

const STEP_CONFIDENCE: Record<ExecutionStep["type"], number> = {
  investigate: 0.7,
  generate: 0.72,
  synthesize: 0.82,
  evaluate: 0.78,
  refine: 0.8,
};

function now(): string {
  return new Date().toISOString();
}

function normalizeList(values?: string[]): string[] | undefined {
  const normalized = values
    ?.map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function clonePlan(plan: OrchestrationPlan): OrchestrationPlan {
  return OrchestrationPlanSchema.parse(plan);
}

function buildSteps(objective: Objective, planId: string): ExecutionStep[] {
  const descriptions: Array<{ type: ExecutionStep["type"]; description: string }> = [
    {
      type: "investigate",
      description: `Investigate the current state, evidence, and context for: ${objective.description}`.slice(0, 1000),
    },
  ];

  if ((objective.constraints?.length ?? 0) > 0) {
    descriptions.push({
      type: "investigate",
      description: `Investigate how these constraints shape execution: ${objective.constraints?.join("; ")}`.slice(0, 1000),
    });
  }

  descriptions.push(
    {
      type: "generate",
      description: `Generate strategic options that address the objective while respecting constraints.`.slice(0, 1000),
    },
    {
      type: "synthesize",
      description: `Synthesize the strongest findings into a cohesive strategic direction.`.slice(0, 1000),
    },
    {
      type: "evaluate",
      description: `Evaluate the proposed direction against desired outcomes${objective.targetOutcomes?.length ? `: ${objective.targetOutcomes.join("; ")}` : "."}`.slice(0, 1000),
    },
    {
      type: "refine",
      description: `Refine the recommended plan into concrete next moves, sequencing, and risk mitigations.`.slice(0, 1000),
    }
  );

  return descriptions.slice(0, 50).map((definition) =>
    ExecutionStepSchema.parse({
      id: randomUUID(),
      planId,
      type: definition.type,
      description: definition.description,
      status: "pending",
    })
  );
}

function updatePlan(plan: OrchestrationPlan): OrchestrationPlan {
  const normalized = OrchestrationPlanSchema.parse({
    ...plan,
    updatedAt: now(),
  });
  plans.set(normalized.id, normalized);
  return normalized;
}

function setPlanStatus(plan: OrchestrationPlan): OrchestrationPlan["status"] {
  if (plan.steps.some((step) => step.status === "failed")) return "failed";
  if (plan.steps.every((step) => step.status === "completed" || step.status === "skipped")) {
    return "completed";
  }
  if (plan.steps.some((step) => step.status === "running" || step.status === "completed")) {
    return "executing";
  }
  return plan.branches?.length ? "executing" : "planning";
}

function buildStepResult(plan: OrchestrationPlan, step: ExecutionStep): string {
  const objective = objectives.get(plan.objectiveId);
  const outcomeText = objective?.targetOutcomes?.length
    ? ` Target outcomes considered: ${objective.targetOutcomes.join("; ")}.`
    : "";

  switch (step.type) {
    case "investigate":
      return `Investigation completed for step ${step.id}. Evidence was mapped for objective \"${objective?.description ?? plan.objectiveId}\".${outcomeText}`.slice(0, 5000);
    case "generate":
      return `Generation completed for step ${step.id}. Produced strategic options spanning new bets, experiments, and delivery paths.`.slice(0, 5000);
    case "synthesize":
      return `Synthesis completed for step ${step.id}. Findings converged into a coherent innovation thesis with differentiated moves.`.slice(0, 5000);
    case "evaluate":
      return `Evaluation completed for step ${step.id}. The preferred strategy was scored against feasibility, impact, and learning velocity.${outcomeText}`.slice(0, 5000);
    case "refine":
      return `Refinement completed for step ${step.id}. The plan now includes execution sequencing, decision checkpoints, and mitigation actions.`.slice(0, 5000);
  }
}

function cloneOutput(output: StrategyOutput): StrategyOutput {
  return StrategyOutputSchema.parse(output);
}

export function createObjective(
  description: string,
  opts?: { constraints?: string[]; targetOutcomes?: string[] }
): Objective {
  const objective = ObjectiveSchema.parse({
    id: randomUUID(),
    description: description.trim(),
    constraints: normalizeList(opts?.constraints),
    targetOutcomes: normalizeList(opts?.targetOutcomes),
  });
  objectives.set(objective.id, objective);
  return ObjectiveSchema.parse(objective);
}

export function decomposeObjective(
  objectiveId: string,
  tokenBudget: number = 1000
): OrchestrationPlan | undefined {
  const objective = objectives.get(objectiveId);
  if (!objective) return undefined;

  const planId = randomUUID();
  const createdAt = now();
  const plan = OrchestrationPlanSchema.parse({
    id: planId,
    objectiveId,
    steps: buildSteps(objective, planId),
    status: "planning",
    totalTokenBudget: tokenBudget,
    usedTokens: 0,
    createdAt,
    updatedAt: createdAt,
  });
  plans.set(plan.id, plan);
  return clonePlan(plan);
}

export function executeStep(planId: string, stepId: string): ExecutionStep | undefined {
  const plan = plans.get(planId);
  if (!plan) return undefined;

  const stepIndex = plan.steps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return undefined;

  const current = plan.steps[stepIndex];
  if (current.status === "completed" || current.status === "skipped") {
    return ExecutionStepSchema.parse(current);
  }

  const tokenCost = STEP_TOKEN_COST[current.type];
  if (plan.usedTokens + tokenCost > plan.totalTokenBudget) {
    const failed = ExecutionStepSchema.parse({
      ...current,
      status: "failed",
      startedAt: current.startedAt ?? now(),
      completedAt: now(),
      result: `Execution stopped because the remaining budget could not cover ${tokenCost} tokens.`.slice(0, 5000),
      confidence: 0,
    });
    plan.steps[stepIndex] = failed;
    plan.status = setPlanStatus(plan);
    updatePlan(plan);
    return ExecutionStepSchema.parse(failed);
  }

  const startedAt = now();
  const completed = ExecutionStepSchema.parse({
    ...current,
    status: "completed",
    startedAt,
    completedAt: now(),
    tokenCost,
    confidence: STEP_CONFIDENCE[current.type],
    result: buildStepResult(plan, current),
  });

  plan.steps[stepIndex] = completed;
  plan.usedTokens += tokenCost;
  plan.status = setPlanStatus(plan);
  updatePlan(plan);
  return ExecutionStepSchema.parse(completed);
}

export function advancePlan(planId: string): OrchestrationPlan | undefined {
  const plan = plans.get(planId);
  if (!plan) return undefined;

  const nextStep = plan.steps.find((step) => step.status === "pending");
  if (!nextStep) {
    plan.status = setPlanStatus(plan);
    return clonePlan(updatePlan(plan));
  }

  executeStep(planId, nextStep.id);
  const updated = plans.get(planId);
  return updated ? clonePlan(updated) : undefined;
}

export function branchExploration(
  planId: string,
  parentStepId: string,
  reason: string
): OrchestrationPlan | undefined {
  const plan = plans.get(planId);
  if (!plan) return undefined;
  if (!plan.steps.some((step) => step.id === parentStepId)) return undefined;

  const branchId = randomUUID();
  const branchSteps = [
    ExecutionStepSchema.parse({
      id: randomUUID(),
      planId,
      type: "investigate",
      description: `Branch investigation for ${parentStepId}: ${reason}`.slice(0, 1000),
      status: "pending",
    }),
    ExecutionStepSchema.parse({
      id: randomUUID(),
      planId,
      type: "synthesize",
      description: `Branch synthesis for ${parentStepId}: convert branch findings into a recommendation.`.slice(0, 1000),
      status: "pending",
    }),
  ];

  const branches = [...(plan.branches ?? [])];
  branches.push(
    PlanBranchSchema.parse({
      id: branchId,
      parentStepId,
      reason: reason.trim(),
      steps: branchSteps,
    })
  );

  plan.branches = branches;
  plan.status = setPlanStatus(plan);
  return clonePlan(updatePlan(plan));
}

export function getPlan(id: string): OrchestrationPlan | undefined {
  const plan = plans.get(id);
  return plan ? clonePlan(plan) : undefined;
}

export function generateStrategyOutput(planId: string): StrategyOutput | undefined {
  const plan = plans.get(planId);
  if (!plan) return undefined;

  const objective = objectives.get(plan.objectiveId);
  const completedSteps = plan.steps.filter((step) => step.status === "completed");
  const findings = completedSteps.slice(0, 20).map((step) =>
    StrategyFindingSchema.parse({
      area: `${step.type}-analysis`.slice(0, 200),
      insight: (step.result ?? step.description).slice(0, 1000),
      confidence: step.confidence ?? 0.5,
      evidence: [step.description.slice(0, 500)],
    })
  );

  const recommendationsSource = completedSteps.filter((step) =>
    ["generate", "evaluate", "refine", "synthesize"].includes(step.type)
  );
  const recommendations = recommendationsSource.slice(0, 10).map((step) =>
    StrategyRecommendationSchema.parse({
      title: `${step.type[0].toUpperCase()}${step.type.slice(1)} recommendation`,
      description: (step.result ?? step.description).slice(0, 1000),
      priority:
        step.type === "refine"
          ? "critical"
          : step.type === "evaluate"
            ? "high"
            : step.type === "synthesize"
              ? "medium"
              : "low",
      effort:
        step.type === "refine"
          ? "medium"
          : step.type === "generate"
            ? "high"
            : "low",
    })
  );

  const completionRatio = plan.steps.length > 0 ? completedSteps.length / plan.steps.length : 0;
  const averageConfidence =
    completedSteps.length > 0
      ? completedSteps.reduce((sum, step) => sum + (step.confidence ?? 0.5), 0) / completedSteps.length
      : 0;
  const coverageGaps = plan.steps
    .filter((step) => step.status !== "completed")
    .slice(0, 5)
    .map((step) => step.description.slice(0, 500));

  const output = StrategyOutputSchema.parse({
    id: randomUUID(),
    planId,
    title: `Strategy Output: ${(objective?.description ?? planId).slice(0, 460)}`,
    executiveSummary: `Completed ${completedSteps.length} of ${plan.steps.length} execution steps for ${(objective?.description ?? planId).slice(0, 400)}. ${recommendations.length} recommendations were distilled while consuming ${plan.usedTokens}/${plan.totalTokenBudget} planned tokens.`.slice(0, 3000),
    findings,
    recommendations,
    confidenceAssessment: {
      overall: Number(averageConfidence.toFixed(2)),
      dataQuality: completionRatio >= 0.8 ? "high" : completionRatio >= 0.4 ? "medium" : "low",
      coverageGaps,
    },
    generatedAt: now(),
  });

  outputs.set(output.id, output);
  return cloneOutput(output);
}

export function getStrategyOutput(id: string): StrategyOutput | undefined {
  const output = outputs.get(id);
  return output ? cloneOutput(output) : undefined;
}

export function getBudgetStatus(
  planId: string
): { total: number; used: number; remaining: number } | undefined {
  const plan = plans.get(planId);
  if (!plan) return undefined;
  return {
    total: plan.totalTokenBudget,
    used: plan.usedTokens,
    remaining: Math.max(0, plan.totalTokenBudget - plan.usedTokens),
  };
}

export function clearOrchestratorData(): void {
  objectives.clear();
  plans.clear();
  outputs.clear();
}
