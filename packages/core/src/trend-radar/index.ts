/**
 * @module trend-radar
 *
 * Innovation Digest & Trend Radar — cross-session topic extraction,
 * trend detection with time-series analysis, pattern clustering,
 * LLM-powered newsletter generation, and interactive radar visualization
 * data showing topic velocity with drill-down support.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** A topic extracted from sessions. */
export const ExtractedTopicSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(300),
  keywords: z.array(z.string().max(100)).max(30),
  frequency: z.number().int().min(1),
  firstSeen: z.string(),
  lastSeen: z.string(),
  sessionIds: z.array(z.string()).max(1000),
});
export type ExtractedTopic = z.infer<typeof ExtractedTopicSchema>;

/** Trend direction classification. */
export const TrendDirectionSchema = z.enum(["rising", "stable", "declining", "emerging", "fading"]);
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;

/** A detected trend with velocity. */
export const TrendSchema = z.object({
  topicId: z.string(),
  label: z.string().max(300),
  direction: TrendDirectionSchema,
  velocity: z.number().min(-1).max(1),
  momentum: z.number().min(0).max(1),
  timeSeriesPoints: z
    .array(
      z.object({
        period: z.string(),
        count: z.number().int().min(0),
      })
    )
    .max(52),
  confidence: z.number().min(0).max(1),
});
export type Trend = z.infer<typeof TrendSchema>;

/** A cluster of related topics. */
export const TopicClusterSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(300),
  topicIds: z.array(z.string()).min(1).max(100),
  centroidKeywords: z.array(z.string().max(100)).max(20),
  coherenceScore: z.number().min(0).max(1),
});
export type TopicCluster = z.infer<typeof TopicClusterSchema>;

/** Radar ring classification. */
export const RadarRingSchema = z.enum(["adopt", "trial", "assess", "hold"]);
export type RadarRing = z.infer<typeof RadarRingSchema>;

/** Radar quadrant classification. */
export const RadarQuadrantSchema = z.enum([
  "techniques",
  "platforms",
  "tools",
  "languages-frameworks",
]);
export type RadarQuadrant = z.infer<typeof RadarQuadrantSchema>;

/** A radar blip (item on the radar). */
export const RadarBlipSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(300),
  ring: RadarRingSchema,
  quadrant: RadarQuadrantSchema,
  description: z.string().max(1000),
  trend: TrendDirectionSchema,
  velocity: z.number().min(-1).max(1),
  isNew: z.boolean(),
  relatedTopicIds: z.array(z.string()).max(20),
});
export type RadarBlip = z.infer<typeof RadarBlipSchema>;

/** Full radar snapshot. */
export const RadarSnapshotSchema = z.object({
  id: z.string(),
  generatedAt: z.string(),
  period: z.string().max(100),
  blips: z.array(RadarBlipSchema).max(200),
  summary: z.string().max(5000),
});
export type RadarSnapshot = z.infer<typeof RadarSnapshotSchema>;

/** Newsletter format. */
export const NewsletterFormatSchema = z.enum(["html", "markdown", "text"]);
export type NewsletterFormat = z.infer<typeof NewsletterFormatSchema>;

/** Generated newsletter. */
export const NewsletterSchema = z.object({
  id: z.string(),
  title: z.string().max(300),
  subtitle: z.string().max(500).optional(),
  generatedAt: z.string(),
  period: z.string(),
  format: NewsletterFormatSchema,
  content: z.string(),
  topTrends: z.array(TrendSchema).max(10),
  topClusters: z.array(TopicClusterSchema).max(5),
});
export type Newsletter = z.infer<typeof NewsletterSchema>;

// ---- Session Input Type ----

export interface SessionData {
  id: string;
  subject: string;
  keywords?: string[];
  angleIds?: string[];
  ideas?: Array<{ title: string; description: string }>;
  timestamp: string;
}

// ---- In-Memory Stores ----

const topics = new Map<string, ExtractedTopic>();
const trends: Trend[] = [];
const clusters: TopicCluster[] = [];
const radarSnapshots: RadarSnapshot[] = [];
const newsletters: Newsletter[] = [];

// ---- Topic Extraction ----

