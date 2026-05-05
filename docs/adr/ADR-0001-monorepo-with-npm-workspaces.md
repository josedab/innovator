# ADR-0001: Monorepo with npm Workspaces

## Status

Accepted

## Context

Innovator consists of multiple deliverables — a web application, a CLI tool, an MCP server for AI tool integration, a chat platform bot, a project scaffolder (`create-innovator`), and a documentation website — all sharing a common core of domain logic. Early in development, the team needed to decide how to organize these packages:

1. **Polyrepo** — each package in its own repository with versioned npm releases.
2. **Monorepo with Lerna/Nx** — a monorepo using a dedicated orchestration tool.
3. **Monorepo with native npm workspaces** — a monorepo using npm's built-in workspace support.

The project was small enough that a heavyweight orchestrator like Nx or Turborepo would add config complexity without clear benefit. However, keeping packages in separate repositories would introduce painful cross-repo versioning, slow feedback loops, and duplicated CI configuration. The team wanted atomic cross-package changes, a single `npm install`, and a unified CI pipeline — without adding dependencies beyond npm itself.

## Decision

We organize all packages in a single Git repository using **npm workspaces**, with three top-level workspace roots:

```
"workspaces": ["apps/*", "packages/*", "website"]
```

- `packages/core` — shared domain engine (`@innovator/core`)
- `packages/mcp-server` — MCP server (`@innovator/mcp-server`)
- `packages/bot` — chat platform bot (`@innovator/bot`)
- `packages/create-innovator` — project scaffolder
- `apps/web` — Next.js web application
- `apps/cli` — Commander.js CLI tool
- `website` — Docusaurus documentation site (standalone)

Cross-workspace dependencies use `"*"` version specifiers (e.g., `"@innovator/core": "*"`) so that npm resolves them via symlinks to the local source. A single root `package.json` defines all shared dev tooling (ESLint, Prettier, Vitest, Husky, commitlint). The root `Makefile` provides ergonomic shortcuts for common tasks.

## Consequences

**Positive:**

- **Atomic changes** — A single PR can modify core logic, update the web app, CLI, and MCP server simultaneously, with one CI run validating everything.
- **Zero publish overhead** — No npm publishing, no version matrix to manage. `"*"` workspace references keep consumers perpetually in sync with core.
- **Single dependency tree** — `npm install` at the root deduplicates shared dependencies (TypeScript, Zod, etc.), reducing `node_modules` size and version drift.
- **Unified CI** — One GitHub Actions workflow runs format, lint, typecheck, build, and test across all packages in a single job.
- **Lower onboarding cost** — New contributors clone one repo, run `npm install`, and have the entire system ready.

**Negative:**

- **Build ordering is manual** — npm workspaces don't have built-in task scheduling. The root `build` script explicitly chains `core → cli → web` in the right order. If the dependency graph grows more complex, this may need Turborepo or a topological build tool.
- **Coupled releases** — All packages share a single version and release cadence. Independent package versioning would require additional tooling (e.g., changesets).
- **CI blast radius** — Any change triggers the full CI pipeline. As the codebase grows, affected-package filtering may become necessary for acceptable CI times.
- **`npm install` at root is required** — Contributors must install from the root; running `npm install` inside a workspace directory can produce broken symlinks.
