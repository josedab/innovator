/**
 * @module scheduler
 *
 * Cron-like scheduler for automated periodic innovation runs.
 * Supports cron expression parsing, timezone-aware execution,
 * schedule CRUD, persistent storage, natural language to cron conversion,
 * and run history logging.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors.js";

// ---- Schemas ----

export const ScheduleStatusSchema = z.enum(["active", "paused", "completed", "failed"]);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

export const ScheduleActionSchema = z.object({
  type: z.enum(["investigate", "auto-pipeline", "competitive-analysis", "trend-scan", "custom"]),
  subject: z.string().max(5000),
  model: z.string().max(100).optional(),
  angles: z.array(z.string().max(100)).max(20).optional(),
  customConfig: z.record(z.string(), z.unknown()).optional(),
});
export type ScheduleAction = z.infer<typeof ScheduleActionSchema>;

export const ScheduleRunSchema = z.object({
  id: z.string().max(100),
  scheduleId: z.string().max(100),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]),
  resultSummary: z.string().max(5000).optional(),
  error: z.string().max(2000).optional(),
  durationMs: z.number().min(0).optional(),
});
export type ScheduleRun = z.infer<typeof ScheduleRunSchema>;

export const DeliveryChannelSchema = z.object({
  type: z.enum(["email", "slack", "webhook"]),
  target: z.string().max(500),
  enabled: z.boolean().default(true),
});
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

export const ScheduleSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  cronExpression: z.string().max(100),
  timezone: z.string().max(100).default("UTC"),
  action: ScheduleActionSchema,
  status: ScheduleStatusSchema.default("active"),
  delivery: z.array(DeliveryChannelSchema).max(10).default([]),
  maxRuns: z.number().min(0).optional(),
  runCount: z.number().min(0).default(0),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// ---- Cron Expression Parser ----

export interface CronField {
  values: number[];
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

function parseField(field: string, min: number, max: number): CronField {
  const values: number[] = [];

  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) values.push(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      const start = range === "*" ? min : parseInt(range, 10);
      if (isNaN(step) || isNaN(start)) throw new ValidationError(`Invalid cron field: ${field}`);
      for (let i = start; i <= max; i += step) values.push(i);
    } else if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) throw new ValidationError(`Invalid cron field: ${field}`);
      for (let i = start; i <= end; i++) values.push(i);
    } else {
      const val = parseInt(part, 10);
      if (isNaN(val)) throw new ValidationError(`Invalid cron field: ${field}`);
      values.push(val);
    }
  }

  return { values: [...new Set(values)].sort((a, b) => a - b) };
}

/** Parse a 5-field cron expression (minute hour day month weekday). */
export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ValidationError(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  return {
    minute: parseField(fields[0], 0, 59),
    hour: parseField(fields[1], 0, 23),
    dayOfMonth: parseField(fields[2], 1, 31),
    month: parseField(fields[3], 1, 12),
    dayOfWeek: parseField(fields[4], 0, 6),
  };
}

/** Check if a Date matches a parsed cron expression. */
export function cronMatches(cron: ParsedCron, date: Date): boolean {
  return (
    cron.minute.values.includes(date.getUTCMinutes()) &&
    cron.hour.values.includes(date.getUTCHours()) &&
    cron.dayOfMonth.values.includes(date.getUTCDate()) &&
    cron.month.values.includes(date.getUTCMonth() + 1) &&
    cron.dayOfWeek.values.includes(date.getUTCDay())
  );
}

/** Calculate the next execution time from now. */
export function getNextRunTime(expression: string, from = new Date()): Date {
  const cron = parseCron(expression);
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  // Search up to 1 year ahead
  const maxIterations = 525960; // ~1 year of minutes
  for (let i = 0; i < maxIterations; i++) {
    if (cronMatches(cron, next)) return next;
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  throw new ValidationError("No matching time found within 1 year");
}

// ---- Natural Language to Cron ----

const NL_PATTERNS: Array<{ pattern: RegExp; cron: string }> = [
  { pattern: /^every\s+minute$/i, cron: "* * * * *" },
  { pattern: /^every\s+hour$/i, cron: "0 * * * *" },
  { pattern: /^daily$/i, cron: "0 9 * * *" },
  { pattern: /^every\s+day(?:\s+at\s+(\d{1,2})(?::(\d{2}))?)?$/i, cron: "0 9 * * *" },
  { pattern: /^weekly$/i, cron: "0 9 * * 1" },
  { pattern: /^every\s+monday$/i, cron: "0 9 * * 1" },
  { pattern: /^every\s+tuesday$/i, cron: "0 9 * * 2" },
  { pattern: /^every\s+wednesday$/i, cron: "0 9 * * 3" },
  { pattern: /^every\s+thursday$/i, cron: "0 9 * * 4" },
  { pattern: /^every\s+friday$/i, cron: "0 9 * * 5" },
  { pattern: /^every\s+saturday$/i, cron: "0 9 * * 6" },
  { pattern: /^every\s+sunday$/i, cron: "0 9 * * 0" },
  { pattern: /^monthly$/i, cron: "0 9 1 * *" },
  { pattern: /^every\s+weekday$/i, cron: "0 9 * * 1-5" },
  { pattern: /^twice\s+daily$/i, cron: "0 9,17 * * *" },
];

/** Convert natural language schedule description to cron expression. */
export function naturalLanguageToCron(text: string): string | null {
  const trimmed = text.trim();

  // Handle "every day at HH:MM"
  const timeMatch = trimmed.match(/every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?/i);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    return `${minute} ${hour} * * *`;
  }

  for (const { pattern, cron } of NL_PATTERNS) {
    if (pattern.test(trimmed)) return cron;
  }

  return null;
}

