/**
 * @module triggers/signal-collectors
 *
 * Context-aware signal collectors for GitHub (issues, PRs, discussions),
 * Slack (messages, reactions), and Calendar (upcoming meetings) that detect
 * innovation-worthy moments and proactively suggest investigation subjects.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Signal Schemas ----

export const SignalSourceSchema = z.enum([
  "github-issues",
  "github-prs",
  "github-discussions",
  "slack-messages",
  "slack-reactions",
  "calendar-meetings",
]);

export const SignalSchema = z.object({
  id: z.string().max(200),
  source: SignalSourceSchema,
  title: z.string().max(500),
  body: z.string().max(5000),
  url: z.string().max(2000).optional(),
  author: z.string().max(200).optional(),
  timestamp: z.string(),
  metadata: z.record(z.string()).optional(),
});

export const InnovationTriggerSchema = z.object({
  id: z.string().max(200),
  signalId: z.string().max(200),
  source: SignalSourceSchema,
  pattern: z.enum([
    "stale-epic",
    "customer-complaint-cluster",
    "strategic-planning-meeting",
    "tech-debt-accumulation",
    "feature-request-surge",
    "bug-pattern",
    "competitive-mention",
    "architecture-discussion",
    "performance-regression",
    "user-feedback-theme",
  ]),
  suggestedSubject: z.string().max(500),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(2000),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  timestamp: z.string(),
  dismissed: z.boolean().default(false),
  actedOn: z.boolean().default(false),
});

export const TriggerThresholdSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.6),
  staleEpicDays: z.number().int().min(7).max(365).default(30),
  complaintClusterSize: z.number().int().min(2).max(100).default(3),
  featureRequestSurgeCount: z.number().int().min(3).max(100).default(5),
  deduplicationWindowMs: z.number().int().min(0).default(86400_000),
});

export const NotificationChannelSchema = z.enum([
  "slack-dm",
  "slack-channel",
  "github-discussion",
  "github-issue",
  "email-digest",
  "in-app",
]);

export const NotificationConfigSchema = z.object({
  channels: z.array(NotificationChannelSchema).min(1),
  digestFrequency: z.enum(["realtime", "hourly", "daily", "weekly"]).default("daily"),
  minPriority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
});

export type SignalSource = z.infer<typeof SignalSourceSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type InnovationTrigger = z.infer<typeof InnovationTriggerSchema>;
export type TriggerThreshold = z.infer<typeof TriggerThresholdSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

// ---- Signal Collector Interface ----

export interface SignalCollector {
  source: SignalSource;
  collect(config: Record<string, unknown>, signal?: AbortSignal): Promise<Signal[]>;
}

// ---- GitHub Signal Collectors ----

function createGitHubCollector(source: SignalSource, itemType: string): SignalCollector {
  return {
    source,
    async collect(config, signal) {
      const repo = (config["repo"] as string) ?? "owner/repo";
      const labels = (config["labels"] as string[]) ?? [];
      const since =
        (config["since"] as string) ?? new Date(Date.now() - 7 * 86400_000).toISOString();

      // In production, this would call the GitHub API
      // For now, we support manual signal ingestion and LLM-based simulation
      const existingSignals = (config["signals"] as Signal[]) ?? [];
      if (existingSignals.length > 0) {
        return existingSignals.filter((s) => s.source === source);
      }

      return [];
    },
  };
}

export const GitHubIssuesCollector: SignalCollector = createGitHubCollector(
  "github-issues",
  "issues"
);
export const GitHubPRsCollector: SignalCollector = createGitHubCollector(
  "github-prs",
  "pull requests"
);
export const GitHubDiscussionsCollector: SignalCollector = createGitHubCollector(
  "github-discussions",
  "discussions"
);

// ---- Slack Signal Collector ----

export const SlackMessagesCollector: SignalCollector = {
  source: "slack-messages",
  async collect(config) {
    // In production, this would use the Slack API
    const existingSignals = (config["signals"] as Signal[]) ?? [];
    return existingSignals.filter((s) => s.source === "slack-messages");
  },
};

export const SlackReactionsCollector: SignalCollector = {
  source: "slack-reactions",
  async collect(config) {
    const existingSignals = (config["signals"] as Signal[]) ?? [];
    return existingSignals.filter((s) => s.source === "slack-reactions");
  },
};

// ---- Calendar Signal Collector ----

export const CalendarCollector: SignalCollector = {
  source: "calendar-meetings",
  async collect(config) {
    const existingSignals = (config["signals"] as Signal[]) ?? [];
    return existingSignals.filter((s) => s.source === "calendar-meetings");
  },
};

// ---- Pattern Matching Engine ----

const triggerStore: InnovationTrigger[] = [];
const seenFingerprints = new Set<string>();

function generateTriggerId(): string {
  return `trigger-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeSignalFingerprint(signal: Signal): string {
  return `${signal.source}::${signal.title.toLowerCase().replace(/\s+/g, "-").slice(0, 100)}`;
}

/**
 * Classify a batch of signals into innovation triggers using LLM-based
 * pattern matching with configurable thresholds.
 */
