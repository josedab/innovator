# Architecture

Innovator is a monorepo with three workspaces and a documentation site.

## Workspace Dependency Graph

```
packages/core ← apps/web   (Next.js web application)
packages/core ← apps/cli   (Command-line interface)
website                     (Docusaurus documentation, standalone)
```

`@innovator/core` is the shared engine: types, prompt templates, Copilot SDK client, and the innovation pipeline. Both `web` and `cli` depend on it — neither contains business logic directly.

## Request Flow (Web)

```
Browser UI → Next.js API route → @innovator/core → GitHub Copilot SDK → LLM
```

1. **UI** (`apps/web/src/app/page.tsx`) — collects subject, drives stage transitions
2. **API routes** (`apps/web/src/app/api/`) — validate input with Zod, delegate to core
3. **Core pipeline** (`packages/core/src/`) — investigation, angle generation, synthesis
4. **Copilot SDK** — sends prompts to the LLM via the user's GitHub Copilot subscription

## Key Directories

| Path                            | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `packages/core/src/prompts/`    | Prompt templates for each innovation angle                   |
| `packages/core/src/innovation/` | Pipeline orchestration (investigate → generate → synthesize) |
| `packages/core/src/copilot/`    | Copilot SDK client wrapper                                   |
| `apps/web/src/components/`      | React UI components                                          |
| `apps/cli/src/`                 | Commander.js CLI entry point                                 |

## Full Documentation

See the [Docusaurus docs site](website/docs/architecture.md) for detailed architecture documentation.
