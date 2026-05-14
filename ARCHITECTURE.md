# Architecture

Innovator is a monorepo with eight workspaces and a documentation site.

## Workspace Dependency Graph

```mermaid
graph BT
  core["@innovator/core<br/><i>Shared innovation engine</i>"]

  web["apps/web<br/><i>Next.js web application</i>"]
  cli["apps/cli<br/><i>Command-line interface</i>"]
  mcp["packages/mcp-server<br/><i>MCP server</i>"]
  bot["packages/bot<br/><i>Chat bot</i>"]
  vscode["packages/vscode-extension<br/><i>VS Code extension</i>"]
  copilot["packages/copilot-extension<br/><i>Copilot Extension</i>"]
  create["packages/create-innovator<br/><i>Project scaffolder</i>"]
  action["action/<br/><i>GitHub Action</i>"]
  website["website/<br/><i>Docusaurus docs</i>"]

  web --> core
  cli --> core
  mcp --> core
  bot --> core
  vscode --> core
  copilot --> core
  action -.->|uses CLI| cli

  style core fill:#4f46e5,color:#fff,stroke:#4338ca
  style website fill:#6b7280,color:#fff,stroke:#4b5563
  style create fill:#6b7280,color:#fff,stroke:#4b5563
```

`@innovator/core` is the shared engine: types, prompt templates, LLM provider abstraction, and the innovation pipeline. All consumers (`web`, `cli`, `mcp-server`, `bot`) depend on it — none contain business logic directly.

## Request Flow (Web)

```mermaid
sequenceDiagram
    participant B as Browser UI
    participant M as Middleware
    participant A as API Route
    participant C as @innovator/core
    participant P as LLM Provider
    participant L as LLM

    B->>M: POST /api/auto {subject}
    M->>M: Rate limit, auth, body size
    M->>A: Validated request
    A->>A: Zod schema validation
    A->>C: runAutoPipeline(subject)

    rect rgb(240, 240, 255)
        Note over C,L: Stage 1 — Investigation
        C->>P: generateText(investigationPrompt)
        P->>L: LLM request
        L-->>P: Response
        P-->>C: Investigation JSON
    end

    rect rgb(240, 255, 240)
        Note over C,L: Stage 2 — Generation (2 angles in parallel)
        C->>P: generateText(angle1Prompt)
        C->>P: generateText(angle2Prompt)
        P->>L: LLM requests
        L-->>P: Responses
        P-->>C: AngleResult[]
    end

    rect rgb(255, 240, 240)
        Note over C,L: Stage 3 — Synthesis
        C->>P: generateText(synthesisPrompt)
        P->>L: LLM request
        L-->>P: Response
        P-->>C: Synthesis JSON
    end

    C-->>A: PipelineProgress (SSE events)
    A-->>B: text/event-stream
```

1. **UI** (`apps/web/src/app/page.tsx`) — collects subject, drives stage transitions
2. **API routes** (`apps/web/src/app/api/`) — validate input with Zod, delegate to core
3. **Core pipeline** (`packages/core/src/`) — investigation, angle generation, synthesis
4. **LLM Provider** — routes requests through the configured provider (see below)

## LLM Provider Abstraction

Innovator supports multiple LLM providers through a unified `LLMProvider` interface (`packages/core/src/providers/`). Each provider implements `generateText()`, `generateStream()`, and `listModels()`.

```mermaid
graph LR
    Core["@innovator/core<br/>Pipeline"]

    subgraph Providers["LLM Providers"]
        direction TB
        Copilot["CopilotProvider<br/><i>gh CLI auth</i>"]
        OpenAI["OpenAIProvider<br/><i>OPENAI_API_KEY</i>"]
        Anthropic["AnthropicProvider<br/><i>ANTHROPIC_API_KEY</i>"]
        Ollama["OllamaProvider<br/><i>OLLAMA_BASE_URL</i>"]
    end

    Core -->|LLMProvider interface| Copilot
    Core -->|LLMProvider interface| OpenAI
    Core -->|LLMProvider interface| Anthropic
    Core -->|LLMProvider interface| Ollama

    Copilot -->|"@github/copilot-sdk"| GH["GitHub Copilot"]
    OpenAI --> OAI["OpenAI API"]
    Anthropic --> ANT["Anthropic API"]
    Ollama --> LOC["Local Ollama"]

    style Core fill:#4f46e5,color:#fff,stroke:#4338ca
    style Copilot fill:#22c55e,color:#fff,stroke:#16a34a
```

| Provider      | Env Variable        | Default                  | Notes                           |
| ------------- | ------------------- | ------------------------ | ------------------------------- |
| **Copilot**   | _(none, uses `gh`)_ | —                        | Default provider via GitHub CLI |
| **OpenAI**    | `OPENAI_API_KEY`    | —                        | Direct OpenAI API access        |
| **Anthropic** | `ANTHROPIC_API_KEY` | —                        | Direct Anthropic API access     |
| **Ollama**    | `OLLAMA_BASE_URL`   | `http://localhost:11434` | Local LLM inference             |

