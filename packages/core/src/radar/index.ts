/**
 * @module radar
 *
 * Scheduled Innovation Radar: cron-based watch subjects with periodic
 * re-investigation, diff-based change detection, and multi-channel alerts.
 * Stores watch configurations and results in ~/.innovator/radar/.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Investigation } from "../types.js";

const RADAR_DIR = join(homedir(), ".innovator", "radar");

function ensureDir(): void {
  if (!existsSync(RADAR_DIR)) mkdirSync(RADAR_DIR, { recursive: true });
}

// ---- Types ----

export type WatchFrequency = "daily" | "weekly" | "monthly";

export type AlertChannel = "email" | "slack" | "webhook" | "in-app";

/** Configuration for a watched subject. */
export interface WatchSubject {
  id: string;
  subject: string;
  frequency: WatchFrequency;
  alertChannels: AlertChannel[];
  /** Minimum significance score (0-1) to trigger an alert. */
  alertThreshold: number;
  /** Webhook URL for webhook channel. */
  webhookUrl?: string;
  /** Email address for email alerts. */
  email?: string;
  /** Slack webhook URL. */
  slackWebhookUrl?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
}

/** A single radar scan result with diff from previous. */
export interface RadarScanResult {
  id: string;
  watchId: string;
  subject: string;
  scannedAt: string;
  investigation: Investigation;
  changes: RadarChange[];
  significanceScore: number;
  alertTriggered: boolean;
}

/** A detected change between scans. */
export interface RadarChange {
  type: "new_opportunity" | "new_challenge" | "new_aspect" | "removed" | "modified";
  category: "opportunity" | "challenge" | "aspect" | "trend";
  title: string;
  description: string;
  significance: "low" | "medium" | "high";
}

/** Alert payload for notifications. */
export interface RadarAlert {
  watchId: string;
  subject: string;
  changes: RadarChange[];
  significanceScore: number;
  scannedAt: string;
  channel: AlertChannel;
}

// ---- Watch Management ----

/** Create a new watch subject. */
export function createWatch(params: {
  subject: string;
  frequency: WatchFrequency;
  alertChannels: AlertChannel[];
  alertThreshold?: number;
  webhookUrl?: string;
  email?: string;
  slackWebhookUrl?: string;
}): WatchSubject {
  ensureDir();
  const now = new Date();
  const watch: WatchSubject = {
    id: randomUUID(),
    subject: params.subject,
    frequency: params.frequency,
    alertChannels: params.alertChannels,
    alertThreshold: params.alertThreshold ?? 0.3,
    webhookUrl: params.webhookUrl,
    email: params.email,
    slackWebhookUrl: params.slackWebhookUrl,
    enabled: true,
    createdAt: now.toISOString(),
    nextRunAt: computeNextRun(now, params.frequency),
  };
  writeFileSync(join(RADAR_DIR, `watch-${watch.id}.json`), JSON.stringify(watch, null, 2), "utf-8");
  return watch;
}

/** Get a watch by ID. */
export function getWatch(id: string): WatchSubject | undefined {
  try {
    const path = join(RADAR_DIR, `watch-${id}.json`);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as WatchSubject;
  } catch {
    return undefined;
  }
}

/** List all watches. */
export function listWatches(): WatchSubject[] {
  ensureDir();
  return readdirSync(RADAR_DIR)
    .filter((f) => f.startsWith("watch-") && f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(RADAR_DIR, f), "utf-8")) as WatchSubject;
      } catch {
        return null;
      }
    })
    .filter((w): w is WatchSubject => w !== null)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
}

/** Update a watch. */
export function updateWatch(
  id: string,
  updates: Partial<
    Pick<
      WatchSubject,
      | "subject"
      | "frequency"
      | "alertChannels"
      | "alertThreshold"
      | "enabled"
      | "webhookUrl"
      | "email"
      | "slackWebhookUrl"
    >
  >
): boolean {
  const watch = getWatch(id);
  if (!watch) return false;
  Object.assign(watch, updates);
  if (updates.frequency) {
    watch.nextRunAt = computeNextRun(new Date(), updates.frequency);
  }
  writeFileSync(join(RADAR_DIR, `watch-${id}.json`), JSON.stringify(watch, null, 2), "utf-8");
  return true;
}

