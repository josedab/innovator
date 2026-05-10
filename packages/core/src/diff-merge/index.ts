/**
 * @module diff-merge
 *
 * Innovation Diff & Merge — Semantic comparison and merge operations for
 * innovation sessions. Extends the basic diff concept with embedding-based
 * similarity analysis, automatic merging of non-conflicting ideas, and
 * LLM-assisted conflict resolution.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import { indexDocument, findSimilar } from "../embeddings/index.js";
import { DiffItemSchema } from "../diff/index.js";
import { InnovationIdeaSchema } from "../types.js";

// ---- Schemas ----

export const SemanticDiffItemSchema = DiffItemSchema.extend({
  similarityScore: z.number().min(0).max(1),
  sourceSession: z.string().max(200),
  category: z.string().max(200),
});

export type SemanticDiffItem = z.infer<typeof SemanticDiffItemSchema>;

export const SemanticDiffReportSchema = z.object({
  overlaps: z.array(SemanticDiffItemSchema).max(50).describe("Conceptual overlaps between sessions"),
  gaps: z.array(SemanticDiffItemSchema).max(50).describe("Complementary gaps"),
  contradictions: z.array(SemanticDiffItemSchema).max(50).describe("Contradictory ideas"),
  uniqueToA: z.array(SemanticDiffItemSchema).max(50).describe("Ideas unique to session A"),
  uniqueToB: z.array(SemanticDiffItemSchema).max(50).describe("Ideas unique to session B"),
  overallSimilarity: z.number().min(0).max(1),
  mergeRecommendations: z.array(z.string().max(1000)).max(20),
});

export type SemanticDiffReport = z.infer<typeof SemanticDiffReportSchema>;

export const MergeConflictSchema = z.object({
  itemA: InnovationIdeaSchema,
  itemB: InnovationIdeaSchema,
  conflictType: z.enum(["contradiction", "overlap", "redundancy"]),
  suggestedResolution: z.string().max(2000),
});

export type MergeConflict = z.infer<typeof MergeConflictSchema>;

export const MergedIdeaSchema = InnovationIdeaSchema.extend({
  provenance: z.array(z.string().max(200)).max(10).describe("Source session IDs for this idea"),
});

export type MergedIdea = z.infer<typeof MergedIdeaSchema>;

export const MergeResultSchema = z.object({
  mergedIdeas: z.array(MergedIdeaSchema).max(100),
  resolvedConflicts: z.array(MergeConflictSchema).max(50),
  autoMerged: z.number().describe("Count of automatically merged ideas"),
  manualRequired: z.number().describe("Count of conflicts requiring manual resolution"),
  provenance: z.record(z.array(z.string().max(200))).describe("Mapping from idea title to source sessions"),
});

export type MergeResult = z.infer<typeof MergeResultSchema>;

export const SessionSnapshotSchema = z.object({
  sessionId: z.string().max(200),
  subject: z.string().max(500),
  ideas: z.array(InnovationIdeaSchema).max(100),
  investigation: z.string().max(10000).describe("Investigation summary text"),
  synthesisText: z.string().max(10000),
});

export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

// ---- Options ----

interface SemanticDiffOptions {
  overlapThreshold?: number;
  model?: string;
  signal?: AbortSignal;
}

interface AutoMergeOptions {
  overlapThreshold?: number;
  model?: string;
  signal?: AbortSignal;
}

// ---- Helpers ----

interface IndexedIdea {
  idea: z.infer<typeof InnovationIdeaSchema>;
  docId: string;
  sessionId: string;
}

function indexSessionIdeas(session: SessionSnapshot): IndexedIdea[] {
  return session.ideas.map((idea) => {
    const doc = indexDocument({
      type: "idea",
      title: idea.title,
      content: `${idea.description} ${idea.potentialImpact} ${idea.implementationHint}`,
      sessionId: session.sessionId,
    });
    return { idea, docId: doc.id, sessionId: session.sessionId };
  });
}

function computePairSimilarities(
  ideasA: IndexedIdea[],
  ideasB: IndexedIdea[]
): { a: IndexedIdea; b: IndexedIdea; score: number }[] {
  const pairs: { a: IndexedIdea; b: IndexedIdea; score: number }[] = [];

  for (const a of ideasA) {
    const similar = findSimilar(a.docId, ideasB.length);
    for (const result of similar) {
      const matchB = ideasB.find((b) => b.docId === result.document.id);
      if (matchB) {
        pairs.push({ a, b: matchB, score: result.score });
      }
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}

function ideaToText(idea: z.infer<typeof InnovationIdeaSchema>): string {
  return `${idea.title}: ${idea.description}`;
}

// ---- Semantic Diff ----

/**
 * Compare two innovation sessions using embedding-based similarity.
 * Indexes all ideas, computes pairwise cosine similarity, identifies
 * overlaps, contradictions, and gaps.
 */
