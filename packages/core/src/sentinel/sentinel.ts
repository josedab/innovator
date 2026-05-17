/**
 * @module sentinel
 *
 * Sentinel engine — collects signals, filters by relevance, runs the
 * innovation pipeline on high-relevance signals, and produces daily briefs.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import { type AngleId } from "../types.js";
import {
  SentinelStateSchema,
  type SentinelConfig,
  type SentinelState,
  type DetectedSignal,
  type Opportunity,
  type DailyBrief,
  type SentinelProgress,
  type SignalSource,
} from "./types.js";

// ---- Constants ----

const DEFAULT_DIR = join(homedir(), ".innovator", "sentinel");
const STATE_FILE = "state.json";
const BRIEFS_DIR = "briefs";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- State Management ----

export function loadState(dir: string = DEFAULT_DIR): SentinelState {
  ensureDir(dir);
  const path = join(dir, STATE_FILE);
  if (existsSync(path)) {
    return SentinelStateSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  }
  return {
    totalRuns: 0,
    totalSignals: 0,
    totalOpportunities: 0,
    processedSignalIds: [],
    estimatedCostToDate: 0,
  };
}

function saveState(state: SentinelState, dir: string = DEFAULT_DIR): void {
  ensureDir(dir);
  atomicWrite(join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

// ---- Signal Collection ----

/** Parse a simple RSS/Atom feed from raw XML text. Returns title+link items. */
function parseSimpleFeed(xml: string): Array<{ title: string; link: string; summary: string }> {
  // Safety: reject binary/non-XML content
  if (!xml || xml.length === 0) return [];
  if (xml.length > 5_000_000) return []; // Skip feeds > 5MB
  // Check for XML-like content (must contain at least one angle bracket)
  if (!xml.includes("<")) return [];

  const items: Array<{ title: string; link: string; summary: string }> = [];
  const MAX_ITEMS = 50;
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
    const block = match[1];
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const linkMatch = /<link[^>]*(?:href="([^"]*)"[^>]*\/?>|>([\s\S]*?)<\/link>)/i.exec(block);
    const descMatch =
      /<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i.exec(
        block
      );

    const title = (titleMatch?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const link = (linkMatch?.[1] ?? linkMatch?.[2] ?? "").trim();
    const summary = (descMatch?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 500);

    if (title) {
      items.push({ title, link, summary });
    }
  }

  return items;
}