The Copilot provider is the default and requires no API keys — it uses the authenticated GitHub CLI (`gh auth login`). Alternative providers are available for environments without Copilot access.

## MCP Server

The MCP (Model Context Protocol) server (`packages/mcp-server/`) exposes Innovator as tools for AI clients.

```mermaid
graph LR
    subgraph Clients["MCP Clients"]
        CD["Claude Desktop"]
        CU["Cursor"]
        VS["VS Code"]
    end

    subgraph MCP["MCP Server"]
        direction TB
        T1["investigate"]
        T2["innovate"]
        T3["auto"]
        T4["innovate-from-code"]
        T5["innovate-file"]
        T6["innovate-architecture"]
    end

    CD <-->|"stdio / SSE"| MCP
    CU <-->|"stdio / SSE"| MCP
    VS <-->|"stdio / SSE"| MCP
    MCP --> Core["@innovator/core"]
    Core --> LLM["LLM Provider → LLM"]

    style MCP fill:#f59e0b,color:#000,stroke:#d97706
    style Core fill:#4f46e5,color:#fff,stroke:#4338ca
```

**Architecture:**

- `src/index.ts` — Server entry point, transport selection (stdio default, SSE via `--sse`)
- `src/handlers.ts` — Tool implementations wrapping core functions (`handleInvestigate`, `handleGenerate`, `handleAutoPipeline`)
- `src/schemas.ts` — Zod validation schemas for tool inputs

**Exposed tools:** `investigate`, `innovate`, `auto`

## Key Directories

| Path                                   | Purpose                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| `packages/core/src/prompts/`           | Prompt templates for each innovation angle                    |
| `packages/core/src/innovation/`        | Pipeline orchestration (investigate → generate → synthesize)  |
| `packages/core/src/copilot/`           | Copilot SDK client wrapper                                    |
| `packages/core/src/providers/`         | LLM provider abstraction (Copilot, OpenAI, Anthropic, Ollama) |
| `packages/core/src/artifacts/`         | Structured artifact generation (PRD, tech spec, user story)   |
| `packages/core/src/collaboration/`     | Collaborative sessions with voting and commenting             |
| `packages/core/src/research/`          | Deep research agent for extended investigations               |
| `packages/core/src/debate/`            | Structured multi-perspective debate engine                    |
| `packages/core/src/evolution/`         | Genetic-algorithm idea evolution                              |
| `packages/core/src/rag/`               | RAG knowledge grounding module                                |
| `packages/core/src/analytics/`         | Innovation analytics and insights                             |
| `packages/core/src/pipeline-builder/`  | Natural language pipeline builder                             |
| `packages/core/src/knowledge-graph/`   | Persistent concept knowledge graph                            |
| `packages/core/src/events/`            | Event bus and webhook delivery system                         |
| `packages/core/src/cost/`              | LLM cost tracking and budget management                       |
| `packages/core/src/storage/`           | Pluggable storage abstraction (memory, SQLite backends)       |
| `packages/core/src/validation/`        | Input validation and sanitization utilities                   |
| `packages/core/src/models/`            | Model allowlist and configuration                             |
| `packages/core/src/chaining/`          | Multi-step prompt chaining                                    |
| `packages/core/src/embeddings/`        | Vector embedding generation and similarity                    |
| `packages/core/src/orchestration/`     | High-level workflow orchestration                             |
| `packages/core/src/rbac/`              | Role-based access control                                     |
| `packages/core/src/plugins/`           | Plugin system for extensibility                               |
| `packages/core/src/presets/`           | Pipeline presets and templates                                |
| `packages/core/src/gauntlet/`          | Adversarial idea stress-testing (Survivability Index)         |
| `packages/core/src/provenance-ledger/` | Tamper-evident hash-chained audit trail                       |
| `packages/core/src/temporal-memory/`   | Temporal knowledge graph for innovation memory                |
| `packages/core/src/sentinel/`          | Always-on signal monitoring and opportunity generation        |
| `packages/core/src/genome-sequencer/`  | Idea decomposition, similarity search, and recombination      |
| `packages/core/src/federation-dp/`     | Differential privacy for federated pattern sharing            |
| `packages/mcp-server/src/`             | MCP server exposing tools via stdio/SSE transports            |
| `packages/bot/`                        | Chat platform bot (Slack, Discord, Teams)                     |
| `packages/vscode-extension/`           | VS Code extension for in-editor innovation                    |
| `packages/copilot-extension/`          | GitHub Copilot Extension (@innovator in Copilot Chat)         |
| `packages/create-innovator/`           | Project scaffolder (`npx create-innovator`)                   |
| `apps/web/src/components/`             | React UI components                                           |
| `apps/web/src/app/api/`                | Next.js API route handlers                                    |
| `apps/cli/src/`                        | Commander.js CLI entry point                                  |

## Moonshot Modules

Six advanced modules extend the core innovation pipeline with intelligence, memory, and quality assurance capabilities:

