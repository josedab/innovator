---
id: api-reference
title: API Reference
sidebar_position: 5
---

# API Reference

Complete reference for the `@innovator/core` package and web API routes.

:::tip Auto-Generated API Docs
For detailed, auto-generated documentation of every exported symbol, see the [TypeDoc API reference](/docs/api/).
:::

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

### `investigate(subject, model?, signal?)`

Analyze a subject and return structured findings.

```typescript
import { investigate } from "@innovator/core";

const result = await investigate("remote work tools");
```

**Parameters:**

| Param     | Type          | Required | Description                        |
| --------- | ------------- | -------- | ---------------------------------- |
| `subject` | `string`      | Yes      | The topic to investigate           |
| `model`   | `string`      | No       | LLM model ID (default: `gpt-4.1`)  |
| `signal`  | `AbortSignal` | No       | Signal to cancel the request early |

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

### `generateForAngle(subject, investigation, angleId, model?, signal?)`

Generate innovations for a single angle.

```typescript
import { generateForAngle } from "@innovator/core";

const result = await generateForAngle("remote work tools", investigation, "scamper");
```

**Parameters:**

| Param           | Type            | Required | Description                        |
| --------------- | --------------- | -------- | ---------------------------------- |
| `subject`       | `string`        | Yes      | The original subject               |
| `investigation` | `Investigation` | Yes      | Result from `investigate()`        |
| `angleId`       | `AngleId`       | Yes      | One of the 8 angle IDs             |
| `model`         | `string`        | No       | LLM model ID                       |
| `signal`        | `AbortSignal`   | No       | Signal to cancel the request early |

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

### `runAutoPipeline(subject, onProgress, model?, angles?, signal?)`

Run the full automatic pipeline with progress callbacks.

```typescript
import { runAutoPipeline } from "@innovator/core";

const result = await runAutoPipeline("remote work tools", (progress) =>
  console.log(progress.stage, progress.completedAngles.length)
);
```

**Parameters:**

| Param        | Type                                   | Required | Description                        |
| ------------ | -------------------------------------- | -------- | ---------------------------------- |
| `subject`    | `string`                               | Yes      | The topic to innovate on           |
| `onProgress` | `(progress: PipelineProgress) => void` | Yes      | Called on each stage transition    |
| `model`      | `string`                               | No       | LLM model ID                       |
| `angles`     | `AngleId[]`                            | No       | Subset of angles (default: all 8)  |
| `signal`     | `AbortSignal`                          | No       | Signal to cancel the request early |

**Returns:** `Promise<PipelineProgress>`

```typescript
interface PipelineProgress {
  stage: "investigating" | "generating" | "synthesizing" | "complete" | "error";
  currentAngle?: string;
  completedAngles: string[];
  totalAngles: number;
  investigation?: Investigation;
  angleResults: AngleResult[];
  failedAngles?: { angleId: string; error: string }[];
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

:::note Partial Failures
The `/api/innovate` route uses `Promise.allSettled()` internally, so individual angle failures do not fail the entire request. The response includes only successful results in `angleResults`. If all angles fail, the endpoint returns a `500` error. Synthesis only runs when `results.length >= 2` — if fewer than 2 angles succeed, the response omits the `synthesis` field even when `synthesize: true` is requested.
:::

### `POST /api/auto`

Returns a **Server-Sent Events** stream. Each event is a JSON `PipelineProgress` object:

```
data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}

data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,...}

