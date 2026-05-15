# Developer Guide

Practical recipes and patterns for working with the Innovator codebase. For setup instructions see [CONTRIBUTING.md](../CONTRIBUTING.md); for architecture context see [ARCHITECTURE.md](../ARCHITECTURE.md); for the full API surface see the [API Reference](./API.md).

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Running the Pipeline Programmatically](#running-the-pipeline-programmatically)
- [Environment Variables](#environment-variables)
- [Creating Custom Angles](#creating-custom-angles)
- [Writing a Plugin](#writing-a-plugin)
- [Using Alternative LLM Providers](#using-alternative-llm-providers)
- [Adding a New API Route](#adding-a-new-api-route)
- [Adding a CLI Command](#adding-a-cli-command)
- [Adding an MCP Tool](#adding-an-mcp-tool)
- [Working with the Knowledge Graph](#working-with-the-knowledge-graph)
- [Stress-Testing Ideas with the Gauntlet](#stress-testing-ideas-with-the-gauntlet)
- [Using the Provenance Ledger](#using-the-provenance-ledger)
- [Building Innovation Memory](#building-innovation-memory)
- [Sequencing Idea Genomes](#sequencing-idea-genomes)
- [Working with Storage & Database](#working-with-storage--database)
- [Examples](#examples)
- [Testing Patterns](#testing-patterns)
- [Common Pitfalls](#common-pitfalls)

---

## Quick Reference

| Task                   | Command                                                     |
| ---------------------- | ----------------------------------------------------------- |
| Start dev server       | `npm run dev`                                               |
| Build everything       | `npm run build`                                             |
| Run all quality gates  | `npm run check`                                             |
| Run tests              | `npm test`                                                  |
| Run a single test file | `npx vitest run packages/core/src/__tests__/angles.test.ts` |
| Type check             | `npm run typecheck`                                         |
| Format code            | `npm run format`                                            |
| Lint + auto-fix        | `npm run lint:fix`                                          |
| Check prerequisites    | `npm run doctor`                                            |
| Generate API docs      | `npm run docs:api`                                          |
| Run CLI in dev mode    | `npm run cli -- investigate "my subject"`                   |
| Clean build artifacts  | `npm run clean`                                             |
| Full clean + rebuild   | `npm run clean:all && npm install && npm run build`         |

---

## Running the Pipeline Programmatically

> 📖 **API Reference:** [`investigate()`](./API.md#investigate), [`runAutoPipeline()`](./API.md#runautopipeline), [`ModelRouting`](./API.md#modelrouting)

### Minimal example

```typescript
import { investigate, runAutoPipeline } from "@innovator/core";

// Stage 1: Just investigation
const investigation = await investigate("sustainable packaging");

// Full pipeline with progress tracking
const result = await runAutoPipeline("sustainable packaging", (progress) => {
  console.log(`[${progress.stage}] ${progress.completedAngles.length}/${progress.totalAngles}`);
});

console.log(result.synthesis?.recommendation);
```

### With cancellation

```typescript
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30_000);

const result = await runAutoPipeline(
  "quantum computing",
  onProgress,
  "gpt-4.1",
  undefined,
  controller.signal
);

if (result.stage === "error" && result.error?.includes("aborted")) {
  console.log("Pipeline was cancelled");
}
```

### With model routing

```typescript
const result = await runAutoPipeline(
  "renewable energy",
  onProgress,
  undefined, // no default model
  ["scamper", "first-principles"], // only these angles
  undefined, // no abort signal
  {
    investigation: "gpt-5", // premium for investigation
    generation: "gpt-4.1-mini", // cost-effective for generation
    synthesis: "gpt-5", // premium for synthesis
  }
);
```

---

## Environment Variables

Innovator is configured via environment variables. Copy `.env.local.example` to `.env.local` in the project root:

```bash
cp .env.local.example .env.local
```

### Core Variables

| Variable                   | Description                                      | Default   |
| -------------------------- | ------------------------------------------------ | --------- |
| `INNOVATOR_DEFAULT_MODEL`  | LLM model used when none is specified at runtime | `gpt-4.1` |
| `INNOVATOR_LLM_TIMEOUT_MS` | Timeout for each LLM request in milliseconds     | `90000`   |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated additional model IDs to allow    | _unset_   |

### Authentication & Security

| Variable                  | Description                                           | Default               |
| ------------------------- | ----------------------------------------------------- | --------------------- |
| `INNOVATOR_API_KEY`       | API key protecting web routes (`X-API-Key` header)    | _unset_ (open access) |
| `INNOVATOR_API_KEYS`      | Comma-separated multi-key auth (overrides single key) | _unset_               |
| `INNOVATOR_EMBED_API_KEY` | API key for the `/api/embed` widget endpoint          | _unset_               |
| `INNOVATOR_EMBED_ORIGINS` | Comma-separated CORS origins for embed endpoint       | `*`                   |

### Alternative LLM Providers

| Variable            | Description                                             | Default                  |
| ------------------- | ------------------------------------------------------- | ------------------------ |
| `OPENAI_API_KEY`    | Direct OpenAI provider (no Copilot subscription needed) | _unset_                  |
| `ANTHROPIC_API_KEY` | Direct Anthropic provider                               | _unset_                  |
| `OLLAMA_BASE_URL`   | Local Ollama instance URL                               | `http://localhost:11434` |

### CI & Infrastructure

| Variable              | Description                                | Default                 |
| --------------------- | ------------------------------------------ | ----------------------- |
| `GH_TOKEN`            | GitHub token for Copilot auth in CI/Docker | _unset_                 |
| `PORT`                | Dev server port                            | `3000`                  |
| `MCP_PORT`            | MCP server SSE transport port              | `3100`                  |
| `PLAYWRIGHT_BASE_URL` | Base URL for E2E tests                     | `http://localhost:3000` |

> **Full reference:** See [`.env.local.example`](../.env.local.example) for all variables with inline docs, and [Configuration docs](../website/docs/configuration.md) for detailed usage examples.

---

## Creating Custom Angles

> 📖 **API Reference:** [`Custom Angles`](./API.md#custom-angles), [`addCustomAngle()`](./API.md#custom-angles)

### Inline registration

```typescript
import { addCustomAngle, generateForAngle, investigate } from "@innovator/core";

addCustomAngle({
  id: "ethics-lens",
  name: "Ethics Lens",
  description: "Evaluate through ethical frameworks",
  promptTemplate: `You are an ethics consultant.
Subject: {{subject}}
Context: {{investigation}}

Generate 3-5 innovative ideas prioritizing fairness and transparency.
Respond with JSON: {
  "angleId": "ethics-lens",
  "angleName": "Ethics Lens",
  "ideas": [{ "title": "...", "description": "...", "potentialImpact": "...", "implementationHint": "..." }],
  "reasoning": "..."
}`,
  icon: "⚖️",
});

const investigation = await investigate("facial recognition");
const result = await generateForAngle("facial recognition", investigation, "ethics-lens");
```

### As a shareable angle pack (`.angle.json`)

```json
{
  "name": "Sustainability Pack",
  "description": "Innovation angles focused on sustainability",
  "version": "1.0.0",
  "angles": [
    {
      "id": "circular-economy",
      "name": "Circular Economy",
      "description": "Reimagine through reduce, reuse, recycle principles",
      "promptTemplate": "...",
      "icon": "♻️",
      "tags": ["sustainability"]
    }
  ]
}
```

```typescript
import { importAnglePack } from "@innovator/core";
import pack from "./sustainability.angle.json";

importAnglePack(pack);
```

---

## Writing a Plugin

```typescript
import { registerPlugin } from "@innovator/core";
import type { AnglePlugin, CustomAngle } from "@innovator/core/types";

const myPlugin: AnglePlugin = {
  id: "myorg.healthcare-angles",
  name: "Healthcare Innovation Angles",
  version: "1.0.0",
  description: "Specialized angles for healthcare innovation",
  type: "angle",
  angles: [
    {
      id: "patient-journey",
      name: "Patient Journey Mapping",
      description: "Map and reimagine the end-to-end patient experience",
      promptTemplate: "...",
      icon: "🏥",
    },
  ],
};

registerPlugin(myPlugin);
```

Plugin IDs must match `^[a-z0-9.-]+$`.

---

## Using Alternative LLM Providers

> 📖 **API Reference:** [`LLMProvider` interface](./API.md#llmprovider-interface), [Provider Registry](./API.md#provider-registry), [Provider Configuration](./API.md#provider-configuration)

### Via environment variables

```bash
# Use OpenAI directly (bypasses Copilot SDK)
export OPENAI_API_KEY="sk-..."

# Use Anthropic directly
export ANTHROPIC_API_KEY="sk-ant-..."

# Use local Ollama
export OLLAMA_BASE_URL="http://localhost:11434"
```

### Programmatic provider switching

```typescript
import { initializeProviders, setActiveProvider, getActiveProvider } from "@innovator/core";

// Initialize all providers based on env vars / config
initializeProviders();

// Switch to OpenAI
setActiveProvider("openai");
console.log(getActiveProvider().name); // "OpenAI"

// Or configure via ~/.innovator/config.json
import { saveConfig } from "@innovator/core";

saveConfig({
  defaultProvider: "openai",
  providers: {
    openai: { enabled: true, apiKeyEnv: "OPENAI_API_KEY" },
  },
  modelPreferences: {
    investigation: "gpt-5",
    generation: "gpt-4.1-mini",
    synthesis: "gpt-5",
  },
});
```

---

## Adding a New API Route

API routes live in `apps/web/src/app/api/`. Follow this pattern:

```typescript
// apps/web/src/app/api/my-feature/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { myFeature } from "@innovator/core";

const RequestSchema = z.object({
  subject: z.string().min(1).max(5000),
  model: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await myFeature(parsed.data.subject, parsed.data.model);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Checklist:**

1. Define a Zod schema for request validation
2. Use `safeParse()` — never trust raw input
3. Delegate business logic to `@innovator/core`
4. Return sanitized error messages (don't leak internals)
5. Middleware handles rate limiting, auth, body size, and CSP headers automatically

---

## Adding a CLI Command

CLI commands use [Commander.js](https://github.com/tj/commander.js/) in `apps/cli/src/index.ts`:

```typescript
program
  .command("my-command <subject>")
  .description("Describe what the command does")
  .option("-m, --model <model>", "LLM model to use")
  .action(async (subject: string, opts: { model?: string }) => {
    const spinner = ora("Processing...").start();
    try {
      const result = await myFeature(subject, opts.model);
      spinner.succeed("Done!");
      console.log(chalk.green(result));
    } catch (err) {
      spinner.fail("Failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    } finally {
      await stopCopilotClient();
    }
  });
```

**Checklist:**

1. Always call `stopCopilotClient()` in a `finally` block
2. Use `ora` for spinners and `chalk` for colored output
3. Call `process.exit(1)` on errors

---

## Adding an MCP Tool

MCP tools live in `packages/mcp-server/src/index.ts`:

```typescript
server.tool(
  "my-tool",
  "Description of what the tool does for AI clients",
  {
    subject: z.string().min(1).max(500).describe("The topic"),
    model: z.string().optional().describe("Optional LLM model override"),
  },
  async ({ subject, model }) => {
    try {
      const result = await handleMyTool({ subject, model });
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);
```

Handler logic goes in `packages/mcp-server/src/handlers.ts`, schemas in `schemas.ts`.

---

## Working with the Knowledge Graph

```typescript
import {
  ingestInvestigation,
  queryRelatedSubjects,
  getKnowledgeGraph,
  getGraphStats,
} from "@innovator/core";

// Ingest investigations to build the graph
const inv1 = await investigate("electric vehicles");
ingestInvestigation("electric vehicles", inv1);

const inv2 = await investigate("battery technology");
ingestInvestigation("battery technology", inv2);

// Query relationships
const related = queryRelatedSubjects("energy storage");
console.log(
  "Related subjects:",
  related.map((n) => n.label)
);

// Inspect the full graph
const stats = getGraphStats();
console.log(`Graph: ${stats.nodes} nodes, ${stats.edges} edges`);
```

---

## Stress-Testing Ideas with the Gauntlet

> 📖 **API Reference:** [`runGauntlet()`](./API.md#rungauntlet), [`computeSurvivabilityIndex()`](./API.md#computesurvivabilityindex)

The Adversarial Gauntlet runs 5 specialized adversary agents against an idea and produces a Survivability Index (0–100).

```typescript
import { runGauntlet, gauntletToMarkdown } from "@innovator/core";

// Basic gauntlet run
const result = await runGauntlet({
  title: "AI-powered code review",
  description: "Automated code review using LLMs that understands context and team conventions",
  potentialImpact: "50% faster review cycles",
  implementationHint: "Start with PR diff analysis",
});

console.log(`Survivability: ${result.survivabilityIndex}/100`);
console.log(`Attacks: ${result.attacks.length}`);

// With strengthening — generates a revised idea addressing top attacks
const strengthened = await runGauntlet(
  {
    title: "AI code review",
    description: "...",
    potentialImpact: "...",
    implementationHint: "...",
  },
  { strengthen: true, adversaries: ["skeptic", "engineer", "economist"] }
);

if (strengthened.strengthenedIdea) {
  console.log(`Revised: ${strengthened.strengthenedIdea.title}`);
  console.log(`New score: ${strengthened.strengthenedIdea.revisedSurvivabilityIndex}/100`);
}

// Export as Markdown report
console.log(gauntletToMarkdown(result));
```

---

## Using the Provenance Ledger

> 📖 **API Reference:** [`appendEntry()`](./API.md#appendentry), [`verifyLedger()`](./API.md#verifyledger), [GDPR Functions](./API.md#gdpr-functions)

The provenance ledger records every AI action and human decision in a tamper-evident hash chain.

```typescript
import {
  recordInvestigation,
  recordGeneration,
  recordHumanDecision,
  verifyLedger,
  getSessionEntries,
  exportForActor,
  ledgerToMarkdown,
} from "@innovator/core";

// Record AI actions (typically called by pipeline internals)
recordInvestigation("session-123", "sustainable energy", "gpt-5", "abc123");
recordGeneration("session-123", "sustainable energy", "scamper", "gpt-5", "def456", 4);

// Record human decisions
recordHumanDecision(
  "session-123",
  "alice@company.com",
  "approval",
  "Solar panel idea",
  "Strong market fit"
);

// Verify chain integrity
const check = verifyLedger();
console.log(`Valid: ${check.valid}, Entries: ${check.totalEntries}`);

// View session audit trail
const entries = getSessionEntries("session-123");
console.log(ledgerToMarkdown(entries));

// GDPR export (Art. 15)
const exported = exportForActor("alice@company.com");
```

---

## Building Innovation Memory

> 📖 **API Reference:** [`ingestSession()`](./API.md#ingestsession), [`queryTemporalMemory()`](./API.md#querytemporalmemory), [`computeVelocity()`](./API.md#computevelocity)

The temporal memory module tracks concept evolution across sessions.

```typescript
import {
  ingestSession,
  queryTemporalMemory,
  detectRecurrences,
  computeVelocity,
  loadTemporalGraph,
} from "@innovator/core";

// Ingest a completed session
const result = ingestSession({
  sessionId: "session-456",
  subject: "AI in healthcare",
  investigation: {
    summary: "Healthcare AI is transforming diagnostics...",
    keyAspects: [{ title: "Diagnostic AI", description: "ML-based image analysis" }],
    challenges: ["Regulatory approval", "Data privacy"],
    opportunities: ["Early detection", "Cost reduction"],
  },
  ideas: [
    {
      title: "AI triage system",
      description: "Automated patient triage",
      angleId: "first-principles",
    },
  ],
  themes: ["patient safety", "efficiency"],
  timestamp: new Date().toISOString(),
});

console.log(`Created ${result.nodesCreated} nodes, ${result.edgesCreated} edges`);
console.log(`Recurrences: ${result.recurrences.map((r) => r.concept).join(", ")}`);

// Natural language query
const answer = await queryTemporalMemory({
  question: "How has our thinking about AI in healthcare evolved?",
  timeRange: { from: "2025-01-01", to: "2026-05-01" },
});
console.log(answer.narrative);

// Innovation velocity
const graph = loadTemporalGraph();
const velocity = computeVelocity(graph, 3);
console.log(`${velocity.ideasPerMonth} ideas/month, ${velocity.activeConcepts} active concepts`);
```

---

## Sequencing Idea Genomes

> 📖 **API Reference:** [`sequenceIdea()`](./API.md#sequenceidea), [`findSimilar()`](./API.md#findsimilar), [`recombine()`](./API.md#recombine)

The genome sequencer decomposes ideas into structural traits for similarity search and recombination.

```typescript
import { sequenceIdea, findSimilar, recombine, genomeToMarkdown } from "@innovator/core";

// Sequence an idea
const genome = await sequenceIdea({
  title: "AI-driven supply chain optimization",
  description: "ML models predict demand and optimize routing in real-time",
  potentialImpact: "30% logistics cost reduction",
  implementationHint: "Start with demand forecasting module",
});

console.log(genomeToMarkdown(genome));
// Output: 7 traits (problem-space, solution-mechanism, value-proposition, ...)

// Find similar ideas in the library
const similar = findSimilar(genome, 5);
for (const match of similar) {
  console.log(`${match.ideaTitle}: ${Math.round(match.overallSimilarity * 100)}% similar`);
}

// Recombine two genomes into a novel idea
if (similar.length > 0) {
  const otherGenome = getGenome(similar[0].genomeB);
  if (otherGenome) {
    const recombinant = await recombine(genome, otherGenome);
    console.log(`New idea: ${recombinant.title} (novelty: ${recombinant.noveltyScore})`);
  }
}
```

---

## Working with Storage & Database

> 📖 **Architecture Reference:** [Database & Persistence](../ARCHITECTURE.md#database--persistence-postgresql--sqlite--in-memory)

Innovator uses a pluggable `StorageProvider` abstraction (`packages/core/src/storage/types.ts`) so business logic never depends on a specific database. Three backends ship out of the box:

| Backend    | Module                     | Use Case                          |
| ---------- | -------------------------- | --------------------------------- |
| In-memory  | `storage/memory.ts`        | Tests and ephemeral CLI runs      |
| SQLite     | `storage/sqlite.ts`        | Single-user / local persistence   |
| PostgreSQL | `storage/drivers/index.ts` | Production multi-user deployments |

### The StorageProvider Interface

Every backend implements the `StorageProvider` interface which groups domain-specific sub-interfaces:

```typescript
import type { StorageProvider } from "@innovator/core";

// StorageProvider shape:
interface StorageProvider {
  readonly name: string;
  sessions: SessionStorage;
  workspaces: WorkspaceStorage;
  apiGateway: ApiGatewayStorage;
  collaboration: CollaborationStorage;
  analytics: AnalyticsStorage;
  knowledgeGraph: KnowledgeGraphStorage;
  initialize(): Promise<void>; // runs migrations
  close(): Promise<void>; // cleans up connections
}
```

Call `initialize()` once at startup — it runs any pending migrations automatically.

### Choosing a Backend at Runtime

The active backend is selected by the `DATABASE_URL` environment variable:

```bash
# SQLite (default for CLI)
DATABASE_URL=sqlite:~/.innovator/data.db

# PostgreSQL
DATABASE_URL=postgresql://innovator:changeme@localhost:5432/innovator

# In-memory (tests / CI)
# Omit DATABASE_URL entirely — the in-memory provider is used automatically
```

### PostgreSQL Setup

```bash
# Start PostgreSQL via Docker Compose
docker compose up -d postgres

# Verify
docker compose exec postgres pg_isready -U innovator

# Connect directly
docker compose exec postgres psql -U innovator -d innovator
```

Migrations are split into two sets:

- **`CORE_MIGRATIONS`** (`storage/drivers/index.ts`) — tables for sessions, workspaces, analytics, API gateway, collaboration, decisions, tournaments, and schedules.
- **`PROJECT_MIGRATIONS`** (`workspace-persistence/index.ts`) — tables for multi-session innovation projects (`innovation_projects`, `project_sessions`, `project_snapshots`, `team_contexts`).

Both sets are applied automatically on `initialize()`. See the [Schema Overview](../ARCHITECTURE.md#schema-overview) in ARCHITECTURE.md for the full table listing.

### Writing Storage-Dependent Code

When adding a new domain that needs persistence:

1. **Define a sub-interface** in `storage/types.ts` (e.g., `MyFeatureStorage`).
2. **Add the field** to the `StorageProvider` interface.
3. **Implement it** in each backend (`memory.ts`, `sqlite.ts`, `drivers/index.ts`).
4. **Add a migration** to `CORE_MIGRATIONS` (or `PROJECT_MIGRATIONS` if project-scoped).

```typescript
// Example: adding storage for a new "feedback" module
export interface FeedbackStorage {
  saveFeedback(feedback: Feedback): Promise<void>;
  getFeedback(id: string): Promise<Feedback | undefined>;
  listFeedback(): Promise<Feedback[]>;
}
```

### Testing with Storage

Always use the in-memory provider or a temp directory for tests — never write to `~/.innovator/`:

```typescript
import { createMemoryStorage } from "@innovator/core";

const storage = createMemoryStorage();
await storage.initialize();
// ... run assertions against storage ...
await storage.close();
```

---

## Examples

The [`examples/`](../examples/) directory contains 5 standalone scripts demonstrating common `@innovator/core` usage patterns:

| Script                   | What It Shows                                              |
| ------------------------ | ---------------------------------------------------------- |
| `basic-usage.ts`         | Investigation → generation → synthesis pipeline            |
| `custom-angles.ts`       | Registering and using custom innovation angles             |
| `with-budget.ts`         | Cost tracking and budget management                        |
| `debate-and-redteam.ts`  | Structured debate engine and adversarial red team analysis |
| `portfolio-lifecycle.ts` | Full idea lifecycle from ideation to shipped               |

```bash
# Run any example with tsx
npx tsx examples/basic-usage.ts
npx tsx examples/basic-usage.ts "quantum computing"
```

See the full [Examples README](../examples/README.md) for prerequisites and detailed descriptions.

---

## Testing Patterns

### Unit test structure

```typescript
import { describe, it, expect, vi } from "vitest";
import { getAngleById, ANGLES } from "../innovation/angles.js";

describe("getAngleById", () => {
  it("returns the correct angle for a valid ID", () => {
    const angle = getAngleById("scamper");
    expect(angle).toBeDefined();
    expect(angle?.name).toBe("SCAMPER");
  });

  it("returns undefined for an unknown ID", () => {
    expect(getAngleById("nonexistent")).toBeUndefined();
  });
});
```

### Mocking LLM calls

```typescript
import { vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue(
    JSON.stringify({
      summary: "Test",
      keyAspects: [],
      currentState: "",
      challenges: [],
      opportunities: [],
    })
  ),
  extractJson: vi.fn((raw: string) => raw),
}));
```

### Running tests

```bash
npm test                                          # All tests
npx vitest run packages/core/src/__tests__/       # Core tests only
npx vitest -t "extractJson"                       # By name pattern
npx vitest --watch                                # Watch mode
```

---

## Common Pitfalls

| Pitfall                                                 | Solution                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Importing `@innovator/core` in a React client component | Use `@innovator/core/types` for client-safe exports (no Node.js deps)              |
| `gh auth` errors in CI                                  | Set the `GH_TOKEN` environment variable                                            |
| Stale `dist/` after code changes                        | Run `npm run build --workspace=packages/core` or `npm run dev:core` for watch mode |
| TypeScript errors after pulling changes                 | Run `npm run clean && npm run build` to rebuild declaration files                  |
| LLM timeouts on complex subjects                        | Increase `INNOVATOR_LLM_TIMEOUT_MS` (default: 90000)                               |
| Test failures due to LLM non-determinism                | Mock `generateText` in unit tests; use integration tests for E2E LLM validation    |
| Unused variable lint errors                             | Prefix with underscore: `_unused`, `_event` (configured in `eslint.config.mjs`)    |
| Plugin ID validation failures                           | IDs must match `^[a-z0-9-]+$` (lowercase, hyphens, no spaces)                      |
