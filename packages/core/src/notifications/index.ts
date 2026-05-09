/**
 * @module notifications
 *
 * Cross-platform notification delivery via Slack, email, Microsoft Teams,
 * and push notifications. Supports configurable digests summarizing
 * innovation session results, high-scoring ideas, and team activity.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for Slack channel configuration. */
export const SlackChannelConfigSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().max(200).optional(),
  username: z.string().max(200).optional(),
  iconEmoji: z.string().max(100).optional(),
});

/** Schema for email channel configuration. */
export const EmailChannelConfigSchema = z.object({
  smtpHost: z.string().max(500),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().max(500),
  smtpPass: z.string().max(500),
  fromAddress: z.string().email(),
  toAddresses: z.array(z.string().email()).min(1).max(100),
  useTls: z.boolean().default(true),
});

/** Schema for Teams channel configuration. */
export const TeamsChannelConfigSchema = z.object({
  webhookUrl: z.string().url(),
  mentionUsers: z.array(z.string().max(200)).max(50).optional(),
});

/** Schema for push notification channel configuration. */
export const PushChannelConfigSchema = z.object({
  vapidPublicKey: z.string().min(1).max(500),
  vapidPrivateKey: z.string().min(1).max(500),
  subscriptions: z.array(z.record(z.unknown())).max(1000).default([]),
});

/** Schema for notification channel type. */
export const ChannelTypeSchema = z.enum(["slack", "email", "teams", "push", "webhook"]);

/** Schema for a notification channel. */
export const NotificationChannelSchema = z.object({
  id: z.string().min(1).max(200),
  type: ChannelTypeSchema,
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
});

/** Schema for notification priority. */
export const NotificationPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

/** Schema for notification category. */
export const NotificationCategorySchema = z.enum([
  "session_complete",
  "high_score_idea",
  "collaboration",
  "digest",
  "system",
]);

/** Schema for a notification payload. */
export const NotificationPayloadSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
  priority: NotificationPrioritySchema.default("medium"),
  category: NotificationCategorySchema,
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().default(() => new Date().toISOString()),
});

/** Schema for digest frequency used in notification preferences. */
export const DigestFrequencySchema = z.enum(["realtime", "hourly", "daily", "weekly"]);

/** Schema for quiet hours. */
export const QuietHoursSchema = z.object({
  start: z.string().max(10),
  end: z.string().max(10),
  timezone: z.string().max(100),
});

/** Schema for notification preferences. */
export const NotificationPreferencesSchema = z.object({
  userId: z.string().min(1).max(200),
  channels: z.array(z.string().max(200)).max(50),
  digestFrequency: DigestFrequencySchema.default("daily"),
  quietHours: QuietHoursSchema.optional(),
  categories: z.record(NotificationCategorySchema, z.boolean()).default({}),
});

/** Schema for notification delivery status. */
export const DeliveryStatusSchema = z.enum(["pending", "sent", "failed", "retried"]);

/** Schema for a notification delivery record. */
export const NotificationDeliverySchema = z.object({
  id: z.string().min(1).max(200),
  channelId: z.string().max(200),
  payload: NotificationPayloadSchema,
  status: DeliveryStatusSchema.default("pending"),
  attempts: z.number().int().min(0).default(0),
  lastAttemptAt: z.string().optional(),
  error: z.string().max(2000).optional(),
});

/** Schema for digest configuration. */
export const DigestConfigSchema = z.object({
  frequency: DigestFrequencySchema,
  includeTopIdeas: z.boolean().default(true),
  includeMetrics: z.boolean().default(true),
  includeTeamActivity: z.boolean().default(true),
  maxItems: z.number().int().min(1).max(100).default(20),
});

// ---- Types ----

export type ChannelType = z.infer<typeof ChannelTypeSchema>;
export type SlackChannelConfig = z.infer<typeof SlackChannelConfigSchema>;
export type EmailChannelConfig = z.infer<typeof EmailChannelConfigSchema>;
export type TeamsChannelConfig = z.infer<typeof TeamsChannelConfigSchema>;
export type PushChannelConfig = z.infer<typeof PushChannelConfigSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
export type DigestFrequency = z.infer<typeof DigestFrequencySchema>;
export type QuietHours = z.infer<typeof QuietHoursSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;
export type DigestConfig = z.infer<typeof DigestConfigSchema>;

/** Result of a notification delivery attempt. */
export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  timestamp: string;
}

// ---- Notification Provider Interface ----

/** Interface for platform-specific notification providers. */
export interface NotificationProvider {
  send(payload: NotificationPayload, config: Record<string, unknown>): Promise<DeliveryResult>;
}

