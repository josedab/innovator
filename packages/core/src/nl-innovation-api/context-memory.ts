/**
 * @module nl-innovation-api/context-memory
 *
 * Session memory & context management for the NL orchestrator.
 * Integrates temporal memory for cross-session intelligence
 * and provides proactive suggestion engine based on usage patterns.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---- Schemas ----

export const IntentCategorySchema = z.enum([
  "investigate",
  "generate",
  "compare",
  "refine",
  "export",
  "analyze",
  "debate",
  "synthesize",
  "navigate",
  "help",
  "unknown",
]);
export type IntentCategory = z.infer<typeof IntentCategorySchema>;

export const ClassifiedIntentSchema = z.object({
  category: IntentCategorySchema,
  confidence: z.number().min(0).max(1),
  entities: z.object({
    subject: z.string().optional(),
    angles: z.array(z.string()).default([]),
    model: z.string().optional(),
    count: z.number().optional(),
    sessionRef: z.string().optional(),
    artifactType: z.string().optional(),
  }),
  rawInput: z.string(),
});
export type ClassifiedIntent = z.infer<typeof ClassifiedIntentSchema>;

export const SessionMemoryEntrySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  intent: ClassifiedIntentSchema,
  result: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string(),
  durationMs: z.number().optional(),
  feedback: z.enum(["positive", "negative", "neutral"]).optional(),
});
export type SessionMemoryEntry = z.infer<typeof SessionMemoryEntrySchema>;

export const ProactiveSuggestionSchema = z.object({
  id: z.string(),
  text: z.string().max(500),
  description: z.string().max(1000),
  type: z.enum(["continue", "explore", "revisit", "optimize", "learn"]),
  relevance: z.number().min(0).max(1),
  basedOn: z.string().max(200),
});
export type ProactiveSuggestion = z.infer<typeof ProactiveSuggestionSchema>;

// ---- Intent Classification (rule-based, no LLM needed) ----

const INTENT_PATTERNS: Array<{
  category: IntentCategory;
  patterns: RegExp[];
  weight: number;
}> = [
  {
    category: "investigate",
    patterns: [
      /\binvestigat/i,
      /\bresearch/i,
      /\bexplor/i,
      /\banalyze\s+(?:the\s+)?(?:topic|subject|area)/i,
      /\bwhat\s+(?:is|are)\b/i,
      /\btell\s+me\s+about/i,
      /\blook\s+into/i,
    ],
    weight: 0.9,
  },
  {
    category: "generate",
    patterns: [
      /\bgenerat/i,
      /\bbrainstorm/i,
      /\bideas?\s+(?:for|about|on)/i,
      /\binnovate/i,
      /\bcreate\s+ideas/i,
      /\bcome\s+up\s+with/i,
      /\busing\s+(?:scamper|first.?principles|cross.?domain|constraints|inversion|perspectives|what.?if|trend)/i,
    ],
    weight: 0.9,
  },
  {
    category: "compare",
    patterns: [
      /\bcompar/i,
      /\bvs\.?\b/i,
      /\bversus/i,
      /\bside\s+by\s+side/i,
      /\blast\s+\d+\s+sessions/i,
      /\bdifferences?\s+between/i,
    ],
    weight: 0.85,
  },
  {
    category: "refine",
    patterns: [
      /\brefin/i,
      /\bimprov/i,
      /\boptimiz/i,
      /\bmake\s+(?:it\s+)?better/i,
      /\benhance/i,
      /\bnarrow\s+down/i,
      /\bfocus\s+on/i,
    ],
    weight: 0.85,
  },
  {
    category: "export",
    patterns: [
      /\bexport/i,
      /\bdownload/i,
      /\bsave\s+(?:as|to)/i,
      /\bmarkdown/i,
      /\bpdf/i,
      /\bjson\s+(?:file|export|output)/i,
      /\bshare/i,
    ],
    weight: 0.8,
  },
  {
    category: "analyze",
    patterns: [
      /\bscor/i,
      /\brank/i,
      /\brat/i,
      /\bevaluat/i,
      /\bmetric/i,
      /\bdashboard/i,
      /\banalytics/i,
      /\bstats/i,
    ],
    weight: 0.8,
  },
  {
    category: "debate",
    patterns: [
      /\bdebat/i,
      /\bpros?\s+(?:and|&)\s+cons/i,
      /\bargument/i,
      /\bchalleng/i,
      /\bdevil'?s?\s+advocat/i,
      /\bcritiq/i,
    ],
    weight: 0.85,
  },
  {
    category: "synthesize",
    patterns: [
      /\bsynth/i,
      /\bcombin/i,
      /\bmerge/i,
      /\bsummar/i,
      /\bconsolid/i,
      /\btop\s+ideas/i,
      /\bbest\s+(?:ideas?|results?)/i,
    ],
    weight: 0.8,
  },
  {
    category: "navigate",
    patterns: [
      /\bshow\s+(?:me|my)/i,
      /\blist/i,
      /\bhistory/i,
      /\bprevious/i,
      /\bgo\s+(?:back|to)/i,
      /\bfind/i,
    ],
    weight: 0.7,
  },
  {
    category: "help",
    patterns: [
      /\bhelp/i,
      /\bhow\s+(?:do|can|to)/i,
      /\bwhat\s+can\s+you/i,
      /\bguide/i,
      /\btutorial/i,
      /\bexplain\s+(?:how|what)/i,
    ],
    weight: 0.7,
  },
];

/** Classify a natural language input into an intent category with entities. */
export function classifyIntent(input: string): ClassifiedIntent {
  const scores: Array<{ category: IntentCategory; score: number }> = [];

  for (const { category, patterns, weight } of INTENT_PATTERNS) {
    const matchCount = patterns.filter((p) => p.test(input)).length;
    if (matchCount > 0) {
      scores.push({ category, score: (matchCount / patterns.length) * weight });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // Extract entities
  const angleNames = [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ];
  const foundAngles = angleNames.filter(
    (a) => input.toLowerCase().includes(a.replace("-", " ")) || input.toLowerCase().includes(a)
  );

  const countMatch = input.match(/(?:top|last|first|best)\s+(\d+)/i);
  const sessionRefMatch = input.match(/session[s]?\s+(\w+-?\w*)/i);
  const modelMatch = input.match(/(?:using|with|model)\s+(gpt-[\w.-]+|claude-[\w.-]+)/i);
  const artifactMatch = input.match(/\b(prd|tech.?spec|user.?stor|pitch|okr)\b/i);

  // Extract subject: remove command words and get the rest
  let subject: string | undefined;
  const subjectMatch = input.match(/(?:about|for|on|into|regarding)\s+['"]?(.+?)['"]?$/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim().replace(/['"]+$/g, "");
  }

  return {
    category: best?.category ?? "unknown",
    confidence: best ? Math.min(best.score + 0.1, 1.0) : 0,
    entities: {
      subject,
      angles: foundAngles,
      model: modelMatch?.[1],
      count: countMatch ? parseInt(countMatch[1], 10) : undefined,
      sessionRef: sessionRefMatch?.[1],
      artifactType: artifactMatch?.[1]?.toLowerCase().replace(/\s+/g, "-"),
    },
    rawInput: input,
  };
}

// ---- Session Memory Store ----

const memoryStore = new Map<string, SessionMemoryEntry[]>();

/** Record a completed interaction in session memory. */
export function recordMemory(entry: {
  sessionId: string;
  intent: ClassifiedIntent;
  result?: Record<string, unknown>;
  durationMs?: number;
}): SessionMemoryEntry {
  const memory: SessionMemoryEntry = {
    id: randomUUID(),
    sessionId: entry.sessionId,
    intent: entry.intent,
    result: entry.result,
    timestamp: new Date().toISOString(),
    durationMs: entry.durationMs,
  };
  const validated = SessionMemoryEntrySchema.parse(memory);

  const list = memoryStore.get(entry.sessionId) ?? [];
  list.push(validated);
  // Keep bounded per session
  if (list.length > 200) list.splice(0, list.length - 100);
  memoryStore.set(entry.sessionId, list);
  return validated;
}

/** Get session memory entries. */
export function getSessionMemory(sessionId: string): SessionMemoryEntry[] {
  return memoryStore.get(sessionId) ?? [];
}

/** Provide feedback on a memory entry. */
export function recordFeedback(
  sessionId: string,
  memoryId: string,
  feedback: "positive" | "negative" | "neutral"
): boolean {
  const entries = memoryStore.get(sessionId);
  if (!entries) return false;
  const entry = entries.find((e) => e.id === memoryId);
  if (!entry) return false;
  entry.feedback = feedback;
  return true;
}

// ---- Proactive Suggestion Engine ----

/** Generate proactive suggestions based on session history and patterns. */
export function generateProactiveSuggestions(
  sessionId: string,
  opts?: { maxSuggestions?: number }
): ProactiveSuggestion[] {
  const max = opts?.maxSuggestions ?? 5;
  const suggestions: ProactiveSuggestion[] = [];
  const memories = memoryStore.get(sessionId) ?? [];

  if (memories.length === 0) {
    suggestions.push({
      id: randomUUID(),
      text: "Start by investigating a topic you're curious about",
      description: "Begin with 'Investigate [your topic]' to get started",
      type: "learn",
      relevance: 0.9,
      basedOn: "new-session",
    });
    return suggestions;
  }

  // Analyze patterns
  const categoryCounts = new Map<string, number>();
  const subjects = new Set<string>();
  const anglesUsed = new Set<string>();
  let lastIntent: ClassifiedIntent | undefined;

  for (const m of memories) {
    categoryCounts.set(m.intent.category, (categoryCounts.get(m.intent.category) ?? 0) + 1);
    if (m.intent.entities.subject) subjects.add(m.intent.entities.subject);
    for (const a of m.intent.entities.angles) anglesUsed.add(a);
    lastIntent = m.intent;
  }

  // Suggest based on last action
  if (lastIntent?.category === "investigate") {
    const subjectText =
      lastIntent.entities.subject ?? lastIntent.rawInput.replace(/^investigate\s*/i, "").trim();
    if (subjectText) {
      suggestions.push({
        id: randomUUID(),
        text: `Generate ideas for "${subjectText}" using multiple angles`,
        description: "Follow up your investigation with brainstorming",
        type: "continue",
        relevance: 0.95,
        basedOn: "last-investigation",
      });
    }
  }

  if (lastIntent?.category === "generate") {
    suggestions.push({
      id: randomUUID(),
      text: "Score and rank the generated ideas",
      description: "Evaluate ideas by feasibility, impact, and novelty",
      type: "continue",
      relevance: 0.9,
      basedOn: "last-generation",
    });
    suggestions.push({
      id: randomUUID(),
      text: "Create a PRD from the best idea",
      description: "Turn your top idea into an actionable document",
      type: "continue",
      relevance: 0.85,
      basedOn: "last-generation",
    });
  }

  // Suggest unexplored angles
  const allAngles = [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ];
  const unexplored = allAngles.filter((a) => !anglesUsed.has(a));
  if (unexplored.length > 0 && memories.length > 2) {
    suggestions.push({
      id: randomUUID(),
      text: `Try the "${unexplored[0]}" angle for a fresh perspective`,
      description: `You haven't used ${unexplored.length} angles yet — diversify your approach`,
      type: "explore",
      relevance: 0.7,
      basedOn: "unexplored-angles",
    });
  }

  // Suggest revisiting past subjects
  if (subjects.size > 1) {
    const subjectArr = Array.from(subjects);
    const oldSubject = subjectArr[0];
    suggestions.push({
      id: randomUUID(),
      text: `Revisit "${oldSubject}" with new angles or deeper analysis`,
      description: "Earlier topics may benefit from a second look",
      type: "revisit",
      relevance: 0.6,
      basedOn: "past-subjects",
    });
  }

  // Suggest optimization if many investigations without artifacts
  const investigateCount = categoryCounts.get("investigate") ?? 0;
  const exportCount = categoryCounts.get("export") ?? 0;
  if (investigateCount > 3 && exportCount === 0) {
    suggestions.push({
      id: randomUUID(),
      text: "Export your best findings to a structured document",
      description: "You've done extensive research — time to capture outcomes",
      type: "optimize",
      relevance: 0.75,
      basedOn: "missing-exports",
    });
  }

  return suggestions.sort((a, b) => b.relevance - a.relevance).slice(0, max);
}

/** Get usage statistics from memory. */
export function getMemoryStats(sessionId: string): {
  totalInteractions: number;
  categoryCounts: Record<string, number>;
  avgConfidence: number;
  topCategory: string | null;
  positiveRatio: number;
} {
  const memories = memoryStore.get(sessionId) ?? [];
  if (memories.length === 0) {
    return {
      totalInteractions: 0,
      categoryCounts: {},
      avgConfidence: 0,
      topCategory: null,
      positiveRatio: 0,
    };
  }

  const counts: Record<string, number> = {};
  let confidenceSum = 0;
  let positiveCount = 0;
  let feedbackCount = 0;

  for (const m of memories) {
    counts[m.intent.category] = (counts[m.intent.category] ?? 0) + 1;
    confidenceSum += m.intent.confidence;
    if (m.feedback) {
      feedbackCount++;
      if (m.feedback === "positive") positiveCount++;
    }
  }

  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalInteractions: memories.length,
    categoryCounts: counts,
    avgConfidence: +(confidenceSum / memories.length).toFixed(3),
    topCategory,
    positiveRatio: feedbackCount > 0 ? +(positiveCount / feedbackCount).toFixed(3) : 0,
  };
}

