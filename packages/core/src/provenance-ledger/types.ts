/**
 * @module provenance-ledger
 *
 * Innovation Provenance Ledger — tamper-evident, append-only audit trail
 * for every AI-assisted innovation decision. Each entry records the prompt,
 * model, investigation context, human decisions, and is chained with
 * SHA-256 hashes. Supports GDPR export/deletion and EU AI Act transparency.
 *
 * Builds on top of the existing `provenance` module by adding:
 * - Persistent append-only ledger stored in ~/.innovator/provenance-ledger/
 * - Hash-chaining (each entry includes the hash of the previous)
 * - Human decision recording (approvals, rejections, edits)
 * - GDPR-compliant export and selective redaction
 * - Audit verification (detect tampering)
 */

import { z } from "zod";

// ---- Ledger Entry Types ----

export const LedgerEntryTypeSchema = z.enum([
  "investigation",
  "generation",
  "synthesis",
  "gauntlet",
  "human-decision",
  "edit",
  "approval",
  "rejection",
  "export",
  "deletion",
]);

export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;

// ---- Ledger Entry Schema ----

export const LedgerEntrySchema = z.object({
  id: z.string(),
  sequenceNumber: z.number().int().min(0),
  type: LedgerEntryTypeSchema,
  timestamp: z.string(),
  sessionId: z.string().max(200),
  /** SHA-256 hash of the previous entry (empty string for the first entry). */
  previousHash: z.string().max(64),
  /** SHA-256 hash of this entry's content (excluding hash fields). */
  contentHash: z.string().max(64),
  /** Actor: "system" for AI actions, user identifier for human actions. */
  actor: z.string().max(200),
  /** What was done. */
  action: z.string().max(500),
  /** The subject/idea/artifact this entry relates to. */
  subject: z.string().max(2000),
  /** Model used for AI actions. */
  model: z.string().max(100).optional(),
  /** SHA-256 hash of the prompt (for AI actions). */
  promptHash: z.string().max(64).optional(),
  /** Human-readable reasoning for the decision. */
  reasoning: z.string().max(5000).optional(),
  /** Alternatives that were considered (for human decisions). */
  alternatives: z.array(z.string().max(1000)).max(10).optional(),
  /** Structured metadata. */
  metadata: z.record(z.string().max(2000)).optional(),
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

// ---- Ledger Schema ----

export const LedgerSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  entries: z.array(LedgerEntrySchema),
});

export type Ledger = z.infer<typeof LedgerSchema>;

// ---- Verification Result ----

export interface LedgerVerification {
  valid: boolean;
  totalEntries: number;
  firstEntry: string;
  lastEntry: string;
  brokenChainAt?: number;
  error?: string;
}

// ---- GDPR Export ----

export interface GdprExport {
  exportedAt: string;
  requestedBy: string;
  entries: LedgerEntry[];
  verificationHash: string;
}

// ---- Config ----

export interface LedgerConfig {
  /** Path to the ledger directory (default: ~/.innovator/provenance-ledger/) */
  ledgerDir?: string;
}
