/**
 * @module seismograph
 *
 * Innovation Seismograph — signal collection, NLP-based tremor detection
 * via clustering, and intelligence briefing generation.
 */

import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { SeismographSignal, Tremor, SeismographBriefing, SeismographConfig } from "./types.js";
import { SeismographSignalSchema, TremorSchema, SeismographBriefingSchema } from "./types.js";

export * from "./types.js";

// ---- Signal Collection ----

/**
 * Collect signals from configured sources. In production, this would call
 * external APIs (arXiv, USPTO, Federal Register, etc.). This implementation
 * uses LLM to generate synthetic signals for the given topics.
 */
export async function collectSignals(config: SeismographConfig): Promise<SeismographSignal[]> {
  const { topics, model, signal } = config;
  const sourceTypes = config.sourceTypes ?? ["patent", "academic", "regulatory", "social", "news"];

  config.onProgress?.({
    stage: "collecting",
    signalsCollected: 0,
    tremorsDetected: 0,
  });

  const prompt = `You are an innovation intelligence analyst. Generate realistic weak signals for the following topics from various sources.

TOPICS: ${topics.join(", ")}
SOURCE TYPES: ${sourceTypes.join(", ")}

For each topic, generate 2-3 realistic signals that represent early indicators of potential disruption. Each signal should reference a plausible source (arXiv paper, patent filing, regulatory change, social trend, news article).

Respond in JSON:
{
  "signals": [
    {
      "sourceType": "<patent|academic|regulatory|social|news>",
      "title": "<realistic title>",
      "summary": "<2-3 sentence summary>",
      "sourceDatabase": "<e.g., arXiv, USPTO, Federal Register, Twitter/X, TechCrunch>",
      "topics": ["<topic1>", "<topic2>"],
      "relevanceScore": <0-1>,
      "noveltyScore": <0-1>
    }
  ]
}
Generate 5-10 signals total.`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    },
    { signal }
  );

  const now = new Date().toISOString();
  const signals: SeismographSignal[] = (result.signals ?? [])
    .slice(0, 20)
    .map((s: Record<string, unknown>) => {
      try {
        return SeismographSignalSchema.parse({
          id: randomUUID(),
          sourceType: s.sourceType ?? "news",
          title: String(s.title ?? "").slice(0, 1000),
          summary: String(s.summary ?? "").slice(0, 5000),
          sourceUrl: s.sourceUrl ? String(s.sourceUrl).slice(0, 2000) : undefined,
          sourceDatabase: String(s.sourceDatabase ?? "unknown").slice(0, 200),
          topics: (Array.isArray(s.topics) ? s.topics : [])
            .slice(0, 30)
            .map((t: unknown) => String(t).slice(0, 200)),
          relevanceScore: Math.max(0, Math.min(1, Number(s.relevanceScore) || 0.5)),
          noveltyScore: Math.max(0, Math.min(1, Number(s.noveltyScore) || 0.5)),
          publishedAt: now,
          collectedAt: now,
        });
      } catch {
        return null;
      }
    })
    .filter((s: SeismographSignal | null): s is SeismographSignal => s !== null);

  config.onProgress?.({
    stage: "collecting",
    signalsCollected: signals.length,
    tremorsDetected: 0,
  });

  return signals;
}

// ---- Tremor Detection (NLP Clustering) ----

/**
 * Detect tremors by clustering related signals using LLM-based analysis.
 */
