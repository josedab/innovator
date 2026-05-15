# @innovator/core

Shared innovation engine for the Innovator project. Provides types, prompt templates, Copilot SDK client management, and the full investigation → generation → synthesis pipeline.

All business logic lives here — consumers (`apps/web`, `apps/cli`, `packages/mcp-server`, `packages/bot`) are thin adapters.

## Installation

This is a private workspace package. It is consumed via npm workspaces:

```jsonc
// In your app's package.json
{ "dependencies": { "@innovator/core": "*" } }
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Consumers                       │
│  apps/web  ·  apps/cli  ·  mcp-server  ·  bot  │
└─────────────────┬───────────────────────────────┘
                  │ imports @innovator/core
┌─────────────────▼───────────────────────────────┐
│              @innovator/core                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Pipeline │  │  Angles  │  │ Copilot Client│  │
│  │ Engine   │──│ Registry │──│ (LLM Gateway) │  │
│  └────┬─────┘  └──────────┘  └───────────────┘  │
│       │                                          │
│  ┌────▼──────────────────────────────────────┐   │
│  │         Module Ecosystem                   │   │
│  │  gauntlet · genome-sequencer · sentinel   │   │
│  │  provenance-ledger · temporal-memory      │   │
│  │  federation-dp · evolution · scoring ...   │   │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Module Map

Every module follows the same file structure convention:

```
packages/core/src/<module>/
├── index.ts          # Barrel exports
├── types.ts          # Zod schemas and TypeScript types
├── <module>.ts       # Main implementation
└── __tests__/        # Module-specific tests
```

### Core Modules

| Module                  | Directory     | Description                                                             |
| ----------------------- | ------------- | ----------------------------------------------------------------------- |
| **Innovation Pipeline** | `innovation/` | Investigation, angle generation, synthesis, auto pipeline               |
| **Copilot Client**      | `copilot/`    | LLM gateway — `generateText()`, `generateTextStream()`, `extractJson()` |
| **Prompts**             | `prompts/`    | Prompt builders and sanitization (`wrapUserInput`, `sanitizeLlmOutput`) |
| **Angles**              | `innovation/` | 8 built-in angles + custom angle CRUD                                   |
| **Providers**           | `providers/`  | Alternative LLM providers (OpenAI, Anthropic, Ollama)                   |
| **Models**              | `models/`     | Model registry and validation                                           |

### Moonshot Modules

| Module                   | Directory            | Description                                                           |
| ------------------------ | -------------------- | --------------------------------------------------------------------- |
| **Adversarial Gauntlet** | `gauntlet/`          | Multi-agent stress-testing with 5 adversary personas                  |
| **Provenance Ledger**    | `provenance-ledger/` | Tamper-evident append-only audit trail with SHA-256 hash chaining     |
| **Temporal Memory**      | `temporal-memory/`   | Persistent knowledge graph tracking concept evolution across sessions |
| **Sentinel**             | `sentinel/`          | Signal monitoring agent with RSS/Atom feeds and daily briefs          |
| **Genome Sequencer**     | `genome-sequencer/`  | Decomposes ideas into 7 genome traits with similarity search          |
| **Federation DP**        | `federation-dp/`     | Differential privacy for cross-organization pattern sharing           |
| **Evolution**            | `evolution/`         | Genetic algorithm evolution of ideas                                  |
| **Debate**               | `debate/`            | Structured multi-perspective debate engine                            |

### Analysis & Intelligence

| Module               | Directory           | Description                          |
| -------------------- | ------------------- | ------------------------------------ |
| **Scoring**          | `scoring/`          | Idea scoring and ranking             |
| **Benchmark**        | `benchmark/`        | Multi-model performance comparison   |
| **Hypothesis**       | `hypothesis/`       | Hypothesis-driven innovation framing |
| **Red Team**         | `redteam/`          | Adversarial perspective analysis     |
| **Competitive**      | `competitive/`      | Competitive landscape analysis       |
| **Impact Simulator** | `impact-simulator/` | Potential impact simulation          |
| **Quality Gate**     | `quality-gate/`     | Automated LLM output quality checks  |

### Data & Knowledge

| Module              | Directory          | Description                                    |
| ------------------- | ------------------ | ---------------------------------------------- |
| **Knowledge Graph** | `knowledge-graph/` | Persistent graph of concepts and relationships |
| **RAG**             | `rag/`             | Retrieval-augmented generation                 |
| **Memory**          | `memory/`          | Cross-session persistent memory                |
| **Serendipity**     | `serendipity/`     | Cross-session unexpected connection discovery  |
| **Diff**            | `diff/`            | Investigation snapshot comparison              |

### Output & Export

| Module        | Directory    | Description                             |
| ------------- | ------------ | --------------------------------------- |
| **Artifacts** | `artifacts/` | PRD, tech spec, user story generation   |
| **Export**    | `export/`    | Markdown, JSON, GitHub Issue export     |
| **Playbook**  | `playbook/`  | Reusable innovation playbook creation   |
| **Audience**  | `audience/`  | Audience-adaptive output transformation |
| **i18n**      | `i18n/`      | Multi-language support                  |

### Platform & Infrastructure

| Module          | Directory      | Description                             |
| --------------- | -------------- | --------------------------------------- |
| **Plugins**     | `plugins/`     | Plugin registration and lifecycle       |
| **Presets**     | `presets/`     | Pipeline presets by category            |
| **History**     | `history/`     | Session history persistence             |
| **Events**      | `events/`      | Event bus and webhook delivery          |
| **Cost**        | `cost/`        | LLM cost tracking and budget management |
| **Metering**    | `metering/`    | API usage metering                      |
| **Observatory** | `observatory/` | Prompt call monitoring and debugging    |

## Public API

### Innovation Pipeline

```typescript
import { investigate, generateForAngle, runAutoPipeline } from "@innovator/core";