export async function runSemanticDiff(
  sessionA: SessionSnapshot,
  sessionB: SessionSnapshot,
  options: SemanticDiffOptions = {}
): Promise<SemanticDiffReport> {
  const threshold = options.overlapThreshold ?? 0.6;

  const ideasA = indexSessionIdeas(sessionA);
  const ideasB = indexSessionIdeas(sessionB);

  const pairs = computePairSimilarities(ideasA, ideasB);

  const overlappingA = new Set<string>();
  const overlappingB = new Set<string>();
  const overlaps: SemanticDiffItem[] = [];
  const potentialContradictions: { a: IndexedIdea; b: IndexedIdea; score: number }[] = [];

  for (const pair of pairs) {
    if (pair.score >= threshold) {
      overlappingA.add(pair.a.docId);
      overlappingB.add(pair.b.docId);
      overlaps.push({
        title: `Overlap: ${pair.a.idea.title} ↔ ${pair.b.idea.title}`,
        description: `Session A idea "${pair.a.idea.title}" is similar to Session B idea "${pair.b.idea.title}".`,
        significance: pair.score > 0.8 ? "high" : "medium",
        similarityScore: pair.score,
        sourceSession: `${sessionA.sessionId},${sessionB.sessionId}`,
        category: "overlap",
      });
    } else if (pair.score > 0.3 && pair.score < threshold) {
      potentialContradictions.push(pair);
    }
  }

  // Use LLM to detect contradictions among partially similar ideas
  const contradictions: SemanticDiffItem[] = [];
  if (potentialContradictions.length > 0 && options.model !== undefined) {
    const contradictionItems = potentialContradictions.slice(0, 10);
    const contradictionPrompt = buildContradictionPrompt(contradictionItems);

    const detected = await detectContradictions(contradictionPrompt, options.model, options.signal);
    for (const idx of detected) {
      if (idx >= 0 && idx < contradictionItems.length) {
        const pair = contradictionItems[idx];
        contradictions.push({
          title: `Contradiction: ${pair.a.idea.title} vs ${pair.b.idea.title}`,
          description: `"${pair.a.idea.title}" may contradict "${pair.b.idea.title}".`,
          significance: "high",
          similarityScore: pair.score,
          sourceSession: `${sessionA.sessionId},${sessionB.sessionId}`,
          category: "contradiction",
        });
      }
    }
  }

  // Unique ideas
  const uniqueToA: SemanticDiffItem[] = ideasA
    .filter((a) => !overlappingA.has(a.docId))
    .map((a) => ({
      title: a.idea.title,
      description: a.idea.description,
      significance: "medium" as const,
      similarityScore: 0,
      sourceSession: sessionA.sessionId,
      category: "unique",
    }));

  const uniqueToB: SemanticDiffItem[] = ideasB
    .filter((b) => !overlappingB.has(b.docId))
    .map((b) => ({
      title: b.idea.title,
      description: b.idea.description,
      significance: "medium" as const,
      similarityScore: 0,
      sourceSession: sessionB.sessionId,
      category: "unique",
    }));

  // Gaps are unique ideas that complement the other session
  const gaps: SemanticDiffItem[] = [
    ...uniqueToA.map((item) => ({
      ...item,
      category: "gap",
      description: `Session B is missing: ${item.description}`,
    })),
    ...uniqueToB.map((item) => ({
      ...item,
      category: "gap",
      description: `Session A is missing: ${item.description}`,
    })),
  ];

  // Overall similarity
  const totalIdeas = ideasA.length + ideasB.length;
  const overallSimilarity =
    totalIdeas > 0 ? (overlappingA.size + overlappingB.size) / totalIdeas : 0;

  const mergeRecommendations = buildMergeRecommendations(overlaps, uniqueToA, uniqueToB, contradictions);

  return SemanticDiffReportSchema.parse({
    overlaps,
    gaps,
    contradictions,
    uniqueToA,
    uniqueToB,
    overallSimilarity: Math.round(overallSimilarity * 1000) / 1000,
    mergeRecommendations,
  });
}

