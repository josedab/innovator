---
id: adr-index
title: Architecture Decision Records
sidebar_position: 1
---

# Architecture Decision Records

Significant architectural decisions are documented as ADRs in the [`docs/adr/`](https://github.com/josedab/innovator/tree/main/docs/adr) directory of the repository.

ADRs serve as a historical record of _why_ things are built the way they are, helping new team members understand the reasoning behind key design choices.

## Index

| ADR                                                                                                                     | Title                                           | Status   |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- |
| [ADR-0001](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0001-monorepo-with-npm-workspaces.md)            | Monorepo with npm Workspaces                    | Accepted |
| [ADR-0002](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0002-core-centric-shared-engine.md)              | Core-Centric Shared Engine                      | Accepted |
| [ADR-0003](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0003-github-copilot-sdk-as-default-llm.md)       | GitHub Copilot SDK as Default LLM Provider      | Accepted |
| [ADR-0004](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0004-pluggable-llm-provider-abstraction.md)      | Pluggable LLM Provider Abstraction              | Accepted |
| [ADR-0005](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0005-multi-stage-innovation-pipeline.md)         | Multi-Stage Innovation Pipeline                 | Accepted |
| [ADR-0006](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0006-zod-schema-validation-at-all-boundaries.md) | Zod Schema Validation at All Boundaries         | Accepted |
| [ADR-0007](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0007-server-sent-events-for-streaming.md)        | Server-Sent Events for Streaming                | Accepted |
| [ADR-0008](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0008-pluggable-storage-provider-abstraction.md)  | Pluggable Storage Provider Abstraction          | Accepted |
| [ADR-0009](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0009-client-server-type-boundary.md)             | Client/Server Type Boundary via Subpath Exports | Accepted |
| [ADR-0010](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0010-defense-in-depth-api-security.md)           | Defense-in-Depth API Security                   | Accepted |
| [ADR-0011](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0011-prompt-injection-defense.md)                | Prompt Injection Defense Layer                  | Accepted |
| [ADR-0012](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0012-plugin-system-for-extensibility.md)         | Plugin System for Extensibility                 | Accepted |

## Format

Each ADR follows this structure:

- **Title** — A short descriptive name prefixed with ADR-NNNN
- **Status** — Accepted, Superseded, or Deprecated
- **Context** — What prompted this decision
- **Decision** — What was decided
- **Consequences** — Tradeoffs, implications, what this enabled or prevented

If your contribution involves a major design choice (new dependency, structural change, protocol selection), consider adding a new ADR. See the [Contributing guide](/docs/contributing) for details.
