/**
 * @module copilot-agent/types
 *
 * Types for the Innovation Copilot Agent — an autonomous multi-step agent
 * that proactively discovers innovation opportunities by monitoring repos,
 * news feeds, and team activity.
 */

import { z } from "zod";

// ---- Agent State Machine ----

export const CopilotAgentStateSchema = z.enum([
  "idle",
  "monitoring",
  "analyzing",
  "proposing",
  "waiting-for-feedback",
  "error",
]);
export type CopilotAgentState = z.infer<typeof CopilotAgentStateSchema>;

// ---- Monitoring Source ----

export const MonitoringSourceTypeSchema = z.enum([
  "repository",
  "rss-feed",
  "team-activity",
  "market-signal",
]);
export type MonitoringSourceType = z.infer<typeof MonitoringSourceTypeSchema>;

export const MonitoringSourceSchema = z.object({
  id: z.string().max(200),
  type: MonitoringSourceTypeSchema,
  name: z.string().max(200),
  url: z.string().max(2000).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().default(true),
  lastCheckedAt: z.string().optional(),
});
export type MonitoringSource = z.infer<typeof MonitoringSourceSchema>;

// ---- Detected Change ----

export const DetectedChangeSchema = z.object({
  id: z.string().max(200),
  sourceId: z.string().max(200),
  sourceType: MonitoringSourceTypeSchema,
  title: z.string().max(500),
  description: z.string().max(5000),
  url: z.string().max(2000).optional(),
  detectedAt: z.string(),
  relevanceScore: z.number().min(0).max(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type DetectedChange = z.infer<typeof DetectedChangeSchema>;

// ---- Proposal ----

export const ProposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "dismissed",
  "deferred",
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalSchema = z.object({
  id: z.string().max(200),
  agentRunId: z.string().max(200),
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
        angleId: z.string().max(100).optional(),
      })
    )
    .max(10),
  sourceChanges: z.array(z.string().max(200)).max(20),
  status: ProposalStatusSchema.default("pending"),
  feedback: z.string().max(5000).optional(),
  createdAt: z.string(),
  respondedAt: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

// ---- Delivery Channel ----

export const DeliveryChannelSchema = z.enum([
  "web",
  "slack",
  "teams",
  "vscode",
  "email",
  "cli",
]);
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

export const DeliveryConfigSchema = z.object({
  channel: DeliveryChannelSchema,
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type DeliveryConfig = z.infer<typeof DeliveryConfigSchema>;

// ---- Agent Run ----

export const CopilotAgentRunSchema = z.object({
  id: z.string().max(200),
  state: CopilotAgentStateSchema,
  sources: z.array(MonitoringSourceSchema).max(50),
  detectedChanges: z.array(DetectedChangeSchema).max(500),
  proposals: z.array(ProposalSchema).max(100),
  deliveryChannels: z.array(DeliveryConfigSchema).max(10),
  config: z.object({
    monitoringIntervalMs: z.number().min(60000).default(300000),
    relevanceThreshold: z.number().min(0).max(1).default(0.5),
    maxProposalsPerCycle: z.number().min(1).max(20).default(5),
    topics: z.array(z.string().max(200)).max(20),
    model: z.string().optional(),
    autoPropose: z.boolean().default(true),
  }),
  stats: z.object({
    totalCycles: z.number().int().min(0).default(0),
    totalChangesDetected: z.number().int().min(0).default(0),
    totalProposals: z.number().int().min(0).default(0),
    acceptedProposals: z.number().int().min(0).default(0),
    dismissedProposals: z.number().int().min(0).default(0),
    deferredProposals: z.number().int().min(0).default(0),
  }),
  startedAt: z.string(),
  updatedAt: z.string(),
  lastCycleAt: z.string().optional(),
  error: z.string().max(2000).optional(),
});
export type CopilotAgentRun = z.infer<typeof CopilotAgentRunSchema>;

// ---- Progress ----

export interface CopilotAgentProgress {
  runId: string;
  state: CopilotAgentState;
  cycle: number;
  changesDetected: number;
  proposalsGenerated: number;
  currentSource?: string;
  error?: string;
}

// ---- Config ----

export interface CopilotAgentConfig {
  sources: MonitoringSource[];
  topics: string[];
  deliveryChannels?: DeliveryConfig[];
  monitoringIntervalMs?: number;
  relevanceThreshold?: number;
  maxProposalsPerCycle?: number;
  model?: string;
  autoPropose?: boolean;
  signal?: AbortSignal;
}
