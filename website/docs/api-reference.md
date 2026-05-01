---
id: api-reference
title: API Reference
sidebar_position: 5
---

# API Reference

Complete reference for the `@innovator/core` package and web API routes.

## Client vs Server Imports

The `@innovator/core` package exposes two subpath exports. Using the wrong one can break client-side components because the main entry pulls in Node.js-only dependencies (the Copilot SDK).

| Import path             | Resolves to      | Use when                                                        |
| ----------------------- | ---------------- | --------------------------------------------------------------- |
| `@innovator/core`       | `dist/index.js`  | Server components, API routes, CLI — full API with Node.js deps |
| `@innovator/core/types` | `dist/client.js` | Client components (`"use client"`) — types and constants only   |

### `exports` field in `packages/core/package.json`

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  },
  "./types": {
    "import": "./dist/client.js",
    "types": "./dist/client.d.ts"
  }
}
```

### Examples

```typescript
// ✅ Server component or API route — full access
import { investigate, generateForAngle } from "@innovator/core";

// ✅ Client component — types and constants only (no Node.js deps)
import { ANGLES, ANGLE_IDS, type AngleId } from "@innovator/core/types";

// ❌ DON'T do this in client components — will fail at build time
import { investigate } from "@innovator/core";
```

---

## Core Package (`@innovator/core`)

### `investigate(subject, model?)`

Analyze a subject and return structured findings.

```typescript
import { investigate } from "@innovator/core";

const result = await investigate("remote work tools");
```

**Parameters:**

| Param     | Type     | Required | Description                       |
| --------- | -------- | -------- | --------------------------------- |
| `subject` | `string` | Yes      | The topic to investigate          |
| `model`   | `string` | No       | LLM model ID (default: `gpt-4.1`) |

**Returns:** `Promise<Investigation>`

```typescript
interface Investigation {
  summary: string;
  keyAspects: { title: string; description: string }[];
  currentState: string;
  challenges: string[];
  opportunities: string[];
}
```

---

### `generateForAngle(subject, investigation, angleId, model?)`

Generate innovations for a single angle.

```typescript
import { generateForAngle } from "@innovator/core";

const result = await generateForAngle("remote work tools", investigation, "scamper");
```

**Parameters:**

| Param           | Type            | Required | Description                 |
| --------------- | --------------- | -------- | --------------------------- |
| `subject`       | `string`        | Yes      | The original subject        |
| `investigation` | `Investigation` | Yes      | Result from `investigate()` |
| `angleId`       | `AngleId`       | Yes      | One of the 8 angle IDs      |
| `model`         | `string`        | No       | LLM model ID                |

**Returns:** `Promise<AngleResult>`

```typescript
interface AngleResult {
  angleId: string;
  angleName: string;
  ideas: InnovationIdea[];
  reasoning: string;
}

interface InnovationIdea {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}
```

---

### `runAutoPipeline(subject, onProgress, model?, angles?)`

Run the full automatic pipeline with progress callbacks.

```typescript
import { runAutoPipeline } from "@innovator/core";

const result = await runAutoPipeline("remote work tools", (progress) =>
  console.log(progress.stage, progress.completedAngles.length)
);
```

**Parameters:**

| Param        | Type                                   | Required | Description                       |
| ------------ | -------------------------------------- | -------- | --------------------------------- |
| `subject`    | `string`                               | Yes      | The topic to innovate on          |
| `onProgress` | `(progress: PipelineProgress) => void` | Yes      | Called on each stage transition   |
| `model`      | `string`                               | No       | LLM model ID                      |
| `angles`     | `AngleId[]`                            | No       | Subset of angles (default: all 8) |

**Returns:** `Promise<PipelineProgress>`

```typescript
interface PipelineProgress {
  stage: "investigating" | "generating" | "synthesizing" | "complete" | "error";
  currentAngle?: string;
  completedAngles: string[];
  totalAngles: number;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
  error?: string;
}
```

---

### `Synthesis` type

```typescript
interface Synthesis {
  topIdeas: {
    title: string;
    description: string;
    sourceAngle: string;
    potentialImpact: string;
    feasibility: "low" | "medium" | "high";
  }[];
  themes: string[];
  recommendation: string;
}
```

---

### `AngleId` type

```typescript
type AngleId =
  | "scamper"
  | "first-principles"
  | "cross-domain"
  | "constraints"
  | "inversion"
  | "perspectives"
  | "what-if"
  | "trend-collision";
```

---

### `ANGLE_IDS` constant

Readonly tuple of all valid angle identifier strings. Used to iterate over angles or validate user input.

```typescript
import { ANGLE_IDS } from "@innovator/core";

ANGLE_IDS.forEach((id) => console.log(id));
// "scamper", "first-principles", "cross-domain", ...
```

**Type:** `readonly ["scamper", "first-principles", "cross-domain", "constraints", "inversion", "perspectives", "what-if", "trend-collision"]`

---

### `ANGLES` constant

Array of all angle definitions with metadata:

```typescript
import { ANGLES } from "@innovator/core";

ANGLES.forEach((angle) => {
  console.log(`${angle.icon} ${angle.name}: ${angle.shortDescription}`);
});
```

Each entry has: `id`, `name`, `shortDescription`, `icon`.

---

### `withRetry(fn, options?)`

Retry an async function with exponential backoff on transient failures.

```typescript
import { withRetry } from "@innovator/core";

