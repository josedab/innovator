import { z } from "zod";

/** A process event in the innovation pipeline. */
export const ProcessEventSchema = z.object({
  id: z.string().max(100),
  caseId: z.string().max(100),
  activity: z.string().max(200),
  timestamp: z.string(),
  durationMs: z.number().min(0).optional(),
  actor: z.string().max(200).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
/** A process event representing one activity occurrence in a pipeline case. */
export type ProcessEvent = z.infer<typeof ProcessEventSchema>;

/** A transition between two activities with frequency and duration statistics. */
export const TransitionSchema = z.object({
  from: z.string().max(200),
  to: z.string().max(200),
  frequency: z.number().min(0),
  averageDurationMs: z.number().min(0),
  medianDurationMs: z.number().min(0),
});
/** A transition between two activities with frequency and timing. */
export type Transition = z.infer<typeof TransitionSchema>;

/** A bottleneck: an activity with excessive wait times and a severity rating. */
export const BottleneckSchema = z.object({
  activity: z.string().max(200),
  severity: z.enum(["low", "medium", "high", "critical"]),
  averageWaitMs: z.number().min(0),
  casePercentage: z.number().min(0).max(100),
  recommendation: z.string().max(1000),
});
/** A bottleneck: an activity with excessive wait times, severity, and recommendation. */
export type Bottleneck = z.infer<typeof BottleneckSchema>;

/** A node in the process map representing a single activity with frequency and duration stats. */
export const ProcessNodeSchema = z.object({
  id: z.string().max(200),
  activity: z.string().max(200),
  frequency: z.number().min(0),
  averageDurationMs: z.number().min(0),
  isStart: z.boolean(),
  isEnd: z.boolean(),
});
/** A node in the process map with activity metadata. */
export type ProcessNode = z.infer<typeof ProcessNodeSchema>;

/** An edge in the process map representing a transition with frequency and probability. */
export const ProcessEdgeSchema = z.object({
  source: z.string().max(200),
  target: z.string().max(200),
  frequency: z.number().min(0),
  probability: z.number().min(0).max(1),
});
/** An edge in the process map with transition frequency and probability. */
export type ProcessEdge = z.infer<typeof ProcessEdgeSchema>;

/** Complete process mining result including map, bottlenecks, conformance, and statistics. */
export const ProcessMiningResultSchema = z.object({
  processMap: z.object({
    nodes: z.array(ProcessNodeSchema),
    edges: z.array(ProcessEdgeSchema),
  }),
  transitions: z.array(TransitionSchema),
  bottlenecks: z.array(BottleneckSchema),
  conformance: z.object({
    fitnessScore: z.number().min(0).max(1),
    deviations: z.array(z.string().max(500)),
  }),
  statistics: z.object({
    totalCases: z.number(),
    totalEvents: z.number(),
    uniqueActivities: z.number(),
    averageCaseDurationMs: z.number(),
    medianCaseDurationMs: z.number(),
  }),
  createdAt: z.string(),
});
/** Complete process mining result with map, transitions, bottlenecks, conformance, and statistics. */
export type ProcessMiningResult = z.infer<typeof ProcessMiningResultSchema>;

/** Configuration for process mining. */
export interface ProcessMiningConfig {
  algorithm?: "alpha" | "inductive";
  minFrequency?: number;
  bottleneckThresholdMs?: number;
}
