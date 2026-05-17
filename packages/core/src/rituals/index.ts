/**
 * @module rituals
 *
 * Team Innovation Rituals — scheduled, recurring innovation sessions.
 * Defines ritual types with cadence, subject backlog, angle rotation,
 * and participant assignment. Supports digest generation, notifications,
 * and participation tracking.
 */

import { z } from "zod";

// ---- Schemas ----

export const CadenceSchema = z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly"]);

export const ParticipantSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  email: z.string().max(300).optional(),
  role: z.enum(["facilitator", "participant", "observer"]),
  sessionsAttended: z.number().default(0),
  ideasContributed: z.number().default(0),
});

export const SubjectBacklogItemSchema = z.object({
  id: z.string().max(100),
  subject: z.string().max(500),
  priority: z.enum(["low", "medium", "high"]),
  addedBy: z.string().max(200),
  addedAt: z.string(),
  completed: z.boolean().default(false),
});

export const RitualExecutionSchema = z.object({
  id: z.string().max(100),
  ritualId: z.string().max(100),
  executedAt: z.string(),
  subject: z.string().max(500),
  anglesUsed: z.array(z.string().max(100)),
  participantIds: z.array(z.string().max(100)),
  ideaCount: z.number(),
  topIdeas: z.array(z.string().max(500)).max(10),
  duration: z.number().optional().describe("Duration in minutes"),
});

export const RitualDigestSchema = z.object({
  ritualId: z.string().max(100),
  period: z.string().max(200),
  totalSessions: z.number(),
  totalIdeas: z.number(),
  topIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        session: z.string().max(200),
      })
    )
    .max(20),
  participationStats: z
    .array(
      z.object({
        participantName: z.string().max(200),
        sessions: z.number(),
        ideas: z.number(),
      })
    )
    .max(50),
  trends: z.array(z.string().max(500)).max(10),
  nextSubject: z.string().max(500).optional(),
});

export const InnovationRitualSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  description: z.string().max(2000),
  cadence: CadenceSchema,
  participants: z.array(ParticipantSchema).max(50),
  subjectBacklog: z.array(SubjectBacklogItemSchema).max(100),
  angleRotation: z.array(z.string().max(100)),
  currentAngleIndex: z.number().default(0),
  executions: z.array(RitualExecutionSchema).max(200),
  createdAt: z.string(),
  lastExecutedAt: z.string().optional(),
  enabled: z.boolean().default(true),
  notificationChannels: z
    .array(
      z.object({
        type: z.enum(["email", "slack", "webhook"]),
        target: z.string().max(500),
      })
    )
    .max(10),
});

export type Cadence = z.infer<typeof CadenceSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type SubjectBacklogItem = z.infer<typeof SubjectBacklogItemSchema>;
export type RitualExecution = z.infer<typeof RitualExecutionSchema>;
export type RitualDigest = z.infer<typeof RitualDigestSchema>;
export type InnovationRitual = z.infer<typeof InnovationRitualSchema>;

// ---- In-Memory Store ----

const rituals = new Map<string, InnovationRitual>();

// ---- CRUD ----

let ritualIdCounter = 0;

/**
 * Create a new innovation ritual.
 */
export function createRitual(config: {
  name: string;
  description: string;
  cadence: Cadence;
  participants?: Participant[];
  angleRotation?: string[];
  notificationChannels?: InnovationRitual["notificationChannels"];
}): InnovationRitual {
  const id = `ritual-${++ritualIdCounter}-${Date.now().toString(36)}`;
  const ritual: InnovationRitual = {
    id,
    name: config.name,
    description: config.description,
    cadence: config.cadence,
    participants: config.participants ?? [],
    subjectBacklog: [],
    angleRotation: config.angleRotation ?? [
      "scamper",
      "first-principles",
      "cross-domain",
      "constraints",
      "inversion",
      "perspectives",
      "what-if",
      "trend-collision",
    ],
    currentAngleIndex: 0,
    executions: [],
    createdAt: new Date().toISOString(),
    enabled: true,
    notificationChannels: config.notificationChannels ?? [],
  };

  rituals.set(id, ritual);
  return ritual;
}

/** Get a ritual by ID. */
export function getRitual(id: string): InnovationRitual | undefined {
  return rituals.get(id);
}

/** List all rituals. */
export function listRituals(): InnovationRitual[] {
  return Array.from(rituals.values());
}

/** Delete a ritual. */
export function deleteRitual(id: string): boolean {
  return rituals.delete(id);
}

/** Update ritual enabled status. */
export function setRitualEnabled(id: string, enabled: boolean): boolean {
  const ritual = rituals.get(id);
  if (!ritual) return false;
  ritual.enabled = enabled;
  return true;
}

// ---- Participant Management ----

/** Add a participant to a ritual. */
export function addParticipant(ritualId: string, participant: Participant): boolean {
  const ritual = rituals.get(ritualId);
  if (!ritual) return false;
  if (ritual.participants.find((p) => p.id === participant.id)) return false;
  ritual.participants.push(participant);
  return true;
}