// ---- Provider Implementations ----

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

/** Slack notification provider — POST to Slack webhook with formatted blocks. */
export class SlackNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<DeliveryResult> {
    const parsed = SlackChannelConfigSchema.parse(config);
    const slackPayload = formatForSlack(payload);

    if (parsed.channel) slackPayload.channel = parsed.channel;
    if (parsed.username) slackPayload.username = parsed.username;
    if (parsed.iconEmoji) slackPayload.icon_emoji = parsed.iconEmoji;

    try {
      const response = await fetch(parsed.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        success: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `Slack API responded with ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/** Email notification provider — SMTP email via nodemailer (dynamic import). */
export class EmailNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<DeliveryResult> {
    const parsed = EmailChannelConfigSchema.parse(config);
    const html = formatForEmail(payload);

    try {
      const moduleName = "nodemailer";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = await (import(/* webpackIgnore: true */ moduleName) as Promise<any>);
      const transporter = nodemailer.createTransport({
        host: parsed.smtpHost,
        port: parsed.smtpPort,
        secure: parsed.useTls,
        auth: { user: parsed.smtpUser, pass: parsed.smtpPass },
      });

      await transporter.sendMail({
        from: parsed.fromAddress,
        to: parsed.toAddresses.join(", "),
        subject: payload.title,
        html,
      });

      return { success: true, timestamp: new Date().toISOString() };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/** Teams notification provider — POST to Teams webhook with adaptive cards. */
export class TeamsNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<DeliveryResult> {
    const parsed = TeamsChannelConfigSchema.parse(config);
    const card = formatForTeams(payload);

    try {
      const response = await fetch(parsed.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        success: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `Teams API responded with ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/** Push notification provider — Web Push API via web-push (dynamic import). */
export class PushNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<DeliveryResult> {
    const parsed = PushChannelConfigSchema.parse(config);

    try {
      const moduleName = "web-push";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webpush = await (import(/* webpackIgnore: true */ moduleName) as Promise<any>);
      webpush.setVapidDetails(
        "mailto:notifications@innovator.dev",
        parsed.vapidPublicKey,
        parsed.vapidPrivateKey,
      );

      const pushPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        priority: payload.priority,
        category: payload.category,
        timestamp: payload.timestamp,
      });

      const results = await Promise.allSettled(
        parsed.subscriptions.map((sub: Record<string, unknown>) =>
          webpush.sendNotification(sub, pushPayload)
        ),
      );

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length === parsed.subscriptions.length && parsed.subscriptions.length > 0) {
        return {
          success: false,
          error: `All ${failures.length} push deliveries failed`,
          timestamp: new Date().toISOString(),
        };
      }

      return { success: true, timestamp: new Date().toISOString() };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/** Generic webhook notification provider — POST to arbitrary URL. */
export class WebhookNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<DeliveryResult> {
    const url = typeof config.url === "string" ? config.url : undefined;
    if (!url) {
      return { success: false, error: "Missing webhook URL", timestamp: new Date().toISOString() };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.headers as Record<string, string> | undefined),
        },
        body: JSON.stringify({
          ...payload,
          metadata: payload.metadata,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        success: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `Webhook responded with ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// ---- In-Memory Store ----

const channels = new Map<string, NotificationChannel>();
const preferences = new Map<string, NotificationPreferences>();
const deliveryLog: NotificationDelivery[] = [];

const providers: Record<ChannelType, NotificationProvider> = {
  slack: new SlackNotificationProvider(),
  email: new EmailNotificationProvider(),
  teams: new TeamsNotificationProvider(),
  push: new PushNotificationProvider(),
  webhook: new WebhookNotificationProvider(),
};

// ---- Core Functions ----

/**
 * Send a notification to the specified channels with retry and fallback.
 */
export async function sendNotification(
  payload: NotificationPayload,
  targetChannels: NotificationChannel[],
): Promise<NotificationDelivery[]> {
  const parsed = NotificationPayloadSchema.parse(payload);
  const deliveries: NotificationDelivery[] = [];

  for (const channel of targetChannels) {
    if (!channel.enabled) continue;

    const delivery: NotificationDelivery = {
      id: `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId: channel.id,
      payload: parsed,
      status: "pending",
      attempts: 0,
    };

    let result: DeliveryResult | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      delivery.attempts = attempt;
      delivery.lastAttemptAt = new Date().toISOString();

      const provider = providers[channel.type];
      result = await provider.send(parsed, channel.config);

      if (result.success) {
        delivery.status = "sent";
        break;
      }

      delivery.error = result.error;

      if (attempt < MAX_RETRY_ATTEMPTS) {
        delivery.status = "retried";
        await new Promise((resolve) =>
          setTimeout(resolve, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)),
        );
      } else {
        delivery.status = "failed";
      }
    }