// ---- Cross-Session Intelligence (Temporal Memory Integration) ----

/** Session context enriched with temporal and history data. */
export interface EnrichedSessionContext {
  sessionId: string;
  recentSubjects: string[];
  recurringSessions: Array<{ subject: string; sessionId: string; createdAt: string }>;
  relatedConcepts: string[];
  suggestedAngles: string[];
  temporalInsights: string[];
}

/**
 * Enrich session context with cross-session intelligence.
 * Integrates past session history and concept recurrence patterns.
 * Works without requiring temporal-memory module to be loaded.
 */
export function enrichSessionContext(
  sessionId: string,
  opts?: {
    pastSessions?: Array<{
      id: string;
      subject: string;
      createdAt: string;
      angleResults: Array<{ angleId: string }>;
    }>;
    temporalConcepts?: Array<{ label: string; weight: number }>;
  }
): EnrichedSessionContext {
  const memories = memoryStore.get(sessionId) ?? [];
  const currentSubjects = memories
    .map((m) => m.intent.entities.subject)
    .filter((s): s is string => !!s);

  const recentSubjects = [...new Set(currentSubjects)].slice(0, 10);
  const anglesUsed = new Set(memories.flatMap((m) => m.intent.entities.angles));
  const allAngles = [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ];

  // Find recurring subjects from past sessions
  const recurringSessions: EnrichedSessionContext["recurringSessions"] = [];
  if (opts?.pastSessions) {
    for (const session of opts.pastSessions) {
      for (const subject of recentSubjects) {
        if (session.subject.toLowerCase().includes(subject.toLowerCase().slice(0, 20))) {
          recurringSessions.push({
            subject: session.subject,
            sessionId: session.id,
            createdAt: session.createdAt,
          });
          break;
        }
      }
    }
  }

  // Extract related concepts from temporal memory
  const relatedConcepts = (opts?.temporalConcepts ?? [])
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map((c) => c.label);

  // Suggest angles not yet used
  const suggestedAngles = allAngles.filter((a) => !anglesUsed.has(a));

  // Generate temporal insights
  const temporalInsights: string[] = [];
  if (recurringSessions.length > 0) {
    temporalInsights.push(
      `Found ${recurringSessions.length} related past session(s) — consider reviewing for cross-pollination.`
    );
  }
  if (relatedConcepts.length > 0) {
    temporalInsights.push(
      `Related concepts from knowledge graph: ${relatedConcepts.slice(0, 3).join(", ")}.`
    );
  }
  if (memories.length > 5 && suggestedAngles.length > 0) {
    temporalInsights.push(`You have ${suggestedAngles.length} unexplored angles available.`);
  }

  return {
    sessionId,
    recentSubjects,
    recurringSessions: recurringSessions.slice(0, 5),
    relatedConcepts,
    suggestedAngles,
    temporalInsights,
  };
}

