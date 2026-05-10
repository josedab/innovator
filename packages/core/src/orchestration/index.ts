/**
 * @module orchestration
 *
 * Declarative YAML/JSON configuration for innovation workflows.
 * Define innovator.yaml schemas for pipelines, schedules, integrations,
 * quality gates, and team assignments with Zod validation.
 * Implements plan/apply/drift engine: plan shows diff, apply executes,
 * drift detects divergence from declared state.
 */

import { z } from "zod";

// ---- Orchestration Schema (innovator.yaml) ----

export const QualityGateSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  condition: z.enum([
    "min-score",
    "min-ideas",
    "min-angles",
    "max-risk",
    "min-confidence",
    "custom",
  ]),
  threshold: z.number(),
  action: z.enum(["block", "warn", "notify"]).default("warn"),
  message: z.string().max(500).optional(),
});

export type QualityGate = z.infer<typeof QualityGateSchema>;

export const TeamAssignmentSchema = z.object({
  memberId: z.string().max(100),
  role: z.enum(["owner", "contributor", "reviewer", "observer"]),
  angles: z.array(z.string().max(100)).max(20).optional(),
  notifications: z.boolean().default(true),
});

export type TeamAssignment = z.infer<typeof TeamAssignmentSchema>;

export const ScheduleSchema = z.object({
  enabled: z.boolean().default(false),
  cron: z
    .string()
    .max(100)
    .optional()
    .describe("Cron expression (e.g. '0 9 * * 1' for Monday 9am)"),
  timezone: z.string().max(100).default("UTC"),
  runOnMerge: z.boolean().default(false),
  runOnPush: z.boolean().default(false),
  branches: z.array(z.string().max(200)).max(10).optional(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

export const IntegrationConfigSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["github", "slack", "jira", "webhook", "email"]),
  enabled: z.boolean().default(true),
  config: z.record(z.string().max(100), z.unknown()),
});

export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

export const OrchestrationPipelineStageSchema = z.object({
  id: z.string().max(100),
  type: z.enum([
    "investigate",
    "generate",
    "score",
    "filter",
    "synthesize",
    "artifact",
    "notify",
    "gate",
    "custom",
  ]),
  name: z.string().max(200).optional(),
  angles: z.array(z.string().max(100)).max(20).optional(),
  model: z.string().max(100).optional(),
  timeout: z.number().int().min(0).max(3600).optional(),
  qualityGate: z.string().max(100).optional(),
  params: z.record(z.string().max(100), z.unknown()).optional(),
  dependsOn: z.array(z.string().max(100)).max(10).optional(),
});

export type OrchestrationPipelineStage = z.infer<typeof OrchestrationPipelineStageSchema>;

export const OrchestrationConfigSchema = z.object({
  version: z.string().max(20).default("1"),
  name: z.string().max(300),
  description: z.string().max(2000).optional(),
  defaults: z
    .object({
      model: z.string().max(100).optional(),
      timeout: z.number().int().min(0).max(3600).default(300),
      continueOnError: z.boolean().default(false),
    })
    .optional(),
  pipeline: z.array(OrchestrationPipelineStageSchema).min(1).max(50),
  qualityGates: z.array(QualityGateSchema).max(20).optional(),
  team: z.array(TeamAssignmentSchema).max(50).optional(),
  schedule: ScheduleSchema.optional(),
  integrations: z.array(IntegrationConfigSchema).max(20).optional(),
  variables: z.record(z.string().max(100), z.string().max(1000)).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export type OrchestrationConfig = z.infer<typeof OrchestrationConfigSchema>;

// ---- Plan / Apply / Drift ----

export const PlanChangeSchema = z.object({
  path: z.string().max(500),
  action: z.enum(["add", "modify", "remove", "unchanged"]),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  description: z.string().max(1000),
});

export type PlanChange = z.infer<typeof PlanChangeSchema>;

export const OrchestrationPlanSchema = z.object({
  configName: z.string().max(300),
  generatedAt: z.string(),
  changes: z.array(PlanChangeSchema).max(200),
  summary: z.string().max(2000),
  hasBreakingChanges: z.boolean(),
  estimatedDuration: z.string().max(100).optional(),
});

export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>;

export const ApplyResultSchema = z.object({
  configName: z.string().max(300),
  appliedAt: z.string(),
  changesApplied: z.number().int().min(0),
  status: z.enum(["success", "partial", "failed"]),
  errors: z.array(z.string().max(500)).max(50),
  warnings: z.array(z.string().max(500)).max(50),
});

export type ApplyResult = z.infer<typeof ApplyResultSchema>;

export const DriftReportSchema = z.object({
  configName: z.string().max(300),
  checkedAt: z.string(),
  hasDrift: z.boolean(),
  drifts: z
    .array(
      z.object({
        path: z.string().max(500),
        declared: z.unknown(),
        actual: z.unknown(),
        severity: z.enum(["info", "warning", "error"]),
        description: z.string().max(1000),
      })
    )
    .max(100),
  summary: z.string().max(2000),
});

export type DriftReport = z.infer<typeof DriftReportSchema>;

// ---- In-Memory Store ----

const appliedConfigs = new Map<string, OrchestrationConfig>();
const planHistory = new Map<string, OrchestrationPlan[]>();

// ---- Lightweight YAML Parser (reuses existing pattern from workflow module) ----

function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  // Attempt JSON parse first (superset compatibility)
  try {
    return JSON.parse(yamlStr);
  } catch {
    // Minimal YAML-like key:value parsing for simple configs
    const result: Record<string, unknown> = {};
    const lines = yamlStr.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        if (value === "true") result[key] = true;
        else if (value === "false") result[key] = false;
        else if (!isNaN(Number(value)) && value !== "") result[key] = Number(value);
        else result[key] = value;
      }
    }
    return result;
  }
}