export async function classifySignals(
  signals: Signal[],
  thresholds: Partial<TriggerThreshold> = {},
  model?: string,
  signal?: AbortSignal
): Promise<InnovationTrigger[]> {
  const config = TriggerThresholdSchema.parse(thresholds);
  const triggers: InnovationTrigger[] = [];

  // Deduplicate
  const newSignals = signals.filter((s) => {
    const fp = computeSignalFingerprint(s);
    if (seenFingerprints.has(fp)) return false;
    seenFingerprints.add(fp);
    return true;
  });

  if (newSignals.length === 0) return [];

  // Batch classify via LLM
  const signalSummaries = newSignals
    .slice(0, 20)
    .map((s, i) => `[${i}] (${s.source}) "${s.title}": ${s.body.slice(0, 300)}`)
    .join("\n");

  const prompt = `You are an innovation opportunity detector. Analyze these signals from various sources and identify innovation-worthy patterns.

${wrapUserInput("SIGNALS", signalSummaries)}

For each signal that represents an innovation opportunity, classify the pattern and suggest an investigation subject.

Available patterns: stale-epic, customer-complaint-cluster, strategic-planning-meeting, tech-debt-accumulation, feature-request-surge, bug-pattern, competitive-mention, architecture-discussion, performance-regression, user-feedback-theme

Respond with valid JSON only:
{
  "triggers": [
    {
      "signalIndex": 0,
      "pattern": "customer-complaint-cluster",
      "suggestedSubject": "Improving customer onboarding experience",
      "confidence": 0.85,
      "reasoning": "Multiple customer complaints about onboarding friction",
      "priority": "high"
    }
  ]
}

Only include signals that genuinely warrant innovation investigation. Be selective.`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(sanitizeLlmOutput(result));
      },
      { signal }
    );

    const parsed = JSON.parse(raw) as {
      triggers: Array<{
        signalIndex: number;
        pattern: InnovationTrigger["pattern"];
        suggestedSubject: string;
        confidence: number;
        reasoning: string;
        priority: InnovationTrigger["priority"];
      }>;
    };

    for (const t of parsed.triggers) {
      if (t.confidence < config.minConfidence) continue;
      if (t.signalIndex < 0 || t.signalIndex >= newSignals.length) continue;

      const sourceSignal = newSignals[t.signalIndex]!;

      const trigger: InnovationTrigger = {
        id: generateTriggerId(),
        signalId: sourceSignal.id,
        source: sourceSignal.source,
        pattern: t.pattern,
        suggestedSubject: t.suggestedSubject.slice(0, 500),
        confidence: Math.max(0, Math.min(1, t.confidence)),
        reasoning: t.reasoning.slice(0, 2000),
        priority: t.priority,
        timestamp: new Date().toISOString(),
        dismissed: false,
        actedOn: false,
      };

      triggers.push(trigger);
      triggerStore.push(trigger);
    }
  } catch {
    // LLM classification failed — return empty
  }

  return triggers;
}

