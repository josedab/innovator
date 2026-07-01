# ADR-0008: Pluggable Storage Provider Abstraction

> **Current operational note (2026):** The first production profile persists application files in `innovator_data` and Copilot session state in `copilot_data`; it does not expose storage-backend selection as a deployment option. PostgreSQL is not implemented, and serverless or horizontally scaled remote-database deployments are unsupported. The provider discussion below records the abstraction's design context.

## Status

Accepted

## Context

Multiple core modules need persistence: session history, collaborative sessions, workspaces, API gateway keys, analytics events, and the knowledge graph. Early versions used in-memory Maps directly within each module, which was fine for development but meant data was lost on every restart.

The team needed a storage strategy that:

1. Works out-of-the-box without external dependencies (for quick starts and testing).
2. Supports durable persistence for production (file-based or remote database).
3. Doesn't couple business logic to a specific storage technology.

Options considered:

1. **Direct database dependency** — Require SQLite/PostgreSQL from the start. High setup friction.
2. **ORM (Prisma, Drizzle)** — Powerful but heavyweight, adds schema migration complexity.
3. **Interface-based abstraction** — Define storage contracts, ship multiple implementations.

## Decision

We define a **`StorageProvider` interface** in `packages/core/src/storage/types.ts` that composes domain-specific sub-interfaces:

```typescript
interface StorageProvider {
  readonly name: string;
  sessions: SessionStorage;
  workspaces: WorkspaceStorage;
  apiGateway: ApiGatewayStorage;
  collaboration: CollaborationStorage;
  analytics: AnalyticsStorage;
  knowledgeGraph: KnowledgeGraphStorage;
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

Two implementations ship built-in:

| Implementation            | Module              | Use Case                                                                                              |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `InMemoryStorageProvider` | `storage/memory.ts` | Default. Zero config, used for development and testing.                                               |
| `SQLiteStorageProvider`   | `storage/sqlite.ts` | Durable file-based persistence. Supports local SQLite via `better-sqlite3` and remote Turso (libSQL). |

A **global provider singleton** (`getStorage()` / `setStorage()`) makes the active provider accessible throughout core without dependency injection. The default is `InMemoryStorageProvider` for backward compatibility.

Business logic modules (history, collaboration, analytics, etc.) call `getStorage().sessions.saveSession(...)` — they never import a specific storage implementation.

Migration support (`storage/migrate.ts`) handles schema evolution for SQLite deployments.

## Consequences

**Positive:**

- **Zero-config default** — `npm run dev` works immediately without database setup. The in-memory provider stores everything in Maps and is perfectly adequate for single-session development.
- **Clean separation** — Business logic is storage-agnostic. Adding a PostgreSQL or DynamoDB provider requires implementing the interfaces without touching any pipeline code.
- **Testing** — Tests use the in-memory provider by default, running fast without database fixtures or cleanup.
- **Progressive enhancement** — Users start with in-memory, graduate to SQLite when they need persistence, and can move to Turso for cloud-hosted durability — all without changing application code.

**Negative:**

- **Global mutable state** — The singleton pattern (`getStorage()`) means storage provider selection is implicit. In multi-tenant or test-parallel scenarios, this can cause subtle bugs. Mitigated by `setStorage()` in test setup.
- **Interface surface area** — The `StorageProvider` interface encompasses 6 sub-interfaces with ~25 methods total. New storage backends must implement all of them, even if they only need a subset.
- **No transactions** — The interface doesn't expose transaction primitives. Cross-table consistency (e.g., saving a session and its analytics event atomically) depends on the implementation.
- **In-memory is the default** — If users don't explicitly configure SQLite, they may not realize their data isn't persisted. The `doctor` script could warn about this.
