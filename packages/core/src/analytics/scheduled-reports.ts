/**
 * @module analytics/scheduled-reports
 *
 * Persistent scheduled analytics report generation with on-demand
 * rendering for executive, team, and individual dashboard views.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { generateSummary, readEvents } from "./analytics.js";
import { computeKPIs, kpiDashboardToMarkdown } from "./kpi-dashboard.js";
import {
  analyzeTeamPatterns,
  computeVelocityTrend,
  generateAngleHeatmap,
  velocityTrendToMarkdown,
} from "./velocity-heatmap.js";
import { ValidationError } from "../errors.js";

const ANALYTICS_DIR = join(homedir(), ".innovator", "analytics");
const REPORT_SCHEDULES_FILE = join(ANALYTICS_DIR, "report-schedules.json");
const GENERATED_REPORTS_FILE = join(ANALYTICS_DIR, "generated-reports.json");

export const ReportScheduleSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().email()).max(50),
  reportType: z.enum(["executive", "team", "individual"]),
  format: z.enum(["markdown", "json"]),
  lastGeneratedAt: z.string().optional(),
  nextRunAt: z.string(),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
});
export type ReportSchedule = z.infer<typeof ReportScheduleSchema>;

export const GeneratedReportSchema = z.object({
  id: z.string().max(200),
  scheduleId: z.string().max(200),
  reportType: z.string().max(100),
  content: z.string(),
  format: z.enum(["markdown", "json"]),
  generatedAt: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
});
export type GeneratedReport = z.infer<typeof GeneratedReportSchema>;

export const ReportScheduleInputSchema = ReportScheduleSchema.omit({
  id: true,
  createdAt: true,
  lastGeneratedAt: true,
}).extend({
  nextRunAt: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type ReportScheduleInput = z.infer<typeof ReportScheduleInputSchema>;

function ensureDir(): void {
  if (!existsSync(ANALYTICS_DIR)) mkdirSync(ANALYTICS_DIR, { recursive: true });
}

function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

function loadSchedules(): ReportSchedule[] {
  ensureDir();
  if (!existsSync(REPORT_SCHEDULES_FILE)) return [];

  try {
    return z
      .array(ReportScheduleSchema)
      .parse(JSON.parse(readFileSync(REPORT_SCHEDULES_FILE, "utf-8")));
  } catch {
    return [];
  }
}

function saveSchedules(schedules: ReportSchedule[]): void {
  ensureDir();
  atomicWriteFileSync(REPORT_SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

function loadGeneratedReports(): GeneratedReport[] {
  ensureDir();
  if (!existsSync(GENERATED_REPORTS_FILE)) return [];

  try {
    return z
      .array(GeneratedReportSchema)
      .parse(JSON.parse(readFileSync(GENERATED_REPORTS_FILE, "utf-8")));
  } catch {
    return [];
  }
}

function saveGeneratedReports(reports: GeneratedReport[]): void {
  ensureDir();
  atomicWriteFileSync(GENERATED_REPORTS_FILE, JSON.stringify(reports, null, 2));
}

function getNextRunAt(frequency: ReportSchedule["frequency"], from = new Date()): string {
  const next = new Date(from);
  switch (frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next.toISOString();
}

function getReportPeriod(frequency: ReportSchedule["frequency"], now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);

  switch (frequency) {
    case "daily":
      start.setUTCDate(start.getUTCDate() - 1);
      break;
    case "weekly":
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case "monthly":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

function renderHeatmapSection(cells: ReturnType<typeof generateAngleHeatmap>["cells"]): string {
  if (cells.length === 0) return "No angle effectiveness data available.";

  return [
    "## Angle Effectiveness Heatmap",
    "",
    "| Angle | Domain | Effectiveness | Sample Size | Avg Quality |",
    "|-------|--------|---------------|-------------|-------------|",
    ...cells
      .slice(0, 10)
      .map(
        (cell) =>
          `| ${cell.angleId} | ${cell.domain} | ${cell.effectivenessScore.toFixed(2)} | ${cell.sampleSize} | ${cell.avgIdeaQuality.toFixed(2)} |`
      ),
  ].join("\n");
}

function renderTeamPatternsSection(patterns: ReturnType<typeof analyzeTeamPatterns>): string {
  if (patterns.length === 0) return "No team pattern data available.";

  return [
    "## Team Innovation Patterns",
    "",
    ...patterns
      .slice(0, 10)
      .map(
        (pattern) =>
          `- **${pattern.displayName}** — ${pattern.totalIdeas} ideas, ${pattern.sessionsCount} sessions, avg quality ${pattern.avgQualityScore.toFixed(2)}, favorite angles: ${pattern.favoriteAngles.join(", ") || "n/a"}`
      ),
  ].join("\n");
}

function buildReportPayload(schedule: ReportSchedule, period: { start: string; end: string }) {
  const allEvents = readEvents();
  const periodEvents = allEvents.filter(
    (event) => event.timestamp >= period.start && event.timestamp <= period.end
  );
  const summary = generateSummary(periodEvents);
  const kpis = computeKPIs(allEvents, period);
  const velocity = computeVelocityTrend(
    periodEvents,
    schedule.frequency === "daily"
      ? "daily"
      : schedule.frequency === "weekly"
        ? "weekly"
        : "monthly"
  );
  const heatmap = generateAngleHeatmap(periodEvents);
  const patterns = analyzeTeamPatterns(periodEvents);

  return { summary, kpis, velocity, heatmap, patterns };
}

function executiveMarkdown(
  schedule: ReportSchedule,
  payload: ReturnType<typeof buildReportPayload>,
  period: { start: string; end: string }
): string {
  return [
    `# ${schedule.name}`,
    "",
    `**Report Type:** Executive`,
    `**Period:** ${period.start} → ${period.end}`,
    "",
    "## Executive Summary",
    "",
    `- Sessions: ${payload.summary.totalPipelines}`,
    `- Ideas Generated: ${payload.summary.totalIdeas}`,
    `- Success Rate: ${Math.round(payload.summary.successRate * 100)}%`,
    `- Average Duration: ${payload.summary.averageDurationMs}ms`,
    "",
    kpiDashboardToMarkdown(payload.kpis),
    "",
    velocityTrendToMarkdown(payload.velocity),
    "",
    renderHeatmapSection(payload.heatmap.cells),
  ].join("\n");
}

function teamMarkdown(
  schedule: ReportSchedule,
  payload: ReturnType<typeof buildReportPayload>,
  period: { start: string; end: string }
): string {
  return [
    `# ${schedule.name}`,
    "",
    `**Report Type:** Team`,
    `**Period:** ${period.start} → ${period.end}`,
    "",
    kpiDashboardToMarkdown(payload.kpis),
    "",
    velocityTrendToMarkdown(payload.velocity),
    "",
    renderHeatmapSection(payload.heatmap.cells),
    "",
    renderTeamPatternsSection(payload.patterns),
  ].join("\n");
}

function individualMarkdown(
  schedule: ReportSchedule,
  payload: ReturnType<typeof buildReportPayload>,
  period: { start: string; end: string }
): string {
  return [
    `# ${schedule.name}`,
    "",
    `**Report Type:** Individual`,
    `**Period:** ${period.start} → ${period.end}`,
    "",
    renderTeamPatternsSection(payload.patterns),
    "",
    velocityTrendToMarkdown(payload.velocity),
  ].join("\n");
}

/** Create a persisted report schedule. */
export function createReportSchedule(input: ReportScheduleInput): ReportSchedule {
  const parsed = ReportScheduleInputSchema.parse(input);
  const now = new Date().toISOString();
  const schedule = ReportScheduleSchema.parse({
    ...parsed,
    id: `report-schedule-${randomUUID().slice(0, 12)}`,
    nextRunAt: parsed.nextRunAt ?? getNextRunAt(parsed.frequency),
    enabled: parsed.enabled ?? true,
    createdAt: now,
  });

  const schedules = loadSchedules();
  schedules.push(schedule);
  saveSchedules(schedules);
  return schedule;
}