// ---- Rule-Based Pattern Detection (no LLM) ----

/**
 * Detect patterns using simple heuristics without requiring LLM calls.
 * Useful as a fast pre-filter before LLM classification.
 */
export function detectPatternsHeuristic(
  signals: Signal[],
  thresholds: Partial<TriggerThreshold> = {}
): InnovationTrigger[] {
  const config = TriggerThresholdSchema.parse(thresholds);
  const triggers: InnovationTrigger[] = [];

  // Detect stale epics
  const now = Date.now();
  const staleThreshold = config.staleEpicDays * 86400_000;

  for (const s of signals) {
    if (s.source !== "github-issues") continue;
    const age = now - new Date(s.timestamp).getTime();
    if (age > staleThreshold && s.metadata?.["type"] === "epic") {
      triggers.push({
        id: generateTriggerId(),
        signalId: s.id,
        source: s.source,
        pattern: "stale-epic",
        suggestedSubject: `Revitalize stale epic: ${s.title}`,
        confidence: Math.min(1, 0.5 + (age / staleThreshold) * 0.3),
        reasoning: `Epic "${s.title}" has been open for ${Math.floor(age / 86400_000)} days without progress.`,
        priority: age > staleThreshold * 2 ? "high" : "medium",
        timestamp: new Date().toISOString(),
        dismissed: false,
        actedOn: false,
      });
    }
  }

  // Detect complaint clusters
  const complaintKeywords = [
    "bug",
    "broken",
    "doesn't work",
    "error",
    "crash",
    "issue",
    "problem",
    "failing",
  ];
  const complaintSignals = signals.filter((s) => {
    const text = `${s.title} ${s.body}`.toLowerCase();
    return complaintKeywords.some((kw) => text.includes(kw));
  });

  if (complaintSignals.length >= config.complaintClusterSize) {
    // Group by common words to find themes
    const wordFreq = new Map<string, number>();
    for (const s of complaintSignals) {
      const words = `${s.title} ${s.body}`.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (w.length > 4 && !complaintKeywords.includes(w)) {
          wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
        }
      }
    }
    const topTheme =
      Array.from(wordFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "product quality";

    triggers.push({
      id: generateTriggerId(),
      signalId: complaintSignals[0]!.id,
      source: complaintSignals[0]!.source,
      pattern: "customer-complaint-cluster",
      suggestedSubject: `Address complaint cluster: ${topTheme} (${complaintSignals.length} reports)`,
      confidence: Math.min(1, 0.6 + complaintSignals.length * 0.05),
      reasoning: `${complaintSignals.length} complaint signals detected with common theme "${topTheme}".`,
      priority: complaintSignals.length >= config.complaintClusterSize * 2 ? "urgent" : "high",
      timestamp: new Date().toISOString(),
      dismissed: false,
      actedOn: false,
    });
  }

  // Detect strategic planning meetings
  const planningKeywords = [
    "strategy",
    "planning",
    "roadmap",
    "quarterly",
    "okr",
    "vision",
    "direction",
  ];
  for (const s of signals) {
    if (s.source !== "calendar-meetings") continue;
    const text = `${s.title} ${s.body}`.toLowerCase();
    if (planningKeywords.some((kw) => text.includes(kw))) {
      triggers.push({
        id: generateTriggerId(),
        signalId: s.id,
        source: s.source,
        pattern: "strategic-planning-meeting",
        suggestedSubject: `Innovation prep for: ${s.title}`,
        confidence: 0.8,
        reasoning: `Strategic planning meeting "${s.title}" detected. Pre-investigation can inform decisions.`,
        priority: "medium",
        timestamp: new Date().toISOString(),
        dismissed: false,
        actedOn: false,
      });
    }
  }

  // Store and return
  triggerStore.push(...triggers);
  return triggers;
}