/** Extract topics from a batch of session data using TF-IDF-like keyword analysis. */
export function extractTopics(sessions: SessionData[]): ExtractedTopic[] {
  const wordFrequency = new Map<
    string,
    { count: number; sessionIds: Set<string>; firstSeen: string; lastSeen: string }
  >();
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "when",
    "where",
    "how",
    "what",
    "which",
    "who",
    "whom",
    "this",
    "that",
    "these",
    "those",
    "with",
    "from",
    "for",
    "not",
    "no",
    "of",
    "in",
    "on",
    "at",
    "to",
    "by",
    "it",
    "its",
    "as",
    "so",
    "up",
    "about",
    "into",
    "over",
    "after",
    "before",
    "between",
    "under",
    "above",
    "more",
    "most",
    "some",
    "any",
    "all",
    "each",
    "every",
    "both",
    "few",
    "than",
    "too",
    "very",
    "just",
    "also",
    "now",
    "here",
    "there",
    "out",
  ]);

  for (const session of sessions) {
    const text = [
      session.subject,
      ...(session.keywords ?? []),
      ...(session.ideas?.map((i) => `${i.title} ${i.description}`) ?? []),
    ].join(" ");

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      const existing = wordFrequency.get(word);
      if (existing) {
        existing.count++;
        existing.sessionIds.add(session.id);
        if (session.timestamp < existing.firstSeen) existing.firstSeen = session.timestamp;
        if (session.timestamp > existing.lastSeen) existing.lastSeen = session.timestamp;
      } else {
        wordFrequency.set(word, {
          count: 1,
          sessionIds: new Set([session.id]),
          firstSeen: session.timestamp,
          lastSeen: session.timestamp,
        });
      }
    }
  }

  // Filter: require at least 2 occurrences for meaningful topics
  const minFrequency = Math.max(2, Math.floor(sessions.length * 0.05));
  const extracted: ExtractedTopic[] = [];

  for (const [word, data] of wordFrequency) {
    if (data.count >= minFrequency) {
      const topic: ExtractedTopic = {
        id: `topic-${word}`,
        label: word,
        keywords: [word],
        frequency: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        sessionIds: [...data.sessionIds],
      };
      topics.set(topic.id, topic);
      extracted.push(topic);
    }
  }

  return extracted.sort((a, b) => b.frequency - a.frequency);
}

// ---- Trend Detection ----

/** Detect trends from extracted topics using time-series analysis. */
export function detectTrends(
  extractedTopics: ExtractedTopic[],
  sessions: SessionData[],
  periodWeeks: number = 12
): Trend[] {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  trends.length = 0;

  for (const topic of extractedTopics) {
    // Build time series: counts per week
    const timeSeries: Array<{ period: string; count: number }> = [];
    for (let i = periodWeeks - 1; i >= 0; i--) {
      const weekStart = now - (i + 1) * weekMs;
      const weekEnd = now - i * weekMs;
      const count = sessions.filter((s) => {
        const ts = new Date(s.timestamp).getTime();
        return ts >= weekStart && ts < weekEnd && topic.sessionIds.includes(s.id);
      }).length;
      const periodDate = new Date(weekStart);
      timeSeries.push({ period: periodDate.toISOString().split("T")[0], count });
    }

    // Compute velocity: linear regression slope normalized
    const values = timeSeries.map((p) => p.count);
    const n = values.length;
    if (n < 2) continue;

    const meanX = (n - 1) / 2;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - meanX) * (values[i] - meanY);
      denominator += (i - meanX) ** 2;
    }
    const slope = denominator > 0 ? numerator / denominator : 0;
    const maxSlope = Math.max(...values, 1);
    const velocity = Math.max(-1, Math.min(1, slope / maxSlope));

    // Momentum: recent activity vs total
    const recentCount = values.slice(-3).reduce((a, b) => a + b, 0);
    const totalCount = values.reduce((a, b) => a + b, 0);
    const momentum = totalCount > 0 ? recentCount / totalCount : 0;

    // Direction classification
    let direction: TrendDirection;
    if (topic.frequency <= 2 && velocity > 0.1) direction = "emerging";
    else if (velocity > 0.2) direction = "rising";
    else if (velocity < -0.2 && momentum < 0.2) direction = "fading";
    else if (velocity < -0.1) direction = "declining";
    else direction = "stable";

    // Confidence based on data points
    const confidence = Math.min(1, topic.frequency / 10);

    const trend: Trend = {
      topicId: topic.id,
      label: topic.label,
      direction,
      velocity,
      momentum,
      timeSeriesPoints: timeSeries,
      confidence,
    };

    trends.push(trend);
  }

  return trends.sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity));
}

