/**
 * @module replay/replay-events
 *
 * Replay event instrumentation — emits structured replay events to the
 * provenance ledger during pipeline execution. Enables deterministic replay
 * with speed control, branch-point detection, and side-by-side scoring overlays.
 */

import { z } from "zod";
import type { RunRecord, TimelineBranch, TimelineSnapshot } from "./index.js";

// ---- Replay Event Schemas ----

export const ReplayEventTypeSchema = z.enum([
  "pipeline.started",
  "pipeline.completed",
  "pipeline.failed",
  "stage.started",
  "stage.completed",
  "stage.failed",
  "branch.created",
  "branch.forked",
  "snapshot.created",
  "replay.started",
  "replay.paused",
  "replay.resumed",
  "replay.completed",
  "decision.point",
]);

export const ReplayEventSchema = z.object({
  id: z.string().max(100),
  type: ReplayEventTypeSchema,
  runId: z.string().max(100),
  sessionId: z.string().max(200),
  timestamp: z.string(),
  stage: z.string().max(100).optional(),
  angleId: z.string().max(100).optional(),
  branchId: z.string().max(100).optional(),
  data: z.record(z.unknown()).optional(),
  metadata: z
    .object({
      model: z.string().max(100).optional(),
      promptHash: z.string().max(64).optional(),
      durationMs: z.number().optional(),
      tokenCount: z.number().optional(),
    })
    .optional(),
});

export const ReplaySpeedSchema = z.enum(["0.25x", "0.5x", "1x", "2x", "4x", "instant"]);

export const ReplaySessionSchema = z.object({
  id: z.string().max(100),
  runId: z.string().max(100),
  status: z.enum(["playing", "paused", "completed", "cancelled"]),
  speed: ReplaySpeedSchema,
  currentEventIndex: z.number().int().min(0),
  totalEvents: z.number().int().min(0),
  startedAt: z.string(),
  branchPoints: z.array(z.number().int().min(0)),
  events: z.array(ReplayEventSchema),
});

export const ScoringOverlaySchema = z.object({
  branchA: z.object({
    runId: z.string(),
    label: z.string(),
    scores: z.record(z.number()),
    totalScore: z.number(),
  }),
  branchB: z.object({
    runId: z.string(),
    label: z.string(),
    scores: z.record(z.number()),
    totalScore: z.number(),
  }),
  dimensions: z.array(z.string()),
  winner: z.string().optional(),
  delta: z.record(z.number()),
});

export type ReplayEventType = z.infer<typeof ReplayEventTypeSchema>;
export type ReplayEvent = z.infer<typeof ReplayEventSchema>;
export type ReplaySpeed = z.infer<typeof ReplaySpeedSchema>;
export type ReplaySession = z.infer<typeof ReplaySessionSchema>;
export type ScoringOverlay = z.infer<typeof ScoringOverlaySchema>;

// ---- Event Emitter ----

const eventLog: ReplayEvent[] = [];
const eventListeners: Array<(event: ReplayEvent) => void> = [];