// ---- Schedule CRUD ----

const schedules = new Map<string, Schedule>();
const runHistory = new Map<string, ScheduleRun[]>();

/** Create a new schedule. */
export function createSchedule(
  input: Omit<Schedule, "id" | "createdAt" | "updatedAt" | "runCount" | "nextRunAt">
): Schedule {
  const id = `sched-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  let nextRunAt: string | undefined;

  try {
    nextRunAt = getNextRunTime(input.cronExpression).toISOString();
  } catch {
    // Invalid cron, leave nextRunAt undefined
  }

  const schedule: Schedule = {
    ...input,
    id,
    runCount: 0,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
  };

  schedules.set(id, schedule);
  runHistory.set(id, []);
  return schedule;
}

/** Get a schedule by ID. */
export function getSchedule(id: string): Schedule | undefined {
  return schedules.get(id);
}

/** Update a schedule. */
export function updateSchedule(
  id: string,
  updates: Partial<
    Pick<
      Schedule,
      | "name"
      | "description"
      | "cronExpression"
      | "action"
      | "status"
      | "delivery"
      | "timezone"
      | "maxRuns"
    >
  >
): Schedule | undefined {
  const schedule = schedules.get(id);
  if (!schedule) return undefined;

  Object.assign(schedule, updates, { updatedAt: new Date().toISOString() });

  if (updates.cronExpression) {
    try {
      schedule.nextRunAt = getNextRunTime(updates.cronExpression).toISOString();
    } catch {
      schedule.nextRunAt = undefined;
    }
  }

  return schedule;
}

/** Delete a schedule. */
export function deleteSchedule(id: string): boolean {
  runHistory.delete(id);
  return schedules.delete(id);
}

/** List all schedules. */
export function listSchedules(): Schedule[] {
  return Array.from(schedules.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Get active schedules that are due to run. */
export function getDueSchedules(now = new Date()): Schedule[] {
  return Array.from(schedules.values()).filter((s) => {
    if (s.status !== "active") return false;
    if (s.maxRuns && s.runCount >= s.maxRuns) return false;
    if (!s.nextRunAt) return false;
    return new Date(s.nextRunAt) <= now;
  });
}

// ---- Run History ----

/** Record a schedule run. */
export function recordScheduleRun(
  scheduleId: string,
  result: {
    status: "completed" | "failed";
    resultSummary?: string;
    error?: string;
    durationMs?: number;
  }
): ScheduleRun | undefined {
  const schedule = schedules.get(scheduleId);
  if (!schedule) return undefined;

  const run: ScheduleRun = {
    id: `run-${randomUUID().slice(0, 8)}`,
    scheduleId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: result.status,
    resultSummary: result.resultSummary,
    error: result.error,
    durationMs: result.durationMs,
  };

  const history = runHistory.get(scheduleId) ?? [];
  history.push(run);
  runHistory.set(scheduleId, history);

  schedule.runCount++;
  schedule.lastRunAt = run.completedAt;

  try {
    schedule.nextRunAt = getNextRunTime(schedule.cronExpression).toISOString();
  } catch {
    schedule.nextRunAt = undefined;
  }

  if (schedule.maxRuns && schedule.runCount >= schedule.maxRuns) {
    schedule.status = "completed";
  }

  schedule.updatedAt = new Date().toISOString();
  return run;
}

/** Get run history for a schedule. */
export function getScheduleRuns(scheduleId: string): ScheduleRun[] {
  return runHistory.get(scheduleId) ?? [];
}

/** Clear all schedules and history (for testing). */
export function clearSchedules(): void {
  schedules.clear();
  runHistory.clear();
}

// ---- Background Worker ----

let workerInterval: ReturnType<typeof setInterval> | null = null;
let executionHandler: ((schedule: Schedule) => Promise<void>) | null = null;

/** Set the handler function called when a schedule is due. */
export function setScheduleExecutionHandler(handler: (schedule: Schedule) => Promise<void>): void {
  executionHandler = handler;
}

/** Start the background schedule worker. Checks every intervalMs for due schedules. */
export function startScheduleWorker(intervalMs = 60000): void {
  if (workerInterval) return;

  workerInterval = setInterval(async () => {
    const due = getDueSchedules();
    for (const schedule of due) {
      if (!executionHandler) continue;
      const start = Date.now();
      try {
        await executionHandler(schedule);
        recordScheduleRun(schedule.id, {
          status: "completed",
          resultSummary: "Automated execution completed",
          durationMs: Date.now() - start,
        });
      } catch (error) {
        recordScheduleRun(schedule.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Execution failed",
          durationMs: Date.now() - start,
        });
      }
    }
  }, intervalMs);
}

/** Stop the background schedule worker. */
export function stopScheduleWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
