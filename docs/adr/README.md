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

## Format

Each ADR follows this structure:

- **Title** — A short descriptive name prefixed with ADR-NNNN
- **Status** — Accepted, Superseded, or Deprecated
- **Context** — What prompted this decision
- **Decision** — What was decided
- **Consequences** — Tradeoffs, implications, what this enabled or prevented
