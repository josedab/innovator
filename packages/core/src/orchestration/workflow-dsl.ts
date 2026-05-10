/**
 * @module orchestration/workflow-dsl
 *
 * YAML/JSON DSL for defining innovation workflows declaratively.
 * Parses workflow definitions and converts them to executable DAG workflows.
 */

import { z } from "zod";
import type { DAGWorkflow, DAGNode } from "./dag-engine.js";
import { DAGWorkflowSchema } from "./dag-engine.js";

// ---- DSL Schema ----

export const WorkflowStepDSLSchema = z.object({
  id: z.string().max(100),
  type: z.enum([
    "investigate",
    "generate",
    "score",
    "filter",
    "synthesize",
    "artifact",
    "redteam",
    "debate",
    "export",
    "gate",
    "condition",
    "loop",
    "human-review",
    "custom",
  ]),
  name: z.string().max(200).optional(),
  after: z.union([z.string(), z.array(z.string())]).optional(),
  angles: z.array(z.string()).optional(),
  model: z.string().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  continueOnError: z.boolean().optional(),
  // Condition
  when: z
    .object({
      field: z.string(),
      op: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists"]),
      value: z.unknown(),
    })
    .optional(),
  then: z.array(z.string()).optional(),
  else: z.array(z.string()).optional(),
  // Loop
  repeat: z
    .object({
      times: z.number().int().min(1).max(10),
      until: z
        .object({
          field: z.string(),
          op: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists"]),
          value: z.unknown(),
        })
        .optional(),
      steps: z.array(z.string()),
    })
    .optional(),
  // Gate
  approve: z
    .object({
      prompt: z.string(),
      timeout: z.number().optional(),
      auto: z.boolean().optional(),
      approvers: z.number().optional(),
    })
    .optional(),
  config: z.record(z.unknown()).optional(),
});

export type WorkflowStepDSL = z.infer<typeof WorkflowStepDSLSchema>;

export const WorkflowDSLSchema = z.object({
  name: z.string().max(300),
  description: z.string().max(2000).optional(),
  version: z.string().max(50).optional(),
  variables: z.record(z.unknown()).optional(),
  steps: z.array(WorkflowStepDSLSchema).min(1).max(100),
  tags: z.array(z.string()).optional(),
});

export type WorkflowDSL = z.infer<typeof WorkflowDSLSchema>;

/** Convert a simplified DSL definition to a full DAG workflow. */
export function dslToDAG(dsl: WorkflowDSL): DAGWorkflow {
  const parsed = WorkflowDSLSchema.parse(dsl);

  const nodes: DAGNode[] = parsed.steps.map((step) => {
    const dependsOn = step.after ? (Array.isArray(step.after) ? step.after : [step.after]) : [];

    const node: Record<string, unknown> = {
      id: step.id,
      type: step.type,
      name: step.name ?? step.id,
      dependsOn,
      config: {
        ...step.config,
        ...(step.angles ? { angles: step.angles } : {}),
        ...(step.model ? { model: step.model } : {}),
      },
      timeout: step.timeout ?? 300,
      retries: step.retries ?? 0,
      continueOnError: step.continueOnError ?? false,
    };

    if (step.when) {
      node.condition = {
        field: step.when.field,
        operator: step.when.op,
        value: step.when.value,
      };
      if (step.then || step.else) {
        node.branches = {
          trueBranch: step.then,
          falseBranch: step.else,
        };
      }
    }

    if (step.repeat) {
      node.loop = {
        maxIterations: step.repeat.times,
        loopBody: step.repeat.steps,
        ...(step.repeat.until
          ? {
              exitCondition: {
                field: step.repeat.until.field,
                operator: step.repeat.until.op,
                value: step.repeat.until.value,
              },
            }
          : {}),
      };
    }

    if (step.approve) {
      node.gate = {
        prompt: step.approve.prompt,
        timeout: step.approve.timeout ?? 3600,
        autoApprove: step.approve.auto ?? false,
        requiredApprovers: step.approve.approvers ?? 1,
      };
    }

    return node as unknown as DAGNode;
  });

  return DAGWorkflowSchema.parse({
    id: parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: parsed.name,
    description: parsed.description,
    version: parsed.version ?? "1.0.0",
    nodes,
    variables: parsed.variables,
    metadata: {
      tags: parsed.tags,
      createdAt: new Date().toISOString(),
    },
  });
}

/** Convert a DAG workflow back to the simplified DSL format. */
export function dagToDSL(workflow: DAGWorkflow): WorkflowDSL {
  const steps: WorkflowStepDSL[] = workflow.nodes.map((node) => {
    const step: Record<string, unknown> = {
      id: node.id,
      type: node.type,
      name: node.name,
    };

    if (node.dependsOn.length === 1) {
      step.after = node.dependsOn[0];
    } else if (node.dependsOn.length > 1) {
      step.after = node.dependsOn;
    }

    if (node.config) {
      const { angles, model, ...rest } = node.config as Record<string, unknown>;
      if (angles) step.angles = angles;
      if (model) step.model = model;
      if (Object.keys(rest).length > 0) step.config = rest;
    }

    if (node.timeout !== 300) step.timeout = node.timeout;
    if (node.retries > 0) step.retries = node.retries;
    if (node.continueOnError) step.continueOnError = true;

    if (node.condition) {
      step.when = {
        field: node.condition.field,
        op: node.condition.operator,
        value: node.condition.value,
      };
      if (node.branches?.trueBranch) step.then = node.branches.trueBranch;
      if (node.branches?.falseBranch) step.else = node.branches.falseBranch;
    }

    if (node.loop) {
      step.repeat = {
        times: node.loop.maxIterations,
        steps: node.loop.loopBody,
        ...(node.loop.exitCondition
          ? {
              until: {
                field: node.loop.exitCondition.field,
                op: node.loop.exitCondition.operator,
                value: node.loop.exitCondition.value,
              },
            }
          : {}),
      };
    }

    if (node.gate) {
      step.approve = {
        prompt: node.gate.prompt,
        timeout: node.gate.timeout,
        auto: node.gate.autoApprove,
        approvers: node.gate.requiredApprovers,
      };
    }

    return step as unknown as WorkflowStepDSL;
  });

  return {
    name: workflow.name,
    description: workflow.description,
    version: workflow.version,
    variables: workflow.variables,
    steps,
    tags: workflow.metadata?.tags as string[] | undefined,
  };
}
