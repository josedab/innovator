/**
 * @module canvas/workshop
 *
 * Workshop mode for structured, facilitated innovation sessions.
 * Provides timed rounds, facilitator controls, phase progression,
 * session replay, and export for collaborative canvas sessions.
 */

import { randomUUID } from "node:crypto";
import type { InnovationCanvas } from "./index.js";

// ---- Types ----

export type WorkshopPhase =
  | "lobby"
  | "brainstorm"
  | "cluster"
  | "vote"
  | "discuss"
  | "prioritize"
  | "completed";

export interface WorkshopConfig {
  /** Duration of each phase in seconds. */
  phaseDurations: Record<WorkshopPhase, number>;
  /** Maximum participants. */
  maxParticipants: number;
  /** Auto-advance to next phase when timer expires. */
  autoAdvance: boolean;
  /** Allow anonymous submissions during brainstorm. */
  anonymousBrainstorm: boolean;
  /** Maximum votes per participant during voting phase. */
  votesPerPerson: number;
  /** Minimum ideas before allowing phase advancement. */
  minIdeasToAdvance: number;
}

export const DEFAULT_WORKSHOP_CONFIG: WorkshopConfig = {
  phaseDurations: {
    lobby: 0, // No timer
    brainstorm: 300, // 5 minutes
    cluster: 180, // 3 minutes
    vote: 120, // 2 minutes
    discuss: 300, // 5 minutes
    prioritize: 180, // 3 minutes
    completed: 0,
  },
  maxParticipants: 20,
  autoAdvance: true,
  anonymousBrainstorm: false,
  votesPerPerson: 5,
  minIdeasToAdvance: 3,
};

export interface WorkshopParticipant {
  userId: string;
  displayName: string;
  role: "facilitator" | "participant" | "observer";
  joinedAt: string;
  connected: boolean;
  votesRemaining: number;
  ideasSubmitted: number;
}

export interface WorkshopTimer {
  phase: WorkshopPhase;
  startedAt: string;
  durationSeconds: number;
  /** Seconds remaining. -1 if no timer. */
  remainingSeconds: number;
  paused: boolean;
  pausedAt?: string;
}