/** Collect signals from all configured sources. */
export async function collectSignals(
  sources: SignalSource[],
  processedIds: Set<string>
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  for (const source of sources) {
    if (!source.enabled || !source.url) continue;

    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "Innovator-Sentinel/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;
      const text = await response.text();

      // Try RSS/Atom parsing
      const items = parseSimpleFeed(text);

      for (const item of items.slice(0, 20)) {
        const signalId = `sig-${source.id}-${item.title.slice(0, 50).replace(/\W/g, "-")}`;
        if (processedIds.has(signalId)) continue;

        signals.push({
          id: signalId,
          sourceId: source.id,
          title: item.title.slice(0, 500),
          summary: item.summary.slice(0, 2000),
          url: item.link || undefined,
          detectedAt: new Date().toISOString(),
          relevanceScore: 0, // Will be scored in filtering step
          topics: source.topics ?? [],
          processed: false,
        });
      }
    } catch (err) {
      console.warn(
        "[sentinel] Source collection failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return signals;
}

// ---- Relevance Filtering ----

const RelevanceResponseSchema = z.object({
  relevanceScore: z.number().min(0).max(1),
  reasoning: z.string().max(500),
  matchedTopics: z.array(z.string().max(200)).max(10),
});

/** Score signal relevance using LLM. */
async function scoreRelevance(
  signal: DetectedSignal,
  topics: string[],
  config: SentinelConfig
): Promise<{ score: number; matchedTopics: string[] }> {
  const prompt = `Rate the relevance of this signal to the following innovation topics.

Signal: ${wrapUserInput("SIGNAL", `${signal.title}: ${signal.summary}`)}

Topics of interest: ${topics.join(", ")}

Respond in JSON:
{
  "relevanceScore": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "matchedTopics": ["topic1"]
}`;

  try {
    const result = await withRetry(
      async () => {
        const raw = await generateText({
          prompt,
          model: config.model,
          signal: config.signal,
        });
        return RelevanceResponseSchema.parse(JSON.parse(extractJson(sanitizeLlmOutput(raw))));
      },
      { signal: config.signal }
    );
    return { score: result.relevanceScore, matchedTopics: result.matchedTopics };
  } catch (err) {
    console.warn("[sentinel] Relevance scoring failed:", err instanceof Error ? err.message : err);
    return { score: 0, matchedTopics: [] };
  }
}

// ---- Opportunity Generation ----

async function generateOpportunity(
  signal: DetectedSignal,
  config: SentinelConfig
): Promise<Opportunity | null> {
  try {
    // Run investigation on the signal
    const investigation = await investigate(signal.title, config.model, config.signal);

    // Generate ideas from 2 angles
    const selectedAngles = (config.angles ?? ["cross-domain", "constraints"]).slice(
      0,
      2
    ) as AngleId[];
    const ideas: Opportunity["ideas"] = [];

    for (const angleId of selectedAngles) {
      try {
        const result = await generateForAngle(
          signal.title,
          investigation,
          angleId,
          config.model,
          config.signal
        );
        for (const idea of result.ideas.slice(0, 2)) {
          ideas.push({
            title: idea.title,
            description: idea.description,
            angleId,
          });
        }
      } catch (err) {
        console.warn(
          "[sentinel] Angle generation failed:",
          err instanceof Error ? err.message : err
        );
      }
    }

    if (ideas.length === 0) return null;

    return {
      id: `opp-${randomUUID().slice(0, 12)}`,
      signalId: signal.id,
      title: `Opportunity: ${signal.title}`,
      description: investigation.summary,
      ideas,
      investigationSummary: investigation.summary,
      overallRelevance: signal.relevanceScore,
      createdAt: new Date().toISOString(),
      status: "new",
    };
  } catch (err) {
    console.warn(
      "[sentinel] Opportunity generation failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ---- Sentinel Run ----

/**
 * Execute a single Sentinel run: collect signals, filter, investigate, generate brief.
 */
export async function runSentinel(
  config: SentinelConfig,
  onProgress?: (progress: SentinelProgress) => void
): Promise<DailyBrief> {
  // Validate config
  if (!config.sources || config.sources.length === 0) {
    throw new Error("At least one signal source is required");
  }
  if (!config.topics || config.topics.length === 0) {
    throw new Error("At least one topic is required for relevance filtering");
  }
  if (
    config.relevanceThreshold !== undefined &&
    (config.relevanceThreshold < 0 || config.relevanceThreshold > 1)
  ) {
    throw new Error("Relevance threshold must be between 0 and 1");
  }
  if (config.dailyCostBudget !== undefined && config.dailyCostBudget < 0) {
    throw new Error("Daily cost budget must be non-negative");
  }

  const state = loadState();
  const processedIds = new Set(state.processedSignalIds);
  const threshold = config.relevanceThreshold ?? 0.5;
  const maxSignals = config.maxSignalsPerRun ?? 5;
  const costBudget = config.dailyCostBudget ?? Infinity;
  // Rough cost estimate: ~$0.01 per relevance scoring, ~$0.10 per opportunity generation
  let estimatedCost = 0;

  // 1. Collect signals
  onProgress?.({
    stage: "collecting",
    signalsCollected: 0,
    signalsFiltered: 0,
    opportunitiesGenerated: 0,
  });

  const rawSignals = await collectSignals(config.sources, processedIds);

  onProgress?.({
    stage: "filtering",
    signalsCollected: rawSignals.length,
    signalsFiltered: 0,
    opportunitiesGenerated: 0,
  });

  // 2. Score relevance
  const scoredSignals: DetectedSignal[] = [];
  for (const signal of rawSignals.slice(0, maxSignals * 3)) {
    if (config.signal?.aborted) break;
    if (estimatedCost >= costBudget) break;

    const { score, matchedTopics } = await scoreRelevance(signal, config.topics, config);
    estimatedCost += 0.01; // ~$0.01 per relevance scoring call
    signal.relevanceScore = score;
    signal.topics = matchedTopics;
    if (score >= threshold) {
      scoredSignals.push(signal);
    }
    processedIds.add(signal.id);
  }

  // Sort by relevance, take top N
  scoredSignals.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topSignals = scoredSignals.slice(0, maxSignals);

  onProgress?.({
    stage: "investigating",
    signalsCollected: rawSignals.length,
    signalsFiltered: topSignals.length,
    opportunitiesGenerated: 0,
  });

  // 3. Generate opportunities
  const opportunities: Opportunity[] = [];
  for (const signal of topSignals) {
    if (config.signal?.aborted) break;
    if (estimatedCost >= costBudget) break;

    onProgress?.({
      stage: "generating",
      signalsCollected: rawSignals.length,
      signalsFiltered: topSignals.length,
      opportunitiesGenerated: opportunities.length,
      currentSignal: signal.title,
    });

    const opportunity = await generateOpportunity(signal, config);
    estimatedCost += 0.1; // ~$0.10 per opportunity (investigation + generation)
    if (opportunity) {
      opportunities.push(opportunity);
    }
  }

  // 4. Build brief
  onProgress?.({
    stage: "briefing",
    signalsCollected: rawSignals.length,
    signalsFiltered: topSignals.length,
    opportunitiesGenerated: opportunities.length,
  });

  const brief: DailyBrief = {
    id: `brief-${new Date().toISOString().split("T")[0]}`,
    date: new Date().toISOString().split("T")[0],
    signalsDetected: rawSignals.length,
    signalsProcessed: topSignals.length,
    opportunities,
    topOpportunity: opportunities[0],
    costEstimate: Math.round(estimatedCost * 100) / 100,
    createdAt: new Date().toISOString(),
  };

  // Save brief
  ensureDir(join(DEFAULT_DIR, BRIEFS_DIR));
  atomicWrite(join(DEFAULT_DIR, BRIEFS_DIR, `${brief.id}.json`), JSON.stringify(brief, null, 2));

  // Update state
  state.lastRunAt = new Date().toISOString();
  state.totalRuns++;
  state.totalSignals += rawSignals.length;
  state.totalOpportunities += opportunities.length;
  // Keep processed IDs bounded
  state.processedSignalIds = [...processedIds].slice(-5000);
  saveState(state);

  onProgress?.({
    stage: "complete",
    signalsCollected: rawSignals.length,
    signalsFiltered: topSignals.length,
    opportunitiesGenerated: opportunities.length,
  });

  return brief;
}

// ---- Brief Formatting ----

/** Format a daily brief as Markdown. */
export function briefToMarkdown(brief: DailyBrief): string {
  const lines: string[] = [
    `# 🛰️ Sentinel Daily Brief — ${brief.date}`,
    "",
    `**Signals Detected:** ${brief.signalsDetected} | **Processed:** ${brief.signalsProcessed} | **Opportunities:** ${brief.opportunities.length}`,
    "",
  ];

  if (brief.opportunities.length === 0) {
    lines.push("No significant opportunities detected today.");
    return lines.join("\n");
  }

  for (let i = 0; i < brief.opportunities.length; i++) {
    const opp = brief.opportunities[i];
    lines.push(`## ${i + 1}. ${opp.title}`);
    lines.push("");
    lines.push(`**Relevance:** ${Math.round(opp.overallRelevance * 100)}%`);
    lines.push(`**Summary:** ${opp.description.slice(0, 300)}`);
    lines.push("");

    if (opp.ideas.length > 0) {
      lines.push("**Ideas:**");
      for (const idea of opp.ideas) {
        lines.push(`- **${idea.title}** (${idea.angleId}): ${idea.description.slice(0, 200)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---- History ----

/** Load past briefs. */
export function loadBriefs(limit: number = 30): DailyBrief[] {
  const dir = join(DEFAULT_DIR, BRIEFS_DIR);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map((f: string) => {
    const raw = readFileSync(join(dir, f), "utf-8");
    return JSON.parse(raw) as DailyBrief;
  });
}