// ---- Functions ----

/** Parse and validate an orchestration config from JSON or YAML string. */
export function parseOrchestrationConfig(input: string): OrchestrationConfig {
  const parsed = parseSimpleYaml(input);
  return OrchestrationConfigSchema.parse(parsed);
}

/** Validate an orchestration config object. */
export function validateOrchestrationConfig(config: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const parsed = OrchestrationConfigSchema.parse(config);

    // Validate stage dependencies
    const stageIds = new Set(parsed.pipeline.map((s) => s.id));
    for (const stage of parsed.pipeline) {
      if (stage.dependsOn) {
        for (const dep of stage.dependsOn) {
          if (!stageIds.has(dep)) {
            errors.push(`Stage '${stage.id}' depends on unknown stage '${dep}'`);
          }
        }
      }
      if (stage.qualityGate) {
        const gateIds = new Set((parsed.qualityGates ?? []).map((g) => g.id));
        if (!gateIds.has(stage.qualityGate)) {
          errors.push(`Stage '${stage.id}' references unknown quality gate '${stage.qualityGate}'`);
        }
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const depsMap = new Map<string, string[]>();
    for (const stage of parsed.pipeline) {
      depsMap.set(stage.id, stage.dependsOn ?? []);
    }

    function hasCycle(id: string): boolean {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const dep of depsMap.get(id) ?? []) {
        if (hasCycle(dep)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    }

    for (const stage of parsed.pipeline) {
      if (hasCycle(stage.id)) {
        errors.push(`Circular dependency detected involving stage '${stage.id}'`);
        break;
      }
    }

    // Warnings
    if (!parsed.schedule?.enabled && !parsed.integrations?.length) {
      warnings.push("No schedule or integrations configured. Pipeline will only run manually.");
    }
    if (!parsed.qualityGates?.length) {
      warnings.push("No quality gates defined. Consider adding gates for production use.");
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [`Schema validation failed: ${message}`], warnings };
  }
}

/** Generate a plan comparing new config against currently applied config. */
export function planOrchestration(newConfig: OrchestrationConfig): OrchestrationPlan {
  const existing = appliedConfigs.get(newConfig.name);
  const changes: PlanChange[] = [];
  let hasBreakingChanges = false;

  if (!existing) {
    changes.push({
      path: "/",
      action: "add",
      after: newConfig.name,
      description: `Create new orchestration config '${newConfig.name}'`,
    });
    for (const stage of newConfig.pipeline) {
      changes.push({
        path: `/pipeline/${stage.id}`,
        action: "add",
        after: stage.type,
        description: `Add ${stage.type} stage '${stage.id}'`,
      });
    }
  } else {
    // Compare pipeline stages
    const existingStageIds = new Set(existing.pipeline.map((s) => s.id));
    const newStageIds = new Set(newConfig.pipeline.map((s) => s.id));

    for (const stage of newConfig.pipeline) {
      if (!existingStageIds.has(stage.id)) {
        changes.push({
          path: `/pipeline/${stage.id}`,
          action: "add",
          after: stage.type,
          description: `Add new ${stage.type} stage '${stage.id}'`,
        });
      } else {
        const existingStage = existing.pipeline.find((s) => s.id === stage.id);
        if (existingStage && JSON.stringify(existingStage) !== JSON.stringify(stage)) {
          changes.push({
            path: `/pipeline/${stage.id}`,
            action: "modify",
            before: existingStage.type,
            after: stage.type,
            description: `Modify stage '${stage.id}'`,
          });
        }
      }
    }

    for (const stage of existing.pipeline) {
      if (!newStageIds.has(stage.id)) {
        hasBreakingChanges = true;
        changes.push({
          path: `/pipeline/${stage.id}`,
          action: "remove",
          before: stage.type,
          description: `Remove ${stage.type} stage '${stage.id}'`,
        });
      }
    }

    // Compare quality gates
    const existingGateIds = new Set((existing.qualityGates ?? []).map((g) => g.id));
    for (const gate of newConfig.qualityGates ?? []) {
      if (!existingGateIds.has(gate.id)) {
        changes.push({
          path: `/qualityGates/${gate.id}`,
          action: "add",
          after: gate.condition,
          description: `Add quality gate '${gate.name}'`,
        });
      }
    }

    // Compare schedule
    if (JSON.stringify(existing.schedule) !== JSON.stringify(newConfig.schedule)) {
      changes.push({
        path: "/schedule",
        action: "modify",
        before: existing.schedule?.cron ?? "none",
        after: newConfig.schedule?.cron ?? "none",
        description: "Update schedule configuration",
      });
    }
  }

  const plan: OrchestrationPlan = {
    configName: newConfig.name,
    generatedAt: new Date().toISOString(),
    changes,
    summary:
      changes.length === 0
        ? "No changes detected."
        : `${changes.filter((c) => c.action === "add").length} additions, ${changes.filter((c) => c.action === "modify").length} modifications, ${changes.filter((c) => c.action === "remove").length} removals`,
    hasBreakingChanges,
    estimatedDuration: `${newConfig.pipeline.length * 30}s estimated`,
  };

  const history = planHistory.get(newConfig.name) ?? [];
  history.push(plan);
  if (history.length > 50) history.splice(0, history.length - 50);
  planHistory.set(newConfig.name, history);

  return OrchestrationPlanSchema.parse(plan);
}

/** Apply an orchestration config (store as the current applied state). */
export function applyOrchestration(config: OrchestrationConfig): ApplyResult {
  const validation = validateOrchestrationConfig(config);
  if (!validation.valid) {
    return ApplyResultSchema.parse({
      configName: config.name,
      appliedAt: new Date().toISOString(),
      changesApplied: 0,
      status: "failed",
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  const plan = planOrchestration(config);
  appliedConfigs.set(config.name, config);

  return ApplyResultSchema.parse({
    configName: config.name,
    appliedAt: new Date().toISOString(),
    changesApplied: plan.changes.filter((c) => c.action !== "unchanged").length,
    status: "success",
    errors: [],
    warnings: validation.warnings,
  });
}

/** Detect drift between declared config and actual applied state. */
export function detectDrift(declaredConfig: OrchestrationConfig): DriftReport {
  const applied = appliedConfigs.get(declaredConfig.name);
  const drifts: DriftReport["drifts"] = [];

  if (!applied) {
    return DriftReportSchema.parse({
      configName: declaredConfig.name,
      checkedAt: new Date().toISOString(),
      hasDrift: true,
      drifts: [
        {
          path: "/",
          declared: declaredConfig.name,
          actual: null,
          severity: "error",
          description: "Configuration has never been applied",
        },
      ],
      summary: "Configuration not yet applied.",
    });
  }

  // Compare pipeline stages
  const appliedStageMap = new Map(applied.pipeline.map((s) => [s.id, s]));
  const declaredStageMap = new Map(declaredConfig.pipeline.map((s) => [s.id, s]));

  for (const [id, declaredStage] of declaredStageMap) {
    const appliedStage = appliedStageMap.get(id);
    if (!appliedStage) {
      drifts.push({
        path: `/pipeline/${id}`,
        declared: declaredStage.type,
        actual: null,
        severity: "error",
        description: `Stage '${id}' declared but not applied`,
      });
    } else if (JSON.stringify(appliedStage) !== JSON.stringify(declaredStage)) {
      drifts.push({
        path: `/pipeline/${id}`,
        declared: declaredStage,
        actual: appliedStage,
        severity: "warning",
        description: `Stage '${id}' has drifted from declared configuration`,
      });
    }
  }

  for (const [id] of appliedStageMap) {
    if (!declaredStageMap.has(id)) {
      drifts.push({
        path: `/pipeline/${id}`,
        declared: null,
        actual: "exists",
        severity: "warning",
        description: `Stage '${id}' applied but not declared (orphaned)`,
      });
    }
  }

  return DriftReportSchema.parse({
    configName: declaredConfig.name,
    checkedAt: new Date().toISOString(),
    hasDrift: drifts.length > 0,
    drifts,
    summary:
      drifts.length === 0
        ? "No drift detected. Applied state matches declared configuration."
        : `${drifts.length} drift(s) detected: ${drifts.filter((d) => d.severity === "error").length} errors, ${drifts.filter((d) => d.severity === "warning").length} warnings`,
  });
}

/** Get the currently applied config for a given name. */
export function getAppliedConfig(name: string): OrchestrationConfig | undefined {
  return appliedConfigs.get(name);
}

/** Get plan history for a config. */
export function getPlanHistory(name: string): OrchestrationPlan[] {
  return planHistory.get(name) ?? [];
}

/** Generate a sample orchestration config. */
export function createSampleOrchestrationConfig(): OrchestrationConfig {
  return OrchestrationConfigSchema.parse({
    version: "1",
    name: "default-innovation-pipeline",
    description:
      "Standard innovation pipeline with investigation, generation, scoring, and synthesis",
    defaults: { model: "gpt-4.1", timeout: 300, continueOnError: false },
    pipeline: [
      { id: "investigate", type: "investigate", name: "Deep Investigation" },
      {
        id: "generate",
        type: "generate",
        name: "Idea Generation",
        angles: ["scamper", "first-principles", "cross-domain"],
        dependsOn: ["investigate"],
      },
      { id: "score", type: "score", name: "Idea Scoring", dependsOn: ["generate"] },
      {
        id: "filter",
        type: "filter",
        name: "Quality Filter",
        qualityGate: "min-quality",
        dependsOn: ["score"],
      },
      { id: "synthesize", type: "synthesize", name: "Synthesis", dependsOn: ["filter"] },
    ],
    qualityGates: [
      {
        id: "min-quality",
        name: "Minimum Quality",
        condition: "min-score",
        threshold: 60,
        action: "warn",
      },
    ],
    schedule: { enabled: false, cron: "0 9 * * 1", timezone: "UTC" },
    integrations: [],
  });
}

/** Clear all orchestration data. */
export function clearOrchestrationData(): void {
  appliedConfigs.clear();
  planHistory.clear();
}

// ---- Re-exports ----

export {
  type DAGNode,
  type DAGWorkflow,
  type DAGCondition,
  type DAGNodeStatus,
  type DAGNodeResult,
  type DAGExecutionState,
  type DAGProgressCallback,
  type DAGGateHandler,
  type DAGNodeExecutor,
  DAGNodeSchema,
  DAGWorkflowSchema,
  DAGConditionSchema,
  executeDAG,
  validateDAG,
  serializeDAGState,
} from "./dag-engine.js";

export {
  type WorkflowTemplate,
  getWorkflowTemplates,
  getWorkflowTemplate,
  registerWorkflowTemplate,
  unregisterWorkflowTemplate,
  getTemplatesByCategory,
  clearCustomTemplates,
} from "./templates.js";

export {
  type WorkflowDSL,
  type WorkflowStepDSL,
  WorkflowDSLSchema,
  WorkflowStepDSLSchema,
  dslToDAG,
  dagToDSL,
} from "./workflow-dsl.js";

export {
  QUICK_EXPLORE_DSL,
  DEEP_DIVE_DSL,
  COMPETITIVE_ANALYSIS_DSL,
  PRODUCT_LAUNCH_DSL,
  PATENT_SCAN_DSL,
  BUILTIN_WORKFLOW_DSLS,
  getBuiltinDSL,
  listBuiltinDSLs,
} from "./builtin-templates.js";
