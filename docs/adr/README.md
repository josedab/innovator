# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Innovator project.

ADRs document significant architectural decisions made during the development of the system. They serve as a historical record of _why_ things are built the way they are, helping new team members understand the reasoning behind key design choices.

## Index

| ADR                                                               | Title                                           | Status   |
| ----------------------------------------------------------------- | ----------------------------------------------- | -------- |
| [ADR-0001](./ADR-0001-monorepo-with-npm-workspaces.md)            | Monorepo with npm Workspaces                    | Accepted |
| [ADR-0002](./ADR-0002-core-centric-shared-engine.md)              | Core-Centric Shared Engine                      | Accepted |
| [ADR-0003](./ADR-0003-github-copilot-sdk-as-default-llm.md)       | GitHub Copilot SDK as Default LLM Provider      | Accepted |
| [ADR-0004](./ADR-0004-pluggable-llm-provider-abstraction.md)      | Pluggable LLM Provider Abstraction              | Accepted |
| [ADR-0005](./ADR-0005-multi-stage-innovation-pipeline.md)         | Multi-Stage Innovation Pipeline                 | Accepted |
| [ADR-0006](./ADR-0006-zod-schema-validation-at-all-boundaries.md) | Zod Schema Validation at All Boundaries         | Accepted |
| [ADR-0007](./ADR-0007-server-sent-events-for-streaming.md)        | Server-Sent Events for Streaming                | Accepted |
| [ADR-0008](./ADR-0008-pluggable-storage-provider-abstraction.md)  | Pluggable Storage Provider Abstraction          | Accepted |
| [ADR-0009](./ADR-0009-client-server-type-boundary.md)             | Client/Server Type Boundary via Subpath Exports | Accepted |
| [ADR-0010](./ADR-0010-defense-in-depth-api-security.md)           | Defense-in-Depth API Security                   | Accepted |
| [ADR-0011](./ADR-0011-prompt-injection-defense.md)                | Prompt Injection Defense Layer                  | Accepted |
| [ADR-0012](./ADR-0012-plugin-system-for-extensibility.md)         | Plugin System for Extensibility                 | Accepted |
| [ADR-0013](./ADR-0013-bounded-concurrency-semaphore.md)           | Bounded-Concurrency Semaphore for LLM Calls     | Accepted |
| [ADR-0014](./ADR-0014-blackboard-pattern-swarm.md)                | Blackboard Pattern for Multi-Agent Swarm        | Accepted |
| [ADR-0015](./ADR-0015-file-based-persistence-atomic-writes.md)    | File-Based Persistence with Atomic Writes       | Accepted |
| [ADR-0016](./ADR-0016-llm-as-judge-evaluation.md)                 | LLM-as-Judge for Idea Quality Evaluation        | Accepted |
| [ADR-0017](./ADR-0017-append-only-hash-chained-ledger.md)         | Append-Only Hash-Chained Provenance Ledger      | Accepted |
| [ADR-0018](./ADR-0018-differential-privacy-federation.md)         | Differential Privacy for Federated Sharing      | Accepted |
| [ADR-0019](./ADR-0019-temporal-knowledge-graph.md)                | Temporal Knowledge Graph for Innovation Memory  | Accepted |
| [ADR-0020](./ADR-0020-genetic-algorithm-idea-evolution.md)        | Genetic Algorithm Metaphor for Idea Evolution   | Accepted |
| [ADR-0021](./ADR-0021-tfidf-offline-semantic-search.md)           | TF-IDF Embeddings for Offline Semantic Search   | Accepted |
| [ADR-0022](./ADR-0022-event-driven-webhooks.md)                   | Event-Driven Architecture with Webhook Delivery | Accepted |

## Format

Each ADR follows this structure:

- **Title** — A short descriptive name prefixed with ADR-NNNN
- **Status** — Accepted, Superseded, or Deprecated
- **Context** — What prompted this decision
- **Decision** — What was decided
- **Consequences** — Tradeoffs, implications, what this enabled or prevented