function buildContradictionPrompt(
  pairs: { a: IndexedIdea; b: IndexedIdea; score: number }[]
): string {
  const pairDescriptions = pairs
    .map(
      (p, i) =>
        `[${i}] Idea A: "${ideaToText(p.a.idea)}" vs Idea B: "${ideaToText(p.b.idea)}"`
    )
    .join("\n");

  return `You are an expert at analyzing innovation ideas for contradictions.

Given the following pairs of ideas from two different innovation sessions, identify which pairs contain genuine contradictions (opposing approaches, conflicting assumptions, or mutually exclusive strategies).

${pairDescriptions}

Respond with valid JSON only — an array of indices (numbers) for pairs that are contradictions.
Example: [0, 3, 5]

If no contradictions exist, respond with: []`;
}

async function detectContradictions(
  prompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<number[]> {
  try {
    const result = await withRetry(
      async () => {
        const raw = await generateText({ prompt, model, serverMode: true, signal });
        const jsonStr = extractJson(raw);
        return JSON.parse(jsonStr) as unknown;
      },
      {
        signal,
        isRetryable: (err) =>
          err instanceof Error &&
          (err.message.includes("Failed to parse") ||
            err.message.includes("No JSON object found") ||
            err.message.includes("Unbalanced JSON braces")),
      }
    );
    return z.array(z.number()).parse(result);
  } catch {
    return [];
  }
}

function buildMergeRecommendations(
  overlaps: SemanticDiffItem[],
  uniqueToA: SemanticDiffItem[],
  uniqueToB: SemanticDiffItem[],
  contradictions: SemanticDiffItem[]
): string[] {
  const recommendations: string[] = [];

  if (overlaps.length > 0) {
    recommendations.push(
      `${overlaps.length} overlapping ideas found — consider merging the strongest version of each.`
    );
  }
  if (uniqueToA.length > 0) {
    recommendations.push(
      `${uniqueToA.length} ideas are unique to session A — these can be directly included in a merge.`
    );
  }
  if (uniqueToB.length > 0) {
    recommendations.push(
      `${uniqueToB.length} ideas are unique to session B — these can be directly included in a merge.`
    );
  }
  if (contradictions.length > 0) {
    recommendations.push(
      `${contradictions.length} contradictions detected — manual review recommended before merging.`
    );
  }
  if (overlaps.length === 0 && contradictions.length === 0) {
    recommendations.push("Sessions are complementary — safe to auto-merge all ideas.");
  }

  return recommendations;
}

// ---- Auto-Merge ----

/**
 * Automatically merge non-conflicting ideas from two sessions.
 * Overlapping ideas keep the higher-quality version; contradictions
 * are flagged for manual resolution.
 */
export async function autoMerge(
  sessionA: SessionSnapshot,
  sessionB: SessionSnapshot,
  options: AutoMergeOptions = {}
): Promise<MergeResult> {
  const threshold = options.overlapThreshold ?? 0.6;

  const ideasA = indexSessionIdeas(sessionA);
  const ideasB = indexSessionIdeas(sessionB);

  const pairs = computePairSimilarities(ideasA, ideasB);

  const mergedIdeas: MergedIdea[] = [];
  const resolvedConflicts: MergeConflict[] = [];
  const provenance: Record<string, string[]> = {};
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  let autoMergedCount = 0;
  let manualCount = 0;

  // Process overlapping pairs
  for (const pair of pairs) {
    if (usedA.has(pair.a.docId) || usedB.has(pair.b.docId)) continue;

    if (pair.score >= threshold) {
      usedA.add(pair.a.docId);
      usedB.add(pair.b.docId);

      // Pick the version with more detailed description
      const pickA = pair.a.idea.description.length >= pair.b.idea.description.length;
      const winner = pickA ? pair.a : pair.b;
      const merged: MergedIdea = {
        ...winner.idea,
        provenance: [sessionA.sessionId, sessionB.sessionId],
      };
      mergedIdeas.push(merged);
      provenance[merged.title] = [sessionA.sessionId, sessionB.sessionId];
      autoMergedCount++;

      if (pair.score < 0.8) {
        // Partial overlap — record as resolved conflict
        resolvedConflicts.push({
          itemA: pair.a.idea,
          itemB: pair.b.idea,
          conflictType: pair.score >= 0.7 ? "redundancy" : "overlap",
          suggestedResolution: `Kept "${winner.idea.title}" as the more detailed version.`,
        });
      }
    } else if (pair.score > 0.3) {
      // Possible contradiction — flag for manual review
      usedA.add(pair.a.docId);
      usedB.add(pair.b.docId);
      resolvedConflicts.push({
        itemA: pair.a.idea,
        itemB: pair.b.idea,
        conflictType: "contradiction",
        suggestedResolution: "Manual review recommended — ideas may be contradictory.",
      });
      manualCount++;
    }
  }

  // Add unique ideas from session A
  for (const a of ideasA) {
    if (usedA.has(a.docId)) continue;
    const merged: MergedIdea = {
      ...a.idea,
      provenance: [sessionA.sessionId],
    };
    mergedIdeas.push(merged);
    provenance[merged.title] = [sessionA.sessionId];
    autoMergedCount++;
  }

  // Add unique ideas from session B
  for (const b of ideasB) {
    if (usedB.has(b.docId)) continue;
    const merged: MergedIdea = {
      ...b.idea,
      provenance: [sessionB.sessionId],
    };
    mergedIdeas.push(merged);
    provenance[merged.title] = [sessionB.sessionId];
    autoMergedCount++;
  }

  return MergeResultSchema.parse({
    mergedIdeas,
    resolvedConflicts,
    autoMerged: autoMergedCount,
    manualRequired: manualCount,
    provenance,
  });
}

// ---- Conflict Resolution ----

/**
 * Resolve a merge conflict using the specified strategy.
 * For 'synthesize', uses an LLM to combine both ideas into one.
 */
export async function resolveConflict(
  conflict: MergeConflict,
  resolution: "keep-a" | "keep-b" | "synthesize",
  model?: string
): Promise<MergedIdea> {
  if (resolution === "keep-a") {
    return { ...conflict.itemA, provenance: ["session-a"] };
  }

  if (resolution === "keep-b") {
    return { ...conflict.itemB, provenance: ["session-b"] };
  }

  // Synthesize using LLM
  const prompt = `You are an expert innovation strategist. Two innovation ideas have a conflict and need to be synthesized into a single, stronger idea that captures the best of both.

${wrapUserInput("IDEA A", `Title: ${conflict.itemA.title}\nDescription: ${conflict.itemA.description}\nImpact: ${conflict.itemA.potentialImpact}\nImplementation: ${conflict.itemA.implementationHint}`)}

${wrapUserInput("IDEA B", `Title: ${conflict.itemB.title}\nDescription: ${conflict.itemB.description}\nImpact: ${conflict.itemB.potentialImpact}\nImplementation: ${conflict.itemB.implementationHint}`)}

Conflict type: ${conflict.conflictType}

Create a single synthesized idea that resolves the conflict and combines the strengths of both ideas.

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "title": "Synthesized idea title",
  "description": "Combined description",
  "potentialImpact": "Combined impact assessment",
  "implementationHint": "Combined implementation approach"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse synthesis response as JSON: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  const idea = InnovationIdeaSchema.parse(parsed);
  return { ...idea, provenance: ["synthesized"] };
}

// ---- Markdown Export ----

/**
 * Convert a SemanticDiffReport to a Markdown string.
 */
export function diffReportToMarkdown(report: SemanticDiffReport): string {
  const lines: string[] = [];

  lines.push("# Semantic Diff Report");
  lines.push("");
  lines.push(`**Overall Similarity:** ${(report.overallSimilarity * 100).toFixed(1)}%`);
  lines.push("");

  if (report.overlaps.length > 0) {
    lines.push("## Overlaps");
    lines.push("");
    for (const item of report.overlaps) {
      lines.push(`- **${item.title}** (similarity: ${(item.similarityScore * 100).toFixed(0)}%, significance: ${item.significance})`);
      lines.push(`  ${item.description}`);
    }
    lines.push("");
  }

  if (report.contradictions.length > 0) {
    lines.push("## Contradictions");
    lines.push("");
    for (const item of report.contradictions) {
      lines.push(`- **${item.title}** (significance: ${item.significance})`);
      lines.push(`  ${item.description}`);
    }
    lines.push("");
  }

  if (report.uniqueToA.length > 0) {
    lines.push("## Unique to Session A");
    lines.push("");
    for (const item of report.uniqueToA) {
      lines.push(`- **${item.title}**: ${item.description}`);
    }
    lines.push("");
  }

  if (report.uniqueToB.length > 0) {
    lines.push("## Unique to Session B");
    lines.push("");
    for (const item of report.uniqueToB) {
      lines.push(`- **${item.title}**: ${item.description}`);
    }
    lines.push("");
  }

  if (report.gaps.length > 0) {
    lines.push("## Complementary Gaps");
    lines.push("");
    for (const item of report.gaps) {
      lines.push(`- **${item.title}**: ${item.description}`);
    }
    lines.push("");
  }

  if (report.mergeRecommendations.length > 0) {
    lines.push("## Merge Recommendations");
    lines.push("");
    for (const rec of report.mergeRecommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Convert a MergeResult to a Markdown string.
 */
export function mergeResultToMarkdown(result: MergeResult): string {
  const lines: string[] = [];

  lines.push("# Merge Result");
  lines.push("");
  lines.push(`**Auto-merged:** ${result.autoMerged} ideas`);
  lines.push(`**Manual required:** ${result.manualRequired} conflicts`);
  lines.push("");

  if (result.mergedIdeas.length > 0) {
    lines.push("## Merged Ideas");
    lines.push("");
    for (const idea of result.mergedIdeas) {
      lines.push(`### ${idea.title}`);
      lines.push("");
      lines.push(idea.description);
      lines.push("");
      lines.push(`**Impact:** ${idea.potentialImpact}`);
      lines.push(`**Implementation:** ${idea.implementationHint}`);
      lines.push(`**Provenance:** ${idea.provenance.join(", ")}`);
      lines.push("");
    }
  }

  if (result.resolvedConflicts.length > 0) {
    lines.push("## Resolved Conflicts");
    lines.push("");
    for (const conflict of result.resolvedConflicts) {
      lines.push(`- **${conflict.conflictType}**: "${conflict.itemA.title}" ↔ "${conflict.itemB.title}"`);
      lines.push(`  Resolution: ${conflict.suggestedResolution}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