/** Get a report schedule by ID. */
export function getReportSchedule(id: string): ReportSchedule | undefined {
  return loadSchedules().find((schedule) => schedule.id === id);
}

/** List all persisted report schedules. */
export function listReportSchedules(): ReportSchedule[] {
  return loadSchedules().sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
}

/** Delete a report schedule by ID. */
export function deleteReportSchedule(id: string): boolean {
  const schedules = loadSchedules();
  const filtered = schedules.filter((schedule) => schedule.id !== id);
  if (filtered.length === schedules.length) return false;

  saveSchedules(filtered);
  saveGeneratedReports(loadGeneratedReports().filter((report) => report.scheduleId !== id));
  return true;
}

/** Generate a scheduled report on demand and advance the schedule. */
export function generateScheduledReport(scheduleId: string): GeneratedReport {
  const schedules = loadSchedules();
  const index = schedules.findIndex((schedule) => schedule.id === scheduleId);
  if (index === -1) {
    throw new ValidationError(`Report schedule not found: ${scheduleId}`);
  }

  const schedule = schedules[index];
  const now = new Date();
  const generatedAt = now.toISOString();
  const period = getReportPeriod(schedule.frequency, now);
  const payload = buildReportPayload(schedule, period);

  const content =
    schedule.format === "json"
      ? JSON.stringify(
          {
            schedule: {
              id: schedule.id,
              name: schedule.name,
              reportType: schedule.reportType,
            },
            period,
            ...payload,
          },
          null,
          2
        )
      : schedule.reportType === "executive"
        ? executiveMarkdown(schedule, payload, period)
        : schedule.reportType === "team"
          ? teamMarkdown(schedule, payload, period)
          : individualMarkdown(schedule, payload, period);

  const report = GeneratedReportSchema.parse({
    id: `generated-report-${randomUUID().slice(0, 12)}`,
    scheduleId: schedule.id,
    reportType: schedule.reportType,
    content,
    format: schedule.format,
    generatedAt,
    period,
  });

  schedules[index] = ReportScheduleSchema.parse({
    ...schedule,
    lastGeneratedAt: generatedAt,
    nextRunAt: getNextRunAt(schedule.frequency, now),
  });
  saveSchedules(schedules);

  const reports = loadGeneratedReports();
  reports.push(report);
  saveGeneratedReports(reports);

  return report;
}

/** Return enabled schedules that are due for generation. */
export function getDueSchedules(): ReportSchedule[] {
  const now = new Date().toISOString();
  return loadSchedules()
    .filter((schedule) => schedule.enabled && schedule.nextRunAt <= now)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
}

/** Clear persisted report schedules and generated reports (for testing). */
export function clearReportSchedules(): void {
  saveSchedules([]);
  saveGeneratedReports([]);
}
