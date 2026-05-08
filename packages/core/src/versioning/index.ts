/**
 * @module versioning
 *
 * Semantic Idea Version Control — immutable version snapshots with
 * branch/merge operations, parent-child relationships, semantic diffing,
 * and LLM-powered merge for complementary variants.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";
import { createHash } from "node:crypto";

// ---- Schemas ----

/** A semantic diff change entry. */
export const SemanticChangeSchema = z.object({
  field: z.enum([
    "scope",
    "approach",
    "targetAudience",
    "feasibility",
    "title",
    "description",
    "impact",
    "implementation",
  ]),
  changeType: z.enum(["added", "removed", "modified", "unchanged"]),
  before: z.string().max(2000).optional(),
  after: z.string().max(2000).optional(),
  significance: z.enum(["minor", "moderate", "major"]),
});

/** Semantic diff between two versions. */
export const SemanticDiffSchema = z.object({
  fromVersion: z.string().max(200),
  toVersion: z.string().max(200),
  changes: z.array(SemanticChangeSchema).max(20),
  overallSignificance: z.enum(["minor", "moderate", "major"]),
  summary: z.string().max(1000),
});

/** An immutable version snapshot. */
export const IdeaVersionSchema = z.object({
  id: z.string().max(200),
  ideaId: z.string().max(200),
  parentId: z.string().max(200).optional(),
  branchName: z.string().max(200).default("main"),
  title: z.string().max(500),
  description: z.string().max(5000),
  potentialImpact: z.string().max(2000),
  implementationHint: z.string().max(2000),
  metadata: z.record(z.string()).optional(),
  createdAt: z.number(),
  author: z.string().max(200).optional(),
  message: z.string().max(500).optional().describe("Version message (like a commit message)"),
});

/** A branch reference. */
export const BranchSchema = z.object({
  name: z.string().max(200),
  ideaId: z.string().max(200),
  headVersionId: z.string().max(200),
  createdAt: z.number(),
});

/** Merge result. */
export const MergeResultSchema = z.object({
  mergedVersion: IdeaVersionSchema,
  sourceBranch: z.string().max(200),
  targetBranch: z.string().max(200),
  strategy: z.enum(["auto", "llm-powered", "manual"]),
  conflicts: z.array(z.string().max(500)).max(20),
});

// ---- Types ----

export type SemanticChange = z.infer<typeof SemanticChangeSchema>;
export type SemanticDiff = z.infer<typeof SemanticDiffSchema>;
export type IdeaVersion = z.infer<typeof IdeaVersionSchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type MergeResult = z.infer<typeof MergeResultSchema>;

// ---- In-Memory Stores (append-only log) ----

const versionLog: IdeaVersion[] = [];
const branches = new Map<string, Branch>(); // key: `${ideaId}::${branchName}`

// ---- Content-Addressable IDs ----

/**
 * Generate a content-addressable ID from idea content.
 */