export interface WorkshopEvent {
  id: string;
  type:
    | "phase_changed"
    | "timer_started"
    | "timer_paused"
    | "timer_resumed"
    | "timer_expired"
    | "participant_joined"
    | "participant_left"
    | "idea_submitted"
    | "vote_cast"
    | "facilitator_action"
    | "session_completed";
  userId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WorkshopSession {
  id: string;
  title: string;
  subject: string;
  canvasId: string;
  phase: WorkshopPhase;
  config: WorkshopConfig;
  facilitatorId: string;
  participants: WorkshopParticipant[];
  timer: WorkshopTimer;
  events: WorkshopEvent[];
  phaseHistory: Array<{ phase: WorkshopPhase; startedAt: string; endedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopSummary {
  sessionId: string;
  title: string;
  subject: string;
  totalParticipants: number;
  totalIdeas: number;
  totalVotes: number;
  duration: { totalSeconds: number; perPhase: Record<string, number> };
  topIdeas: Array<{ title: string; votes: number; cluster?: string }>;
  phases: Array<{ phase: string; duration: number; ideaCount: number }>;
}

// ---- Store ----

const workshops = new Map<string, WorkshopSession>();

// ---- Workshop Lifecycle ----

export function createWorkshop(input: {
  title: string;
  subject: string;
  canvasId: string;
  facilitatorId: string;
  facilitatorName: string;
  config?: Partial<WorkshopConfig>;
}): WorkshopSession {
  const config = { ...DEFAULT_WORKSHOP_CONFIG, ...input.config };
  const now = new Date().toISOString();

  const session: WorkshopSession = {
    id: randomUUID(),
    title: input.title,
    subject: input.subject,
    canvasId: input.canvasId,
    phase: "lobby",
    config,
    facilitatorId: input.facilitatorId,
    participants: [
      {
        userId: input.facilitatorId,
        displayName: input.facilitatorName,
        role: "facilitator",
        joinedAt: now,
        connected: true,
        votesRemaining: config.votesPerPerson,
        ideasSubmitted: 0,
      },
    ],
    timer: {
      phase: "lobby",
      startedAt: now,
      durationSeconds: 0,
      remainingSeconds: -1,
      paused: false,
    },
    events: [],
    phaseHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  workshops.set(session.id, session);
  return session;
}

export function getWorkshop(id: string): WorkshopSession | undefined {
  return workshops.get(id);
}

export function joinWorkshop(
  workshopId: string,
  userId: string,
  displayName: string,
  role: "participant" | "observer" = "participant"
): WorkshopParticipant | undefined {
  const ws = workshops.get(workshopId);
  if (!ws) return undefined;

  const existing = ws.participants.find((p) => p.userId === userId);
  if (existing) {
    existing.connected = true;
    return existing;
  }

  if (ws.participants.length >= ws.config.maxParticipants) return undefined;

  const participant: WorkshopParticipant = {
    userId,
    displayName,
    role,
    joinedAt: new Date().toISOString(),
    connected: true,
    votesRemaining: ws.config.votesPerPerson,
    ideasSubmitted: 0,
  };

  ws.participants.push(participant);
  addEvent(ws, "participant_joined", userId, { displayName, role });
  return participant;
}

export function leaveWorkshop(workshopId: string, userId: string): boolean {
  const ws = workshops.get(workshopId);
  if (!ws) return false;

  const p = ws.participants.find((p) => p.userId === userId);
  if (!p) return false;

  p.connected = false;
  addEvent(ws, "participant_left", userId, {});
  return true;
}

// ---- Phase Management ----

const PHASE_ORDER: WorkshopPhase[] = [
  "lobby",
  "brainstorm",
  "cluster",
  "vote",
  "discuss",
  "prioritize",
  "completed",
];

export function advanceWorkshopPhase(
  workshopId: string,
  facilitatorId: string
): WorkshopSession | undefined {
  const ws = workshops.get(workshopId);
  if (!ws || ws.facilitatorId !== facilitatorId) return undefined;
  if (ws.phase === "completed") return undefined;

  const currentIndex = PHASE_ORDER.indexOf(ws.phase);
  const nextPhase = PHASE_ORDER[currentIndex + 1];
  if (!nextPhase) return undefined;

  const now = new Date().toISOString();

  // Record phase history
  ws.phaseHistory.push({
    phase: ws.phase,
    startedAt: ws.timer.startedAt,
    endedAt: now,
  });

  ws.phase = nextPhase;
  const duration = ws.config.phaseDurations[nextPhase] ?? 0;

  ws.timer = {
    phase: nextPhase,
    startedAt: now,
    durationSeconds: duration,
    remainingSeconds: duration > 0 ? duration : -1,
    paused: false,
  };

  ws.updatedAt = now;
  addEvent(ws, "phase_changed", facilitatorId, { phase: nextPhase });

  if (duration > 0) {
    addEvent(ws, "timer_started", facilitatorId, { durationSeconds: duration });
  }

  return ws;
}

export function pauseTimer(workshopId: string, facilitatorId: string): boolean {
  const ws = workshops.get(workshopId);
  if (!ws || ws.facilitatorId !== facilitatorId) return false;
  if (ws.timer.paused || ws.timer.remainingSeconds <= 0) return false;

  const elapsed = (Date.now() - new Date(ws.timer.startedAt).getTime()) / 1000;
  ws.timer.remainingSeconds = Math.max(0, ws.timer.durationSeconds - elapsed);
  ws.timer.paused = true;
  ws.timer.pausedAt = new Date().toISOString();

  addEvent(ws, "timer_paused", facilitatorId, { remaining: ws.timer.remainingSeconds });
  return true;
}

export function resumeTimer(workshopId: string, facilitatorId: string): boolean {
  const ws = workshops.get(workshopId);
  if (!ws || ws.facilitatorId !== facilitatorId) return false;
  if (!ws.timer.paused) return false;

  ws.timer.paused = false;
  ws.timer.startedAt = new Date().toISOString();
  ws.timer.durationSeconds = ws.timer.remainingSeconds;
  ws.timer.pausedAt = undefined;

  addEvent(ws, "timer_resumed", facilitatorId, { remaining: ws.timer.remainingSeconds });
  return true;
}

export function extendTimer(
  workshopId: string,
  facilitatorId: string,
  extraSeconds: number
): boolean {
  const ws = workshops.get(workshopId);
  if (!ws || ws.facilitatorId !== facilitatorId) return false;

  ws.timer.durationSeconds += extraSeconds;
  ws.timer.remainingSeconds += extraSeconds;
  addEvent(ws, "facilitator_action", facilitatorId, { action: "extend_timer", extraSeconds });
  return true;
}

// ---- Workshop Interactions ----

export function submitWorkshopIdea(workshopId: string, userId: string, ideaTitle: string): boolean {
  const ws = workshops.get(workshopId);
  if (!ws || ws.phase !== "brainstorm") return false;

  const participant = ws.participants.find((p) => p.userId === userId);
  if (!participant || participant.role === "observer") return false;

  participant.ideasSubmitted++;
  addEvent(ws, "idea_submitted", userId, { title: ideaTitle });
  return true;
}

export function castWorkshopVote(workshopId: string, userId: string, nodeId: string): boolean {
  const ws = workshops.get(workshopId);
  if (!ws || ws.phase !== "vote") return false;

  const participant = ws.participants.find((p) => p.userId === userId);
  if (!participant || participant.role === "observer") return false;
  if (participant.votesRemaining <= 0) return false;

  participant.votesRemaining--;
  addEvent(ws, "vote_cast", userId, { nodeId });
  return true;
}

// ---- Summary & Export ----

export function generateWorkshopSummary(
  workshopId: string,
  canvas?: InnovationCanvas
): WorkshopSummary | undefined {
  const ws = workshops.get(workshopId);
  if (!ws) return undefined;

  const ideaEvents = ws.events.filter((e) => e.type === "idea_submitted");
  const voteEvents = ws.events.filter((e) => e.type === "vote_cast");

  // Count votes per node
  const votesByNode = new Map<string, number>();
  for (const event of voteEvents) {
    const nodeId = event.data.nodeId as string;
    votesByNode.set(nodeId, (votesByNode.get(nodeId) ?? 0) + 1);
  }

  // Build top ideas from canvas nodes
  const topIdeas: WorkshopSummary["topIdeas"] = [];
  if (canvas) {
    const ideaNodes = canvas.nodes.filter((n) => n.type === "idea");
    for (const node of ideaNodes) {
      topIdeas.push({
        title: node.title,
        votes: votesByNode.get(node.id) ?? 0,
        cluster: canvas.clusters.find((c) => c.nodeIds.includes(node.id))?.label,
      });
    }
    topIdeas.sort((a, b) => b.votes - a.votes);
  }

  // Phase durations
  const perPhase: Record<string, number> = {};
  let totalSeconds = 0;
  for (const ph of ws.phaseHistory) {
    const dur = (new Date(ph.endedAt).getTime() - new Date(ph.startedAt).getTime()) / 1000;
    perPhase[ph.phase] = (perPhase[ph.phase] ?? 0) + dur;
    totalSeconds += dur;
  }

  return {
    sessionId: ws.id,
    title: ws.title,
    subject: ws.subject,
    totalParticipants: ws.participants.length,
    totalIdeas: ideaEvents.length,
    totalVotes: voteEvents.length,
    duration: { totalSeconds, perPhase },
    topIdeas: topIdeas.slice(0, 10),
    phases: ws.phaseHistory.map((ph) => ({
      phase: ph.phase,
      duration: (new Date(ph.endedAt).getTime() - new Date(ph.startedAt).getTime()) / 1000,
      ideaCount: ideaEvents.filter(
        (e) =>
          new Date(e.timestamp) >= new Date(ph.startedAt) &&
          new Date(e.timestamp) <= new Date(ph.endedAt)
      ).length,
    })),
  };
}

export function getWorkshopReplay(workshopId: string): WorkshopEvent[] | undefined {
  const ws = workshops.get(workshopId);
  return ws?.events;
}

// ---- Helpers ----

function addEvent(
  ws: WorkshopSession,
  type: WorkshopEvent["type"],
  userId: string,
  data: Record<string, unknown>
): void {
  ws.events.push({
    id: randomUUID(),
    type,
    userId,
    timestamp: new Date().toISOString(),
    data,
  });
}

// ---- Cleanup ----

export function deleteWorkshop(id: string): boolean {
  return workshops.delete(id);
}

export function clearWorkshops(): void {
  workshops.clear();
}

export function listWorkshops(): WorkshopSession[] {
  return Array.from(workshops.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
