import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { InnovationIdea } from "../types.js";
import {
  FutureContextSchema,
  ReEvaluationSchema,
  type TimeCapsule,
  type FutureContext,
  type OpeningCeremony,
  type TimeCapsuleConfig,
} from "./types.js";
import { ValidationError } from "../errors.js";

// In-memory store (replace with persistent storage in production)
const capsuleStore: Map<string, TimeCapsule> = new Map();

/** Create and seal a time capsule for future re-evaluation. */
export function createTimeCapsule(
  idea: InnovationIdea,
  openDate: string,
  options?: { notes?: string; tags?: string[]; createdBy?: string; score?: number }
): TimeCapsule {
  const id = `capsule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const capsule: TimeCapsule = {
    id,
    ideaSnapshot: {
      title: idea.title,
      description: idea.description,
      potentialImpact: idea.potentialImpact,
      feasibility: "medium",
      originalScore: options?.score,
      capturedAt: now,
    },
    openDate,
    createdAt: now,
    status: "sealed",
    notes: options?.notes,
    tags: options?.tags ?? [],
    createdBy: options?.createdBy,
  };

  capsuleStore.set(id, capsule);
  return capsule;
}

/** Get a time capsule by ID. */
export function getTimeCapsule(id: string): TimeCapsule | undefined {
  return capsuleStore.get(id);
}

/** List all time capsules, optionally filtered by status. */
export function listTimeCapsules(
  status?: "sealed" | "scheduled" | "opened" | "expired"
): TimeCapsule[] {
  const all = Array.from(capsuleStore.values());
  return status ? all.filter((c) => c.status === status) : all;
}

/** Get capsules that are due to be opened (openDate <= now). */
export function getDueCapsules(): TimeCapsule[] {
  const now = new Date().toISOString();
  return Array.from(capsuleStore.values()).filter(
    (c) => c.status === "sealed" && c.openDate <= now
  );
}

/** Delete a time capsule. */
export function deleteTimeCapsule(id: string): boolean {
  return capsuleStore.delete(id);
}

function buildFutureContextPrompt(capsule: TimeCapsule): string {
  return `Predict what the market and technology landscape might look like at ${capsule.openDate}.

Context: This idea was captured at ${capsule.ideaSnapshot.capturedAt}:
Title: ${capsule.ideaSnapshot.title}
Description: ${capsule.ideaSnapshot.description}
Impact: ${capsule.ideaSnapshot.potentialImpact}

Predict the following for the target date:
1. Market trends relevant to this idea
2. Technology shifts that could affect feasibility
3. Competitive landscape changes
4. Regulatory changes
5. Consumer behavior shifts

Respond in JSON:
{
  "predictedDate": "${capsule.openDate}",
  "marketTrends": ["trend1"],
  "technologyShifts": ["shift1"],
  "competitiveLandscape": "description",
  "regulatoryChanges": ["change1"],
  "consumerBehavior": "description",
  "confidenceLevel": 0.0-1.0
}`;
}

function buildReEvaluationPrompt(capsule: TimeCapsule, futureContext: FutureContext): string {
  return `Re-evaluate this innovation idea in light of predicted future conditions.

Original Idea (captured ${capsule.ideaSnapshot.capturedAt}):
Title: ${capsule.ideaSnapshot.title}
Description: ${capsule.ideaSnapshot.description}
Impact: ${capsule.ideaSnapshot.potentialImpact}
Original Score: ${capsule.ideaSnapshot.originalScore ?? "N/A"}/10

Predicted Future Context (${futureContext.predictedDate}):
Market Trends: ${futureContext.marketTrends.join("; ")}
Technology Shifts: ${futureContext.technologyShifts.join("; ")}
Competitive Landscape: ${futureContext.competitiveLandscape}
Regulatory Changes: ${futureContext.regulatoryChanges.join("; ")}

Re-evaluate and provide an updated assessment.

Respond in JSON:
{
  "updatedScore": 0-10,
  "scoreDelta": change from original,
  "stillRelevant": true/false,
  "whatChanged": "key changes affecting this idea",
  "newOpportunities": ["opportunity1"],
  "newRisks": ["risk1"],
  "recommendation": "pursue-now" | "continue-waiting" | "pivot" | "abandon",
  "reasoning": "detailed reasoning"
}`;
}

/** Open a time capsule — generate future context, re-evaluate, and compare. */
export async function openTimeCapsule(
  capsuleId: string,
  config: TimeCapsuleConfig = {}
): Promise<OpeningCeremony> {
  const capsule = capsuleStore.get(capsuleId);
  if (!capsule) throw new ValidationError(`Time capsule not found: ${capsuleId}`);

  config.onProgress?.({
    stage: "predicting-future",
    capsuleId,
  });

  // Generate future context
  const futureContext = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: buildFutureContextPrompt(capsule),
        model: config.model,
        signal: config.signal,
      });
      return FutureContextSchema.parse(JSON.parse(extractJson(raw)));
    },
    { signal: config.signal }
  );

  config.onProgress?.({
    stage: "re-evaluating",
    capsuleId,
  });

  // Re-evaluate idea
  const reEvaluation = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: buildReEvaluationPrompt(capsule, futureContext),
        model: config.model,
        signal: config.signal,
      });
      return ReEvaluationSchema.parse(JSON.parse(extractJson(raw)));
    },
    { signal: config.signal }
  );

  config.onProgress?.({
    stage: "comparing",
    capsuleId,
  });

  const originalScore = capsule.ideaSnapshot.originalScore ?? 5;
  const openedAt = new Date().toISOString();

  // Update capsule
  capsule.status = "opened";
  capsule.futureContext = futureContext;
  capsule.reEvaluation = reEvaluation;
  capsule.openedAt = openedAt;

  config.onProgress?.({
    stage: "complete",
    capsuleId,
  });

  return {
    capsuleId,
    ideaTitle: capsule.ideaSnapshot.title,
    originalSnapshot: capsule.ideaSnapshot,
    futureContext,
    reEvaluation,
    sideByComparison: {
      originalScore,
      updatedScore: reEvaluation.updatedScore,
      keyDifferences: [
        `Score changed from ${originalScore} to ${reEvaluation.updatedScore} (${reEvaluation.scoreDelta > 0 ? "+" : ""}${reEvaluation.scoreDelta})`,
        `Recommendation: ${reEvaluation.recommendation}`,
        ...(reEvaluation.newOpportunities.length > 0
          ? [`New opportunities: ${reEvaluation.newOpportunities.length}`]
          : []),
        ...(reEvaluation.newRisks.length > 0 ? [`New risks: ${reEvaluation.newRisks.length}`] : []),
      ],
      verdict: reEvaluation.reasoning,
    },
    openedAt,
  };
}

/** Convert an opening ceremony result to markdown. */
export function openingCeremonyToMarkdown(ceremony: OpeningCeremony): string {
  const lines: string[] = [
    "# 🕰️ Time Capsule Opening Ceremony",
    "",
    `**Idea:** ${ceremony.ideaTitle}`,
    `**Sealed:** ${ceremony.originalSnapshot.capturedAt}`,
    `**Opened:** ${ceremony.openedAt}`,
    "",
    "## Original Snapshot",
    "",
    `**Score:** ${ceremony.sideByComparison.originalScore}/10`,
    ceremony.originalSnapshot.description,
    `**Expected Impact:** ${ceremony.originalSnapshot.potentialImpact}`,
    "",
    "## Predicted Future Context",
    "",
    `**Market Trends:** ${ceremony.futureContext.marketTrends.join("; ")}`,
    `**Tech Shifts:** ${ceremony.futureContext.technologyShifts.join("; ")}`,
    `**Competitive Landscape:** ${ceremony.futureContext.competitiveLandscape}`,
    `**Confidence:** ${(ceremony.futureContext.confidenceLevel * 100).toFixed(0)}%`,
    "",
    "## Re-Evaluation",
    "",
    `**Updated Score:** ${ceremony.reEvaluation.updatedScore}/10 (${ceremony.reEvaluation.scoreDelta > 0 ? "+" : ""}${ceremony.reEvaluation.scoreDelta})`,
    `**Still Relevant:** ${ceremony.reEvaluation.stillRelevant ? "Yes" : "No"}`,
    `**Recommendation:** ${ceremony.reEvaluation.recommendation}`,
    "",
    `**What Changed:** ${ceremony.reEvaluation.whatChanged}`,
    "",
  ];

  if (ceremony.reEvaluation.newOpportunities.length > 0) {
    lines.push("**New Opportunities:**");
    ceremony.reEvaluation.newOpportunities.forEach((o) => lines.push(`- ${o}`));
    lines.push("");
  }

  if (ceremony.reEvaluation.newRisks.length > 0) {
    lines.push("**New Risks:**");
    ceremony.reEvaluation.newRisks.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  lines.push(
    "## Side-by-Side Comparison",
    "",
    `| Metric | Original | Updated |`,
    `| ------ | -------- | ------- |`,
    `| Score  | ${ceremony.sideByComparison.originalScore}/10 | ${ceremony.sideByComparison.updatedScore}/10 |`,
    "",
    `**Verdict:** ${ceremony.sideByComparison.verdict}`
  );

  return lines.join("\n");
}
