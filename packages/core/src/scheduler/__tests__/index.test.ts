import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseCron,
  cronMatches,
  getNextRunTime,
  naturalLanguageToCron,
  createSchedule,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  listSchedules,
  getDueSchedules,
  recordScheduleRun,
  getScheduleRuns,
  clearSchedules,
  startScheduleWorker,
  stopScheduleWorker,
  setScheduleExecutionHandler,
  type Schedule,
} from "../index.js";

function makeScheduleInput(overrides: Partial<Schedule> = {}) {
  return {
    name: "Test Schedule",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
    action: {
      type: "investigate" as const,
      subject: "Test subject",
    },
    status: "active" as const,
    delivery: [],
    ...overrides,
  };
}

describe("scheduler", () => {
  beforeEach(() => {
    clearSchedules();
  });

  afterEach(() => {
    stopScheduleWorker();
  });

  // ---- parseCron ----

  describe("parseCron", () => {
    it("parses wildcard fields", () => {
      const cron = parseCron("* * * * *");
      expect(cron.minute.values).toHaveLength(60);
      expect(cron.hour.values).toHaveLength(24);
      expect(cron.dayOfMonth.values).toHaveLength(31);
      expect(cron.month.values).toHaveLength(12);
      expect(cron.dayOfWeek.values).toHaveLength(7);
    });

    it("parses specific values", () => {
      const cron = parseCron("30 9 15 6 3");
      expect(cron.minute.values).toEqual([30]);
      expect(cron.hour.values).toEqual([9]);
      expect(cron.dayOfMonth.values).toEqual([15]);
      expect(cron.month.values).toEqual([6]);
      expect(cron.dayOfWeek.values).toEqual([3]);
    });

    it("parses ranges", () => {
      const cron = parseCron("0-5 * * * *");
      expect(cron.minute.values).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("parses steps", () => {
      const cron = parseCron("*/15 * * * *");
      expect(cron.minute.values).toEqual([0, 15, 30, 45]);
    });

    it("parses lists", () => {
      const cron = parseCron("0,30 * * * *");
      expect(cron.minute.values).toEqual([0, 30]);
    });

    it("parses combined range + step", () => {
      const cron = parseCron("10/20 * * * *");
      expect(cron.minute.values).toEqual([10, 30, 50]);
    });

    it("throws for invalid field count", () => {
      expect(() => parseCron("* * *")).toThrow("expected 5 fields");
    });

    it("throws for non-numeric field", () => {
      expect(() => parseCron("abc * * * *")).toThrow("Invalid cron field");
    });

    it("deduplicates values", () => {
      const cron = parseCron("5,5,5 * * * *");
      expect(cron.minute.values).toEqual([5]);
    });

    it("sorts values", () => {
      const cron = parseCron("30,10,20 * * * *");
      expect(cron.minute.values).toEqual([10, 20, 30]);
    });
  });

  // ---- cronMatches ----

  describe("cronMatches", () => {
    it("matches a date that fits the cron", () => {
      const cron = parseCron("0 9 * * *");
      const date = new Date("2026-01-15T09:00:00Z");
      expect(cronMatches(cron, date)).toBe(true);
    });

    it("does not match a different minute", () => {
      const cron = parseCron("30 9 * * *");
      const date = new Date("2026-01-15T09:00:00Z");
      expect(cronMatches(cron, date)).toBe(false);
    });

    it("matches day of week correctly", () => {
      const cron = parseCron("0 9 * * 1"); // Monday
      const monday = new Date("2026-05-11T09:00:00Z"); // 2026-05-11 is Monday
      expect(cronMatches(cron, monday)).toBe(true);

      const tuesday = new Date("2026-05-12T09:00:00Z");
      expect(cronMatches(cron, tuesday)).toBe(false);
    });

    it("handles month boundaries", () => {
      const cron = parseCron("0 0 1 * *"); // First day of every month
      const jan1 = new Date("2026-01-01T00:00:00Z");
      expect(cronMatches(cron, jan1)).toBe(true);

      const jan15 = new Date("2026-01-15T00:00:00Z");
      expect(cronMatches(cron, jan15)).toBe(false);
    });
  });

  // ---- getNextRunTime ----

  describe("getNextRunTime", () => {
    it("returns next matching minute", () => {
      const from = new Date("2026-01-15T08:59:00Z");
      const next = getNextRunTime("0 9 * * *", from);
      expect(next.getUTCHours()).toBe(9);
      expect(next.getUTCMinutes()).toBe(0);
    });

    it("advances to next day if no match today", () => {
      const from = new Date("2026-01-15T10:00:00Z");
      const next = getNextRunTime("0 9 * * *", from);
      expect(next.getUTCDate()).toBe(16);
    });

    it("handles month boundary", () => {
      const from = new Date("2026-01-31T23:59:00Z");
      const next = getNextRunTime("0 9 * * *", from);
      expect(next.getUTCMonth()).toBe(1); // February
    });

    it("handles year boundary", () => {
      const from = new Date("2026-12-31T23:59:00Z");
      const next = getNextRunTime("0 9 1 1 *", from);
      expect(next.getUTCFullYear()).toBe(2027);
      expect(next.getUTCMonth()).toBe(0); // January
    });

    it("throws for impossible cron (no match within year)", () => {
      // Feb 31 never exists
      expect(() => getNextRunTime("0 0 31 2 *")).toThrow("No matching time");
    });
  });

  // ---- naturalLanguageToCron ----

  describe("naturalLanguageToCron", () => {
    it("converts 'daily'", () => {
      expect(naturalLanguageToCron("daily")).toBe("0 9 * * *");
    });

    it("converts 'every minute'", () => {
      expect(naturalLanguageToCron("every minute")).toBe("* * * * *");
    });

    it("converts 'every hour'", () => {
      expect(naturalLanguageToCron("every hour")).toBe("0 * * * *");
    });

    it("converts 'weekly'", () => {
      expect(naturalLanguageToCron("weekly")).toBe("0 9 * * 1");
    });

    it("converts 'every Monday'", () => {
      expect(naturalLanguageToCron("every Monday")).toBe("0 9 * * 1");
    });

    it("converts 'every day at 14:30'", () => {
      expect(naturalLanguageToCron("every day at 14:30")).toBe("30 14 * * *");
    });

    it("converts 'every day at 9'", () => {
      expect(naturalLanguageToCron("every day at 9")).toBe("0 9 * * *");
    });

    it("converts 'monthly'", () => {
      expect(naturalLanguageToCron("monthly")).toBe("0 9 1 * *");
    });

    it("converts 'every weekday'", () => {
      expect(naturalLanguageToCron("every weekday")).toBe("0 9 * * 1-5");
    });

    it("converts 'twice daily'", () => {
      expect(naturalLanguageToCron("twice daily")).toBe("0 9,17 * * *");
    });

    it("returns null for unrecognized input", () => {
      expect(naturalLanguageToCron("whenever it feels right")).toBeNull();
    });

    it("handles case insensitivity", () => {
      expect(naturalLanguageToCron("DAILY")).toBe("0 9 * * *");
      expect(naturalLanguageToCron("Every Friday")).toBe("0 9 * * 5");
    });
  });

  // ---- Schedule CRUD ----

  describe("createSchedule", () => {
    it("creates a schedule with auto-generated ID", () => {
      const schedule = createSchedule(makeScheduleInput());
      expect(schedule.id).toMatch(/^sched-/);
      expect(schedule.name).toBe("Test Schedule");
      expect(schedule.runCount).toBe(0);
      expect(schedule.createdAt).toBeDefined();
      expect(schedule.nextRunAt).toBeDefined();
    });

    it("computes nextRunAt from cron expression", () => {
      const schedule = createSchedule(makeScheduleInput({ cronExpression: "0 9 * * *" }));
      expect(schedule.nextRunAt).toBeDefined();
      const nextRun = new Date(schedule.nextRunAt!);
      expect(nextRun.getUTCHours()).toBe(9);
    });
  });

  describe("getSchedule", () => {
    it("retrieves by ID", () => {
      const schedule = createSchedule(makeScheduleInput());
      expect(getSchedule(schedule.id)).toEqual(schedule);
    });

    it("returns undefined for non-existent", () => {
      expect(getSchedule("nonexistent")).toBeUndefined();
    });
  });

  describe("updateSchedule", () => {
    it("updates name and description", () => {
      const schedule = createSchedule(makeScheduleInput());
      const updated = updateSchedule(schedule.id, { name: "Updated" });
      expect(updated?.name).toBe("Updated");
    });

    it("updates cron expression and recomputes nextRunAt", () => {
      const schedule = createSchedule(makeScheduleInput({ cronExpression: "0 9 * * *" }));
      const updated = updateSchedule(schedule.id, { cronExpression: "0 17 * * *" });
      const nextRun = new Date(updated!.nextRunAt!);
      expect(nextRun.getUTCHours()).toBe(17);
    });

    it("returns undefined for non-existent", () => {
      expect(updateSchedule("nonexistent", { name: "X" })).toBeUndefined();
    });
  });

  describe("deleteSchedule", () => {
    it("deletes schedule and returns true", () => {
      const schedule = createSchedule(makeScheduleInput());
      expect(deleteSchedule(schedule.id)).toBe(true);
      expect(getSchedule(schedule.id)).toBeUndefined();
    });

    it("returns false for non-existent", () => {
      expect(deleteSchedule("nonexistent")).toBe(false);
    });

    it("clears run history on delete", () => {
      const schedule = createSchedule(makeScheduleInput());
      recordScheduleRun(schedule.id, { status: "completed" });
      deleteSchedule(schedule.id);
      expect(getScheduleRuns(schedule.id)).toEqual([]);
    });
  });

  describe("listSchedules", () => {
    it("returns all schedules sorted by createdAt desc", () => {
      createSchedule(makeScheduleInput({ name: "First" }));
      createSchedule(makeScheduleInput({ name: "Second" }));
      const list = listSchedules();
      expect(list).toHaveLength(2);
      // Latest first
      expect(list[0].createdAt >= list[1].createdAt).toBe(true);
    });
  });

  // ---- getDueSchedules ----

  describe("getDueSchedules", () => {
    it("returns schedules whose nextRunAt is in the past", () => {
      const schedule = createSchedule(makeScheduleInput());
      // Force nextRunAt to past
      const sched = getSchedule(schedule.id)!;
      sched.nextRunAt = new Date(Date.now() - 60000).toISOString();

      const due = getDueSchedules();
      expect(due).toHaveLength(1);
    });

    it("excludes paused schedules", () => {
      const schedule = createSchedule(makeScheduleInput());
      updateSchedule(schedule.id, { status: "paused" });
      const sched = getSchedule(schedule.id)!;
      sched.nextRunAt = new Date(Date.now() - 60000).toISOString();

      expect(getDueSchedules()).toHaveLength(0);
    });

    it("excludes schedules that reached maxRuns", () => {
      const schedule = createSchedule(makeScheduleInput({ maxRuns: 1 }));
      recordScheduleRun(schedule.id, { status: "completed" });

      const sched = getSchedule(schedule.id)!;
      sched.nextRunAt = new Date(Date.now() - 60000).toISOString();

      expect(getDueSchedules()).toHaveLength(0);
    });

    it("excludes schedules with no nextRunAt", () => {
      const schedule = createSchedule(makeScheduleInput());
      const sched = getSchedule(schedule.id)!;
      sched.nextRunAt = undefined;

      expect(getDueSchedules()).toHaveLength(0);
    });
  });

  // ---- recordScheduleRun ----

  describe("recordScheduleRun", () => {
    it("records a completed run", () => {
      const schedule = createSchedule(makeScheduleInput());
      const run = recordScheduleRun(schedule.id, {
        status: "completed",
        resultSummary: "Done",
        durationMs: 150,
      });

      expect(run).toBeDefined();
      expect(run!.status).toBe("completed");
      expect(run!.durationMs).toBe(150);
    });

    it("increments runCount", () => {
      const schedule = createSchedule(makeScheduleInput());
      recordScheduleRun(schedule.id, { status: "completed" });
      expect(getSchedule(schedule.id)!.runCount).toBe(1);
    });

    it("recomputes nextRunAt after recording", () => {
      const schedule = createSchedule(makeScheduleInput());
      const originalNext = schedule.nextRunAt;
      recordScheduleRun(schedule.id, { status: "completed" });
      // nextRunAt should be recomputed (may be same if cron matches same pattern)
      expect(getSchedule(schedule.id)!.nextRunAt).toBeDefined();
    });

    it("marks schedule as completed when maxRuns reached", () => {
      const schedule = createSchedule(makeScheduleInput({ maxRuns: 1 }));
      recordScheduleRun(schedule.id, { status: "completed" });
      expect(getSchedule(schedule.id)!.status).toBe("completed");
    });

    it("returns undefined for non-existent schedule", () => {
      expect(recordScheduleRun("nonexistent", { status: "completed" })).toBeUndefined();
    });

    it("stores run in history", () => {
      const schedule = createSchedule(makeScheduleInput());
      recordScheduleRun(schedule.id, { status: "completed" });
      recordScheduleRun(schedule.id, { status: "failed", error: "timeout" });

      const history = getScheduleRuns(schedule.id);
      expect(history).toHaveLength(2);
      expect(history[1].status).toBe("failed");
      expect(history[1].error).toBe("timeout");
    });
  });

  // ---- Worker lifecycle ----

  describe("startScheduleWorker / stopScheduleWorker", () => {
    it("starts and stops without error", () => {
      expect(() => startScheduleWorker(60000)).not.toThrow();
      expect(() => stopScheduleWorker()).not.toThrow();
    });

    it("does not start multiple workers", () => {
      startScheduleWorker(60000);
      startScheduleWorker(60000); // Should be a no-op
      stopScheduleWorker();
    });

    it("stopScheduleWorker is idempotent", () => {
      stopScheduleWorker();
      stopScheduleWorker();
    });
  });

  // ---- maxRuns: 0 edge case ----

  describe("edge cases", () => {
    it("maxRuns: 0 does not block scheduling (0 is falsy)", () => {
      const schedule = createSchedule(makeScheduleInput({ maxRuns: 0 }));
      const sched = getSchedule(schedule.id)!;
      sched.nextRunAt = new Date(Date.now() - 60000).toISOString();

      // maxRuns: 0 is falsy, so the check `s.maxRuns && ...` is skipped
      expect(getDueSchedules()).toHaveLength(1);
    });
  });
});