// ---- Intent Classification Accuracy Tracking ----

const accuracyLog: Array<{
  predicted: string;
  actual: string;
  correct: boolean;
  timestamp: string;
}> = [];

/**
 * Record an intent classification outcome for accuracy measurement.
 * Call this after the system resolves the actual intent (e.g., after execution).
 */
export function recordClassificationOutcome(predicted: string, actual: string): void {
  accuracyLog.push({
    predicted,
    actual,
    correct: predicted === actual,
    timestamp: new Date().toISOString(),
  });
  // Keep bounded
  if (accuracyLog.length > 5000) accuracyLog.splice(0, accuracyLog.length - 2500);
}

/** Get intent classification accuracy metrics. */
export function getClassificationAccuracy(opts?: { window?: number }): {
  totalClassifications: number;
  correctClassifications: number;
  accuracy: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
  meetsTarget: boolean;
} {
  const window = opts?.window ?? accuracyLog.length;
  const entries = accuracyLog.slice(-window);
  if (entries.length === 0) {
    return {
      totalClassifications: 0,
      correctClassifications: 0,
      accuracy: 0,
      byCategory: {},
      meetsTarget: false,
    };
  }

  const correct = entries.filter((e) => e.correct).length;
  const accuracy = +(correct / entries.length).toFixed(3);

  const byCategory: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const entry of entries) {
    const cat = entry.actual;
    const existing = byCategory[cat] ?? { total: 0, correct: 0, accuracy: 0 };
    existing.total++;
    if (entry.correct) existing.correct++;
    existing.accuracy = +(existing.correct / existing.total).toFixed(3);
    byCategory[cat] = existing;
  }

  return {
    totalClassifications: entries.length,
    correctClassifications: correct,
    accuracy,
    byCategory,
    meetsTarget: accuracy >= 0.8, // ≥80% target
  };
}

/** Clear all memory and accuracy data (for testing). */
export function clearMemoryStore(): void {
  memoryStore.clear();
  accuracyLog.length = 0;
}
