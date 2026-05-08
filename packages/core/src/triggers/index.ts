/**
 * @module triggers
 *
 * Contextual Innovation Triggers — monitor external sources (RSS, GitHub
 * Releases, Hacker News, arXiv, patent filings, custom webhooks) for events
 * relevant to user-defined innovation interests. Includes semantic matching
 * via LLM, deduplication, frequency capping, and a configurable polling
 * pipeline.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

// ---- Zod Schemas ----

/** Supported trigger source types. */
export const TriggerSourceSchema = z.enum([
  "rss",
  "github-releases",
  "hacker-news",
  "arxiv",
  "patent-filings",
  "custom-webhook",
]);
export type TriggerSource = z.infer<typeof TriggerSourceSchema>;

/** Filter rules applied to incoming trigger events. */
export const TriggerFilterSchema = z.object({
  keywords: z.array(z.string().max(200)).max(50).optional(),
  categories: z.array(z.string().max(100)).max(20).optional(),
  minRelevance: z.number().min(0).max(1).optional(),
});
export type TriggerFilter = z.infer<typeof TriggerFilterSchema>;

/** Frequency cap — limits on how many triggers may fire within a window. */
export const FrequencyCapSchema = z.object({
  maxPerHour: z.number().int().min(0).optional(),
  maxPerDay: z.number().int().min(0).optional(),
});
export type FrequencyCap = z.infer<typeof FrequencyCapSchema>;

/** Configuration for a trigger source. */
export const TriggerConfigSchema = z.object({
  source: TriggerSourceSchema,
  filter: TriggerFilterSchema.optional(),
  frequencyCap: FrequencyCapSchema.optional(),
  /** Deduplication window in milliseconds (default: 24 h). */
  deduplicationWindowMs: z.number().int().min(0).optional(),
  /** Arbitrary source-specific settings (e.g. feed URL, repo name). */
  options: z.record(z.unknown()).optional(),
});
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

/** A single trigger event emitted by a source adapter. */
export const TriggerEventSchema = z.object({
  source: TriggerSourceSchema,
  title: z.string().max(500),
  url: z.string().max(2000).optional(),
  summary: z.string().max(2000),
  relevanceScore: z.number().min(0).max(1),
  matchedInterests: z.array(z.string().max(200)).max(50),
  timestamp: z.string(),
  /** Content fingerprint used for deduplication. */
  fingerprint: z.string().max(500),
});
export type TriggerEvent = z.infer<typeof TriggerEventSchema>;

/** User-defined innovation interest for semantic matching. */
export const InnovationInterestSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(300),
  keywords: z.array(z.string().max(200)).max(50),
  domains: z.array(z.string().max(200)).max(20).optional(),
  semanticDescriptors: z.array(z.string().max(500)).max(20).optional(),
});
export type InnovationInterest = z.infer<typeof InnovationInterestSchema>;

// ---- Adapter Interface ----

/** Interface for pluggable trigger source adapters. */
export interface TriggerSourceAdapter {
  type: TriggerSource;
  /** Fetch events from this source, respecting optional abort signal. */
  fetchEvents(config: TriggerConfig, signal?: AbortSignal): Promise<TriggerEvent[]>;
}

// ---- Built-in Adapters ----

function fingerprint(source: string, title: string): string {
  return `${source}::${title.toLowerCase().replace(/\s+/g, "-").slice(0, 200)}`;
}

function makeLLMAdapter(type: TriggerSource, sourceName: string): TriggerSourceAdapter {
  return {
    type,
    async fetchEvents(config, signal) {
      const keywords = config.filter?.keywords?.join(", ") ?? "general innovation";
      const prompt = `You are an intelligence analyst monitoring ${sourceName}.

${wrapUserInput("KEYWORDS", keywords)}

Provide up to 5 recent noteworthy items from ${sourceName} related to those keywords.

You MUST respond with valid JSON only:
{
  "events": [
    {
      "title": "Event title",
      "url": "https://example.com/...",
      "summary": "Brief description",
      "relevanceScore": 0.85
    }
  ]
}`;
      try {
        const raw = await withRetry(
          async () => {
            const result = await generateText({ prompt, serverMode: true, signal });
            return extractJson(result);
          },
          { signal }
        );
        const parsed = JSON.parse(raw) as {
          events: Array<{ title: string; url?: string; summary: string; relevanceScore: number }>;
        };
        return parsed.events.slice(0, 5).map((e) => ({
          source: type,
          title: sanitizeLlmOutput(e.title),
          url: e.url,
          summary: sanitizeLlmOutput(e.summary),
          relevanceScore: Math.max(0, Math.min(1, e.relevanceScore)),
          matchedInterests: [] as string[],
          timestamp: new Date().toISOString(),
          fingerprint: fingerprint(type, e.title),
        }));
      } catch {
        return [];
      }
    },
  };
}

