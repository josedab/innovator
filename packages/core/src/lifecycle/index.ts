/**
 * @module lifecycle
 *
 * Idea Maturity Lifecycle — formal stage-gate process for ideas:
 * Spark → Concept → Validated → Planned → In Progress → Shipped → Measured.
 * Each stage has required evidence, and a Kanban board visualization model.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const LifecycleStageSchema = z.enum([
  "spark",
  "concept",
  "validated",
  "planned",
  "in-progress",
  "shipped",
  "measured",
]);

export const EvidenceTypeSchema = z.enum([
  "market-data",
  "user-research",
  "technical-feasibility",
  "competitive-analysis",
  "financial-projection",
  "team-commitment",
  "prototype",
  "customer-feedback",
  "metrics-report",
  "stakeholder-approval",
  "custom",
]);

export const EvidenceItemSchema = z.object({
  id: z.string(),
  type: EvidenceTypeSchema,
  title: z.string().max(500),
  description: z.string().max(2000).optional(),
  url: z.string().max(2000).optional(),
  addedBy: z.string().max(200).optional(),
  addedAt: z.string(),
  verified: z.boolean().default(false),
});

export const LifecycleIdeaSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(5000),
  stage: LifecycleStageSchema,
  evidence: z.array(EvidenceItemSchema).max(50),
  sourceSessionId: z.string().optional(),
  sourceAngleId: z.string().max(100).optional(),
  assigneeId: z.string().max(200).optional(),
  assigneeName: z.string().max(200).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  stageHistory: z.array(
    z.object({
      from: LifecycleStageSchema,
      to: LifecycleStageSchema,
      timestamp: z.string(),
      userId: z.string().max(200).optional(),
    })
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
  staleAfterDays: z.number().default(14),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

export const KanbanColumnSchema = z.object({
  stage: LifecycleStageSchema,
  name: z.string(),
  ideas: z.array(LifecycleIdeaSchema),
  count: z.number(),
  wipLimit: z.number().optional(),
});

// ---- Types ----

export type LifecycleStage = z.infer<typeof LifecycleStageSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type LifecycleIdea = z.infer<typeof LifecycleIdeaSchema>;
export type KanbanColumn = z.infer<typeof KanbanColumnSchema>;

export interface KanbanBoard {
  columns: KanbanColumn[];
  totalIdeas: number;
  staleCount: number;
}

// ---- Stage Requirements ----

const STAGE_EVIDENCE_REQUIREMENTS: Record<LifecycleStage, EvidenceType[]> = {
  spark: [],
  concept: ["market-data"],
  validated: ["user-research", "technical-feasibility"],
  planned: ["financial-projection", "team-commitment"],
  "in-progress": ["stakeholder-approval"],
  shipped: ["prototype"],
  measured: ["metrics-report", "customer-feedback"],
};

export const LIFECYCLE_STAGES: Array<{
  id: LifecycleStage;
  name: string;
  description: string;
  requiredEvidence: EvidenceType[];
  icon: string;
}> = [
  {
    id: "spark",
    name: "Spark",
    description: "Initial idea captured",
    requiredEvidence: [],
    icon: "✨",
  },
  {
    id: "concept",
    name: "Concept",
    description: "Idea refined with market context",
    requiredEvidence: ["market-data"],
    icon: "💡",
  },
  {
    id: "validated",
    name: "Validated",
    description: "Feasibility and user demand confirmed",
    requiredEvidence: ["user-research", "technical-feasibility"],
    icon: "✅",
  },
  {
    id: "planned",
    name: "Planned",
    description: "Committed to roadmap with resources",
    requiredEvidence: ["financial-projection", "team-commitment"],
    icon: "📋",
  },
  {
    id: "in-progress",
    name: "In Progress",
    description: "Actively being built",
    requiredEvidence: ["stakeholder-approval"],
    icon: "🚧",
  },
  {
    id: "shipped",
    name: "Shipped",
    description: "Released to users",
    requiredEvidence: ["prototype"],
    icon: "🚀",
  },
  {
    id: "measured",
    name: "Measured",
    description: "Impact measured and reported",
    requiredEvidence: ["metrics-report", "customer-feedback"],
    icon: "📊",
  },
];

// ---- In-Memory Store ----

const ideas = new Map<string, LifecycleIdea>();

// ---- Core Functions ----

/** Create a new lifecycle idea at the Spark stage. */
export function createLifecycleIdea(params: {
  title: string;
  description: string;
  sourceSessionId?: string;
  sourceAngleId?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
}): LifecycleIdea {
  const id = randomUUID();
  const now = new Date().toISOString();
  const idea: LifecycleIdea = {
    id,
    title: params.title,
    description: params.description,
    stage: "spark",
    evidence: [],
    sourceSessionId: params.sourceSessionId,
    sourceAngleId: params.sourceAngleId,
    assigneeId: params.assigneeId,
    assigneeName: params.assigneeName,
    priority: params.priority ?? "medium",
    stageHistory: [],
    createdAt: now,
    updatedAt: now,
    staleAfterDays: 14,
    tags: params.tags,
  };
  ideas.set(id, idea);
  return idea;
}