/** Remove a participant from a ritual. */
export function removeParticipant(ritualId: string, participantId: string): boolean {
  const ritual = rituals.get(ritualId);
  if (!ritual) return false;
  const idx = ritual.participants.findIndex((p) => p.id === participantId);
  if (idx === -1) return false;
  ritual.participants.splice(idx, 1);
  return true;
}

// ---- Backlog Management ----

/** Add a subject to the ritual's backlog. */
export function addBacklogItem(
  ritualId: string,
  subject: string,
  priority: "low" | "medium" | "high",
  addedBy: string
): boolean {
  const ritual = rituals.get(ritualId);
  if (!ritual) return false;
  ritual.subjectBacklog.push({
    id: `bl-${Date.now().toString(36)}`,
    subject,
    priority,
    addedBy,
    addedAt: new Date().toISOString(),
    completed: false,
  });
  return true;
}

/** Get the next subject from the backlog (highest priority first). */
export function getNextBacklogSubject(ritualId: string): SubjectBacklogItem | undefined {
  const ritual = rituals.get(ritualId);
  if (!ritual) return undefined;
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  return ritual.subjectBacklog
    .filter((i) => !i.completed)
    .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])[0];
}

// ---- Execution ----

/**
 * Record a ritual execution.
 */
export function recordExecution(
  ritualId: string,
  execution: Omit<RitualExecution, "id" | "ritualId" | "executedAt">
): RitualExecution | null {
  const ritual = rituals.get(ritualId);
  if (!ritual) return null;

  const exec: RitualExecution = {
    ...execution,
    id: `exec-${Date.now().toString(36)}`,
    ritualId,
    executedAt: new Date().toISOString(),
  };

  ritual.executions.push(exec);
  ritual.lastExecutedAt = exec.executedAt;

  // Rotate angles
  ritual.currentAngleIndex = (ritual.currentAngleIndex + 1) % ritual.angleRotation.length;

  // Update participant stats
  for (const pid of execution.participantIds) {
    const participant = ritual.participants.find((p) => p.id === pid);
    if (participant) {
      participant.sessionsAttended++;
    }
  }

  // Mark backlog item as completed if matching
  const backlogItem = ritual.subjectBacklog.find((i) => i.subject === execution.subject);
  if (backlogItem) backlogItem.completed = true;

  return exec;
}

/**
 * Get the next angles for a ritual (based on rotation).
 */
export function getNextAngles(ritualId: string, count: number = 3): string[] {
  const ritual = rituals.get(ritualId);
  if (!ritual) return [];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (ritual.currentAngleIndex + i) % ritual.angleRotation.length;
    result.push(ritual.angleRotation[idx]);
  }
  return result;
}

/**
 * Check if a ritual is due for execution based on its cadence.
 */
export function isRitualDue(ritualId: string): boolean {
  const ritual = rituals.get(ritualId);
  if (!ritual || !ritual.enabled) return false;
  if (!ritual.lastExecutedAt) return true;

  const now = Date.now();
  const lastExec = new Date(ritual.lastExecutedAt).getTime();
  const intervals: Record<Cadence, number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    biweekly: 14 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
    quarterly: 90 * 24 * 60 * 60 * 1000,
  };

  return now - lastExec >= intervals[ritual.cadence];
}

/**
 * Get all rituals that are due for execution.
 */
export function getDueRituals(): InnovationRitual[] {
  return listRituals().filter((r) => isRitualDue(r.id));
}

// ---- Digest ----

/**
 * Compile a digest for a ritual covering recent executions.
 */
export function compileDigest(ritualId: string, periodDays: number = 30): RitualDigest | null {
  const ritual = rituals.get(ritualId);
  if (!ritual) return null;

  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
  const recentExecs = ritual.executions.filter((e) => e.executedAt >= cutoff);

  const topIdeas = recentExecs
    .flatMap((e) => e.topIdeas.map((title) => ({ title, session: e.subject })))
    .slice(0, 20);

  // Participation stats
  const participantMap = new Map<string, { sessions: number; ideas: number }>();
  for (const exec of recentExecs) {
    for (const pid of exec.participantIds) {
      const stats = participantMap.get(pid) ?? { sessions: 0, ideas: 0 };
      stats.sessions++;
      participantMap.set(pid, stats);
    }
  }

  const participationStats = ritual.participants
    .filter((p) => participantMap.has(p.id))
    .map((p) => ({
      participantName: p.name,
      sessions: participantMap.get(p.id)!.sessions,
      ideas: p.ideasContributed,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // Trends
  const trends: string[] = [];
  if (recentExecs.length > 1) {
    const avgIdeas = recentExecs.reduce((s, e) => s + e.ideaCount, 0) / recentExecs.length;
    trends.push(`Average of ${avgIdeas.toFixed(1)} ideas per session`);
  }

  const nextSubject = getNextBacklogSubject(ritualId);

  return {
    ritualId,
    period: `${periodDays} days`,
    totalSessions: recentExecs.length,
    totalIdeas: recentExecs.reduce((s, e) => s + e.ideaCount, 0),
    topIdeas,
    participationStats,
    trends,
    nextSubject: nextSubject?.subject,
  };
}

/** Clear all rituals (for testing). */
export function clearRituals(): void {
  rituals.clear();
  ritualIdCounter = 0;
}