// ---- Notification Formatting ----

export interface TriggerNotification {
  channel: NotificationChannel;
  title: string;
  body: string;
  priority: InnovationTrigger["priority"];
  actionUrl?: string;
  triggerId: string;
}

/**
 * Format triggers into notifications for various channels.
 */
export function formatNotifications(
  triggers: InnovationTrigger[],
  config: NotificationConfig
): TriggerNotification[] {
  const filtered = triggers.filter((t) => {
    const priorityOrder = { low: 0, medium: 1, high: 2, urgent: 3 };
    return priorityOrder[t.priority] >= priorityOrder[config.minPriority];
  });

  const notifications: TriggerNotification[] = [];

  for (const channel of config.channels) {
    if (config.digestFrequency === "realtime") {
      for (const t of filtered) {
        notifications.push(formatSingleNotification(t, channel));
      }
    } else {
      // Digest mode — batch all triggers into one notification
      if (filtered.length > 0) {
        notifications.push(formatDigestNotification(filtered, channel));
      }
    }
  }

  return notifications;
}

function formatSingleNotification(
  trigger: InnovationTrigger,
  channel: NotificationChannel
): TriggerNotification {
  const emoji = { low: "💡", medium: "🔔", high: "⚡", urgent: "🚨" }[trigger.priority];

  return {
    channel,
    title: `${emoji} Innovation Opportunity: ${trigger.suggestedSubject}`,
    body: `**Pattern:** ${trigger.pattern}\n**Confidence:** ${(trigger.confidence * 100).toFixed(0)}%\n**Source:** ${trigger.source}\n\n${trigger.reasoning}`,
    priority: trigger.priority,
    triggerId: trigger.id,
  };
}

function formatDigestNotification(
  triggers: InnovationTrigger[],
  channel: NotificationChannel
): TriggerNotification {
  const byPriority = { urgent: 0, high: 0, medium: 0, low: 0 };
  for (const t of triggers) byPriority[t.priority]++;

  const lines = triggers.slice(0, 10).map((t) => {
    const emoji = { low: "💡", medium: "🔔", high: "⚡", urgent: "🚨" }[t.priority];
    return `${emoji} **${t.suggestedSubject}** (${t.pattern}, ${(t.confidence * 100).toFixed(0)}%)`;
  });

  return {
    channel,
    title: `📊 Innovation Trigger Digest — ${triggers.length} opportunities detected`,
    body: `**Summary:** ${byPriority.urgent} urgent, ${byPriority.high} high, ${byPriority.medium} medium, ${byPriority.low} low\n\n${lines.join("\n")}`,
    priority: triggers.some((t) => t.priority === "urgent") ? "urgent" : "high",
    triggerId: triggers[0]!.id,
  };
}

// ---- Trigger Management ----

/** Get all stored triggers. */
export function getStoredTriggers(): InnovationTrigger[] {
  return [...triggerStore];
}

/** Dismiss a trigger. */
export function dismissTrigger(triggerId: string): boolean {
  const trigger = triggerStore.find((t) => t.id === triggerId);
  if (!trigger) return false;
  trigger.dismissed = true;
  return true;
}

/** Mark a trigger as acted on. */
export function markTriggerActedOn(triggerId: string): boolean {
  const trigger = triggerStore.find((t) => t.id === triggerId);
  if (!trigger) return false;
  trigger.actedOn = true;
  return true;
}

/** Get pending (not dismissed, not acted on) triggers. */
export function getPendingTriggers(): InnovationTrigger[] {
  return triggerStore.filter((t) => !t.dismissed && !t.actedOn);
}

/** Clear all trigger state (for testing). */
export function clearTriggerState(): void {
  triggerStore.length = 0;
  seenFingerprints.clear();
}
