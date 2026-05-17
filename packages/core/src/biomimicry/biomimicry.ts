import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { Investigation } from "../types.js";
import { BIOMIMICRY_TAXONOMY } from "./taxonomy.js";
import {
  BiomimicryTransferSchema,
  type BiomimicryEntry,
  type BiomimicryTransfer,
  type BiomimicryResult,
  type BiomimicryConfig,
} from "./types.js";

/** Simple term overlap matching for biomimicry entries. */
function computeRelevance(subject: string, entry: BiomimicryEntry): number {
  const subjectTokens = new Set(
    subject
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const entryText = [
    entry.biologicalStrategy,
    entry.technicalAnalogy,
    ...entry.knownApplications,
    ...entry.tags,
  ]
    .join(" ")
    .toLowerCase();

  const entryTokens = new Set(entryText.split(/\s+/).filter((w) => w.length > 2));
  let overlap = 0;
  for (const token of subjectTokens) {
    if (entryTokens.has(token)) overlap++;
  }
  return subjectTokens.size > 0 ? overlap / subjectTokens.size : 0;
}

/** Find relevant biomimicry entries for a subject. */
export function findRelevantEntries(
  subject: string,
  config: BiomimicryConfig = {}
): BiomimicryEntry[] {
  const functionFilter = config.functions;
  const maxResults = config.maxTransfers ?? 10;

  return BIOMIMICRY_TAXONOMY.filter((e) => !functionFilter || functionFilter.includes(e.function))
    .map((entry) => ({ entry, score: computeRelevance(subject, entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((r) => r.entry);
}

function buildTransferPrompt(
  entry: BiomimicryEntry,
  subject: string,
  investigation?: Investigation
): string {
  return `Analyze how this biological strategy could inspire innovation for the given subject.

Subject: ${subject}
${investigation ? `Context: ${investigation.summary.slice(0, 800)}` : ""}

Biological Strategy:
- Organism: ${entry.organism}
- Strategy: ${entry.biologicalStrategy}
- Mechanism: ${entry.mechanism}
- Known Applications: ${entry.knownApplications.join(", ")}

Evaluate the transferability of this biological strategy to the subject domain.

Respond in JSON:
{
  "technicalApplication": "how this could be applied",
  "transferabilityScore": 0.0-1.0,
  "feasibilityScore": 0.0-1.0,
  "noveltyScore": 0.0-1.0,
  "implementationPath": "concrete steps to implement",
  "challenges": ["challenge1"],
  "potentialImpact": "expected impact"
}`;
}

/** Run a biomimicry-inspired innovation analysis for a subject. */
export async function runBiomimicryAnalysis(
  subject: string,
  investigation?: Investigation,
  config: BiomimicryConfig = {}
): Promise<BiomimicryResult> {
  const maxTransfers = config.maxTransfers ?? 5;

  // Step 1: Find relevant entries
  config.onProgress?.({
    stage: "matching",
    completedTransfers: 0,
    totalTransfers: maxTransfers,
  });

  const matchedEntries = findRelevantEntries(subject, {
    ...config,
    maxTransfers: maxTransfers * 2,
  });

  // Step 2: Generate transfers
  const transfers: BiomimicryTransfer[] = [];
  const entriesToProcess = matchedEntries.slice(0, maxTransfers);

  for (let i = 0; i < entriesToProcess.length; i++) {
    if (config.signal?.aborted) break;
    const entry = entriesToProcess[i];

    config.onProgress?.({
      stage: "transferring",
      completedTransfers: i,
      totalTransfers: entriesToProcess.length,
    });

    try {
      const transfer = await withRetry(
        async () => {
          const raw = await generateText({
            prompt: buildTransferPrompt(entry, subject, investigation),
            model: config.model,
            signal: config.signal,
          });
          const parsed = JSON.parse(extractJson(raw));
          return BiomimicryTransferSchema.parse({
            entryId: entry.id,
            organism: entry.organism,
            biologicalStrategy: entry.biologicalStrategy,
            ...parsed,
          });
        },
        { signal: config.signal }
      );
      transfers.push(transfer);
    } catch {
      // Non-critical: skip transfer on failure
    }
  }

  // Step 3: Synthesize
  config.onProgress?.({
    stage: "synthesizing",
    completedTransfers: transfers.length,
    totalTransfers: entriesToProcess.length,
  });

  const topTransfer = transfers.sort(
    (a, b) => b.transferabilityScore * b.noveltyScore - a.transferabilityScore * a.noveltyScore
  )[0];

  const synthesisPrompt = `Synthesize these biomimicry-inspired innovations for "${subject}":

${transfers.map((t) => `- ${t.organism}: ${t.technicalApplication} (transferability: ${t.transferabilityScore}, novelty: ${t.noveltyScore})`).join("\n")}

Write a compelling narrative connecting nature's solutions to this innovation challenge.

Respond in JSON:
{
  "synthesisNarrative": "connecting narrative",
  "topInspiration": "the single most promising bio-inspired direction"
}`;

  let synthesisNarrative = "";
  let topInspiration = "";
  try {
    const synthResult = await withRetry(
      async () => {
        const raw = await generateText({
          prompt: synthesisPrompt,
          model: config.model,
          signal: config.signal,
        });
        return JSON.parse(extractJson(raw));
      },
      { signal: config.signal }
    );
    synthesisNarrative = synthResult.synthesisNarrative ?? "";
    topInspiration = synthResult.topInspiration ?? "";
  } catch {
    synthesisNarrative = `Found ${transfers.length} nature-inspired strategies for ${subject}.`;
    topInspiration = topTransfer?.technicalApplication ?? "";
  }

  config.onProgress?.({
    stage: "complete",
    completedTransfers: transfers.length,
    totalTransfers: entriesToProcess.length,
  });

  return {
    subject,
    matchedEntries,
    transfers,
    synthesisNarrative,
    topInspiration,
  };
}

/** Convert biomimicry results to markdown. */
export function biomimicryToMarkdown(result: BiomimicryResult): string {
  const lines: string[] = [
    "# Biomimicry Innovation Report",
    "",
    `**Subject:** ${result.subject}`,
    `**Nature-Inspired Strategies Found:** ${result.transfers.length}`,
    "",
    "## Top Inspiration",
    "",
    result.topInspiration,
    "",
    "## Nature-Inspired Innovations",
    "",
  ];

  for (const transfer of result.transfers) {
    lines.push(`### 🌿 ${transfer.organism}`);
    lines.push(`**Strategy:** ${transfer.biologicalStrategy}`);
    lines.push(`**Application:** ${transfer.technicalApplication}`);
    lines.push(
      `**Scores:** Transferability ${(transfer.transferabilityScore * 100).toFixed(0)}% | Feasibility ${(transfer.feasibilityScore * 100).toFixed(0)}% | Novelty ${(transfer.noveltyScore * 100).toFixed(0)}%`
    );
    lines.push(`**Implementation:** ${transfer.implementationPath}`);
    if (transfer.challenges.length > 0) {
      lines.push(`**Challenges:** ${transfer.challenges.join("; ")}`);
    }
    lines.push(`**Impact:** ${transfer.potentialImpact}`);
    lines.push("");
  }

  lines.push("## Synthesis", "", result.synthesisNarrative);

  return lines.join("\n");
}
