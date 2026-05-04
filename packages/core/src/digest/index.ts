/**
 * @module digest
 *
 * Innovation Digest — AI-generated periodic summaries of innovation
 * activity. Supports email, Slack, and RSS delivery channels.
 * Aggregates recent sessions, top ideas, trending subjects, and
 * activity metrics into a consumable digest format.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for digest frequency. */
export const DigestFrequencySchema = z.enum(["daily", "weekly", "monthly"]);

/** Schema for a delivery channel configuration. */
export const DeliveryChannelSchema = z.object({
  type: z.enum(["email", "slack", "rss", "webhook"]),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});

/** Schema for a digest subscription. */
export const DigestSubscriptionSchema = z.object({
  id: z.string().min(1).max(200),
  userId: z.string().max(200),
  frequency: DigestFrequencySchema,
  channels: z.array(DeliveryChannelSchema).min(1).max(10),
  topics: z.array(z.string().max(200)).max(20).optional(),
  createdAt: z.string(),
  lastSentAt: z.string().optional(),
  enabled: z.boolean().default(true),
});

/** Schema for a digest idea highlight. */
export const DigestIdeaSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(1000),
  sourceAngle: z.string().max(200),
  score: z.number().min(0).max(10).optional(),
  sessionDate: z.string(),
});

/** Schema for a digest section. */
export const DigestSectionSchema = z.object({
  title: z.string().max(200),
  content: z.string().max(5000),
  type: z.enum(["summary", "top-ideas", "trending", "metrics", "recommendations"]),
});

/** Schema for a generated digest. */
export const InnovationDigestSchema = z.object({
  id: z.string().min(1).max(200),
  subscriptionId: z.string().max(200),
  frequency: DigestFrequencySchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  title: z.string().max(500),
  summary: z.string().max(2000),
  sections: z.array(DigestSectionSchema).max(20),
  topIdeas: z.array(DigestIdeaSchema).max(20),
  metrics: z.object({
    totalSessions: z.number(),
    totalIdeas: z.number(),
    anglesUsed: z.number(),
    averageScore: z.number(),
  }),
  generatedAt: z.string(),
});

/** Schema for RSS feed item. */
export const RSSItemSchema = z.object({
  title: z.string().max(500),
  description: z.string().max(5000),
  link: z.string().max(2000).optional(),
  pubDate: z.string(),
  guid: z.string().max(200),
});

// ---- Types ----

export type DigestFrequency = z.infer<typeof DigestFrequencySchema>;
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;
export type DigestSubscription = z.infer<typeof DigestSubscriptionSchema>;
export type DigestIdea = z.infer<typeof DigestIdeaSchema>;
export type DigestSection = z.infer<typeof DigestSectionSchema>;
export type InnovationDigest = z.infer<typeof InnovationDigestSchema>;
export type RSSItem = z.infer<typeof RSSItemSchema>;

/** Input data for digest generation. */
export interface DigestInput {
  sessions: Array<{
    subject: string;
    date: string;
    ideas: Array<{ title: string; description: string; sourceAngle: string; score?: number }>;
    anglesUsed: string[];
  }>;
  period: { start: string; end: string };
  frequency: DigestFrequency;
}

// ---- In-Memory Store ----

const subscriptions: Map<string, DigestSubscription> = new Map();
const generatedDigests: InnovationDigest[] = [];

// ---- Subscription Management ----

/**
 * Create a digest subscription.
 */
