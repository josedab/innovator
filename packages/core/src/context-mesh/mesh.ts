import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import {
  DetectedPatternSchema,
  ProactiveSuggestionSchema,
  type ContextSignal,
  type DetectedPattern,
  type ProactiveSuggestion,
  type ContextMeshState,
  type ContextAdapter,
  type ContextMeshConfig,
} from "./types.js";

/** In-memory context mesh state. All processing is local for privacy. */
const meshState: ContextMeshState = {
  signals: [],
  patterns: [],
  suggestions: [],
  totalSignalsIngested: 0,
};

/** Ingest a single context signal into the mesh. */
export function ingestSignal(signal: ContextSignal): void {
  meshState.signals.push(signal);
  meshState.totalSignalsIngested++;

  // Keep bounded
  const maxSignals = 1000;
  if (meshState.signals.length > maxSignals) {
    meshState.signals = meshState.signals.slice(-maxSignals);
  }
}

/** Ingest multiple signals from an adapter. */
export async function ingestFromAdapter(adapter: ContextAdapter): Promise<number> {
  const signals = await adapter.ingest();
  for (const signal of signals) {
    ingestSignal(signal);
  }
  return signals.length;
}

/** Get the current mesh state. */
export function getMeshState(): ContextMeshState {
  return { ...meshState };
}

/** Clear all signals and reset the mesh. */
export function resetMesh(): void {
  meshState.signals = [];
  meshState.patterns = [];
  meshState.suggestions = [];
  meshState.totalSignalsIngested = 0;
  meshState.lastAnalyzedAt = undefined;
}

/** Simple term overlap between two texts for local pattern detection. */
function computeOverlap(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  const a = tokenize(textA);
  const b = tokenize(textB);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap / Math.max(a.size, b.size);
}

/** Detect patterns in the current signal pool using local analysis. */
export function detectPatternsLocal(): DetectedPattern[] {
  const signals = meshState.signals;
  if (signals.length < 2) return [];

  const patterns: DetectedPattern[] = [];
  const now = new Date().toISOString();

  // Find recurring themes via term clustering
  const themes = new Map<string, string[]>();
  for (const signal of signals) {
    const words = signal.content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    for (const word of words) {
      if (!themes.has(word)) themes.set(word, []);
      themes.get(word)!.push(signal.id);
    }
  }

  // Themes appearing in 3+ signals
  for (const [theme, signalIds] of themes) {
    if (signalIds.length >= 3) {
      const uniqueIds = [...new Set(signalIds)];
      if (uniqueIds.length >= 3) {
        patterns.push({
          id: `pattern-theme-${theme}`,
          title: `Recurring theme: "${theme}"`,
          description: `The term "${theme}" appears across ${uniqueIds.length} different context signals, suggesting a recurring focus area.`,
          signals: uniqueIds.slice(0, 20),
          confidence: Math.min(uniqueIds.length / 10, 1),
          patternType: "recurring-theme",
          detectedAt: now,
        });
      }
    }
  }

  // Find unconnected dots (signals from different sources with high overlap)
  for (let i = 0; i < signals.length && i < 50; i++) {
    for (let j = i + 1; j < signals.length && j < 50; j++) {
      if (signals[i].source === signals[j].source) continue;
      const overlap = computeOverlap(signals[i].content, signals[j].content);
      if (overlap > 0.3) {
        patterns.push({
          id: `pattern-dots-${signals[i].id}-${signals[j].id}`,
          title: `Unconnected dots: ${signals[i].title} ↔ ${signals[j].title}`,
          description: `High content similarity (${(overlap * 100).toFixed(0)}%) between signals from different sources suggests an unexplored connection.`,
          signals: [signals[i].id, signals[j].id],
          confidence: overlap,
          patternType: "unconnected-dots",
          detectedAt: now,
        });
      }
    }
  }

  // Deduplicate and limit
  const uniquePatterns = patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 20);

  meshState.patterns = uniquePatterns;
  return uniquePatterns;
}

