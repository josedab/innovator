# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Innovator project.

ADRs document significant architectural decisions made during the development of the system. They serve as a historical record of _why_ things are built the way they are, helping new team members understand the reasoning behind key design choices.

## Index

| ADR                                                               | Title                                           | Decision Summary                                                                              | Status   |
| ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| [ADR-0001](./ADR-0001-monorepo-with-npm-workspaces.md)            | Monorepo with npm Workspaces                    | Organize all packages in a single repo using npm workspaces for atomic changes and unified CI | Accepted |
| [ADR-0002](./ADR-0002-core-centric-shared-engine.md)              | Core-Centric Shared Engine                      | Concentrate all domain logic in `@innovator/core`; consumers are thin adapters                | Accepted |
| [ADR-0003](./ADR-0003-github-copilot-sdk-as-default-llm.md)       | GitHub Copilot SDK as Default LLM Provider      | Use GitHub Copilot SDK as default LLM provider via local `gh` CLI authentication              | Accepted |
| [ADR-0004](./ADR-0004-pluggable-llm-provider-abstraction.md)      | Pluggable LLM Provider Abstraction              | Define pluggable `LLMProvider` interface supporting Copilot, OpenAI, Anthropic, Ollama        | Accepted |
| [ADR-0005](./ADR-0005-multi-stage-innovation-pipeline.md)         | Multi-Stage Innovation Pipeline                 | Implement three-stage pipeline: investigate → generate angles → synthesize                    | Accepted |
| [ADR-0006](./ADR-0006-zod-schema-validation-at-all-boundaries.md) | Zod Schema Validation at All Boundaries         | Validate all trust boundaries (API input, LLM output, config) with Zod schemas                | Accepted |
| [ADR-0007](./ADR-0007-server-sent-events-for-streaming.md)        | Server-Sent Events for Streaming                | Stream long-running pipeline results to clients via SSE with heartbeat                        | Accepted |
| [ADR-0008](./ADR-0008-pluggable-storage-provider-abstraction.md)  | Pluggable Storage Provider Abstraction          | Define pluggable `StorageProvider` interface supporting in-memory and SQLite backends         | Accepted |
| [ADR-0009](./ADR-0009-client-server-type-boundary.md)             | Client/Server Type Boundary via Subpath Exports | Share types to browser via `@innovator/core/types` subpath export without Node deps           | Accepted |
| [ADR-0010](./ADR-0010-defense-in-depth-api-security.md)           | Defense-in-Depth API Security                   | Layer API security with optional auth, per-route rate limits, body size limits, CSP           | Accepted |
| [ADR-0011](./ADR-0011-prompt-injection-defense.md)                | Prompt Injection Defense Layer                  | Defend against prompt injection with input sanitization, wrapping, and output filtering       | Accepted |
| [ADR-0012](./ADR-0012-plugin-system-for-extensibility.md)         | Plugin System for Extensibility                 | Enable extensibility via plugin system supporting angle, exporter, and visualizer types       | Accepted |
| [ADR-0013](./ADR-0013-bounded-concurrency-semaphore.md)           | Bounded-Concurrency Semaphore for LLM Calls     | Bound parallel LLM calls to `MAX_CONCURRENCY=2` using semaphore pattern with AbortSignal      | Accepted |
| [ADR-0014](./ADR-0014-blackboard-pattern-swarm.md)                | Blackboard Pattern for Multi-Agent Swarm        | Coordinate multi-agent swarm using blackboard pattern with append-only shared state           | Accepted |
| [ADR-0015](./ADR-0015-file-based-persistence-atomic-writes.md)    | File-Based Persistence with Atomic Writes       | Persist JSON files atomically using temp-write then rename for crash safety                   | Accepted |
| [ADR-0016](./ADR-0016-llm-as-judge-evaluation.md)                 | LLM-as-Judge for Idea Quality Evaluation        | Evaluate idea quality via LLM-as-judge with gauntlet, red team, and debate modules            | Accepted |
| [ADR-0017](./ADR-0017-append-only-hash-chained-ledger.md)         | Append-Only Hash-Chained Provenance Ledger      | Record audit trail in append-only hash-chained ledger for GDPR/AI Act compliance              | Accepted |
| [ADR-0018](./ADR-0018-differential-privacy-federation.md)         | Differential Privacy for Federated Sharing      | Share federated patterns with ε-differential privacy via Laplace mechanism                    | Accepted |
| [ADR-0019](./ADR-0019-temporal-knowledge-graph.md)                | Temporal Knowledge Graph for Innovation Memory  | Build temporal knowledge graph with timestamps tracking concept evolution across sessions     | Accepted |
| [ADR-0020](./ADR-0020-genetic-algorithm-idea-evolution.md)        | Genetic Algorithm Metaphor for Idea Evolution   | Model idea refinement as genetic algorithm with crossover, mutation, and selection            | Accepted |
| [ADR-0021](./ADR-0021-tfidf-offline-semantic-search.md)           | TF-IDF Embeddings for Offline Semantic Search   | Index and search documents offline using TF-IDF vector space with cosine similarity           | Accepted |
| [ADR-0022](./ADR-0022-event-driven-webhooks.md)                   | Event-Driven Architecture with Webhook Delivery | Decouple modules with typed event bus supporting internal subscriptions and webhooks          | Accepted |

## Format

Each ADR follows this structure:

- **Title** — A short descriptive name prefixed with ADR-NNNN
- **Status** — One of the statuses below
- **Context** — What prompted this decision
- **Decision** — What was decided
- **Consequences** — Tradeoffs, implications, what this enabled or prevented

## Status Legend

| Status         | Meaning                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| **Proposed**   | Under discussion; not yet approved. Open for feedback and revision.                      |
| **Accepted**   | Approved and in effect. The decision guides current implementation.                      |
| **Deprecated** | No longer recommended. A newer approach is preferred, but no replacement ADR exists yet. |
| **Superseded** | Replaced by a newer ADR. The superseding ADR is linked in the document.                  |
