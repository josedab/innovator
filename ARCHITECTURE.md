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

| Provider      | Env Variable        | Default                  | Notes                           |
| ------------- | ------------------- | ------------------------ | ------------------------------- |
| **Copilot**   | _(none, uses `gh`)_ | —                        | Default provider via GitHub CLI |
| **OpenAI**    | `OPENAI_API_KEY`    | —                        | Direct OpenAI API access        |
| **Anthropic** | `ANTHROPIC_API_KEY` | —                        | Direct Anthropic API access     |
| **Ollama**    | `OLLAMA_BASE_URL`   | `http://localhost:11434` | Local LLM inference             |

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

| Path                                  | Purpose                                                       |
| ------------------------------------- | ------------------------------------------------------------- |
| `packages/core/src/prompts/`          | Prompt templates for each innovation angle                    |
| `packages/core/src/innovation/`       | Pipeline orchestration (investigate → generate → synthesize)  |
| `packages/core/src/copilot/`          | Copilot SDK client wrapper                                    |
| `packages/core/src/providers/`        | LLM provider abstraction (Copilot, OpenAI, Anthropic, Ollama) |
| `packages/core/src/artifacts/`        | Structured artifact generation (PRD, tech spec, user story)   |
| `packages/core/src/collaboration/`    | Collaborative sessions with voting and commenting             |
| `packages/core/src/research/`         | Deep research agent for extended investigations               |
| `packages/core/src/debate/`           | Structured multi-perspective debate engine                    |
| `packages/core/src/evolution/`        | Genetic-algorithm idea evolution                              |
| `packages/core/src/rag/`              | RAG knowledge grounding module                                |
| `packages/core/src/analytics/`        | Innovation analytics and insights                             |
| `packages/core/src/pipeline-builder/` | Natural language pipeline builder                             |
| `packages/core/src/knowledge-graph/`  | Persistent concept knowledge graph                            |
| `packages/core/src/events/`           | Event bus and webhook delivery system                         |
| `packages/core/src/cost/`             | LLM cost tracking and budget management                       |
| `packages/core/src/storage/`          | Pluggable storage abstraction (memory, SQLite backends)       |
| `packages/core/src/validation/`       | Input validation and sanitization utilities                   |
| `packages/core/src/models/`           | Model allowlist and configuration                             |
| `packages/core/src/chaining/`         | Multi-step prompt chaining                                    |
| `packages/core/src/embeddings/`       | Vector embedding generation and similarity                    |
| `packages/core/src/orchestration/`    | High-level workflow orchestration                             |
| `packages/core/src/rbac/`             | Role-based access control                                     |
| `packages/core/src/plugins/`          | Plugin system for extensibility                               |
| `packages/core/src/presets/`          | Pipeline presets and templates                                |
| `packages/mcp-server/src/`            | MCP server exposing tools via stdio/SSE transports            |
| `packages/bot/`                       | Chat platform bot (Slack, Discord, Teams)                     |
| `apps/web/src/components/`            | React UI components                                           |
| `apps/web/src/app/api/`               | Next.js API route handlers                                    |
| `apps/cli/src/`                       | Commander.js CLI entry point                                  |

## Concurrency Model

The innovation pipeline uses semaphore-based bounded concurrency via `runWithConcurrency()` in `packages/core/src/innovation/pipeline.ts`:

- **`MAX_CONCURRENCY = 2`** — At most 2 LLM calls run in parallel during angle generation
- A promise pool tracks active tasks; `Promise.race()` waits for a free slot when the pool is full
- Individual angle failures are captured without aborting the entire pipeline
- `AbortSignal` propagation allows early cancellation from API routes

This design balances throughput against LLM provider rate limits. Investigation and synthesis stages run as single sequential calls.

## SSE Streaming Architecture

Long-running endpoints (`/api/auto`, `/api/pipeline`) use Server-Sent Events (SSE) for real-time progress:

```
Client (EventSource) ←── SSE stream ←── ReadableStream ←── Pipeline callbacks
```

- API routes create a `ReadableStream` and return it as a `text/event-stream` response
- Pipeline progress callbacks emit `data: {...}\n\n` events as JSON
- A 15-second heartbeat comment prevents proxy/CDN timeout disconnections
- Events follow the stage progression: `investigating` → `generating` → `synthesizing` → `complete`
- The `currentAngle` field identifies which angle is actively generating

SSE was chosen over WebSockets (see ADR-0007) for unidirectional updates, serverless compatibility, and native browser `EventSource` support.

## Request Validation

API routes use a two-layer validation strategy:

1. **Middleware layer** (`apps/web/src/middleware.ts`) — Rate limiting, auth, body size (100 KB cap), CSP headers, `Content-Length` enforcement
2. **Route-level Zod schemas** — Each API route defines a Zod schema for its request body

```typescript
// Typical pattern in route handlers
const RequestSchema = z.object({
  subject: z.string().min(1).max(5000),
  model: z.string().optional(),
  angles: z.array(z.string()).max(20).optional(),
});

const parsed = RequestSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
```

Core types (`Investigation`, `AngleResult`, `Synthesis`) also have Zod schemas for validating LLM output at runtime, ensuring structured data even when the model produces unexpected formats.

## Provider Abstraction Internals

Each LLM provider implements the `LLMProvider` interface:

```typescript
interface LLMProvider {
  readonly id: string;
  readonly name: string;
  generateText(options: LLMGenerateOptions): Promise<string>;
  generateStream(options: LLMGenerateOptions, onChunk: (chunk: string) => void): Promise<string>;
  listModels(): Promise<LLMModelInfo[]>;
}
```

**Provider selection** is automatic based on environment variables — if `OPENAI_API_KEY` is set, the OpenAI provider activates; if no keys are set, the Copilot provider is used via `gh` CLI authentication. The `validateModel()` utility checks requested models against the provider's allowlist plus any `INNOVATOR_EXTRA_MODELS`.

**Built-in providers:**

- **CopilotProvider** — Wraps `@github/copilot-sdk`, uses `getCopilotClient()` singleton with graceful shutdown
- **OpenAIProvider** — Direct OpenAI API via `openai` SDK
- **AnthropicProvider** — Direct Anthropic API via `@anthropic-ai/sdk`
- **OllamaProvider** — Local inference via Ollama REST API

## Full Documentation

See the [Docusaurus docs site](https://github.com/josedab/innovator/blob/main/website/docs/architecture.md) for detailed architecture documentation.

## Architecture Decision Records

Key design decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/). See the [ADR index](./docs/adr/README.md) for the full list.