/** Detect deeper patterns using LLM analysis of signal clusters. */
export async function detectPatternsLLM(
  config: ContextMeshConfig = {}
): Promise<DetectedPattern[]> {
  const signals = meshState.signals;
  if (signals.length < 3) return detectPatternsLocal();

  // Run local detection first
  const localPatterns = detectPatternsLocal();

  // Build LLM prompt from recent signals
  const signalSummaries = signals
    .slice(-20)
    .map((s) => `[${s.source}] ${s.title}: ${s.content.slice(0, 300)}`)
    .join("\n");

  const prompt = `Analyze these context signals from a user's work and detect non-obvious patterns:

${signalSummaries}

Look for:
1. Recurring themes across different sources
2. Unconnected dots — signals from different domains that share hidden connections
3. Emerging trends — signals pointing to a new direction
4. Knowledge gaps — areas frequently referenced but poorly understood
5. Opportunity windows — convergence of signals suggesting timely action

Respond in JSON:
{
  "patterns": [
    {
      "title": "pattern name",
      "description": "what this pattern means",
      "patternType": "recurring-theme" | "unconnected-dots" | "emerging-trend" | "knowledge-gap" | "opportunity-window" | "convergence",
      "confidence": 0.0-1.0,
      "signalIndices": [0, 3, 7]
    }
  ]
}`;

  try {
    const result = await withRetry(
      async () => {
        const raw = await generateText({
          prompt,
          model: config.model,
          signal: config.signal,
        });
        return JSON.parse(extractJson(raw));
      },
      { signal: config.signal }
    );

    const now = new Date().toISOString();
    const recentSignals = signals.slice(-20);
    const llmPatterns: DetectedPattern[] = (result.patterns ?? []).map(
      (
        p: {
          title?: string;
          description?: string;
          patternType?: string;
          confidence?: number;
          signalIndices?: number[];
        },
        idx: number
      ) => {
        const signalIds = (p.signalIndices ?? [])
          .filter((i: number) => i >= 0 && i < recentSignals.length)
          .map((i: number) => recentSignals[i].id);

        return DetectedPatternSchema.parse({
          id: `llm-pattern-${Date.now()}-${idx}`,
          title: p.title ?? "Unnamed pattern",
          description: p.description ?? "",
          signals: signalIds,
          confidence: p.confidence ?? 0.5,
          patternType: p.patternType ?? "recurring-theme",
          detectedAt: now,
        });
      }
    );

    // Merge with local patterns, preferring LLM patterns for higher confidence
    const merged = [...llmPatterns, ...localPatterns]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    meshState.patterns = merged;
    return merged;
  } catch {
    return localPatterns;
  }
}

