# ADR-0017: Append-Only Hash-Chained Provenance Ledger

## Status

Accepted

## Context

As AI-generated content becomes subject to regulatory scrutiny (EU AI Act Article 14 transparency requirements, effective August 2026), Innovator needed an audit trail that records _how_ every idea was produced — which model, prompt, investigation context, and human decisions shaped the output. Requirements:

1. **Tamper evidence** — It must be detectable if any historical entry is modified after the fact.
2. **Append-only semantics** — New entries are added but existing entries are never modified (except for GDPR redaction, which is recorded).
3. **GDPR compliance** — Right of access (Art. 15) and right to erasure (Art. 17) must be supported.
4. **Zero infrastructure** — No blockchain, no external database, no network dependency.

Options considered:

1. **Database with audit table** — Requires a running database; overkill for single-user.
2. **Blockchain / Merkle tree** — Strong guarantees but complex, slow, and dependency-heavy.
3. **Append-only JSON file with hash chaining** — Each entry contains the SHA-256 hash of the previous entry's content, forming a sequential chain.

## Decision

We implement a **hash-chained append-only ledger** in `packages/core/src/provenance-ledger/`. Each `LedgerEntry` contains:

- `contentHash` — SHA-256 of the entry's own content fields (excluding hash fields).
- `previousHash` — The `contentHash` of the preceding entry (empty string for the first entry).

Verification walks the chain and recomputes hashes. If any entry has been modified, the chain breaks at that point. GDPR redaction replaces PII fields with `[REDACTED]` and appends a new `deletion` entry recording the action — the chain remains valid but the content is obscured.

Convenience functions record common event types: `recordInvestigation()`, `recordGeneration()`, `recordGauntlet()`, `recordHumanDecision()`.

## Consequences

**Positive:**

- **Tamper-evident** — `verifyLedger()` detects any modification to historical entries in O(n) time.
- **GDPR-compliant** — `exportForActor()` implements Art. 15 right of access; `redactActor()` implements Art. 17 right to erasure with audit trail.
- **EU AI Act ready** — Full decision trail from prompt to output to human approval, meeting Art. 14 transparency requirements.
- **Zero infrastructure** — File-based, no external services.

**Negative:**

- **No cryptographic non-repudiation** — Hash chaining proves integrity but not identity. Adding Ed25519 signatures would provide non-repudiation but requires key management infrastructure.
- **Linear verification** — Verifying the full chain requires reading all entries. Acceptable for typical volumes (hundreds to low thousands of entries).
- **Redaction weakens chain** — After GDPR redaction, the redacted entry's original content hash no longer matches. The chain is still valid (the redacted content is hashed as-is) but the original content is unrecoverable.