/** RSS feed adapter. */
export const RSSAdapter: TriggerSourceAdapter = makeLLMAdapter("rss", "RSS feeds");

/** GitHub Releases adapter. */
export const GitHubReleasesAdapter: TriggerSourceAdapter = makeLLMAdapter(
  "github-releases",
  "GitHub Releases"
);

/** Hacker News adapter. */
export const HackerNewsAdapter: TriggerSourceAdapter = makeLLMAdapter("hacker-news", "Hacker News");

/** arXiv adapter. */
export const ArxivAdapter: TriggerSourceAdapter = makeLLMAdapter("arxiv", "arXiv");

/** Patent filings adapter. */
export const PatentAdapter: TriggerSourceAdapter = makeLLMAdapter(
  "patent-filings",
  "patent filing databases"
);

// ---- Semantic Matcher ----

/**
 * Use LLM to score how relevant a trigger event is to a set of user interests.
 * Returns the event with `relevanceScore` and `matchedInterests` populated.
 */
export async function matchEventToInterests(
  event: TriggerEvent,
  interests: InnovationInterest[],
  model?: string,
  signal?: AbortSignal
): Promise<TriggerEvent> {
  if (interests.length === 0) return { ...event, relevanceScore: 0, matchedInterests: [] };

  const interestBlock = interests
    .map(
      (i) =>
        `- ${i.label}: keywords=[${i.keywords.join(", ")}]${i.domains?.length ? `, domains=[${i.domains.join(", ")}]` : ""}${i.semanticDescriptors?.length ? `, descriptors=[${i.semanticDescriptors.join(", ")}]` : ""}`
    )
    .join("\n");

  const prompt = `You are an innovation relevance analyst.

EVENT:
Title: ${wrapUserInput("TITLE", event.title)}
Summary: ${wrapUserInput("SUMMARY", event.summary)}

USER INTERESTS:
${interestBlock}

Score how relevant the event is to each interest (0-1). Return the overall relevance and the IDs of matched interests (score >= 0.5).

You MUST respond with valid JSON only:
{
  "relevanceScore": 0.85,
  "matchedInterests": ["interest-id-1"]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { relevanceScore: number; matchedInterests: string[] };
    return {
      ...event,
      relevanceScore: Math.max(0, Math.min(1, parsed.relevanceScore)),
      matchedInterests: parsed.matchedInterests ?? [],
    };
  } catch {
    return event;
  }
}

// ---- Trigger Pipeline ----

/** Callback for trigger events. */
export type TriggerCallback = (events: TriggerEvent[]) => void;

/**
 * Main trigger pipeline — registers adapters, polls sources, deduplicates,
 * applies frequency caps, runs semantic matching, and emits batched events.
 */
export class TriggerPipeline {
  private adapters: Map<TriggerSource, TriggerSourceAdapter> = new Map();
  private interests: InnovationInterest[] = [];
  private callbacks: TriggerCallback[] = [];
  private seenFingerprints: Map<string, number> = new Map();
  private emitTimestamps: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: TriggerConfig;

  constructor(config: TriggerConfig) {
    this.config = config;
  }

  /** Register a source adapter. */
  registerAdapter(adapter: TriggerSourceAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /** Add an innovation interest for semantic matching. */
  addInterest(interest: InnovationInterest): void {
    this.interests.push(interest);
  }

  /** Subscribe to trigger events. */
  onTrigger(callback: TriggerCallback): void {
    this.callbacks.push(callback);
  }

  /** Start polling at the given interval (default 60 000 ms). */
  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Execute a single poll cycle across all registered adapters. */
  private async poll(): Promise<void> {
    // Poll all registered adapters (not just the config source)
    const adaptersToRun = this.config.source
      ? ([this.adapters.get(this.config.source)].filter(Boolean) as TriggerSourceAdapter[])
      : [...this.adapters.values()];

    if (adaptersToRun.length === 0) return;

    let allEvents: TriggerEvent[] = [];
    const results = await Promise.allSettled(
      adaptersToRun.map((adapter) => adapter.fetchEvents(this.config))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allEvents.push(...result.value);
      }
    }

    if (allEvents.length === 0) return;

    // Dedup
    const dedupWindow = this.config.deduplicationWindowMs ?? 24 * 60 * 60 * 1000;
    const now = Date.now();
    this.pruneFingerprints(now, dedupWindow);
    allEvents = allEvents.filter((e) => {
      if (this.seenFingerprints.has(e.fingerprint)) return false;
      this.seenFingerprints.set(e.fingerprint, now);
      return true;
    });

    if (allEvents.length === 0) return;

    // Semantic matching
    const matched = await Promise.all(
      allEvents.map((e) => matchEventToInterests(e, this.interests))
    );

    // Apply min relevance filter
    const minRelevance = this.config.filter?.minRelevance ?? 0;
    const filtered = matched.filter((e) => e.relevanceScore >= minRelevance);
    if (filtered.length === 0) return;

    // Frequency cap
    const capped = this.applyFrequencyCap(filtered);
    if (capped.length === 0) return;

    // Emit
    for (const cb of this.callbacks) {
      try {
        cb(capped);
      } catch {
        // swallow callback errors
      }
    }
  }

  private pruneFingerprints(now: number, windowMs: number): void {
    for (const [fp, ts] of this.seenFingerprints) {
      if (now - ts > windowMs) this.seenFingerprints.delete(fp);
    }
  }

  private applyFrequencyCap(events: TriggerEvent[]): TriggerEvent[] {
    const cap = this.config.frequencyCap;
    if (!cap) return events;

    const now = Date.now();
    const hourAgo = now - 3_600_000;
    const dayAgo = now - 86_400_000;

    // Prune old timestamps
    this.emitTimestamps = this.emitTimestamps.filter((t) => t > dayAgo);

    const hourCount = this.emitTimestamps.filter((t) => t > hourAgo).length;
    const dayCount = this.emitTimestamps.length;

    let allowedByHour =
      cap.maxPerHour != null ? Math.max(0, cap.maxPerHour - hourCount) : events.length;
    let allowedByDay =
      cap.maxPerDay != null ? Math.max(0, cap.maxPerDay - dayCount) : events.length;
    const allowed = Math.min(allowedByHour, allowedByDay, events.length);

    const result = events.slice(0, allowed);
    for (let i = 0; i < result.length; i++) {
      this.emitTimestamps.push(now);
    }
    return result;
  }
}

// ---- Factory ----

/**
 * Create a fully wired TriggerPipeline with built-in adapters pre-registered.
 */
export function createTriggerPipeline(config: TriggerConfig): TriggerPipeline {
  const pipeline = new TriggerPipeline(config);
  pipeline.registerAdapter(RSSAdapter);
  pipeline.registerAdapter(GitHubReleasesAdapter);
  pipeline.registerAdapter(HackerNewsAdapter);
  pipeline.registerAdapter(ArxivAdapter);
  pipeline.registerAdapter(PatentAdapter);
  return pipeline;
}

// ---- Formatting ----

/** Format a TriggerEvent as a Markdown block. */
export function triggerEventToMarkdown(event: TriggerEvent): string {
  const lines: string[] = [
    `### ${event.title}`,
    "",
    `**Source:** ${event.source}  `,
    `**Relevance:** ${(event.relevanceScore * 100).toFixed(0)}%  `,
  ];
  if (event.url) lines.push(`**URL:** ${event.url}  `);
  if (event.matchedInterests.length > 0) {
    lines.push(`**Matched Interests:** ${event.matchedInterests.join(", ")}  `);
  }
  lines.push("", event.summary, "", `_${event.timestamp}_`);
  return lines.join("\n");
}