/** Analyze patterns and generate innovation suggestions using LLM. */
export async function analyzeAndSuggest(
  config: ContextMeshConfig = {}
): Promise<ProactiveSuggestion[]> {
  config.onProgress?.({
    stage: "ingesting",
    signalCount: meshState.signals.length,
    patternCount: meshState.patterns.length,
    suggestionCount: meshState.suggestions.length,
  });

  // Run adapters
  if (config.adapters) {
    for (const adapter of config.adapters) {
      try {
        await ingestFromAdapter(adapter);
      } catch {
        // Non-critical: skip adapter on failure
      }
    }
  }

  // Detect patterns locally first
  config.onProgress?.({
    stage: "analyzing",
    signalCount: meshState.signals.length,
    patternCount: meshState.patterns.length,
    suggestionCount: meshState.suggestions.length,
  });

  const patterns = detectPatternsLocal();

  if (patterns.length === 0) {
    config.onProgress?.({
      stage: "idle",
      signalCount: meshState.signals.length,
      patternCount: 0,
      suggestionCount: 0,
    });
    return [];
  }

  // Use LLM to generate suggestions from patterns
  config.onProgress?.({
    stage: "suggesting",
    signalCount: meshState.signals.length,
    patternCount: patterns.length,
    suggestionCount: meshState.suggestions.length,
  });

  const patternSummaries = patterns
    .slice(0, 10)
    .map(
      (p) =>
        `- ${p.title} (${p.patternType}, confidence: ${(p.confidence * 100).toFixed(0)}%): ${p.description}`
    )
    .join("\n");

  const recentSignals = meshState.signals
    .slice(-10)
    .map((s) => `- [${s.source}] ${s.title}: ${s.content.slice(0, 200)}`)
    .join("\n");

  const prompt = `Based on these detected patterns in a user's work context, suggest innovation opportunities.

Detected Patterns:
${patternSummaries}

Recent Context Signals:
${recentSignals}

Generate 2-3 proactive innovation suggestions based on the patterns. Each suggestion should connect multiple signals.

Respond in JSON:
{
  "suggestions": [
    {
      "title": "suggestion title",
      "description": "what to explore",
      "rationale": "why this pattern suggests an opportunity",
      "urgency": "low" | "medium" | "high",
      "confidence": 0.0-1.0
    }
  ]
}`;

  const newSuggestions: ProactiveSuggestion[] = [];
  try {
    const result = await withRetry(
      async () => {
        const raw = await generateText({
          prompt,
          model: config.model,
          signal: config.signal,
        });
        return JSON.parse(extractJson(raw));
      },
      { signal: config.signal }
    );

    for (const [idx, s] of (result.suggestions ?? []).entries()) {
      const suggestion = ProactiveSuggestionSchema.parse({
        id: `suggestion-${Date.now()}-${idx}`,
        title: s.title,
        description: s.description,
        rationale: s.rationale,
        relatedPatterns: patterns.slice(0, 5).map((p) => p.id),
        relatedSignals: [],
        urgency: s.urgency ?? "medium",
        confidence: s.confidence ?? 0.5,
        suggestedAt: new Date().toISOString(),
        dismissed: false,
      });

      newSuggestions.push(suggestion);
      meshState.suggestions.push(suggestion);
      config.onSuggestion?.(suggestion);
    }
  } catch {
    // Non-critical
  }

  meshState.lastAnalyzedAt = new Date().toISOString();

  config.onProgress?.({
    stage: "idle",
    signalCount: meshState.signals.length,
    patternCount: meshState.patterns.length,
    suggestionCount: meshState.suggestions.length,
  });

  return newSuggestions;
}

/** Dismiss a suggestion. */
export function dismissSuggestion(id: string): boolean {
  const suggestion = meshState.suggestions.find((s) => s.id === id);
  if (suggestion) {
    suggestion.dismissed = true;
    return true;
  }
  return false;
}

/** Get active (non-dismissed) suggestions. */
export function getActiveSuggestions(): ProactiveSuggestion[] {
  return meshState.suggestions.filter((s) => !s.dismissed);
}

/** Convert context mesh state to markdown. */
export function contextMeshToMarkdown(): string {
  const state = getMeshState();
  const lines: string[] = [
    "# Context Mesh Report",
    "",
    `**Total Signals Ingested:** ${state.totalSignalsIngested}`,
    `**Active Signals:** ${state.signals.length}`,
    `**Patterns Detected:** ${state.patterns.length}`,
    `**Suggestions Generated:** ${state.suggestions.length}`,
    `**Last Analyzed:** ${state.lastAnalyzedAt ?? "Never"}`,
    "",
  ];

  if (state.patterns.length > 0) {
    lines.push("## Detected Patterns", "");
    for (const p of state.patterns.slice(0, 10)) {
      lines.push(`### ${p.title} (${p.patternType})`);
      lines.push(
        `**Confidence:** ${(p.confidence * 100).toFixed(0)}% | **Signals:** ${p.signals.length}`
      );
      lines.push(p.description);
      lines.push("");
    }
  }

  const active = state.suggestions.filter((s) => !s.dismissed);
  if (active.length > 0) {
    lines.push("## Active Suggestions", "");
    for (const s of active) {
      lines.push(`### 💡 ${s.title} (${s.urgency})`);
      lines.push(s.description);
      lines.push(`**Rationale:** ${s.rationale}`);
      lines.push(`**Confidence:** ${(s.confidence * 100).toFixed(0)}%`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
