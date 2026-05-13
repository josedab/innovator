/**
 * @module process-mining
 *
 * Alpha and Inductive mining algorithms on innovation session data.
 * Detects bottlenecks, generates process maps, and visualizes pipeline flows.
 */

import type {
  ProcessEvent,
  ProcessMiningResult,
  ProcessMiningConfig,
  Transition,
  Bottleneck,
  ProcessNode,
  ProcessEdge,
} from "./types.js";

export {
  ProcessEventSchema,
  TransitionSchema,
  BottleneckSchema,
  ProcessNodeSchema,
  ProcessEdgeSchema,
  ProcessMiningResultSchema,
} from "./types.js";
export type {
  ProcessEvent,
  Transition,
  Bottleneck,
  ProcessNode,
  ProcessEdge,
  ProcessMiningResult,
  ProcessMiningConfig,
} from "./types.js";

// ---- Alpha Miner ----

/** Group events by case ID and sort by timestamp. */
function groupByCase(events: ProcessEvent[]): Map<string, ProcessEvent[]> {
  const cases = new Map<string, ProcessEvent[]>();
  for (const event of events) {
    const existing = cases.get(event.caseId) ?? [];
    existing.push(event);
    cases.set(event.caseId, existing);
  }
  for (const [, caseEvents] of cases) {
    caseEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
  return cases;
}

/** Extract the directly-follows relation from event logs. */
function extractDirectlyFollows(
  cases: Map<string, ProcessEvent[]>
): Map<string, Map<string, number>> {
  const follows = new Map<string, Map<string, number>>();
  for (const [, events] of cases) {
    for (let i = 0; i < events.length - 1; i++) {
      const from = events[i].activity;
      const to = events[i + 1].activity;
      if (!follows.has(from)) follows.set(from, new Map());
      const targets = follows.get(from)!;
      targets.set(to, (targets.get(to) ?? 0) + 1);
    }
  }
  return follows;
}

/**
 * Alpha mining algorithm: discovers a process model from event logs.
 *
 * 1. Groups events by case ID and sorts by timestamp.
 * 2. Extracts the directly-follows relation (activity A → B frequency).
 * 3. Identifies start/end activities per case.
 * 4. Computes per-activity frequency and average duration.
 * 5. Builds nodes (activities) and edges (transitions above minFrequency).
 */
function alphaMine(
  events: ProcessEvent[],
  config: ProcessMiningConfig
): { nodes: ProcessNode[]; edges: ProcessEdge[] } {
  const cases = groupByCase(events);
  const follows = extractDirectlyFollows(cases);
  const minFreq = config.minFrequency ?? 1;

  // Collect all activities
  const activities = new Set<string>();
  for (const e of events) activities.add(e.activity);

  // Find start and end activities
  const startActivities = new Set<string>();
  const endActivities = new Set<string>();
  for (const [, caseEvents] of cases) {
    if (caseEvents.length > 0) {
      startActivities.add(caseEvents[0].activity);
      endActivities.add(caseEvents[caseEvents.length - 1].activity);
    }
  }

  // Build activity frequency and duration maps
  const activityFreq = new Map<string, number>();
  const activityDurations = new Map<string, number[]>();
  for (const e of events) {
    activityFreq.set(e.activity, (activityFreq.get(e.activity) ?? 0) + 1);
    if (e.durationMs !== undefined) {
      const durations = activityDurations.get(e.activity) ?? [];
      durations.push(e.durationMs);
      activityDurations.set(e.activity, durations);
    }
  }

  const nodes: ProcessNode[] = Array.from(activities).map((activity) => {
    const durations = activityDurations.get(activity) ?? [];
    return {
      id: activity,
      activity,
      frequency: activityFreq.get(activity) ?? 0,
      averageDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
      isStart: startActivities.has(activity),
      isEnd: endActivities.has(activity),
    };
  });

  const edges: ProcessEdge[] = [];
  for (const [from, targets] of follows) {
    const fromTotal = Array.from(targets.values()).reduce((a, b) => a + b, 0);
    for (const [to, freq] of targets) {
      if (freq >= minFreq) {
        edges.push({
          source: from,
          target: to,
          frequency: freq,
          probability: Math.round((freq / fromTotal) * 1000) / 1000,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Simplified Inductive mining algorithm.
 * Falls back to Alpha mining with a higher minimum frequency threshold,
 * filtering out low-frequency transitions to reveal the dominant process structure.
 */
function inductiveMine(
  events: ProcessEvent[],
  config: ProcessMiningConfig
): { nodes: ProcessNode[]; edges: ProcessEdge[] } {
  // Inductive mining falls back to directly-follows with frequency filtering
  // for this simplified implementation
  return alphaMine(events, { ...config, minFrequency: Math.max(config.minFrequency ?? 1, 2) });
}

// ---- Bottleneck Detection ----

function detectBottlenecks(cases: Map<string, ProcessEvent[]>, thresholdMs: number): Bottleneck[] {
  const waitTimes = new Map<string, number[]>();

  for (const [, caseEvents] of cases) {
    for (let i = 1; i < caseEvents.length; i++) {
      const prev = new Date(caseEvents[i - 1].timestamp).getTime();
      const prevDuration = caseEvents[i - 1].durationMs ?? 0;
      const curr = new Date(caseEvents[i].timestamp).getTime();
      const waitMs = curr - prev - prevDuration;

      if (waitMs > 0) {
        const activity = caseEvents[i].activity;
        const waits = waitTimes.get(activity) ?? [];
        waits.push(waitMs);
        waitTimes.set(activity, waits);
      }
    }
  }

  const bottlenecks: Bottleneck[] = [];
  for (const [activity, waits] of waitTimes) {
    const avg = waits.reduce((a, b) => a + b, 0) / waits.length;
    if (avg > thresholdMs) {
      const percentage = Math.round(
        (waits.filter((w) => w > thresholdMs).length / waits.length) * 100
      );
      const severity =
        avg > thresholdMs * 10
          ? "critical"
          : avg > thresholdMs * 5
            ? "high"
            : avg > thresholdMs * 2
              ? "medium"
              : "low";

      bottlenecks.push({
        activity,
        severity,
        averageWaitMs: Math.round(avg),
        casePercentage: percentage,
        recommendation:
          severity === "critical"
            ? `Critical bottleneck at "${activity}". Consider parallelization or resource allocation.`
            : `${severity} wait time at "${activity}". Monitor and optimize if trend continues.`,
      });
    }
  }

  return bottlenecks.sort((a, b) => b.averageWaitMs - a.averageWaitMs);
}

// ---- Transition Analysis ----

function analyzeTransitions(cases: Map<string, ProcessEvent[]>): Transition[] {
  const transitionData = new Map<string, { durations: number[]; count: number }>();

  for (const [, caseEvents] of cases) {
    for (let i = 0; i < caseEvents.length - 1; i++) {
      const from = caseEvents[i].activity;
      const to = caseEvents[i + 1].activity;
      const key = `${from}→${to}`;
      const data = transitionData.get(key) ?? { durations: [], count: 0 };
      data.count++;

      const fromTime = new Date(caseEvents[i].timestamp).getTime();
      const toTime = new Date(caseEvents[i + 1].timestamp).getTime();
      data.durations.push(toTime - fromTime);
      transitionData.set(key, data);
    }
  }

  return Array.from(transitionData.entries()).map(([key, data]) => {
    const [from, to] = key.split("→");
    const sorted = [...data.durations].sort((a, b) => a - b);
    return {
      from,
      to,
      frequency: data.count,
      averageDurationMs: Math.round(
        data.durations.reduce((a, b) => a + b, 0) / data.durations.length
      ),
      medianDurationMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    };
  });
}

// ---- Main Entry Point ----

/**
 * Run process mining on innovation pipeline event data.
 *
 * @param events - Array of process events from session data
 * @param config - Mining configuration
 * @returns Full process mining result with map, bottlenecks, and statistics
 */
export function mineProcess(
  events: ProcessEvent[],
  config: ProcessMiningConfig = {}
): ProcessMiningResult {
  if (events.length === 0) {
    return {
      processMap: { nodes: [], edges: [] },
      transitions: [],
      bottlenecks: [],
      conformance: { fitnessScore: 1, deviations: [] },
      statistics: {
        totalCases: 0,
        totalEvents: 0,
        uniqueActivities: 0,
        averageCaseDurationMs: 0,
        medianCaseDurationMs: 0,
      },
      createdAt: new Date().toISOString(),
    };
  }

  const algorithm = config.algorithm ?? "alpha";
  const bottleneckThreshold = config.bottleneckThresholdMs ?? 5000;

  const cases = groupByCase(events);
  const processMap =
    algorithm === "inductive" ? inductiveMine(events, config) : alphaMine(events, config);
  const transitions = analyzeTransitions(cases);
  const bottlenecks = detectBottlenecks(cases, bottleneckThreshold);

  // Case duration statistics
  const caseDurations: number[] = [];
  for (const [, caseEvents] of cases) {
    if (caseEvents.length >= 2) {
      const start = new Date(caseEvents[0].timestamp).getTime();
      const end = new Date(caseEvents[caseEvents.length - 1].timestamp).getTime();
      caseDurations.push(end - start);
    }
  }
  const sortedDurations = [...caseDurations].sort((a, b) => a - b);

  // Conformance: check expected sequence
  const expectedSequence = ["investigation", "generation", "synthesis"];
  const deviations: string[] = [];
  for (const [caseId, caseEvents] of cases) {
    const activities = caseEvents.map((e) => e.activity);
    for (let i = 0; i < expectedSequence.length - 1; i++) {
      const fromIdx = activities.indexOf(expectedSequence[i]);
      const toIdx = activities.indexOf(expectedSequence[i + 1]);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx > toIdx) {
        deviations.push(`Case ${caseId}: ${expectedSequence[i + 1]} before ${expectedSequence[i]}`);
      }
    }
  }
  const fitnessScore = cases.size > 0 ? Math.max(0, 1 - deviations.length / cases.size) : 1;

  return {
    processMap,
    transitions,
    bottlenecks,
    conformance: {
      fitnessScore: Math.round(fitnessScore * 1000) / 1000,
      deviations: deviations.slice(0, 20),
    },
    statistics: {
      totalCases: cases.size,
      totalEvents: events.length,
      uniqueActivities: new Set(events.map((e) => e.activity)).size,
      averageCaseDurationMs:
        caseDurations.length > 0
          ? Math.round(caseDurations.reduce((a, b) => a + b, 0) / caseDurations.length)
          : 0,
      medianCaseDurationMs: sortedDurations[Math.floor(sortedDurations.length / 2)] ?? 0,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convert analytics events (e.g., from the `/api/analytics` endpoint)
 * to process mining events by mapping event types to pipeline stage names.
 * @param analyticsEvents - Raw analytics events with type, timestamp, and optional data.
 * @returns Array of {@link ProcessEvent} records suitable for {@link mineProcess}.
 */
export function analyticsToProcessEvents(
  analyticsEvents: Array<{
    id: string;
    type: string;
    timestamp: string;
    data?: Record<string, unknown>;
  }>
): ProcessEvent[] {
  const stageMap: Record<string, string> = {
    pipeline_started: "start",
    investigation_completed: "investigation",
    angle_generated: "generation",
    synthesis_completed: "synthesis",
    pipeline_completed: "complete",
    pipeline_failed: "error",
    ideas_scored: "scoring",
    artifact_generated: "artifact",
  };

  return analyticsEvents
    .filter((e) => stageMap[e.type])
    .map((e) => ({
      id: e.id,
      caseId: (e.data?.sessionId as string) ?? (e.data?.subject as string) ?? e.id,
      activity: stageMap[e.type],
      timestamp: e.timestamp,
      durationMs: (e.data?.durationMs as number) ?? undefined,
      actor: (e.data?.model as string) ?? undefined,
    }));
}

/**
 * Format process mining results as human-readable markdown.
 * Includes statistics, bottleneck warnings with severity icons, and the process map.
 * @param result - The {@link ProcessMiningResult} to format.
 * @returns A markdown string.
 */
export function processMiningToMarkdown(result: ProcessMiningResult): string {
  const lines: string[] = [
    "# Innovation Process Mining",
    "",
    `**Cases:** ${result.statistics.totalCases}`,
    `**Events:** ${result.statistics.totalEvents}`,
    `**Activities:** ${result.statistics.uniqueActivities}`,
    `**Avg Duration:** ${Math.round(result.statistics.averageCaseDurationMs / 1000)}s`,
    `**Conformance:** ${Math.round(result.conformance.fitnessScore * 100)}%`,
    "",
  ];

  if (result.bottlenecks.length > 0) {
    lines.push("## Bottlenecks", "");
    for (const b of result.bottlenecks) {
      const icon =
        b.severity === "critical"
          ? "🔴"
          : b.severity === "high"
            ? "🟠"
            : b.severity === "medium"
              ? "🟡"
              : "🟢";
      lines.push(
        `${icon} **${b.activity}** — avg wait: ${Math.round(b.averageWaitMs / 1000)}s, affects ${b.casePercentage}% of cases`
      );
      lines.push(`  ${b.recommendation}`);
    }
    lines.push("");
  }

  lines.push("## Process Map", "");
  for (const edge of result.processMap.edges) {
    lines.push(`  ${edge.source} → ${edge.target} (${edge.frequency}x, p=${edge.probability})`);
  }

  return lines.join("\n");
}
