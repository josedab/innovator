import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadLedger,
  appendEntry,
  verifyLedger,
  recordInvestigation,
  recordHumanDecision,
  getSessionEntries,
  exportForActor,
  redactActor,
  ledgerToMarkdown,
} from "../provenance-ledger/ledger.js";

describe("provenance-ledger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "provenance-ledger-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates empty ledger on first load", () => {
    const ledger = loadLedger({ ledgerDir: tempDir });
    expect(ledger.version).toBe(1);
    expect(ledger.entries).toHaveLength(0);
  });

  it("appends entries with hash chaining", () => {
    const config = { ledgerDir: tempDir };
    const e1 = appendEntry(
      {
        type: "investigation",
        sessionId: "s1",
        actor: "system",
        action: "Investigated topic",
        subject: "AI Ethics",
      },
      config
    );

    expect(e1.sequenceNumber).toBe(0);
    expect(e1.previousHash).toBe("");
    expect(e1.contentHash).toBeTruthy();

    const e2 = appendEntry(
      {
        type: "generation",
        sessionId: "s1",
        actor: "system",
        action: "Generated ideas",
        subject: "AI Ethics",
        model: "gpt-5",
      },
      config
    );

    expect(e2.sequenceNumber).toBe(1);
    expect(e2.previousHash).toBe(e1.contentHash);
  });

  it("verifies valid ledger integrity", () => {
    const config = { ledgerDir: tempDir };
    appendEntry(
      { type: "investigation", sessionId: "s1", actor: "system", action: "test", subject: "test" },
      config
    );
    appendEntry(
      { type: "generation", sessionId: "s1", actor: "system", action: "test2", subject: "test2" },
      config
    );

    const result = verifyLedger(config);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(2);
  });

  it("records investigation and human decisions", () => {
    const config = { ledgerDir: tempDir };
    recordInvestigation("s1", "Climate Tech", "gpt-5", "abc123", config);
    recordHumanDecision("s1", "user@test.com", "approval", "Solar panels idea", "Strong market fit", undefined, config);

    const entries = getSessionEntries("s1", config);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("investigation");
    expect(entries[1].type).toBe("approval");
    expect(entries[1].reasoning).toBe("Strong market fit");
  });

  it("exports data for actor (GDPR)", () => {
    const config = { ledgerDir: tempDir };
    appendEntry(
      { type: "approval", sessionId: "s1", actor: "alice@test.com", action: "Approved", subject: "Idea A" },
      config
    );
    appendEntry(
      { type: "rejection", sessionId: "s1", actor: "bob@test.com", action: "Rejected", subject: "Idea B" },
      config
    );

    const exported = exportForActor("alice@test.com", config);
    expect(exported.entries).toHaveLength(1);
    expect(exported.entries[0].actor).toBe("alice@test.com");
    expect(exported.verificationHash).toBeTruthy();
  });

  it("redacts actor data (GDPR Art. 17)", () => {
    const config = { ledgerDir: tempDir };
    appendEntry(
      { type: "approval", sessionId: "s1", actor: "alice@test.com", action: "Approved", subject: "Secret Idea", reasoning: "Private reasoning" },
      config
    );

    const count = redactActor("alice@test.com", config);
    expect(count).toBe(1);

    const ledger = loadLedger(config);
    const redacted = ledger.entries.find((e) => e.sequenceNumber === 0);
    expect(redacted?.actor).toBe("[REDACTED]");
    expect(redacted?.subject).toBe("[REDACTED]");
  });

  it("formats ledger as markdown", () => {
    const config = { ledgerDir: tempDir };
    appendEntry(
      { type: "investigation", sessionId: "s1", actor: "system", action: "Investigated", subject: "AI" },
      config
    );

    const entries = getSessionEntries("s1", config);
    const md = ledgerToMarkdown(entries);
    expect(md).toContain("Innovation Provenance Ledger");
    expect(md).toContain("investigation");
  });
});
