/**
 * @module provenance-ledger
 *
 * Persistent, tamper-evident, append-only innovation audit trail.
 * Every AI generation and human decision is recorded with hash-chaining.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  LedgerSchema,
  LedgerEntrySchema,
  type Ledger,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerVerification,
  type GdprExport,
  type LedgerConfig,
} from "./types.js";

// ---- Constants ----

const DEFAULT_LEDGER_DIR = join(homedir(), ".innovator", "provenance-ledger");

function ledgerPath(dir: string): string {
  return join(dir, "ledger.json");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

// ---- Hashing ----

/** Compute SHA-256 hash of the content fields of a ledger entry. */
export function computeEntryContentHash(
  entry: Omit<LedgerEntry, "contentHash" | "previousHash">
): string {
  const content = [
    entry.id,
    String(entry.sequenceNumber),
    entry.type,
    entry.timestamp,
    entry.sessionId,
    entry.actor,
    entry.action,
    entry.subject,
    entry.model ?? "",
    entry.promptHash ?? "",
    entry.reasoning ?? "",
    JSON.stringify(entry.alternatives ?? []),
    JSON.stringify(entry.metadata ?? {}),
  ].join("|");
  return createHash("sha256").update(content).digest("hex");
}

/** Compute the chain hash: SHA-256(previousHash + contentHash). */
function _computeChainHash(previousHash: string, contentHash: string): string {
  return createHash("sha256")
    .update(previousHash + contentHash)
    .digest("hex");
}

// ---- Ledger Operations ----

/** Load or create a ledger. */
export function loadLedger(config: LedgerConfig = {}): Ledger {
  const dir = config.ledgerDir ?? DEFAULT_LEDGER_DIR;
  ensureDir(dir);
  const path = ledgerPath(dir);

  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      return LedgerSchema.parse(JSON.parse(raw));
    } catch {
      // Corrupted file — back up and start fresh
      const backupPath = `${path}.corrupt.${Date.now()}`;
      try {
        renameSync(path, backupPath);
      } catch {
        /* best-effort backup */
      }
      console.warn(
        `[provenance-ledger] Corrupted ledger backed up to ${backupPath}, starting fresh`
      );
    }
  }

  const now = new Date().toISOString();
  return { version: 1, createdAt: now, updatedAt: now, entries: [] };
}

/** Save the ledger to disk. */
function saveLedger(ledger: Ledger, config: LedgerConfig = {}): void {
  const dir = config.ledgerDir ?? DEFAULT_LEDGER_DIR;
  ensureDir(dir);
  atomicWrite(ledgerPath(dir), JSON.stringify(ledger, null, 2));
}

/** Append a new entry to the ledger. Returns the entry with hashes filled in. */
export function appendEntry(
  params: {
    type: LedgerEntryType;
    sessionId: string;
    actor: string;
    action: string;
    subject: string;
    model?: string;
    promptHash?: string;
    reasoning?: string;
    alternatives?: string[];
    metadata?: Record<string, string>;
  },
  config: LedgerConfig = {}
): LedgerEntry {
  const ledger = loadLedger(config);
  const sequenceNumber = ledger.entries.length;
  const previousHash = sequenceNumber > 0 ? ledger.entries[sequenceNumber - 1].contentHash : "";

  const baseEntry = {
    id: randomUUID(),
    sequenceNumber,
    type: params.type,
    timestamp: new Date().toISOString(),
    sessionId: params.sessionId,
    actor: params.actor,
    action: params.action,
    subject: params.subject,
    model: params.model,
    promptHash: params.promptHash,
    reasoning: params.reasoning,
    alternatives: params.alternatives,
    metadata: params.metadata,
  };

  const contentHash = computeEntryContentHash(baseEntry);

  const entry: LedgerEntry = {
    ...baseEntry,
    previousHash,
    contentHash,
  };

  LedgerEntrySchema.parse(entry);
  ledger.entries.push(entry);
  ledger.updatedAt = new Date().toISOString();
  saveLedger(ledger, config);

  return entry;
}

// ---- Convenience Recorders ----

/** Record an AI investigation action. */
export function recordInvestigation(
  sessionId: string,
  subject: string,
  model: string,
  promptHash: string,
  config: LedgerConfig = {}
): LedgerEntry {
  return appendEntry(
    {
      type: "investigation",
      sessionId,
      actor: "system",
      action: "AI investigated subject",
      subject,
      model,
      promptHash,
    },
    config
  );
}

/** Record an AI idea generation action. */
export function recordGeneration(
  sessionId: string,
  subject: string,
  angleId: string,
  model: string,
  promptHash: string,
  ideaCount: number,
  config: LedgerConfig = {}
): LedgerEntry {
  return appendEntry(
    {
      type: "generation",
      sessionId,
      actor: "system",
      action: `AI generated ${ideaCount} ideas via ${angleId}`,
      subject,
      model,
      promptHash,
      metadata: { angleId, ideaCount: String(ideaCount) },
    },
    config
  );
}

/** Record a gauntlet run. */
export function recordGauntlet(
  sessionId: string,
  ideaTitle: string,
  survivabilityIndex: number,
  attackCount: number,
  config: LedgerConfig = {}
): LedgerEntry {
  return appendEntry(
    {
      type: "gauntlet",
      sessionId,
      actor: "system",
      action: `Gauntlet: ${attackCount} attacks, survivability ${survivabilityIndex}/100`,
      subject: ideaTitle,
      metadata: {
        survivabilityIndex: String(survivabilityIndex),
        attackCount: String(attackCount),
      },
    },
    config
  );
}