// ---- Pattern Clustering ----

/** Cluster related topics using keyword overlap. */
export function clusterTopics(
  extractedTopics: ExtractedTopic[],
  minClusterSize: number = 2
): TopicCluster[] {
  clusters.length = 0;
  const assigned = new Set<string>();

  // Sort by frequency for seed selection
  const sorted = [...extractedTopics].sort((a, b) => b.frequency - a.frequency);

  for (const seed of sorted) {
    if (assigned.has(seed.id)) continue;

    const clusterMembers = [seed];
    assigned.add(seed.id);

    // Find related topics by session overlap (Jaccard similarity)
    for (const candidate of sorted) {
      if (assigned.has(candidate.id)) continue;

      const seedSessions = new Set(seed.sessionIds);
      const candidateSessions = new Set(candidate.sessionIds);
      const intersection = [...candidateSessions].filter((s) => seedSessions.has(s));
      const union = new Set([...seedSessions, ...candidateSessions]);
      const jaccard = union.size > 0 ? intersection.length / union.size : 0;

      if (jaccard > 0.3) {
        clusterMembers.push(candidate);
        assigned.add(candidate.id);
      }
    }

    if (clusterMembers.length >= minClusterSize) {
      const allKeywords = clusterMembers.flatMap((t) => t.keywords);
      const keywordCounts = new Map<string, number>();
      for (const kw of allKeywords) {
        keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
      }
      const centroidKeywords = [...keywordCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([kw]) => kw);

      const cluster: TopicCluster = {
        id: `cluster-${seed.id}`,
        label: clusterMembers
          .map((t) => t.label)
          .slice(0, 3)
          .join(" + "),
        topicIds: clusterMembers.map((t) => t.id),
        centroidKeywords,
        coherenceScore: Math.min(1, clusterMembers.length / 5),
      };
      clusters.push(cluster);
    }
  }

  return clusters;
}

// ---- Radar Generation ----

/** Classify a topic into a radar ring based on trend data. */
function classifyRing(trend: Trend | undefined, _frequency: number): RadarRing {
  if (!trend) return "assess";
  if (trend.direction === "rising" && trend.momentum > 0.6) return "adopt";
  if (trend.direction === "rising" || trend.direction === "stable") return "trial";
  if (trend.direction === "emerging") return "assess";
  return "hold";
}

/** Classify a topic into a radar quadrant based on keywords. */
function classifyQuadrant(topic: ExtractedTopic): RadarQuadrant {
  const text = topic.keywords.join(" ").toLowerCase();
  if (/framework|library|react|vue|angular|sdk|api/i.test(text)) return "languages-frameworks";
  if (/cloud|aws|azure|gcp|kubernetes|docker|platform/i.test(text)) return "platforms";
  if (/tool|ide|cli|editor|debug|monitor|test/i.test(text)) return "tools";
  return "techniques";
}