const result = await withRetry(() => fetchData(), {
  maxAttempts: 3,
  initialDelayMs: 1000,
});
```

**Parameters:**

| Param     | Type               | Required | Description                     |
| --------- | ------------------ | -------- | ------------------------------- |
| `fn`      | `() => Promise<T>` | Yes      | The async function to retry     |
| `options` | `RetryOptions`     | No       | Retry configuration (see below) |

**Returns:** `Promise<T>`

```typescript
interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in ms before first retry. Default: 1000 */
  initialDelayMs?: number;
  /** Multiplier applied to delay after each retry. Default: 2 */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Predicate to decide if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** AbortSignal to cancel retries early */
  signal?: AbortSignal;
}
```

---

### Prompt Sanitization Utilities

```typescript
import { sanitizeUserInput, wrapUserInput, sanitizeLlmOutput } from "@innovator/core";
```

| Function                      | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `sanitizeUserInput(input)`    | Strip prompt-injection patterns from user text before LLM prompts   |
| `wrapUserInput(label, value)` | Sanitize and wrap user text in delimiters for safe prompt inclusion |
| `sanitizeLlmOutput(output)`   | Sanitize LLM output before re-inclusion in subsequent prompts       |

---

### `getAngleById(id)`

Look up an angle definition by its ID.

```typescript
import { getAngleById } from "@innovator/core";

const angle = getAngleById("scamper");
console.log(angle?.name); // "SCAMPER"
```

**Parameters:**

| Param | Type     | Required | Description                             |
| ----- | -------- | -------- | --------------------------------------- |
| `id`  | `string` | Yes      | The angle identifier (e.g. `"scamper"`) |

**Returns:** `AngleDefinition | undefined`

---

### Copilot Client Utilities

```typescript
import {
  generateText,
  generateTextStream,
  extractJson,
  getCopilotClient,
  stopCopilotClient,
} from "@innovator/core";
```

| Function                               | Description                                     |
| -------------------------------------- | ----------------------------------------------- |
| `generateText(options)`                | Send a prompt, wait for complete response       |
| `generateTextStream(options, onChunk)` | Stream response chunks                          |
| `extractJson(raw)`                     | Extract JSON from LLM response (brace-balanced) |
| `getCopilotClient()`                   | Get or create the singleton CopilotClient       |
| `stopCopilotClient()`                  | Shut down the CopilotClient gracefully          |

```typescript
interface GenerateOptions {
  prompt: string;
  model?: string;
  /** Use restricted permissions (for server/API routes) */
  serverMode?: boolean;
  /** Timeout in milliseconds for the LLM call (default: 90000) */
  timeoutMs?: number;
  /** AbortSignal to cancel the request early */
  signal?: AbortSignal;
}
```

---

### Request / Response Types

```typescript
interface InvestigateRequest {
  subject: string;
  model?: string;
}

interface InnovateRequest {
  subject: string;
  investigation: Investigation;
  angles: AngleId[];
  model?: string;
  synthesize?: boolean;
}

interface AutoRequest {
  subject: string;
  model?: string;
}
```

### Constants

| Constant          | Value | Description                                                              |
| ----------------- | ----- | ------------------------------------------------------------------------ |
| `MAX_CONCURRENCY` | `2`   | Maximum parallel LLM requests when generating ideas for multiple angles. |

`MAX_CONCURRENCY` is exported from `@innovator/core/types` and used by the innovate route to limit how many angles are processed simultaneously.

---

## Web API Routes

### `POST /api/investigate`

```json
// Request
{ "subject": "remote work tools", "model": "gpt-4.1" }

// Response (200)
{
  "summary": "...",
  "keyAspects": [{ "title": "...", "description": "..." }],
  "currentState": "...",
  "challenges": ["..."],
  "opportunities": ["..."]
}

// Error (400)
{ "error": "Invalid request. Please check your input and try again." }
```

### `POST /api/innovate`

```json
// Request
{
  "subject": "remote work tools",
  "investigation": { ... },
  "angles": ["scamper", "first-principles"],
  "synthesize": true
}

// Response (200)
{
  "angleResults": [{ "angleId": "scamper", "angleName": "SCAMPER", "ideas": [...], "reasoning": "..." }],
  "synthesis": { "topIdeas": [...], "themes": [...], "recommendation": "..." }
}
```

### `POST /api/auto`

Returns a **Server-Sent Events** stream. Each event is a JSON `PipelineProgress` object:

```
data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}

data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,...}

data: {"stage":"complete","completedAngles":[...],"synthesis":{...}}
```

### `GET /api/health`

Returns the service status and version.

```json
// Response (200)
{ "status": "ok", "version": "0.1.0" }
```

The `version` value comes from `npm_package_version` (defaults to `"0.1.0"`).

---

## Rate Limiting

All API routes are protected by middleware-level rate limiting (see `apps/web/src/middleware.ts`). Limits are enforced per client IP using an in-memory store.

### Limits

| Constraint            | Value      | Scope        |
| --------------------- | ---------- | ------------ |
| Global rate limit     | 10 req/min | All `/api/*` |
| `/api/innovate` limit | 5 req/min  | Per IP       |
| `/api/auto` limit     | 3 req/min  | Per IP       |
| Concurrent requests   | 2 per IP   | All `/api/*` |
| Max request body size | 100 KB     | All `/api/*` |

### 429 Response

When a rate limit is exceeded, the API returns HTTP 429 with a JSON body and `Retry-After` header:

```json
{ "error": "Too many requests. Please try again later." }
```

Route-specific messages:

- **`/api/innovate`**: `"Too many innovate requests. Please try again later."`
- **`/api/auto`**: `"Too many auto requests. Please try again later."`
- **Concurrent limit**: `"Too many concurrent requests. Please wait for existing requests to complete."`

:::note
The in-memory rate limiter works for single-instance deployments only. For multi-instance environments (Vercel, Kubernetes), use Redis or a platform-provided rate limiting solution.
:::