data: {"stage":"complete","completedAngles":[...],"synthesis":{...}}
```

#### Fields present at each stage

Not every `PipelineProgress` field is populated at every stage. The table below shows which fields carry meaningful values at each stage transition:

| Field             | `investigating` | `generating`                       | `synthesizing`    | `complete`        | `error`        |
| ----------------- | --------------- | ---------------------------------- | ----------------- | ----------------- | -------------- |
| `stage`           | ✅              | ✅                                 | ✅                | ✅                | ✅             |
| `totalAngles`     | ✅              | ✅                                 | ✅                | ✅                | ✅             |
| `completedAngles` | `[]`            | Grows as angles finish             | All angles listed | All angles listed | Partial        |
| `currentAngle`    | —               | ID of the angle in progress        | —                 | —                 | —              |
| `investigation`   | —               | ✅ (set after investigation)       | ✅                | ✅                | May be present |
| `angleResults`    | `[]`            | Grows with each completion         | All angle results | All angle results | Partial        |
| `failedAngles`    | —               | `{ angleId, error }[]` if any fail | May be present    | May be present    | May be present |
| `synthesis`       | —               | —                                  | —                 | ✅                | —              |
| `error`           | —               | —                                  | —                 | —                 | Error message  |

:::note
The server sends SSE keepalive comments (`: keepalive`) every 15 seconds to prevent proxy/load-balancer timeouts. These are lines starting with `:` and should be ignored by the client.
:::

#### Consuming the SSE stream

The `/api/auto` endpoint uses raw SSE (not compatible with `EventSource`). Use `fetch()` with a streaming reader:

```javascript
async function runAuto(subject) {
  const response = await fetch("/api/auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE messages are separated by double newlines
    const parts = buffer.split("\n\n");
    buffer = parts.pop(); // keep incomplete chunk

    for (const part of parts) {
      if (part.startsWith("data: ")) {
        const progress = JSON.parse(part.slice(6));
        console.log(progress.stage, progress.completedAngles.length);
      }
      // Lines starting with ":" are keepalive comments — ignore them
    }
  }
}
```

### `GET /api/health`

Returns the service status and version.

```json
// Response (200)
{ "status": "ok", "version": "0.1.0" }
```

The `version` value comes from `npm_package_version` (defaults to `"0.1.0"`).

---

### `POST /api/artifacts`

Generate structured artifacts from an innovation idea.

```json
// Request
{
  "idea": { "title": "...", "description": "...", "potentialImpact": "...", "implementationHint": "..." },
  "artifactType": "prd",
  "subject": "remote work tools",
  "investigation": { ... },
  "model": "gpt-4.1"
}

// Response (200)
{
  "type": "prd",
  "title": "...",
  "content": "...",
  "sections": [{ "heading": "...", "body": "..." }],
  "metadata": { ... }
}
```

**Artifact types:** `prd`, `user-story`, `tech-spec`, `pitch-outline`, `okr`

---

### `GET /api/collaborate` · `POST /api/collaborate`

Manage collaborative innovation sessions with voting and commenting.

```json
// GET — Retrieve session by ID or share code
// Query: ?id=<session-id> or ?code=<share-code>
// Response (200)
{ "data": { "id": "...", "subject": "...", "participants": [...], "ideas": [...] } }

// POST — Create session
{
  "subject": "remote work tools",
  "hostUserId": "user-123",
  "hostDisplayName": "Alice"
}

// POST — Session actions
{
  "action": "join" | "submit_idea" | "vote" | "comment" | "start" | "complete" | "assign_angles" | "merge",
  ...
}
```

---

### `POST /api/refine`

Conversational refinement of innovation ideas.

```json
// Start a refinement session
{
  "action": "start",
  "subject": "remote work tools",
  "selectedIdeas": ["idea-1", "idea-2"],
  "model": "gpt-4.1"
}
// Response (200)
{ "sessionId": "uuid", "subject": "remote work tools" }

// Send follow-up refinement
{
  "action": "refine",
  "sessionId": "uuid",
  "message": "Focus on enterprise use cases"
}
```

---

### `POST /api/validate`

Validate innovation ideas with structured scoring.

```json
// Request
{
  "ideas": [{ "title": "...", "description": "..." }],
  "domain": "enterprise SaaS",
  "model": "gpt-4.1"
}

// Response (200) — ValidationScorecard
{ ... }
```

**Constraints:** 1–50 ideas, domain max 200 chars.

---

### `GET /api/share` · `POST /api/share` · `GET /api/share/[slug]` · `POST /api/share/[slug]`

Share and fork innovation sessions via shareable links.

```json
// POST /api/share — Create shareable link
{
  "subject": "remote work tools",
  "investigation": { ... },
  "angleResults": [...],
  "synthesis": { ... },
  "title": "My Session",
  "isPublic": true,
  "expiresInDays": 30
}
// Response (200)
{ "shareUrl": "https://...", ... }

