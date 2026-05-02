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
}