export function createSubscription(
  userId: string,
  frequency: DigestFrequency,
  channels: DeliveryChannel[],
  topics?: string[]
): DigestSubscription {
  const id = `digest-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sub: DigestSubscription = {
    id,
    userId,
    frequency,
    channels,
    topics,
    createdAt: new Date().toISOString(),
    enabled: true,
  };
  subscriptions.set(id, sub);
  return sub;
}

/**
 * Get a subscription by ID.
 */
export function getSubscription(id: string): DigestSubscription | undefined {
  return subscriptions.get(id);
}

/**
 * List subscriptions, optionally filtered by user.
 */
export function listSubscriptions(userId?: string): DigestSubscription[] {
  const all = Array.from(subscriptions.values());
  return userId ? all.filter((s) => s.userId === userId) : all;
}

/**
 * Update subscription settings.
 */
export function updateSubscription(
  id: string,
  updates: Partial<Pick<DigestSubscription, "frequency" | "channels" | "topics" | "enabled">>
): DigestSubscription | undefined {
  const sub = subscriptions.get(id);
  if (!sub) return undefined;

  if (updates.frequency) sub.frequency = updates.frequency;
  if (updates.channels) sub.channels = updates.channels;
  if (updates.topics !== undefined) sub.topics = updates.topics;
  if (updates.enabled !== undefined) sub.enabled = updates.enabled;

  return sub;
}

/**
 * Delete a subscription.
 */
export function deleteSubscription(id: string): boolean {
  return subscriptions.delete(id);
}

/**
 * Clear all subscriptions and digests (for testing).
 */
export function clearDigests(): void {
  subscriptions.clear();
  generatedDigests.length = 0;
}

// ---- Digest Generation ----

/**
 * Generate a digest from session data.
 */
export function generateDigest(
  subscriptionId: string,
  input: DigestInput
): InnovationDigest {
  const allIdeas = input.sessions.flatMap((s) =>
    s.ideas.map((idea) => ({
      ...idea,
      sessionDate: s.date,
    }))
  );

  // Sort ideas by score (descending)
  const topIdeas = [...allIdeas]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 10)
    .map((idea) => DigestIdeaSchema.parse(idea));

  // Compute metrics
  const totalSessions = input.sessions.length;
  const totalIdeas = allIdeas.length;
  const anglesUsed = new Set(input.sessions.flatMap((s) => s.anglesUsed)).size;
  const scores = allIdeas.map((i) => i.score).filter((s): s is number => s !== undefined);
  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : 0;

  // Build sections
  const sections: DigestSection[] = [];

  // Summary section
  sections.push({
    title: "Overview",
    content: `This ${input.frequency} digest covers ${totalSessions} innovation session${totalSessions !== 1 ? "s" : ""} with ${totalIdeas} ideas generated across ${anglesUsed} angles.`,
    type: "summary",
  });

  // Top ideas section
  if (topIdeas.length > 0) {
    const ideaList = topIdeas
      .slice(0, 5)
      .map((i, idx) => `${idx + 1}. **${i.title}** (${i.sourceAngle})${i.score ? ` — Score: ${i.score}` : ""}`)
      .join("\n");
    sections.push({
      title: "Top Ideas",
      content: ideaList,
      type: "top-ideas",
    });
  }

  // Trending subjects
  const subjectCounts = new Map<string, number>();
  for (const session of input.sessions) {
    const words = session.subject.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      subjectCounts.set(word, (subjectCounts.get(word) ?? 0) + 1);
    }
  }
  const trending = Array.from(subjectCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  if (trending.length > 0) {
    sections.push({
      title: "Trending Topics",
      content: `Hot topics this period: ${trending.join(", ")}`,
      type: "trending",
    });
  }

  // Metrics section
  sections.push({
    title: "Metrics",
    content: `Sessions: ${totalSessions} | Ideas: ${totalIdeas} | Angles: ${anglesUsed} | Avg Score: ${averageScore}`,
    type: "metrics",
  });

  const title = `Innovation Digest — ${input.frequency.charAt(0).toUpperCase() + input.frequency.slice(1)} Report`;

  const digest: InnovationDigest = {
    id: `digest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subscriptionId,
    frequency: input.frequency,
    periodStart: input.period.start,
    periodEnd: input.period.end,
    title,
    summary: `${totalSessions} sessions, ${totalIdeas} ideas, avg score ${averageScore}`,
    sections,
    topIdeas,
    metrics: { totalSessions, totalIdeas, anglesUsed, averageScore },
    generatedAt: new Date().toISOString(),
  };

  generatedDigests.push(digest);

  // Update subscription last sent timestamp
  const sub = subscriptions.get(subscriptionId);
  if (sub) sub.lastSentAt = digest.generatedAt;

  return digest;
}

/**
 * Get all generated digests.
 */
export function getGeneratedDigests(subscriptionId?: string): InnovationDigest[] {
  if (subscriptionId) {
    return generatedDigests.filter((d) => d.subscriptionId === subscriptionId);
  }
  return [...generatedDigests];
}

// ---- Format Renderers ----

/**
 * Render a digest as Markdown (for email/display).
 */
export function digestToMarkdown(digest: InnovationDigest): string {
  const lines: string[] = [
    `# ${digest.title}`,
    "",
    `*${digest.periodStart} — ${digest.periodEnd}*`,
    "",
    digest.summary,
    "",
  ];

  for (const section of digest.sections) {
    lines.push(`## ${section.title}`, "", section.content, "");
  }

  return lines.join("\n");
}

/**
 * Render a digest as a Slack message payload.
 */
export function digestToSlack(digest: InnovationDigest): {
  text: string;
  blocks: Array<Record<string, unknown>>;
} {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: digest.title },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: digest.summary },
    },
    { type: "divider" },
  ];

  for (const section of digest.sections) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${section.title}*\n${section.content}` },
    });
  }

  return {
    text: digest.title,
    blocks,
  };
}

/**
 * Render a digest as an RSS XML feed.
 */
export function digestToRSS(digests: InnovationDigest[], feedTitle?: string): string {
  const items = digests.map((d) => {
    const content = d.sections.map((s) => `<h3>${s.title}</h3><p>${s.content}</p>`).join("");
    return `    <item>
      <title>${escapeXml(d.title)}</title>
      <description><![CDATA[${content}]]></description>
      <pubDate>${new Date(d.generatedAt).toUTCString()}</pubDate>
      <guid>${d.id}</guid>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feedTitle ?? "Innovation Digest")}</title>
    <description>Periodic innovation summaries</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Get subscriptions due for digest generation.
 */
export function getDueSubscriptions(now?: Date): DigestSubscription[] {
  const currentTime = now ?? new Date();
  return Array.from(subscriptions.values()).filter((sub) => {
    if (!sub.enabled) return false;
    if (!sub.lastSentAt) return true;

    const lastSent = new Date(sub.lastSentAt);
    const diffMs = currentTime.getTime() - lastSent.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    switch (sub.frequency) {
      case "daily":
        return diffHours >= 24;
      case "weekly":
        return diffHours >= 168;
      case "monthly":
        return diffHours >= 720;
      default:
        return false;
    }
  });
}