/** Get a lifecycle idea by ID. */
export function getLifecycleIdea(id: string): LifecycleIdea | undefined {
  return ideas.get(id);
}

/** List all lifecycle ideas, optionally filtered by stage. */
export function listLifecycleIdeas(filter?: {
  stage?: LifecycleStage;
  assigneeId?: string;
  priority?: string;
}): LifecycleIdea[] {
  let list = Array.from(ideas.values());
  if (filter?.stage) list = list.filter((i) => i.stage === filter.stage);
  if (filter?.assigneeId) list = list.filter((i) => i.assigneeId === filter.assigneeId);
  if (filter?.priority) list = list.filter((i) => i.priority === filter.priority);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Advance an idea to the next lifecycle stage if evidence requirements are met. */
export function advanceLifecycleStage(
  id: string,
  targetStage: LifecycleStage,
  opts?: { userId?: string; force?: boolean }
): { success: boolean; idea?: LifecycleIdea; missingEvidence?: EvidenceType[] } {
  const idea = ideas.get(id);
  if (!idea) return { success: false };

  const stageOrder = LIFECYCLE_STAGES.map((s) => s.id);
  const currentIdx = stageOrder.indexOf(idea.stage);
  const targetIdx = stageOrder.indexOf(targetStage);

  if (targetIdx <= currentIdx) {
    return { success: false };
  }

  // Check evidence requirements unless forced
  if (!opts?.force) {
    const required = STAGE_EVIDENCE_REQUIREMENTS[targetStage] ?? [];
    const existingTypes = new Set(idea.evidence.map((e) => e.type));
    const missing = required.filter((r) => !existingTypes.has(r));
    if (missing.length > 0) {
      return { success: false, missingEvidence: missing };
    }
  }

  const now = new Date().toISOString();
  idea.stageHistory.push({
    from: idea.stage,
    to: targetStage,
    timestamp: now,
    userId: opts?.userId,
  });
  idea.stage = targetStage;
  idea.updatedAt = now;
  ideas.set(id, idea);
  return { success: true, idea };
}

/** Add evidence to an idea. */
export function addEvidence(
  ideaId: string,
  evidence: {
    type: EvidenceType;
    title: string;
    description?: string;
    url?: string;
    addedBy?: string;
  }
): LifecycleIdea | undefined {
  const idea = ideas.get(ideaId);
  if (!idea) return undefined;

  idea.evidence.push({
    id: randomUUID(),
    type: evidence.type,
    title: evidence.title,
    description: evidence.description,
    url: evidence.url,
    addedBy: evidence.addedBy,
    addedAt: new Date().toISOString(),
    verified: false,
  });
  idea.updatedAt = new Date().toISOString();
  ideas.set(ideaId, idea);
  return idea;
}

/** Get the Kanban board view of all ideas. */
export function getKanbanBoard(): KanbanBoard {
  const allIdeas = Array.from(ideas.values());
  const now = Date.now();

  let staleCount = 0;
  const columns: KanbanColumn[] = LIFECYCLE_STAGES.map((stage) => {
    const stageIdeas = allIdeas
      .filter((i) => i.stage === stage.id)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      });

    return {
      stage: stage.id,
      name: stage.name,
      ideas: stageIdeas,
      count: stageIdeas.length,
    };
  });

  for (const idea of allIdeas) {
    const daysSinceUpdate = (now - new Date(idea.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (
      daysSinceUpdate > idea.staleAfterDays &&
      idea.stage !== "measured" &&
      idea.stage !== "shipped"
    ) {
      staleCount++;
    }
  }

  return { columns, totalIdeas: allIdeas.length, staleCount };
}

/** Get ideas that have been stale (not updated) beyond their threshold. */
export function getStaleIdeas(): LifecycleIdea[] {
  const now = Date.now();
  return Array.from(ideas.values()).filter((idea) => {
    if (idea.stage === "measured" || idea.stage === "shipped") return false;
    const daysSinceUpdate = (now - new Date(idea.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > idea.staleAfterDays;
  });
}

/** Delete a lifecycle idea. */
export function deleteLifecycleIdea(id: string): boolean {
  return ideas.delete(id);
}

/** Clear all lifecycle ideas (for testing). */
export function clearLifecycle(): void {
  ideas.clear();
}