function generateEventId(): string {
  return `revt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Emit a structured replay event. Notifies all registered listeners
 * and appends to the event log.
 */
export function emitReplayEvent(
  type: ReplayEventType,
  runId: string,
  sessionId: string,
  data?: Record<string, unknown>,
  metadata?: ReplayEvent["metadata"]
): ReplayEvent {
  const event: ReplayEvent = {
    id: generateEventId(),
    type,
    runId,
    sessionId,
    timestamp: new Date().toISOString(),
    data,
    metadata,
  };

  eventLog.push(event);

  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch {
      // Don't let listener errors break the pipeline
    }
  }

  return event;
}

/** Register a listener for replay events. */
export function onReplayEvent(listener: (event: ReplayEvent) => void): () => void {
  eventListeners.push(listener);
  return () => {
    const idx = eventListeners.indexOf(listener);
    if (idx >= 0) eventListeners.splice(idx, 1);
  };
}

/** Get all emitted replay events for a run. */
export function getReplayEvents(runId: string): ReplayEvent[] {
  return eventLog.filter((e) => e.runId === runId);
}

/** Clear all replay events (for testing). */
export function clearReplayEvents(): void {
  eventLog.length = 0;
}

// ---- Deterministic Replay Session ----

const SPEED_MULTIPLIERS: Record<ReplaySpeed, number> = {
  "0.25x": 4,
  "0.5x": 2,
  "1x": 1,
  "2x": 0.5,
  "4x": 0.25,
  instant: 0,
};

/**
 * Create a deterministic replay session from a recorded run's events.
 * Replays events in order with configurable speed control.
 */
export function createReplaySession(runId: string, speed: ReplaySpeed = "1x"): ReplaySession {
  const events = getReplayEvents(runId);

  // Detect branch points — events where branches were created
  const branchPoints: number[] = [];
  events.forEach((event, idx) => {
    if (
      event.type === "decision.point" ||
      event.type === "branch.created" ||
      event.type === "stage.completed"
    ) {
      branchPoints.push(idx);
    }
  });

  return {
    id: `rsess-${Date.now().toString(36)}`,
    runId,
    status: "playing",
    speed,
    currentEventIndex: 0,
    totalEvents: events.length,
    startedAt: new Date().toISOString(),
    branchPoints,
    events,
  };
}

/**
 * Advance a replay session by one event. Returns the next event
 * and the delay (in ms) before the following event should fire.
 */
export function advanceReplaySession(
  session: ReplaySession
): { event: ReplayEvent; delayMs: number; isBranchPoint: boolean } | null {
  if (session.status !== "playing") {
    return null;
  }
  if (session.currentEventIndex >= session.totalEvents) {
    session.status = "completed";
    return null;
  }

  const event = session.events[session.currentEventIndex];
  if (!event) {
    session.status = "completed";
    return null;
  }
  const isBranchPoint = session.branchPoints.includes(session.currentEventIndex);

  // Calculate delay based on original timing and speed multiplier
  let delayMs = 0;
  if (session.currentEventIndex < session.totalEvents - 1) {
    const nextEvent = session.events[session.currentEventIndex + 1];
    if (nextEvent) {
      const currentTime = new Date(event.timestamp).getTime();
      const nextTime = new Date(nextEvent.timestamp).getTime();
      const originalDelay = Math.max(0, nextTime - currentTime);
      delayMs = originalDelay * SPEED_MULTIPLIERS[session.speed];
    }
  }

  session.currentEventIndex++;

  if (session.currentEventIndex >= session.totalEvents) {
    session.status = "completed";
  }

  return { event, delayMs, isBranchPoint };
}

/** Pause a replay session. */
export function pauseReplaySession(session: ReplaySession): void {
  if (session.status === "playing") {
    session.status = "paused";
  }
}

/** Resume a paused replay session. */
export function resumeReplaySession(session: ReplaySession): void {
  if (session.status === "paused") {
    session.status = "playing";
  }
}

/** Change replay speed. */
export function setReplaySpeed(session: ReplaySession, speed: ReplaySpeed): void {
  session.speed = speed;
}

/** Seek to a specific event index. */
export function seekReplaySession(session: ReplaySession, eventIndex: number): void {
  if (eventIndex >= 0 && eventIndex < session.totalEvents) {
    session.currentEventIndex = eventIndex;
    if (session.status === "completed") {
      session.status = "paused";
    }
  }
}

// ---- Scoring Overlay for Branch Comparison ----

/**
 * Build a scoring overlay comparing two branches across multiple dimensions.
 * Used for side-by-side diff views with scoring data.
 */
export function buildScoringOverlay(
  branchA: { runId: string; label: string; scores: Record<string, number> },
  branchB: { runId: string; label: string; scores: Record<string, number> }
): ScoringOverlay {
  const dimensions = [
    ...new Set([...Object.keys(branchA.scores), ...Object.keys(branchB.scores)]),
  ].sort();

  const scoresA: Record<string, number> = {};
  const scoresB: Record<string, number> = {};
  const delta: Record<string, number> = {};

  let totalA = 0;
  let totalB = 0;

  for (const dim of dimensions) {
    const a = branchA.scores[dim] ?? 0;
    const b = branchB.scores[dim] ?? 0;
    scoresA[dim] = a;
    scoresB[dim] = b;
    delta[dim] = Math.round((b - a) * 100) / 100;
    totalA += a;
    totalB += b;
  }

  const totalScoreA =
    dimensions.length > 0 ? Math.round((totalA / dimensions.length) * 100) / 100 : 0;
  const totalScoreB =
    dimensions.length > 0 ? Math.round((totalB / dimensions.length) * 100) / 100 : 0;

  return {
    branchA: {
      runId: branchA.runId,
      label: branchA.label,
      scores: scoresA,
      totalScore: totalScoreA,
    },
    branchB: {
      runId: branchB.runId,
      label: branchB.label,
      scores: scoresB,
      totalScore: totalScoreB,
    },
    dimensions,
    winner:
      totalScoreA > totalScoreB
        ? branchA.runId
        : totalScoreB > totalScoreA
          ? branchB.runId
          : undefined,
    delta,
  };
}

/**
 * Generate a side-by-side diff report for two branches with scoring overlay.
 */
export function scoringOverlayToMarkdown(overlay: ScoringOverlay): string {
  const lines: string[] = [
    "# Branch Comparison — Scoring Overlay",
    "",
    `| Dimension | ${overlay.branchA.label} | ${overlay.branchB.label} | Delta |`,
    `|-----------|${"-".repeat(overlay.branchA.label.length + 2)}|${"-".repeat(overlay.branchB.label.length + 2)}|-------|`,
  ];

  for (const dim of overlay.dimensions) {
    const a = overlay.branchA.scores[dim] ?? 0;
    const b = overlay.branchB.scores[dim] ?? 0;
    const d = overlay.delta[dim] ?? 0;
    const indicator = d > 0 ? "↑" : d < 0 ? "↓" : "=";
    lines.push(
      `| ${dim} | ${a.toFixed(2)} | ${b.toFixed(2)} | ${indicator} ${Math.abs(d).toFixed(2)} |`
    );
  }

  lines.push(
    "",
    `**Overall:** ${overlay.branchA.label}: ${overlay.branchA.totalScore.toFixed(2)} | ${overlay.branchB.label}: ${overlay.branchB.totalScore.toFixed(2)}`,
    overlay.winner
      ? `**Winner:** ${overlay.winner === overlay.branchA.runId ? overlay.branchA.label : overlay.branchB.label}`
      : "**Result:** Tie",
    ""
  );

  return lines.join("\n");
}