function generateContentId(idea: {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}): string {
  const content = `${idea.title}|${idea.description}|${idea.potentialImpact}|${idea.implementationHint}`;
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// ---- Core Functions ----

/**
 * Create an initial version snapshot of an idea.
 *
 * @param ideaId - Unique identifier for the idea
 * @param idea - The innovation idea content
 * @param author - Optional author name
 * @param message - Optional version message
 * @returns The created version
 */
export function createVersion(
  ideaId: string,
  idea: InnovationIdea,
  author?: string,
  message?: string
): IdeaVersion {
  const version: IdeaVersion = {
    id: generateContentId(idea),
    ideaId,
    branchName: "main",
    title: idea.title,
    description: idea.description,
    potentialImpact: idea.potentialImpact,
    implementationHint: idea.implementationHint,
    createdAt: Date.now(),
    author,
    message: message ?? "Initial version",
  };

  versionLog.push(version);

  // Create or update main branch
  const branchKey = `${ideaId}::main`;
  branches.set(branchKey, {
    name: "main",
    ideaId,
    headVersionId: version.id,
    createdAt: Date.now(),
  });

  return version;
}

/**
 * Create a new version as a child of an existing version.
 *
 * @param parentVersionId - The parent version ID
 * @param updates - Partial idea updates
 * @param author - Optional author name
 * @param message - Optional version message
 * @returns The new version or undefined if parent not found
 */
export function commitVersion(
  parentVersionId: string,
  updates: Partial<
    Pick<InnovationIdea, "title" | "description" | "potentialImpact" | "implementationHint">
  >,
  author?: string,
  message?: string
): IdeaVersion | undefined {
  const parent = versionLog.find((v) => v.id === parentVersionId);
  if (!parent) return undefined;

  const newContent = {
    title: updates.title ?? parent.title,
    description: updates.description ?? parent.description,
    potentialImpact: updates.potentialImpact ?? parent.potentialImpact,
    implementationHint: updates.implementationHint ?? parent.implementationHint,
  };

  const version: IdeaVersion = {
    id: generateContentId(newContent),
    ideaId: parent.ideaId,
    parentId: parentVersionId,
    branchName: parent.branchName,
    ...newContent,
    createdAt: Date.now(),
    author,
    message,
  };

  // Avoid duplicate content-addressable versions
  const existing = versionLog.find((v) => v.id === version.id);
  if (existing) return existing;

  versionLog.push(version);

  // Update branch head
  const branchKey = `${parent.ideaId}::${parent.branchName}`;
  const branch = branches.get(branchKey);
  if (branch) {
    branch.headVersionId = version.id;
  }

  return version;
}

/**
 * Create a new branch from a version.
 *
 * @param versionId - The version to branch from
 * @param branchName - Name for the new branch
 * @returns The branch or undefined if version not found
 */
export function createBranch(versionId: string, branchName: string): Branch | undefined {
  const version = versionLog.find((v) => v.id === versionId);
  if (!version) return undefined;

  const branchKey = `${version.ideaId}::${branchName}`;
  if (branches.has(branchKey)) return undefined; // branch already exists

  // Create a copy of the version on the new branch
  const branchVersion: IdeaVersion = {
    ...version,
    id: `${version.id}-${branchName}`,
    branchName,
    parentId: version.id,
    createdAt: Date.now(),
    message: `Branch "${branchName}" created from ${version.id}`,
  };
  versionLog.push(branchVersion);

  const branch: Branch = {
    name: branchName,
    ideaId: version.ideaId,
    headVersionId: branchVersion.id,
    createdAt: Date.now(),
  };
  branches.set(branchKey, branch);

  return branch;
}

/**
 * Get the version history (log) for an idea, optionally filtered by branch.
 *
 * @param ideaId - The idea ID
 * @param branchName - Optional branch filter
 * @returns Array of versions, newest first
 */
export function getVersionLog(ideaId: string, branchName?: string): IdeaVersion[] {
  let versions = versionLog.filter((v) => v.ideaId === ideaId);
  if (branchName) {
    versions = versions.filter((v) => v.branchName === branchName);
  }
  return [...versions].reverse();
}

/**
 * Get a specific version by ID.
 *
 * @param versionId - The version ID
 * @returns The version or undefined
 */
export function getVersion(versionId: string): IdeaVersion | undefined {
  return versionLog.find((v) => v.id === versionId);
}

/**
 * List all branches for an idea.
 *
 * @param ideaId - The idea ID
 * @returns Array of branches
 */
export function listBranches(ideaId: string): Branch[] {
  return [...branches.values()].filter((b) => b.ideaId === ideaId);
}

/**
 * Compute semantic diff between two versions.
 *
 * @param fromVersionId - Source version
 * @param toVersionId - Target version
 * @param model - Optional LLM model for semantic analysis
 * @param signal - Optional AbortSignal
 * @returns Semantic diff result
 */
export async function semanticDiff(
  fromVersionId: string,
  toVersionId: string,
  model?: string,
  signal?: AbortSignal
): Promise<SemanticDiff> {
  const from = versionLog.find((v) => v.id === fromVersionId);
  const to = versionLog.find((v) => v.id === toVersionId);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const prompt = `You are an expert at analyzing semantic differences between two versions of an innovation idea.

VERSION A:
Title: ${sanitizeLlmOutput(from.title)}
Description: ${sanitizeLlmOutput(from.description)}
Impact: ${sanitizeLlmOutput(from.potentialImpact)}
Implementation: ${sanitizeLlmOutput(from.implementationHint)}

VERSION B:
Title: ${sanitizeLlmOutput(to.title)}
Description: ${sanitizeLlmOutput(to.description)}
Impact: ${sanitizeLlmOutput(to.potentialImpact)}
Implementation: ${sanitizeLlmOutput(to.implementationHint)}

Analyze the semantic differences between these versions. Focus on changes in:
- scope, approach, targetAudience, feasibility, title, description, impact, implementation

Return valid JSON only:
{
  "fromVersion": "${fromVersionId}",
  "toVersion": "${toVersionId}",
  "changes": [
    { "field": "scope", "changeType": "modified", "before": "...", "after": "...", "significance": "major" }
  ],
  "overallSignificance": "minor|moderate|major",
  "summary": "Brief summary of what changed"
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse semantic diff: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  return SemanticDiffSchema.parse(parsed);
}

/**
 * LLM-powered merge of two idea versions from different branches.
 *
 * @param sourceVersionId - The source branch version
 * @param targetVersionId - The target branch version
 * @param model - Optional LLM model
 * @param signal - Optional AbortSignal
 * @returns Merge result with merged version
 */
export async function mergeVersions(
  sourceVersionId: string,
  targetVersionId: string,
  model?: string,
  signal?: AbortSignal
): Promise<MergeResult> {
  const source = versionLog.find((v) => v.id === sourceVersionId);
  const target = versionLog.find((v) => v.id === targetVersionId);

  if (!source || !target) {
    throw new Error("Version not found");
  }

  if (source.ideaId !== target.ideaId) {
    throw new Error("Cannot merge versions from different ideas");
  }

  const prompt = `You are merging two variants of an innovation idea into a single improved version.

VARIANT A (${source.branchName}):
Title: ${sanitizeLlmOutput(source.title)}
Description: ${sanitizeLlmOutput(source.description)}
Impact: ${sanitizeLlmOutput(source.potentialImpact)}
Implementation: ${sanitizeLlmOutput(source.implementationHint)}

VARIANT B (${target.branchName}):
Title: ${sanitizeLlmOutput(target.title)}
Description: ${sanitizeLlmOutput(target.description)}
Impact: ${sanitizeLlmOutput(target.potentialImpact)}
Implementation: ${sanitizeLlmOutput(target.implementationHint)}

Merge these into a single idea that combines the best elements of both. Resolve conflicts intelligently.

Return valid JSON only:
{
  "title": "Merged title",
  "description": "Merged description",
  "potentialImpact": "Merged impact",
  "implementationHint": "Merged implementation",
  "conflicts": ["List any unresolvable conflicts"]
}`;

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse merge result: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );

  const mergedContent = z
    .object({
      title: z.string().max(500),
      description: z.string().max(5000),
      potentialImpact: z.string().max(2000),
      implementationHint: z.string().max(2000),
      conflicts: z.array(z.string().max(500)).max(20),
    })
    .parse(parsed);

  const mergedVersion = commitVersion(
    targetVersionId,
    {
      title: mergedContent.title,
      description: mergedContent.description,
      potentialImpact: mergedContent.potentialImpact,
      implementationHint: mergedContent.implementationHint,
    },
    "auto-merge",
    `Merge ${source.branchName} into ${target.branchName}`
  );

  if (!mergedVersion) {
    throw new Error("Failed to create merged version");
  }

  return {
    mergedVersion,
    sourceBranch: source.branchName,
    targetBranch: target.branchName,
    strategy: "llm-powered",
    conflicts: mergedContent.conflicts,
  };
}

/**
 * Clear all version history (for testing).
 */
export function clearVersionHistory(): void {
  versionLog.length = 0;
  branches.clear();
  versionTags.clear();
}

// ---- Additional Schemas ----

/** A conflict report between two branches. */
export const ConflictReportSchema = z.object({
  branchA: z.string().max(200),
  branchB: z.string().max(200),
  ideaId: z.string().max(200),
  divergencePointId: z.string().max(200).optional(),
  conflictingFields: z.array(
    z.object({
      field: z.string().max(200),
      valueA: z.string().max(5000),
      valueB: z.string().max(5000),
      ancestorValue: z.string().max(5000).optional(),
    })
  ),
  autoResolvable: z.boolean(),
});

/** A timeline entry for visual rendering. */
export const TimelineEntrySchema = z.object({
  versionId: z.string().max(200),
  branchName: z.string().max(200),
  author: z.string().max(200).optional(),
  message: z.string().max(500).optional(),
  timestamp: z.number(),
  parentId: z.string().max(200).optional(),
  isMerge: z.boolean(),
});

/** A field-level side-by-side comparison entry. */
export const SideBySideFieldSchema = z.object({
  field: z.string().max(200),
  valueA: z.string().max(5000),
  valueB: z.string().max(5000),
  changed: z.boolean(),
  diff: z.array(
    z.object({
      type: z.enum(["equal", "added", "removed"]),
      value: z.string().max(5000),
    })
  ),
});

/** A structured side-by-side comparison of two versions. */
export const SideBySideComparisonSchema = z.object({
  versionIdA: z.string().max(200),
  versionIdB: z.string().max(200),
  fields: z.array(SideBySideFieldSchema),
});

/** A version graph for DAG visualization. */
export const VersionGraphSchema = z.object({
  ideaId: z.string().max(200),
  nodes: z.array(
    z.object({
      id: z.string().max(200),
      branchName: z.string().max(200),
      author: z.string().max(200).optional(),
      message: z.string().max(500).optional(),
      timestamp: z.number(),
    })
  ),
  edges: z.array(
    z.object({
      from: z.string().max(200),
      to: z.string().max(200),
    })
  ),
});

// ---- Additional Types ----

export type ConflictReport = z.infer<typeof ConflictReportSchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type SideBySideField = z.infer<typeof SideBySideFieldSchema>;
export type SideBySideComparison = z.infer<typeof SideBySideComparisonSchema>;
export type VersionGraph = z.infer<typeof VersionGraphSchema>;

// ---- Tag Store ----

const versionTags = new Map<string, Set<string>>(); // key: tag, value: set of versionIds

// ---- Helper: word-level diff ----

function wordDiff(
  a: string,
  b: string
): Array<{ type: "equal" | "added" | "removed"; value: string }> {
  const wordsA = a.split(/\s+/).filter(Boolean);
  const wordsB = b.split(/\s+/).filter(Boolean);

  // Simple LCS-based word diff
  const m = wordsA.length;
  const n = wordsB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        wordsA[i - 1] === wordsB[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: Array<{ type: "equal" | "added" | "removed"; value: string }> = [];
  let i = m;
  let j = n;
  const parts: Array<{ type: "equal" | "added" | "removed"; value: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      parts.push({ type: "equal", value: wordsA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.push({ type: "added", value: wordsB[j - 1] });
      j--;
    } else {
      parts.push({ type: "removed", value: wordsA[i - 1] });
      i--;
    }
  }

  parts.reverse();

  // Merge consecutive same-type entries
  for (const part of parts) {
    const last = result[result.length - 1];
    if (last && last.type === part.type) {
      last.value += " " + part.value;
    } else {
      result.push({ ...part });
    }
  }

  return result;
}

// ---- Helper: find common ancestor ----

function findCommonAncestor(versionA: IdeaVersion, versionB: IdeaVersion): IdeaVersion | undefined {
  const ancestorsA = new Set<string>();
  let current: IdeaVersion | undefined = versionA;
  while (current) {
    ancestorsA.add(current.id);
    current = current.parentId ? versionLog.find((v) => v.id === current!.parentId) : undefined;
  }

  current = versionB;
  while (current) {
    if (ancestorsA.has(current.id)) return current;
    current = current.parentId ? versionLog.find((v) => v.id === current!.parentId) : undefined;
  }

  return undefined;
}

// ---- Additional Functions ----

const CONTENT_FIELDS = ["title", "description", "potentialImpact", "implementationHint"] as const;

/**
 * Cherry-pick a version's changes onto a target branch.
 *
 * @param sourceVersionId - The version whose changes to apply
 * @param targetBranch - The branch to apply changes to
 * @param author - Optional author name
 * @param message - Optional commit message
 * @returns The new version on the target branch, or undefined if inputs are invalid
 */
export function cherryPickVersion(
  sourceVersionId: string,
  targetBranch: string,
  author?: string,
  message?: string
): IdeaVersion | undefined {
  const source = versionLog.find((v) => v.id === sourceVersionId);
  if (!source) return undefined;

  const branchKey = `${source.ideaId}::${targetBranch}`;
  const branch = branches.get(branchKey);
  if (!branch) return undefined;

  const targetHead = versionLog.find((v) => v.id === branch.headVersionId);
  if (!targetHead) return undefined;

  // Compute the delta from the source's parent (if any) and apply to target head
  const sourceParent = source.parentId
    ? versionLog.find((v) => v.id === source.parentId)
    : undefined;
  const updates: Partial<
    Pick<InnovationIdea, "title" | "description" | "potentialImpact" | "implementationHint">
  > = {};

  for (const field of CONTENT_FIELDS) {
    const sourceValue = source[field];
    const parentValue = sourceParent?.[field] ?? "";
    if (sourceValue !== parentValue) {
      updates[field] = sourceValue;
    }
  }

  const newContent = {
    title: updates.title ?? targetHead.title,
    description: updates.description ?? targetHead.description,
    potentialImpact: updates.potentialImpact ?? targetHead.potentialImpact,
    implementationHint: updates.implementationHint ?? targetHead.implementationHint,
  };

  const version: IdeaVersion = {
    id: generateContentId(newContent),
    ideaId: source.ideaId,
    parentId: targetHead.id,
    branchName: targetBranch,
    ...newContent,
    createdAt: Date.now(),
    author,
    message: message ?? `Cherry-pick ${sourceVersionId} onto ${targetBranch}`,
  };

  const existing = versionLog.find((v) => v.id === version.id);
  if (existing) return existing;

  versionLog.push(version);
  branch.headVersionId = version.id;

  return version;
}

/**
 * Detect conflicts between two branches for a given idea.
 *
 * @param branchA - First branch name
 * @param branchB - Second branch name
 * @param ideaId - The idea ID
 * @returns Conflict report describing diverging fields
 */
export function detectConflicts(branchA: string, branchB: string, ideaId: string): ConflictReport {
  const keyA = `${ideaId}::${branchA}`;
  const keyB = `${ideaId}::${branchB}`;
  const bA = branches.get(keyA);
  const bB = branches.get(keyB);

  if (!bA || !bB) {
    return {
      branchA,
      branchB,
      ideaId,
      conflictingFields: [],
      autoResolvable: true,
    };
  }

  const headA = versionLog.find((v) => v.id === bA.headVersionId);
  const headB = versionLog.find((v) => v.id === bB.headVersionId);

  if (!headA || !headB) {
    return {
      branchA,
      branchB,
      ideaId,
      conflictingFields: [],
      autoResolvable: true,
    };
  }

  const ancestor = findCommonAncestor(headA, headB);

  const conflictingFields: ConflictReport["conflictingFields"] = [];

  for (const field of CONTENT_FIELDS) {
    const valA = headA[field];
    const valB = headB[field];
    const ancestorVal = ancestor?.[field] ?? "";

    // Both branches modified the same field differently from ancestor
    if (valA !== valB && (valA !== ancestorVal || valB !== ancestorVal)) {
      conflictingFields.push({
        field,
        valueA: valA,
        valueB: valB,
        ancestorValue: ancestorVal,
      });
    }
  }

  return {
    branchA,
    branchB,
    ideaId,
    divergencePointId: ancestor?.id,
    conflictingFields,
    autoResolvable: conflictingFields.length === 0,
  };
}

/**
 * Build a chronological timeline of all versions across all branches for an idea.
 *
 * @param ideaId - The idea ID
 * @returns Array of timeline entries sorted by timestamp
 */
export function buildTimeline(ideaId: string): TimelineEntry[] {
  const versions = versionLog.filter((v) => v.ideaId === ideaId);

  return versions
    .map((v) => ({
      versionId: v.id,
      branchName: v.branchName,
      author: v.author,
      message: v.message,
      timestamp: v.createdAt,
      parentId: v.parentId,
      isMerge: v.message?.startsWith("Merge ") ?? false,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Compare two versions side-by-side with word-level diff (pure local, no LLM).
 *
 * @param versionIdA - First version ID
 * @param versionIdB - Second version ID
 * @returns Structured field-by-field comparison, or undefined if versions not found
 */
export function compareSideBySide(
  versionIdA: string,
  versionIdB: string
): SideBySideComparison | undefined {
  const a = versionLog.find((v) => v.id === versionIdA);
  const b = versionLog.find((v) => v.id === versionIdB);

  if (!a || !b) return undefined;

  const fields: SideBySideComparison["fields"] = CONTENT_FIELDS.map((field) => {
    const valA = a[field];
    const valB = b[field];
    return {
      field,
      valueA: valA,
      valueB: valB,
      changed: valA !== valB,
      diff: wordDiff(valA, valB),
    };
  });

  return { versionIdA, versionIdB, fields };
}

/**
 * Revert to a historical version by creating a new commit with its content.
 *
 * @param versionId - The version to revert to
 * @param author - Optional author name
 * @param message - Optional commit message
 * @returns The new version, or undefined if source version not found
 */
export function revertToVersion(
  versionId: string,
  author?: string,
  message?: string
): IdeaVersion | undefined {
  const target = versionLog.find((v) => v.id === versionId);
  if (!target) return undefined;

  const branchKey = `${target.ideaId}::${target.branchName}`;
  const branch = branches.get(branchKey);
  if (!branch) return undefined;

  const currentHead = branch.headVersionId;

  const newContent = {
    title: target.title,
    description: target.description,
    potentialImpact: target.potentialImpact,
    implementationHint: target.implementationHint,
  };

  const version: IdeaVersion = {
    id: generateContentId({
      ...newContent,
      // Salt with timestamp to avoid collision with original version
      implementationHint: newContent.implementationHint + `|revert:${Date.now()}`,
    }),
    ideaId: target.ideaId,
    parentId: currentHead,
    branchName: target.branchName,
    ...newContent,
    createdAt: Date.now(),
    author,
    message: message ?? `Revert to version ${versionId}`,
  };

  versionLog.push(version);
  branch.headVersionId = version.id;

  return version;
}

/**
 * Tag a version with a label for marking milestones.
 *
 * @param versionId - The version to tag
 * @param tag - The tag label
 * @returns true if tagged successfully, false if version not found
 */
export function tagVersion(versionId: string, tag: string): boolean {
  const version = versionLog.find((v) => v.id === versionId);
  if (!version) return false;

  let ids = versionTags.get(tag);
  if (!ids) {
    ids = new Set();
    versionTags.set(tag, ids);
  }
  ids.add(versionId);
  return true;
}

/**
 * Get all versions with a given tag.
 *
 * @param tag - The tag to search for
 * @returns Array of versions with that tag
 */
export function getVersionsByTag(tag: string): IdeaVersion[] {
  const ids = versionTags.get(tag);
  if (!ids) return [];
  return versionLog.filter((v) => ids.has(v.id));
}

/**
 * Build a version graph (DAG) for an idea, returning nodes and edges.
 *
 * @param ideaId - The idea ID
 * @returns Graph with nodes (versions) and edges (parent→child)
 */
export function buildVersionGraph(ideaId: string): VersionGraph {
  const versions = versionLog.filter((v) => v.ideaId === ideaId);

  const nodes = versions.map((v) => ({
    id: v.id,
    branchName: v.branchName,
    author: v.author,
    message: v.message,
    timestamp: v.createdAt,
  }));

  const edges: VersionGraph["edges"] = [];
  for (const v of versions) {
    if (v.parentId) {
      edges.push({ from: v.parentId, to: v.id });
    }
  }

  return { ideaId, nodes, edges };
}