// GET /api/share — List all shared investigations
// Response (200)
{ "investigations": [...] }

// GET /api/share/[slug] — Retrieve by slug
// Response (200)
{ "subject": "...", "investigation": { ... }, ... }

// POST /api/share/[slug] — Fork investigation
// Response (201)
{ "newSessionId": "..." }
```

---

### `GET /api/analytics` · `POST /api/analytics`

Innovation analytics and event tracking.

```json
// GET — Analytics summary
// Response (200)
{ "summary": { ... }, "insights": [...] }

// POST — Track event
{ "type": "idea_generated", "data": { "angleId": "scamper" } }
// Response (200)
{ "event": { ... } }
```

---

### `GET /api/angles` · `POST /api/angles` · `DELETE /api/angles`

Manage built-in and custom innovation angles.

```json
// GET — List all angles
// Response (200)
{ "angles": [{ "id": "scamper", "name": "SCAMPER", "type": "built-in", ... }] }

// POST — Create custom angle
{
  "id": "my-angle",
  "name": "My Angle",
  "description": "Custom framework",
  "promptTemplate": "Analyze {{subject}}...",
  "icon": "🔧",
  "author": "user",
  "tags": ["custom"]
}
// Response (201)
{ "success": true, "angle": { ... } }

// DELETE ?id=my-angle — Remove custom angle
// Response (200)
{ "success": true }
```

---

### `GET /api/presets`

Retrieve innovation presets (pre-configured angle sets and configurations).

```json
// GET — List all presets
// Query: ?category=<category> or ?id=<preset-id>
// Response (200)
{ "data": [...] }
```

---

### `POST /api/export`

Export innovation results in various formats.

```json
// Request
{
  "format": "markdown" | "json" | "clipboard" | "github-issue",
  "data": {
    "subject": "remote work tools",
    "investigation": { ... },
    "angleResults": [...],
    "synthesis": { ... },
    "metadata": { ... }
  }
}
// Response (200)
{ "data": "..." }
```

---

### `GET /api/observatory`

Query the prompt observatory for LLM call statistics, timeline, and diffs.

```json
// GET ?action=stats — Aggregated statistics
// Response (200)
{ "totalCalls": 42, "byModel": { ... }, "byStage": { ... }, "qualityDistribution": { ... } }

// GET ?action=timeline&limit=20&stage=investigate&model=gpt-4.1 — Call timeline
// Response (200)
{ "calls": [{ "id": "...", "prompt": "...", "tokens": { ... }, "latencyMs": 1200, ... }] }

// GET ?action=diff&a=<call-id>&b=<call-id> — Compare two LLM calls
// Response (200)
{ "added": [...], "removed": [...], "unchanged": [...], "tokenDelta": { ... } }
```

---

### `GET /api/history` · `POST /api/history` · `DELETE /api/history` · `PATCH /api/history`

Session history management with search, tags, and pagination.

```json
// GET — Query sessions
// Query: ?search=<text>&tags=<csv>&angle=<id>&from=<date>&to=<date>&page=1&limit=20
// Response (200)
{ "data": [...], "total": 42 }

// POST — Save session
{
  "subject": "remote work tools",
  "investigation": { ... },
  "angleResults": [...],
  "synthesis": { ... },
  "tags": ["enterprise"],
  "notes": "Initial exploration"
}
// Response (201)
{ "data": { "id": "..." } }

// DELETE ?id=<session-id> — Remove session
// PATCH — Update session tags/notes
{ "id": "...", "tags": ["updated"], "notes": "Refined" }
```

---

### `POST /api/pipeline`

Run a natural-language-described pipeline. Returns an SSE stream.

```json
// Request
{ "description": "Investigate AI in healthcare, focus on diagnostics", "model": "gpt-4.1" }