    deliveryLog.push(delivery);
    deliveries.push(delivery);
  }

  return deliveries;
}

/**
 * Generate and send a digest notification for a user.
 */
export async function sendDigest(
  userId: string,
  config?: Partial<DigestConfig>,
): Promise<NotificationDelivery[]> {
  const prefs = preferences.get(userId);
  const userChannels = prefs
    ? prefs.channels.map((id) => channels.get(id)).filter((c): c is NotificationChannel => !!c)
    : [];

  const digestConfig = DigestConfigSchema.parse({
    frequency: config?.frequency ?? prefs?.digestFrequency ?? "daily",
    includeTopIdeas: config?.includeTopIdeas,
    includeMetrics: config?.includeMetrics,
    includeTeamActivity: config?.includeTeamActivity,
    maxItems: config?.maxItems,
  });

  const sections: string[] = [];
  if (digestConfig.includeTopIdeas) sections.push("• Top-scoring ideas from recent sessions");
  if (digestConfig.includeMetrics) sections.push("• Innovation metrics and trends");
  if (digestConfig.includeTeamActivity) sections.push("• Team collaboration activity");

  const payload: NotificationPayload = {
    title: `Innovation Digest — ${digestConfig.frequency.charAt(0).toUpperCase() + digestConfig.frequency.slice(1)}`,
    body: sections.length > 0 ? sections.join("\n") : "No digest content available.",
    priority: "low",
    category: "digest",
    metadata: { userId, digestConfig },
    timestamp: new Date().toISOString(),
  };

  return sendNotification(payload, userChannels);
}

/**
 * Register a notification channel.
 */
export function registerChannel(channel: NotificationChannel): NotificationChannel {
  const parsed = NotificationChannelSchema.parse(channel);
  channels.set(parsed.id, parsed);
  return parsed;
}

/**
 * Remove a notification channel by ID.
 */
export function removeChannel(channelId: string): boolean {
  return channels.delete(channelId);
}

/**
 * Get registered channels, optionally filtered by user preferences.
 */
export function getChannels(userId?: string): NotificationChannel[] {
  if (userId) {
    const prefs = preferences.get(userId);
    if (!prefs) return [];
    return prefs.channels
      .map((id) => channels.get(id))
      .filter((c): c is NotificationChannel => !!c);
  }
  return Array.from(channels.values());
}

/**
 * Update notification preferences for a user.
 */
export function updatePreferences(
  userId: string,
  prefs: Partial<Omit<NotificationPreferences, "userId">>,
): NotificationPreferences {
  const existing = preferences.get(userId);
  const updated: NotificationPreferences = {
    userId,
    channels: prefs.channels ?? existing?.channels ?? [],
    digestFrequency: prefs.digestFrequency ?? existing?.digestFrequency ?? "daily",
    quietHours: prefs.quietHours ?? existing?.quietHours,
    categories: prefs.categories ?? existing?.categories ?? {},
  };
  preferences.set(userId, updated);
  return updated;
}

/**
 * Get notification preferences for a user.
 */
export function getPreferences(userId: string): NotificationPreferences | undefined {
  return preferences.get(userId);
}

// ---- Convenience Notification Functions ----

/**
 * Notify that an innovation session has completed.
 */
export async function notifySessionComplete(
  sessionData: { subject: string; ideaCount: number; topScore?: number; sessionId: string },
  targetChannels?: NotificationChannel[],
): Promise<NotificationDelivery[]> {
  const payload: NotificationPayload = {
    title: "Session Complete",
    body: `Innovation session on "${sessionData.subject}" finished with ${sessionData.ideaCount} ideas${sessionData.topScore != null ? ` (top score: ${sessionData.topScore})` : ""}.`,
    priority: "medium",
    category: "session_complete",
    metadata: sessionData,
    timestamp: new Date().toISOString(),
  };
  return sendNotification(payload, targetChannels ?? Array.from(channels.values()));
}

/**
 * Notify about a high-scoring idea.
 */
