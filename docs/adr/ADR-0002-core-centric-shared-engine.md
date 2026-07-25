# ADR-0002: Core-Centric Shared Engine

## Status

Accepted

## Context

Innovator exposes the same innovation capabilities through four different surfaces: a web app, a CLI, an MCP server, and a chat bot. Without a shared engine, each surface would need its own implementation of investigation logic, prompt construction, LLM interaction, angle definitions, scoring, export, and session management — leading to duplication, divergent behavior, and compounding maintenance cost.

The team needed to decide where business logic lives:

1. **In each consumer** — duplicate logic per surface, coupled to its runtime.
2. **In a shared library** — a single package that all consumers depend on, containing zero UI or transport logic.

## Decision

We concentrate **all domain logic** in `@innovator/core` (`packages/core/`). This package owns:

- Type definitions and Zod schemas (`types.ts`)
- The innovation pipeline (investigate → generate → synthesize)
- Prompt templates and sanitization
- LLM provider abstraction
- Angle definitions, custom angles, and angle packs
- Scoring, ranking, and priority classification
- Session history and storage
- Collaboration, conversation, and refinement
- Export to multiple formats (Markdown, JSON, Jira, Confluence, etc.)
- Plugin system, presets, events, cost tracking, RAG, and 60+ other modules

Consumers (`apps/web`, `apps/cli`, `packages/mcp-server`, `packages/bot`) are **thin adapters** that handle transport (HTTP, stdio, chat protocol), UI rendering, and user interaction — they never contain business logic directly. They delegate through the compatibility `@innovator/core` root or a supported cohesive feature subpath such as `@innovator/core/innovation`.

The dependency graph enforces a strict unidirectional flow:

```
packages/core ← apps/web
packages/core ← apps/cli
packages/core ← packages/mcp-server
packages/core ← packages/bot
```

## Consequences

**Positive:**

- **Single source of truth** — Bug fixes and feature additions in core automatically propagate to all surfaces without cross-package coordination.
- **Behavioral consistency** — The same prompt templates, validation schemas, and scoring logic are used whether the user interacts via browser, terminal, MCP, or chat.
- **Testability** — Core logic is tested in isolation with unit tests, independent of HTTP, CLI parsing, or chat protocols. Consumers only need integration/E2E tests for their transport layer.
- **New surfaces are cheap** — Adding a new consumer (e.g., a VS Code extension, a Slack app) requires only writing the transport adapter; all intelligence is inherited from core.

**Negative:**

- **Core becomes a monolith** — With 60+ modules, `@innovator/core` is large. As it grows, internal cohesion may decrease and build times may increase. Future refactoring could split it into `@innovator/core`, `@innovator/analytics`, `@innovator/collaboration`, etc.
- **Core API compatibility burden** — The root barrel remains supported, while stable feature subpaths reduce coupling for adapters that use one cohesive area. Breaking changes still require coordinated updates.
- **Node.js runtime assumption** — Core uses Node.js APIs (file system, `process.env`) which prevents direct use in browsers. This is addressed by the client-safe subpath export (see ADR-0009).