export async function detectTremors(
  signals: SeismographSignal[],
  config: SeismographConfig
): Promise<Tremor[]> {
  if (signals.length < (config.minTremorSignals ?? 2)) return [];

  config.onProgress?.({
    stage: "clustering",
    signalsCollected: signals.length,
    tremorsDetected: 0,
  });

  const signalSummaries = signals.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    topics: s.topics,
    sourceType: s.sourceType,
    relevance: s.relevanceScore,
    novelty: s.noveltyScore,
  }));

  const prompt = `You are an innovation intelligence analyst. Analyze these signals for emerging trends and disruptive shifts.

${wrapUserInput("SIGNALS", JSON.stringify(signalSummaries, null, 2))}

Identify clusters of related signals that together indicate a significant shift.
For each cluster (tremor), assess:
- Severity: micro (2-3 signals, low coherence), minor (3-5, moderate), moderate (5-7, high), major (7-10, very high), mega (10+)
- Time horizon for impact
- Affected domains

Respond in JSON:
{
  "tremors": [
    {
      "name": "<descriptive name>",
      "description": "<what this trend means>",
      "severity": "<micro|minor|moderate|major|mega>",
      "score": <0-100>,
      "signalIds": ["<id1>", "<id2>"],
      "affectedDomains": ["<domain1>"],
      "timeHorizon": "<months|1-2years|3-5years|5+years>",
      "confidence": <0-1>
    }
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    },
    { signal: config.signal }
  );

  const now = new Date().toISOString();
  const tremors: Tremor[] = (result.tremors ?? [])
    .slice(0, 20)
    .map((t: Record<string, unknown>) => {
      try {
        const signalIds = (Array.isArray(t.signalIds) ? t.signalIds : [])
          .filter((id: unknown) => signals.some((s) => s.id === id))
          .map((id: unknown) => String(id));
        if (signalIds.length === 0) return null;

        return TremorSchema.parse({
          id: randomUUID(),
          name: String(t.name ?? "Unknown Trend").slice(0, 500),
          description: String(t.description ?? "").slice(0, 5000),
          severity: t.severity ?? "micro",
          score: Math.max(0, Math.min(100, Number(t.score) || 30)),
          signalIds,
          signalCount: signalIds.length,
          affectedDomains: (Array.isArray(t.affectedDomains) ? t.affectedDomains : [])
            .slice(0, 20)
            .map((d: unknown) => String(d).slice(0, 200)),
          timeHorizon: t.timeHorizon ?? "1-2years",
          confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
          firstDetectedAt: now,
          lastSignalAt: now,
        });
      } catch {
        return null;
      }
    })
    .filter((t: Tremor | null): t is Tremor => t !== null);

  config.onProgress?.({
    stage: "clustering",
    signalsCollected: signals.length,
    tremorsDetected: tremors.length,
  });

  return tremors;
}

// ---- Briefing Generation ----

/**
 * Generate an intelligence briefing from signals and tremors.
 */
export async function generateBriefing(
  signals: SeismographSignal[],
  tremors: Tremor[],
  config: SeismographConfig & { type?: "daily" | "weekly" | "monthly" | "ad-hoc" }
): Promise<SeismographBriefing> {
  config.onProgress?.({
    stage: "briefing",
    signalsCollected: signals.length,
    tremorsDetected: tremors.length,
  });

  const prompt = `You are a chief innovation officer's intelligence briefing writer.

Summarize the following signals and tremors into an executive briefing.

SIGNALS (${signals.length} total):
${signals
  .slice(0, 10)
  .map((s) => `- [${s.sourceType}] ${s.title}: ${s.summary}`)
  .join("\n")}

TREMORS (${tremors.length} detected):
${tremors.map((t) => `- [${t.severity}] ${t.name} (score: ${t.score}): ${t.description}`).join("\n")}

${wrapUserInput("MONITORING TOPICS", config.topics.join(", "))}

Write a concise executive summary and a prioritized watch list.

Respond in JSON:
{
  "executiveSummary": "<3-5 paragraph briefing>",
  "watchList": [
    {"topic": "<topic>", "reason": "<why to watch>", "priority": "<low|medium|high|critical>"}
  ]
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    },
    { signal: config.signal }
  );

  const now = new Date().toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const briefing = SeismographBriefingSchema.parse({
    id: randomUUID(),
    periodStart: oneDayAgo,
    periodEnd: now,
    type: config.type ?? "ad-hoc",
    signalsCollected: signals.length,
    tremors,
    topSignals: signals.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 20),
    executiveSummary: String(result.executiveSummary ?? "No summary available.").slice(0, 10000),
    watchList: (result.watchList ?? []).slice(0, 20).map((w: Record<string, unknown>) => ({
      topic: String(w.topic ?? "").slice(0, 200),
      reason: String(w.reason ?? "").slice(0, 1000),
      priority: w.priority ?? "medium",
    })),
    generatedAt: now,
  });

  config.onProgress?.({
    stage: "complete",
    signalsCollected: signals.length,
    tremorsDetected: tremors.length,
  });

  return briefing;
}

/**
 * Run the full seismograph pipeline: collect → detect → brief.
 */
export async function runSeismograph(
  config: SeismographConfig & { type?: "daily" | "weekly" | "monthly" | "ad-hoc" }
): Promise<SeismographBriefing> {
  const signals = await collectSignals(config);

  const relevanceThreshold = config.relevanceThreshold ?? 0.3;
  const filteredSignals = signals.filter((s) => s.relevanceScore >= relevanceThreshold);

  const tremors = await detectTremors(filteredSignals, config);
  return generateBriefing(filteredSignals, tremors, config);
}
