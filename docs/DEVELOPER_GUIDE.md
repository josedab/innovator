# Developer Guide

Practical recipes and patterns for working with the Innovator codebase. For setup instructions see [CONTRIBUTING.md](../CONTRIBUTING.md); for architecture context see [ARCHITECTURE.md](../ARCHITECTURE.md).

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Running the Pipeline Programmatically](#running-the-pipeline-programmatically)
- [Creating Custom Angles](#creating-custom-angles)
- [Writing a Plugin](#writing-a-plugin)
- [Using Alternative LLM Providers](#using-alternative-llm-providers)
- [Adding a New API Route](#adding-a-new-api-route)
- [Adding a CLI Command](#adding-a-cli-command)
- [Adding an MCP Tool](#adding-an-mcp-tool)
- [Working with the Knowledge Graph](#working-with-the-knowledge-graph)
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

## Creating Custom Angles

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
  generateText: vi
    .fn()
    .mockResolvedValue(
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