// 1. Investigate a subject
const investigation = await investigate("remote work tools");

// 2. Generate innovations for a specific angle
const result = await generateForAngle("remote work tools", investigation, "scamper");

// 3. Or run the full pipeline automatically
const final = await runAutoPipeline("remote work tools", (progress) => {
  console.log(progress.stage, progress.completedAngles.length);
});
```

### Angles

```typescript
import { ANGLES, getAngleById } from "@innovator/core";

// List all 8 angles
for (const angle of ANGLES) {
  console.log(`${angle.icon} ${angle.name}: ${angle.shortDescription}`);
}

// Look up by ID
const angle = getAngleById("scamper");
```

### Copilot Client

```typescript
import {
  getCopilotClient,
  stopCopilotClient,
  generateText,
  generateTextStream,
  extractJson,
} from "@innovator/core";

// Generate a complete response
const text = await generateText({ prompt: "Hello", model: "gpt-4.1" });

// Stream response chunks
await generateTextStream({ prompt: "Hello" }, (chunk) => process.stdout.write(chunk));

// Extract JSON from LLM response
const json = extractJson(text);

// Clean up
await stopCopilotClient();
```

### Retry Utility

```typescript
import { withRetry } from "@innovator/core";

const data = await withRetry(() => fetchUnreliableService(), {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
});
```

### Prompt Sanitization

```typescript
import { sanitizeUserInput, wrapUserInput, sanitizeLlmOutput } from "@innovator/core";

const safe = sanitizeUserInput(userText);
const wrapped = wrapUserInput("Subject", userText);
const safeLlm = sanitizeLlmOutput(llmResponse);
```

## Exported Types

| Type                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `Investigation`      | Structured investigation result                   |
| `AngleResult`        | Generated ideas for a single angle                |
| `InnovationIdea`     | A single innovation idea                          |
| `Synthesis`          | Cross-angle synthesis with top ideas and themes   |
| `PipelineProgress`   | Auto pipeline progress state                      |
| `PipelineStage`      | Pipeline stage union type                         |
| `AngleId`            | Union of 8 angle identifiers                      |
| `AngleDefinition`    | Angle metadata (id, name, description, icon)      |
| `GenerateOptions`    | Options for `generateText` / `generateTextStream` |
| `RetryOptions`       | Configuration for `withRetry`                     |
| `InvestigateRequest` | Request shape for the investigate API             |
| `InnovateRequest`    | Request shape for the innovate API                |
| `AutoRequest`        | Request shape for the auto API                    |

## Client-Safe Subpath

For React client components that only need types and angle definitions (no Node.js dependencies):

```typescript
import { ANGLES, getAngleById } from "@innovator/core/types";
import type { AngleId, Investigation } from "@innovator/core/types";
```

## Further Reading

- [API Reference](../../docs/API.md) — Full function signatures and parameter tables
- [Developer Guide](../../docs/DEVELOPER_GUIDE.md) — Recipes and tutorials
- [Architecture Decision Records](../../docs/adr/) — Design rationale

## Building

```bash
npm run build -w packages/core
```