/** Generate a radar snapshot from current topics and trends. */
export function generateRadarSnapshot(
  extractedTopics: ExtractedTopic[],
  detectedTrends: Trend[],
  period: string
): RadarSnapshot {
  const trendMap = new Map(detectedTrends.map((t) => [t.topicId, t]));

  const blips: RadarBlip[] = extractedTopics.slice(0, 100).map((topic) => {
    const trend = trendMap.get(topic.id);
    return {
      id: `blip-${topic.id}`,
      label: topic.label,
      ring: classifyRing(trend, topic.frequency),
      quadrant: classifyQuadrant(topic),
      description: `Appeared in ${topic.frequency} sessions. Keywords: ${topic.keywords.join(", ")}`,
      trend: trend?.direction ?? "stable",
      velocity: trend?.velocity ?? 0,
      isNew: trend?.direction === "emerging",
      relatedTopicIds: [],
    };
  });

  const snapshot: RadarSnapshot = {
    id: `radar-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    period,
    blips,
    summary:
      `Innovation radar for ${period}: ${blips.length} topics tracked, ` +
      `${blips.filter((b) => b.ring === "adopt").length} to adopt, ` +
      `${blips.filter((b) => b.isNew).length} emerging.`,
  };

  radarSnapshots.push(snapshot);
  return snapshot;
}

// ---- Newsletter Generation ----

/** Generate an HTML newsletter from trends and clusters. */
export async function generateNewsletter(
  detectedTrends: Trend[],
  topicClusters: TopicCluster[],
  period: string,
  options?: { format?: NewsletterFormat; model?: string; signal?: AbortSignal }
): Promise<Newsletter> {
  const format = options?.format ?? "html";
  const topTrends = detectedTrends.slice(0, 10);
  const topClusters = topicClusters.slice(0, 5);

  const trendSummary = topTrends
    .map(
      (t) =>
        `- ${t.label}: ${t.direction} (velocity: ${t.velocity.toFixed(2)}, momentum: ${t.momentum.toFixed(2)})`
    )
    .join("\n");

  const clusterSummary = topClusters
    .map(
      (c) => `- ${c.label}: ${c.topicIds.length} topics, keywords: ${c.centroidKeywords.join(", ")}`
    )
    .join("\n");

  const prompt = `You are an innovation newsletter writer. Create a compelling ${format} newsletter.

${wrapUserInput("PERIOD", period)}
${wrapUserInput("TOP TRENDS", trendSummary)}
${wrapUserInput("TOPIC CLUSTERS", clusterSummary)}

Write a professional innovation digest newsletter with:
1. Executive summary of key trends
2. Deep dives on top 3 rising trends
3. Emerging opportunities section
4. Declining areas to watch
5. Recommended actions

${format === "html" ? "Format as clean HTML with inline styles suitable for email." : "Format as Markdown."}

Respond with JSON: { "title": "...", "subtitle": "...", "content": "..." }`;

  const raw = await withRetry(() =>
    generateText({
      prompt: sanitizeLlmOutput(prompt),
      model: options?.model,
      signal: options?.signal,
    })
  );

  const parsed = (() => {
    try {
      return JSON.parse(extractJson(raw)) as { title: string; subtitle?: string; content: string };
    } catch {
      return undefined;
    }
  })() ?? {
    title: `Innovation Digest — ${period}`,
    content: raw,
  };

  const newsletter: Newsletter = {
    id: `newsletter-${Date.now()}`,
    title: parsed.title,
    subtitle: parsed.subtitle,
    generatedAt: new Date().toISOString(),
    period,
    format,
    content: parsed.content,
    topTrends,
    topClusters,
  };

  newsletters.push(newsletter);
  return newsletter;
}

// ---- Query Functions ----

/** Get all detected trends. */
export function getTrends(): Trend[] {
  return [...trends];
}

/** Get all topic clusters. */
export function getTopicClusters(): TopicCluster[] {
  return [...clusters];
}

/** Get radar snapshots. */
export function getRadarSnapshots(): RadarSnapshot[] {
  return [...radarSnapshots];
}

/** Get a specific radar blip with drill-down data. */
export function getRadarBlipDetails(
  snapshotId: string,
  blipId: string
): { blip: RadarBlip; topic?: ExtractedTopic; trend?: Trend } | undefined {
  const snapshot = radarSnapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return undefined;

  const blip = snapshot.blips.find((b) => b.id === blipId);
  if (!blip) return undefined;

  const topicId = blip.id.replace("blip-", "");
  const topic = topics.get(topicId);
  const trend = trends.find((t) => t.topicId === topicId);

  return { blip, topic, trend };
}

/** Get newsletters. */
export function getNewsletters(): Newsletter[] {
  return [...newsletters];
}

// ---- Store Management ----

/** Clear all trend radar data (for testing). */
export function clearTrendRadarData(): void {
  topics.clear();
  trends.length = 0;
  clusters.length = 0;
  radarSnapshots.length = 0;
  newsletters.length = 0;
}