```mermaid
graph TB
    subgraph "Quality & Trust"
        G["⚔️ Gauntlet<br/><i>Adversarial stress-testing</i>"]
        PL["📋 Provenance Ledger<br/><i>Tamper-evident audit trail</i>"]
    end

    subgraph "Memory & Intelligence"
        TM["🧠 Temporal Memory<br/><i>Concept evolution graph</i>"]
        GS["🧬 Genome Sequencer<br/><i>Idea decomposition</i>"]
    end

    subgraph "Network & Automation"
        S["🛰️ Sentinel<br/><i>Signal monitoring agent</i>"]
        FDP["🔒 Federation DP<br/><i>Privacy-preserving sharing</i>"]
    end

    Pipeline["Innovation Pipeline"] --> G
    Pipeline --> PL
    Pipeline --> TM
    TM --> GS
    G --> S
    FDP --> TM

    style Pipeline fill:#4f46e5,color:#fff,stroke:#4338ca
    style G fill:#ef4444,color:#fff
    style PL fill:#f59e0b,color:#000
    style TM fill:#8b5cf6,color:#fff
    style GS fill:#06b6d4,color:#fff
    style S fill:#22c55e,color:#fff
    style FDP fill:#ec4899,color:#fff
```

| Module                | Purpose                                                                     | Key Functions                                                   | ADR                                                              |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Gauntlet**          | 5 adversary personas attack ideas, producing a 0–100 Survivability Index    | `runGauntlet()`, `computeSurvivabilityIndex()`                  | [ADR-0016](docs/adr/ADR-0016-llm-as-judge-evaluation.md)         |
| **Provenance Ledger** | SHA-256 hash-chained append-only log of AI actions and human decisions      | `appendEntry()`, `verifyLedger()`, `exportForActor()`           | [ADR-0017](docs/adr/ADR-0017-append-only-hash-chained-ledger.md) |
| **Temporal Memory**   | Persistent graph tracking concept evolution, recurrence, and causality      | `ingestSession()`, `queryTemporalMemory()`, `computeVelocity()` | [ADR-0019](docs/adr/ADR-0019-temporal-knowledge-graph.md)        |
| **Sentinel**          | Monitors RSS/Atom feeds, filters by relevance, generates daily briefs       | `runSentinel()`, `briefToMarkdown()`                            | —                                                                |
| **Genome Sequencer**  | Decomposes ideas into 7 traits, enables similarity search and recombination | `sequenceIdea()`, `findSimilar()`, `recombine()`                | —                                                                |
| **Federation DP**     | Laplace-mechanism ε-differential privacy for cross-org pattern sharing      | `extractAnonymizedPatterns()`, `generateRecommendations()`      | [ADR-0018](docs/adr/ADR-0018-differential-privacy-federation.md) |

## Concurrency Model

The innovation pipeline uses semaphore-based bounded concurrency via `runWithConcurrency()` in `packages/core/src/innovation/pipeline.ts`:

- **`MAX_CONCURRENCY = 2`** — At most 2 LLM calls run in parallel during angle generation
- A promise pool tracks active tasks; `Promise.race()` waits for a free slot when the pool is full
- Individual angle failures are captured without aborting the entire pipeline
- `AbortSignal` propagation allows early cancellation from API routes

This design balances throughput against LLM provider rate limits. Investigation and synthesis stages run as single sequential calls.

## SSE Streaming Architecture

Long-running endpoints (`/api/auto`, `/api/pipeline`) use Server-Sent Events (SSE) for real-time progress:

```mermaid
sequenceDiagram
    participant C as Client (EventSource)
    participant A as API Route
    participant R as ReadableStream
    participant P as Pipeline Callbacks

    C->>A: GET /api/auto?subject=...
    A->>R: Create ReadableStream
    A-->>C: Response: text/event-stream

    loop Pipeline Execution
        P->>R: data: {"stage":"investigating"}
        R-->>C: SSE event
        P->>R: data: {"stage":"generating","currentAngle":"scamper"}
        R-->>C: SSE event
    end

    Note over A,C: 15s heartbeat comments prevent proxy timeouts

    P->>R: data: {"stage":"complete","synthesis":{...}}
    R-->>C: Final SSE event
    R->>R: Close stream
```

- API routes create a `ReadableStream` and return it as a `text/event-stream` response
- Pipeline progress callbacks emit `data: {...}\n\n` events as JSON
- A 15-second heartbeat comment prevents proxy/CDN timeout disconnections
- Events follow the stage progression: `investigating` → `generating` → `synthesizing` → `complete`
- The `currentAngle` field identifies which angle is actively generating

SSE was chosen over WebSockets (see ADR-0007) for unidirectional updates, serverless compatibility, and native browser `EventSource` support.

## Pipeline State Machine

The auto-mode pipeline progresses through these states:

```mermaid
stateDiagram-v2
    [*] --> investigating

    investigating --> generating: Investigation complete
    investigating --> error: LLM failure / abort

    generating --> synthesizing: All angles complete
    generating --> error: All angles failed / abort

    synthesizing --> complete: Synthesis complete
    synthesizing --> error: LLM failure / abort

    complete --> [*]
    error --> [*]

    note right of generating
        Up to 2 angles run in parallel.
        Individual angle failures are
        captured without aborting.
    end note
```

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