/** Delete a watch. */
export function deleteWatch(id: string): boolean {
  const path = join(RADAR_DIR, `watch-${id}.json`);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/** Get watches that are due for scanning. */
export function getDueWatches(): WatchSubject[] {
  const now = new Date().toISOString();
  return listWatches().filter((w) => w.enabled && w.nextRunAt <= now);
}

// ---- Scan & Diff ----

/**
 * Compare a new investigation with the previous one and detect changes.
 */
export function diffInvestigations(
  previous: Investigation | undefined,
  current: Investigation
): RadarChange[] {
  if (!previous) {
    // First scan — report all as new
    return [
      ...current.opportunities.map(
        (o): RadarChange => ({
          type: "new_opportunity",
          category: "opportunity",
          title: o,
          description: `New opportunity detected: ${o}`,
          significance: "medium",
        })
      ),
      ...current.challenges.map(
        (c): RadarChange => ({
          type: "new_challenge",
          category: "challenge",
          title: c,
          description: `New challenge identified: ${c}`,
          significance: "medium",
        })
      ),
    ];
  }

  const changes: RadarChange[] = [];
  const prevOpps = new Set(previous.opportunities.map((o) => o.toLowerCase()));
  const prevChallenges = new Set(previous.challenges.map((c) => c.toLowerCase()));
  const prevAspects = new Set(previous.keyAspects.map((a) => a.title.toLowerCase()));

  // New opportunities
  for (const opp of current.opportunities) {
    if (!prevOpps.has(opp.toLowerCase())) {
      changes.push({
        type: "new_opportunity",
        category: "opportunity",
        title: opp,
        description: `New opportunity emerged: ${opp}`,
        significance: "high",
      });
    }
  }

  // Removed opportunities
  for (const opp of previous.opportunities) {
    if (!current.opportunities.some((o) => o.toLowerCase() === opp.toLowerCase())) {
      changes.push({
        type: "removed",
        category: "opportunity",
        title: opp,
        description: `Opportunity no longer detected: ${opp}`,
        significance: "medium",
      });
    }
  }

  // New challenges
  for (const ch of current.challenges) {
    if (!prevChallenges.has(ch.toLowerCase())) {
      changes.push({
        type: "new_challenge",
        category: "challenge",
        title: ch,
        description: `New challenge emerged: ${ch}`,
        significance: "high",
      });
    }
  }

  // New aspects
  for (const aspect of current.keyAspects) {
    if (!prevAspects.has(aspect.title.toLowerCase())) {
      changes.push({
        type: "new_aspect",
        category: "aspect",
        title: aspect.title,
        description: aspect.description,
        significance: "medium",
      });
    }
  }

  return changes;
}

/**
 * Run a radar scan for a watch subject.
 * Accepts a function that performs the investigation (to decouple from LLM).
 */
export async function runRadarScan(
  watch: WatchSubject,
  investigateFn: (subject: string) => Promise<Investigation>,
  previousInvestigation?: Investigation
): Promise<RadarScanResult> {
  const investigation = await investigateFn(watch.subject);
  const changes = diffInvestigations(previousInvestigation, investigation);

  const significanceScore = computeSignificance(changes);
  const alertTriggered = significanceScore >= watch.alertThreshold && changes.length > 0;

  // Update watch metadata
  const now = new Date();
  watch.lastRunAt = now.toISOString();
  watch.nextRunAt = computeNextRun(now, watch.frequency);
  writeFileSync(join(RADAR_DIR, `watch-${watch.id}.json`), JSON.stringify(watch, null, 2), "utf-8");

  const result: RadarScanResult = {
    id: randomUUID(),
    watchId: watch.id,
    subject: watch.subject,
    scannedAt: now.toISOString(),
    investigation,
    changes,
    significanceScore,
    alertTriggered,
  };

  // Persist scan result
  ensureDir();
  writeFileSync(
    join(RADAR_DIR, `scan-${result.id}.json`),
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  return result;
}

/** Get previous scan results for a watch. */
export function getScanHistory(watchId: string, limit: number = 10): RadarScanResult[] {
  ensureDir();
  return readdirSync(RADAR_DIR)
    .filter((f) => f.startsWith("scan-") && f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(RADAR_DIR, f), "utf-8")) as RadarScanResult;
      } catch {
        return null;
      }
    })
    .filter((s): s is RadarScanResult => s !== null && s.watchId === watchId)
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
    .slice(0, limit);
}

/**
 * Build alert payloads for triggered changes.
 */
export function buildAlerts(watch: WatchSubject, scan: RadarScanResult): RadarAlert[] {
  if (!scan.alertTriggered) return [];
  return watch.alertChannels.map((channel) => ({
    watchId: watch.id,
    subject: watch.subject,
    changes: scan.changes,
    significanceScore: scan.significanceScore,
    scannedAt: scan.scannedAt,
    channel,
  }));
}

/**
 * Deliver an alert via webhook.
 */
export async function deliverWebhookAlert(alert: RadarAlert, webhookUrl: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🔔 Innovation Radar Alert: ${alert.subject}`,
        changes: alert.changes.length,
        significance: Math.round(alert.significanceScore * 100) + "%",
        details: alert.changes.map((c) => `[${c.significance}] ${c.type}: ${c.title}`),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---- Helpers ----

function computeNextRun(from: Date, frequency: WatchFrequency): string {
  const next = new Date(from);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next.toISOString();
}

function computeSignificance(changes: RadarChange[]): number {
  if (changes.length === 0) return 0;
  const weights = { low: 0.2, medium: 0.5, high: 1.0 };
  const total = changes.reduce((sum, c) => sum + weights[c.significance], 0);
  return Math.min(1, +(total / (changes.length * 1.5)).toFixed(3));
}