export async function notifyHighScoreIdea(
  idea: { title: string; description: string; sourceAngle: string },
  score: number,
  targetChannels?: NotificationChannel[],
): Promise<NotificationDelivery[]> {
  const payload: NotificationPayload = {
    title: `High-Scoring Idea: ${idea.title}`,
    body: `"${idea.title}" scored ${score}/10 via ${idea.sourceAngle}.\n\n${idea.description}`,
    priority: score >= 9 ? "urgent" : "high",
    category: "high_score_idea",
    metadata: { ...idea, score },
    timestamp: new Date().toISOString(),
  };
  return sendNotification(payload, targetChannels ?? Array.from(channels.values()));
}

/**
 * Notify about a collaboration event.
 */
export async function notifyCollaborationEvent(
  event: { type: string; userId: string; details: string },
  targetChannels?: NotificationChannel[],
): Promise<NotificationDelivery[]> {
  const payload: NotificationPayload = {
    title: `Collaboration: ${event.type}`,
    body: event.details,
    priority: "medium",
    category: "collaboration",
    metadata: event,
    timestamp: new Date().toISOString(),
  };
  return sendNotification(payload, targetChannels ?? Array.from(channels.values()));
}

// ---- Delivery History ----

/**
 * Query delivery history, optionally filtered by channel.
 */
export function getDeliveryHistory(channelId?: string, limit?: number): NotificationDelivery[] {
  let results = channelId
    ? deliveryLog.filter((d) => d.channelId === channelId)
    : [...deliveryLog];
  if (limit && limit > 0) {
    results = results.slice(-limit);
  }
  return results;
}

/**
 * Retry failed notification deliveries.
 */
export async function retryFailedDeliveries(
  channelId?: string,
): Promise<NotificationDelivery[]> {
  const failed = deliveryLog.filter(
    (d) => d.status === "failed" && (!channelId || d.channelId === channelId),
  );

  const retried: NotificationDelivery[] = [];
  for (const delivery of failed) {
    const channel = channels.get(delivery.channelId);
    if (!channel || !channel.enabled) continue;

    const provider = providers[channel.type];
    delivery.attempts += 1;
    delivery.lastAttemptAt = new Date().toISOString();

    const result = await provider.send(delivery.payload, channel.config);
    delivery.status = result.success ? "sent" : "failed";
    delivery.error = result.error;

    retried.push(delivery);
  }

  return retried;
}

// ---- Format Helpers ----

/**
 * Format a notification payload as Slack blocks.
 */
export function formatForSlack(
  payload: NotificationPayload,
): Record<string, unknown> {
  const priorityEmoji: Record<NotificationPriority, string> = {
    low: "ℹ️",
    medium: "📋",
    high: "⚠️",
    urgent: "🚨",
  };

  return {
    text: payload.title,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${priorityEmoji[payload.priority]} ${payload.title}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: payload.body },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Priority:* ${payload.priority} | *Category:* ${payload.category} | ${payload.timestamp}`,
          },
        ],
      },
    ],
  };
}

/**
 * Format a notification payload as a Teams adaptive card.
 */
export function formatForTeams(
  payload: NotificationPayload,
): Record<string, unknown> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: payload.title,
              size: "Large",
              weight: "Bolder",
            },
            {
              type: "TextBlock",
              text: payload.body,
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Priority", value: payload.priority },
                { title: "Category", value: payload.category },
                { title: "Time", value: payload.timestamp },
              ],
            },
          ],
        },
      },
    ],
  };
}

/**
 * Format a notification payload as an HTML email.
 */
export function formatForEmail(payload: NotificationPayload): string {
  const priorityColor: Record<NotificationPriority, string> = {
    low: "#6b7280",
    medium: "#2563eb",
    high: "#f59e0b",
    urgent: "#dc2626",
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-left: 4px solid ${priorityColor[payload.priority]}; padding-left: 16px;">
    <h2 style="margin: 0 0 8px 0;">${escapeHtml(payload.title)}</h2>
    <p style="margin: 0 0 16px 0; white-space: pre-line;">${escapeHtml(payload.body)}</p>
    <p style="margin: 0; font-size: 12px; color: #6b7280;">
      Priority: ${payload.priority} · Category: ${payload.category} · ${payload.timestamp}
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Channel Testing ----

/**
 * Send a test notification to verify a channel's configuration.
 */
export async function testChannel(channel: NotificationChannel): Promise<DeliveryResult> {
  const payload: NotificationPayload = {
    title: "Test Notification",
    body: "This is a test notification to verify your channel configuration.",
    priority: "low",
    category: "system",
    timestamp: new Date().toISOString(),
  };

  const provider = providers[channel.type];
  return provider.send(payload, channel.config);
}

/**
 * Clear all channels, preferences, and delivery log (for testing).
 */
export function clearNotifications(): void {
  channels.clear();
  preferences.clear();
  deliveryLog.length = 0;
}
