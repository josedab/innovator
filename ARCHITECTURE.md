# Architecture

Innovator is a monorepo with four workspaces and a documentation site.

## Workspace Dependency Graph

```
packages/core ← apps/web            (Next.js web application)
packages/core ← apps/cli            (Command-line interface)
packages/core ← packages/mcp-server (MCP server for AI tool integration)
packages/core ← packages/bot        (Chat platform bot)
website                              (Docusaurus documentation, standalone)
```

`@innovator/core` is the shared engine: types, prompt templates, LLM provider abstraction, and the innovation pipeline. All consumers (`web`, `cli`, `mcp-server`, `bot`) depend on it — none contain business logic directly.

## Request Flow (Web)

```
Browser UI → Next.js API route → @innovator/core → LLM Provider → LLM
```

1. **UI** (`apps/web/src/app/page.tsx`) — collects subject, drives stage transitions
2. **API routes** (`apps/web/src/app/api/`) — validate input with Zod, delegate to core
3. **Core pipeline** (`packages/core/src/`) — investigation, angle generation, synthesis
4. **LLM Provider** — routes requests through the configured provider (see below)

## LLM Provider Abstraction

Innovator supports multiple LLM providers through a unified `LLMProvider` interface (`packages/core/src/providers/`). Each provider implements `generateText()`, `generateStream()`, and `listModels()`.

| Provider     | Env Variable         | Default                    | Notes                              |
| ------------ | -------------------- | -------------------------- | ---------------------------------- |
| **Copilot**  | _(none, uses `gh`)_  | —                          | Default provider via GitHub CLI    |
| **OpenAI**   | `OPENAI_API_KEY`     | —                          | Direct OpenAI API access           |
| **Anthropic**| `ANTHROPIC_API_KEY`  | —                          | Direct Anthropic API access        |
| **Ollama**   | `OLLAMA_BASE_URL`    | `http://localhost:11434`   | Local LLM inference                |

The Copilot provider is the default and requires no API keys — it uses the authenticated GitHub CLI (`gh auth login`). Alternative providers are available for environments without Copilot access.

## MCP Server

The MCP (Model Context Protocol) server (`packages/mcp-server/`) exposes Innovator as tools for AI clients.

```
AI Client (Claude Desktop / Cursor / VS Code)
  ↕ stdio or SSE
MCP Server → @innovator/core → LLM Provider → LLM
```

**Architecture:**
- `src/index.ts` — Server entry point, transport selection (stdio default, SSE via `--sse`)
- `src/handlers.ts` — Tool implementations wrapping core functions (`handleInvestigate`, `handleGenerate`, `handleAutoPipeline`)
- `src/schemas.ts` — Zod validation schemas for tool inputs

**Exposed tools:** `investigate`, `innovate`, `auto`

## Key Directories

| Path                            | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `packages/core/src/prompts/`    | Prompt templates for each innovation angle                   |
| `packages/core/src/innovation/` | Pipeline orchestration (investigate → generate → synthesize) |
| `packages/core/src/copilot/`    | Copilot SDK client wrapper                                   |
| `packages/core/src/providers/`  | LLM provider abstraction (Copilot, OpenAI, Anthropic, Ollama)|
| `packages/core/src/artifacts/`  | Structured artifact generation (PRD, tech spec, user story)  |
| `packages/core/src/collaboration/` | Collaborative sessions with voting and commenting         |
| `packages/core/src/research/`   | Deep research agent for extended investigations              |
| `packages/core/src/debate/`     | Structured multi-perspective debate engine                   |
| `packages/core/src/evolution/`  | Genetic-algorithm idea evolution                             |
| `packages/core/src/rag/`        | RAG knowledge grounding module                               |
| `packages/core/src/analytics/`  | Innovation analytics and insights                            |
| `packages/core/src/pipeline-builder/` | Natural language pipeline builder                      |
| `packages/core/src/knowledge-graph/`  | Persistent concept knowledge graph                     |
| `packages/core/src/events/`     | Event bus and webhook delivery system                        |
| `packages/core/src/cost/`       | LLM cost tracking and budget management                      |
| `packages/mcp-server/src/`      | MCP server exposing tools via stdio/SSE transports           |
| `packages/bot/`                 | Chat platform bot (Slack, Discord, Teams)                    |
| `apps/web/src/components/`      | React UI components                                          |
| `apps/web/src/app/api/`         | Next.js API route handlers                                   |
| `apps/cli/src/`                 | Commander.js CLI entry point                                 |

## Full Documentation

See the [Docusaurus docs site](https://github.com/josedab/innovator/blob/main/website/docs/architecture.md) for detailed architecture documentation.

## Architecture Decision Records

Key design decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/). See the [ADR index](./docs/adr/README.md) for the full list.
