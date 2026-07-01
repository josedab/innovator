# ADR-0015: File-Based Persistence with Atomic Writes

> **Current operational note (2026):** The first production profile deliberately uses this file-based model with one process, one replica, and backed-up `innovator_data` plus `copilot_data` volumes. PostgreSQL is not an available production fallback because its adapter is not implemented; the scale-out limitation below remains a future design concern.

## Status

Accepted

## Context

Multiple core modules — session history, custom angles, marketplace, knowledge graph, temporal memory, provenance ledger, genome library, and sentinel state — need durable persistence across process restarts. The persistence strategy needed to support:

- Single-user desktop operation (the primary use case)
- Zero external dependencies (no database server required)
- Trivial backup and portability (copy a directory)
- Crash safety (no partial writes corrupting state)

Options considered:

1. **SQLite via better-sqlite3** — Available in the storage abstraction but adds a native dependency and build complexity.
2. **JSON files with direct `writeFileSync`** — Simple but vulnerable to corruption if the process crashes mid-write.
3. **JSON files with atomic write (temp + rename)** — Crash-safe without external dependencies.
4. **LevelDB / RocksDB** — Overkill for the data volumes involved; adds native dependencies.

## Decision

All file-persisting modules write JSON to `~/.innovator/<module>/` using an **atomic write pattern**: write to a temporary file with a random suffix, then `renameSync()` to the target path. Since `rename` is atomic on POSIX filesystems (and on NTFS for same-directory renames), the target file is either the old version or the new version — never a partial write.

```typescript
function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}
```

This pattern is applied in: `history/index.ts`, `innovation/custom-angles.ts`, `marketplace/index.ts`, `provenance-ledger/ledger.ts`, `temporal-memory/temporal-memory.ts`, `genome-sequencer/sequencer.ts`, and `sentinel/sentinel.ts`.

## Consequences

**Positive:**

- **Zero dependencies** — Uses only Node.js built-in `fs` module.
- **Crash-safe** — Interrupted writes leave the previous version intact; the temp file is orphaned but harmless.
- **Portable** — Users can back up, sync, or migrate their innovation data by copying `~/.innovator/`.
- **Human-readable** — JSON files can be inspected, edited, and version-controlled.

**Negative:**

- **No concurrent access** — Multiple processes writing to the same file can race. This is acceptable for single-user desktop use but inadequate for multi-user server deployments.
- **No transactions** — Cross-file atomic operations (e.g., updating both the knowledge graph and the ledger) are not possible.
- **Linear scan** — Queries over large datasets (thousands of sessions) require reading and parsing the entire file. The `storage/` abstraction with SQLite or PostgreSQL drivers should be used for production-scale deployments.
- **Disk usage** — JSON is verbose; binary formats would be more compact. Not a concern at typical innovation session volumes.
