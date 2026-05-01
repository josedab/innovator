# @innovator/core

Shared innovation engine for the Innovator project. Provides types, prompt templates, Copilot SDK client management, and the full investigation → generation → synthesis pipeline.

## Installation

This is a private workspace package. It is consumed via npm workspaces:

```jsonc
// In your app's package.json
{ "dependencies": { "@innovator/core": "*" } }
```

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

## Building

```bash
npm run build -w packages/core
```
