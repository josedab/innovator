/**
 * @module provenance
 *
 * Idea Provenance Chain — tracks every idea back to its originating
 * prompt, model, angle config, and investigation context.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { AngleResult, Investigation } from "../types.js";

// ---- Schemas ----

/** Record of provenance for a single idea. */
export const ProvenanceRecordSchema = z.object({
  id: z.string(),
  ideaTitle: z.string().max(500),
  ideaIndex: z.number().int().min(0),
  angleId: z.string().max(100),
  angleName: z.string().max(200),
  promptHash: z.string().max(128).describe("SHA-256 hash of the prompt used"),
  modelUsed: z.string().max(100).describe("Model that generated this idea"),
  inputTokensEstimate: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Estimated input token count"),
  investigationSnippet: z
    .string()
    .max(1000)
    .optional()
    .describe("Key investigation context used"),
  timestamp: z.string().describe("ISO timestamp of generation"),
  parentId: z
    .string()
    .optional()
    .describe("Parent idea ID for evolved/refined ideas"),
  metadata: z.record(z.string().max(500)).optional(),
});

export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

/** A provenance chain linking multiple records for a session. */
export const ProvenanceChainSchema = z.object({
  sessionId: z.string(),
  subject: z.string().max(2000),
  records: z.array(ProvenanceRecordSchema).max(500),
  createdAt: z.string(),
});

export type ProvenanceChain = z.infer<typeof ProvenanceChainSchema>;

/** A node in a provenance tree for display. */
export interface ProvenanceTreeNode {
  record: ProvenanceRecord;
  children: ProvenanceTreeNode[];
}

// ---- Utility Functions ----

/** Generate a SHA-256 hash of a prompt string. */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

/** Estimate token count from text (rough ~4 chars per token). */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build provenance records from angle results and context.
 */
export function buildProvenanceRecords(params: {
  angleResults: AngleResult[];
  investigation?: Investigation;
  model?: string;
  promptHashes?: Record<string, string>;
}): ProvenanceRecord[] {
  const { angleResults, investigation, model, promptHashes } = params;
  const records: ProvenanceRecord[] = [];
  const now = new Date().toISOString();
  const investigationSnippet = investigation
    ? `${investigation.summary.slice(0, 200)}... Challenges: ${investigation.challenges.slice(0, 3).join("; ")}`
    : undefined;

  for (const ar of angleResults) {
    for (let i = 0; i < ar.ideas.length; i++) {
      const idea = ar.ideas[i];
      records.push({
        id: randomUUID(),
        ideaTitle: idea.title,
        ideaIndex: i,
        angleId: ar.angleId,
        angleName: ar.angleName,
        promptHash: promptHashes?.[ar.angleId] ?? "unknown",
        modelUsed: model ?? "default",
        inputTokensEstimate: investigationSnippet
          ? estimateInputTokens(investigationSnippet)
          : undefined,
        investigationSnippet: investigationSnippet?.slice(0, 1000),
        timestamp: now,
      });
    }
  }

  return records;
}

/**
 * Create a ProvenanceChain from session data.
 */
export function createProvenanceChain(params: {
  sessionId: string;
  subject: string;
  angleResults: AngleResult[];
  investigation?: Investigation;
  model?: string;
  promptHashes?: Record<string, string>;
}): ProvenanceChain {
  return {
    sessionId: params.sessionId,
    subject: params.subject,
    records: buildProvenanceRecords({
      angleResults: params.angleResults,
      investigation: params.investigation,
      model: params.model,
      promptHashes: params.promptHashes,
    }),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build a provenance tree from a flat list of records.
 * Records with parentId are nested under their parent.
 */
export function buildProvenanceTree(
  records: ProvenanceRecord[]
): ProvenanceTreeNode[] {
  const byId = new Map<string, ProvenanceTreeNode>();
  const roots: ProvenanceTreeNode[] = [];

  for (const record of records) {
    byId.set(record.id, { record, children: [] });
  }

  for (const record of records) {
    const node = byId.get(record.id)!;
    if (record.parentId && byId.has(record.parentId)) {
      byId.get(record.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Look up provenance records for a specific idea title.
 */
export function getIdeaProvenance(
  chain: ProvenanceChain,
  ideaTitle: string
): ProvenanceRecord[] {
  return chain.records.filter(
    (r) => r.ideaTitle.toLowerCase() === ideaTitle.toLowerCase()
  );
}

/**
 * Format provenance records as a readable string.
 */
export function formatProvenance(records: ProvenanceRecord[]): string {
  if (records.length === 0) return "No provenance data available.";

  return records
    .map(
      (r) =>
        `[${r.angleId}] "${r.ideaTitle}" — model: ${r.modelUsed}, prompt: ${r.promptHash}, ` +
        `tokens: ~${r.inputTokensEstimate ?? "?"}, at: ${r.timestamp}`
    )
    .join("\n");
}
