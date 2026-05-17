/**
 * @module integrations/backlog-import
 *
 * Backlog import utilities for normalizing project-management items
 * into innovation-oriented backlog records and subject suggestions.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

export const BacklogItemSchema = z.object({
  id: z.string().max(200),
  externalId: z.string().max(200),
  source: z.enum(["jira", "linear", "notion", "github"]),
  title: z.string().max(500),
  description: z.string().max(5000),
  status: z.string().max(100),
  priority: z.string().max(50).optional(),
  labels: z.array(z.string().max(100)).max(20),
  assignee: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  importedAt: z.string(),
});
export type BacklogItem = z.infer<typeof BacklogItemSchema>;

export const BacklogAnalysisSchema = z.object({
  totalItems: z.number().int().min(0),
  byPriority: z.record(z.string(), z.number().int()),
  byStatus: z.record(z.string(), z.number().int()),
  suggestedSubjects: z.array(z.object({
    title: z.string().max(500),
    description: z.string().max(2000),
    sourceItems: z.array(z.string().max(200)),
    rationale: z.string().max(1000),
  })).max(20),
  generatedAt: z.string(),
});
export type BacklogAnalysis = z.infer<typeof BacklogAnalysisSchema>;

export const BacklogImportInputSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  status: z.string().max(100),
  priority: z.string().max(50).optional(),
  labels: z.array(z.string().max(100)).max(20).optional(),
  source: z.enum(["jira", "linear", "notion", "github"]),
});
export type BacklogImportInput = z.infer<typeof BacklogImportInputSchema>;

const importedBacklog: BacklogItem[] = [];

/**
 * Normalize backlog items from external tools and store them locally.
 */
export function importBacklog(items: BacklogImportInput[]): BacklogItem[] {
  const parsedItems = z.array(BacklogImportInputSchema).parse(items);
  const importedAt = new Date().toISOString();
  const normalized = parsedItems.map((item) =>
    BacklogItemSchema.parse({
      id: randomUUID(),
      externalId: randomUUID(),
      source: item.source,
      title: truncate(normalizeText(item.title, 500), 500),
      description: truncate(normalizeText(item.description, 5000), 5000),
      status: normalizeCategory(item.status, "unknown", 100),
      priority: item.priority ? normalizeCategory(item.priority, undefined, 50) : undefined,
      labels: normalizeLabels(item.labels),
      importedAt,
    })
  );

  importedBacklog.push(...normalized);
  return normalized.map((item) => ({ ...item }));
}

/**
 * Retrieve imported backlog items, optionally filtered by source.
 */
export function getImportedBacklog(source?: BacklogItem["source"]): BacklogItem[] {
  return importedBacklog
    .filter((item) => !source || item.source === source)
    .map((item) => ({ ...item, labels: [...item.labels] }));
}

/**
 * Analyze imported backlog items and suggest innovation subjects.
 */
export function analyzeBacklog(items: BacklogItem[]): BacklogAnalysis {
  const parsedItems = z.array(BacklogItemSchema).parse(items);
  const byPriority: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const item of parsedItems) {
    const priorityKey = item.priority ?? "unspecified";
    byPriority[priorityKey] = (byPriority[priorityKey] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }

  const activeItems = parsedItems.filter((item) => !DONE_STATUSES.has(item.status));
  const labelGroups = new Map<string, BacklogItem[]>();
  for (const item of activeItems) {
    for (const label of item.labels) {
      const key = label.toLowerCase();
      const group = labelGroups.get(key) ?? [];
      group.push(item);
      labelGroups.set(key, group);
    }
  }

  const suggestions: BacklogAnalysis["suggestedSubjects"] = [];
  for (const [label, group] of [...labelGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (group.length < 2 || suggestions.length >= 20) continue;
    suggestions.push({
      title: truncate(`Explore ${toTitleCase(label)} improvements`, 500),
      description: truncate(
        `Multiple backlog items across ${uniqueSources(group).join(", ")} point to a recurring ${label} opportunity: ${group
          .map((item) => item.title)
          .slice(0, 4)
          .join("; ")}.`,
        2000
      ),
      sourceItems: group.map((item) => item.externalId).slice(0, 10),
      rationale: truncate(
        `${group.length} active backlog items share the \"${label}\" label, indicating a theme worth deeper innovation work.`,
        1000
      ),
    });
  }

  const prioritizedItems = [...activeItems].sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));
  for (const item of prioritizedItems) {
    if (suggestions.length >= 20) break;
    if (suggestions.some((subject) => subject.sourceItems.includes(item.externalId))) continue;
    suggestions.push({
      title: truncate(item.title, 500),
      description: truncate(
        [
          item.description,
          `Source: ${item.source}`,
          `Status: ${item.status}`,
          item.priority ? `Priority: ${item.priority}` : undefined,
          item.labels.length ? `Labels: ${item.labels.join(", ")}` : undefined,
        ]
          .filter(Boolean)
          .join("\n\n"),
        2000
      ),
      sourceItems: [item.externalId],
      rationale: truncate(
        `Open backlog work from ${item.source} with status \"${item.status}\"${item.priority ? ` and priority \"${item.priority}\"` : ""} is a direct candidate for innovation exploration.`,
        1000
      ),
    });
  }

  return BacklogAnalysisSchema.parse({
    totalItems: parsedItems.length,
    byPriority,
    byStatus,
    suggestedSubjects: suggestions.slice(0, 20),
    generatedAt: new Date().toISOString(),
  });
}

/**
 * Convert imported backlog items into innovation-subject style records.
 */
export function backlogToInnovationSubjects(
  items: BacklogItem[]
): BacklogAnalysis["suggestedSubjects"] {
  const parsedItems = z.array(BacklogItemSchema).parse(items);
  return parsedItems.map((item) => ({
    title: truncate(item.title, 500),
    description: truncate(
      [
        item.description,
        `Source: ${item.source}`,
        `Status: ${item.status}`,
        item.priority ? `Priority: ${item.priority}` : undefined,
        item.assignee ? `Assignee: ${item.assignee}` : undefined,
        item.labels.length ? `Labels: ${item.labels.join(", ")}` : undefined,
        item.url ? `Reference: ${item.url}` : undefined,
      ]
        .filter(Boolean)
        .join("\n\n"),
      2000
    ),
    sourceItems: [item.externalId],
    rationale: truncate(
      `Derived from an imported ${item.source} backlog item currently in ${item.status} state.`,
      1000
    ),
  }));
}

/** Clear imported backlog items (for testing). */
export function clearImportedBacklog(): void {
  importedBacklog.length = 0;
}

const DONE_STATUSES = new Set(["done", "closed", "completed", "cancelled", "canceled", "resolved"]);

function normalizeText(value: string, maxLength: number): string {
  return truncate(value.trim() || "Untitled backlog item", maxLength);
}

function normalizeCategory(value: string, fallback = "unknown", maxLength = 100): string {
  const normalized = value.trim().toLowerCase() || fallback;
  return truncate(normalized, maxLength);
}

function normalizeLabels(labels?: string[]): string[] {
  return Array.from(
    new Set((labels ?? []).map((label) => label.trim()).filter(Boolean))
  ).slice(0, 20);
}

function priorityScore(priority?: string): number {
  switch ((priority ?? "").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function uniqueSources(items: BacklogItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.source)));
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