/** Record a human decision (approval, rejection, edit). */
export function recordHumanDecision(
  sessionId: string,
  actor: string,
  type: "approval" | "rejection" | "edit",
  subject: string,
  reasoning: string,
  alternatives?: string[],
  config: LedgerConfig = {}
): LedgerEntry {
  return appendEntry(
    {
      type: type === "edit" ? "edit" : type,
      sessionId,
      actor,
      action: `Human ${type}: ${subject}`,
      subject,
      reasoning,
      alternatives,
    },
    config
  );
}

// ---- Verification ----

/** Verify the integrity of the ledger's hash chain. */
export function verifyLedger(config: LedgerConfig = {}): LedgerVerification {
  const ledger = loadLedger(config);

  if (ledger.entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      firstEntry: "",
      lastEntry: "",
    };
  }

  for (let i = 0; i < ledger.entries.length; i++) {
    const entry = ledger.entries[i];

    // Verify content hash
    const { contentHash: _ch, previousHash: _ph, ...base } = entry;
    const expectedContentHash = computeEntryContentHash(base);
    if (entry.contentHash !== expectedContentHash) {
      return {
        valid: false,
        totalEntries: ledger.entries.length,
        firstEntry: ledger.entries[0].id,
        lastEntry: ledger.entries[ledger.entries.length - 1].id,
        brokenChainAt: i,
        error: `Entry ${i} content hash mismatch`,
      };
    }

    // Verify chain link
    const expectedPrevious = i > 0 ? ledger.entries[i - 1].contentHash : "";
    if (entry.previousHash !== expectedPrevious) {
      return {
        valid: false,
        totalEntries: ledger.entries.length,
        firstEntry: ledger.entries[0].id,
        lastEntry: ledger.entries[ledger.entries.length - 1].id,
        brokenChainAt: i,
        error: `Entry ${i} chain link broken`,
      };
    }
  }

  return {
    valid: true,
    totalEntries: ledger.entries.length,
    firstEntry: ledger.entries[0].id,
    lastEntry: ledger.entries[ledger.entries.length - 1].id,
  };
}

// ---- Query ----

/** Get all ledger entries for a session. */
export function getSessionEntries(sessionId: string, config: LedgerConfig = {}): LedgerEntry[] {
  const ledger = loadLedger(config);
  return ledger.entries.filter((e) => e.sessionId === sessionId);
}

/** Get all ledger entries by actor. */
export function getActorEntries(actor: string, config: LedgerConfig = {}): LedgerEntry[] {
  const ledger = loadLedger(config);
  return ledger.entries.filter((e) => e.actor === actor);
}

/** Get entries in a time range. */
export function getEntriesInRange(
  from: string,
  to: string,
  config: LedgerConfig = {}
): LedgerEntry[] {
  const ledger = loadLedger(config);
  return ledger.entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
}

// ---- GDPR Export ----

/** Export all ledger data for a specific actor (GDPR Art. 15 right of access). */
export function exportForActor(actor: string, config: LedgerConfig = {}): GdprExport {
  const entries = getActorEntries(actor, config);
  const verificationHash = createHash("sha256").update(JSON.stringify(entries)).digest("hex");

  return {
    exportedAt: new Date().toISOString(),
    requestedBy: actor,
    entries,
    verificationHash,
  };
}

/** Redact entries for a specific actor (GDPR Art. 17 right to erasure). */
export function redactActor(actor: string, config: LedgerConfig = {}): number {
  const ledger = loadLedger(config);
  let count = 0;

  for (const entry of ledger.entries) {
    if (entry.actor === actor) {
      entry.actor = "[REDACTED]";
      entry.reasoning = entry.reasoning ? "[REDACTED]" : undefined;
      entry.subject = "[REDACTED]";
      count++;
    }
  }

  if (count > 0) {
    // Save the redacted ledger first
    saveLedger(ledger, config);

    // Record the redaction as a new entry
    appendEntry(
      {
        type: "deletion",
        sessionId: "gdpr-redaction",
        actor: "system",
        action: `GDPR Art. 17 redaction: ${count} entries for actor`,
        subject: `Redacted ${count} entries`,
        metadata: { redactedCount: String(count) },
      },
      config
    );
  }

  return count;
}

// ---- Formatting ----

/** Format ledger entries as Markdown audit trail. */
export function ledgerToMarkdown(entries: LedgerEntry[]): string {
  if (entries.length === 0) return "No provenance entries found.";

  const lines: string[] = [
    "# 📋 Innovation Provenance Ledger",
    "",
    `**Entries:** ${entries.length}`,
    `**Period:** ${entries[0].timestamp} → ${entries[entries.length - 1].timestamp}`,
    "",
    "| # | Time | Type | Actor | Action | Subject |",
    "|---|------|------|-------|--------|---------|",
  ];

  for (const entry of entries) {
    const time = entry.timestamp.split("T")[1]?.split(".")[0] ?? entry.timestamp;
    lines.push(
      `| ${entry.sequenceNumber} | ${time} | ${entry.type} | ${entry.actor} | ${entry.action} | ${entry.subject.slice(0, 60)} |`
    );
  }

  return lines.join("\n");
}