// Response — Server-Sent Events stream
data: {"type":"config","config":{...}}
data: {"stage":"investigating",...}
data: {"stage":"complete",...}
```

The server sends `: keepalive` comments every 15 seconds.

---

### `GET /api/tracker`

Get the innovation tracker dashboard.

```json
// Response (200)
{ "dashboard": { ... }, "recentIdeas": [...] }
```

Returns up to 20 recent ideas.

---

### `GET /api/widget`

Serves the `<innovator-widget>` embeddable web component as JavaScript.

- **Content-Type:** `application/javascript`
- **Cache-Control:** `public, max-age=3600`
- **CORS:** `Access-Control-Allow-Origin: *`

Usage:

```html
<script src="https://your-domain.com/api/widget"></script>
<innovator-widget></innovator-widget>
```

---

### `POST /api/embed`

Embeddable API for running innovation pipelines from external sites.

```json
// Request
{
  "subject": "remote work tools",
  "angles": ["scamper", "first-principles"],
  "model": "gpt-4.1"
}

// Response (200)
{
  "subject": "...",
  "investigation": { ... },
  "angleResults": [...],
  "synthesis": { ... }
}
```

**Authentication:** Optional `X-Embed-Key` header (validated against `INNOVATOR_EMBED_API_KEY` env var).
**CORS:** Configurable via `INNOVATOR_EMBED_ORIGINS` env var.

---

## V1 Authenticated API

The `/api/v1/*` endpoints provide programmatic access with API key authentication. All requests require an `X-API-Key` header.

See the [V1 API Guide](/docs/guides/v1-api) for setup and usage details.

### `POST /api/v1/investigate`

Authenticated investigation endpoint.

```json
// Request (X-API-Key required)
{ "subject": "remote work tools", "model": "gpt-4.1" }

// Response (200)
{ "data": { "summary": "...", "keyAspects": [...], ... } }
```

**Rate limit:** 30 req/min.

### `POST /api/v1/innovate`

Authenticated innovation generation.

```json
// Request (X-API-Key required)
{ "subject": "remote work tools", "angles": ["scamper", "first-principles"], "model": "gpt-4.1" }

// Response (200)
{ "data": { "investigation": { ... }, "angleResults": [...] } }
```

**Rate limit:** 20 req/min.

### `POST /api/v1/auto`

Authenticated full pipeline with optional streaming.

```json
// Request (X-API-Key required)
{ "subject": "remote work tools", "model": "gpt-4.1", "stream": true }

// Response (stream: true) — SSE stream of PipelineProgress events
// Response (stream: false)
{ "data": { ... } }
```

**Rate limit:** 10 req/min.

### `POST /api/v1/keys` · `GET /api/v1/keys` · `DELETE /api/v1/keys`

API key management.

```json
// POST — Create key
{ "name": "My Integration" }
// Response (201)
{ "id": "...", "name": "...", "key": "inv_...", ... }

// GET — List keys
// Response (200)
{ "keys": [{ "id": "...", "name": "...", "enabled": true, ... }] }

// DELETE — Revoke key
{ "id": "key-id" }
// Response (200)
{ "success": true }
```

### `GET /api/v1/openapi`

Returns the OpenAPI specification for the V1 API as JSON.

### `GET /api/v1/plugins`

List registered plugins. Requires API key authentication.

```json
// Response (200)
{ "data": [{ "id": "...", "name": "...", "type": "...", "version": "...", "description": "..." }] }
```

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

### 411 Response

All mutation requests (`POST`, `PUT`, `PATCH`) require a `Content-Length` header. Requests without it receive a `411 Length Required` response:

```json
{ "error": "Content-Length header is required." }
```

### In-Flight Request Timeout

In-flight request slots are automatically freed after 3 minutes (`INFLIGHT_TIMEOUT_MS = 180000`) as a safety mechanism. This prevents permanent counter leaks when response completion cannot be detected (e.g., long-running `/api/auto` pipelines or dropped connections).

:::note
The in-memory rate limiter works for single-instance deployments only. For multi-instance environments (Vercel, Kubernetes), use Redis or a platform-provided rate limiting solution.
:::
