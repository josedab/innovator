# @innovator/sdk

Framework-agnostic TypeScript SDK client for the [Innovator](../../README.md) innovation platform API.

## Installation

```bash
npm install @innovator/sdk
```

## Quick Start

```ts
import { InnovatorClient } from "@innovator/sdk";

const client = new InnovatorClient({
  baseUrl: "http://localhost:3000",
  apiKey: "your-api-key", // optional
});

// Investigate a subject
const investigation = await client.investigate("renewable energy");

// Run the full auto pipeline (investigate → all angles → synthesize)
const events = await client.auto("renewable energy");
```

## Configuration

```ts
const client = new InnovatorClient({
  baseUrl: "https://innovator.example.com", // Required
  apiKey: "inv_abc123", // Optional — sent as Bearer token
  timeout: 120_000, // Optional — request timeout in ms (default: 120s)
  maxRetries: 2, // Optional — retries for transient failures (default: 2)
});
```

## API Reference

### `investigate(subject, options?)`

Analyze a subject to gather background research.

```ts
const result = await client.investigate("code review processes", {
  model: "gpt-5", // optional model override
});
```

### `innovate(subject, angles, options?)`

Generate ideas using specific innovation angles.

```ts
const result = await client.innovate("code review processes", ["scamper", "first-principles"], {
  investigation: previousInvestigation, // optional prior investigation
  synthesize: true, // cross-reference results
  score: true, // add feasibility scoring
});
```

### `auto(subject, options?)`

Run the full pipeline (investigate → all angles → synthesize). Returns all SSE events after completion.

```ts
const events = await client.auto("remote work tools");
```

### `streamAuto(subject, onEvent, options?)`

Stream the auto pipeline with real-time progress events via SSE.

```ts
await client.streamAuto("remote work tools", (event) => {
  console.log(event.event, event.data);
});
```

### `nlInnovate(prompt, options?)`

Run a natural-language innovation request.

```ts
const events = await client.nlInnovate("How can we improve developer onboarding?");
```

### `streamNLInnovate(prompt, onEvent, options?)`

Stream natural-language innovation events.

```ts
await client.streamNLInnovate("Improve developer onboarding", (event) => {
  console.log(event.data);
});
```

### `diffMerge(action, sessions, options?)`

Diff, merge, or resolve innovation sessions.

```ts
const diff = await client.diffMerge("diff", {
  sessionA: sessionData1,
  sessionB: sessionData2,
});
```

### `memorySearch(query, options?)`

Search the memory graph for past investigations.

```ts
const results = await client.memorySearch("renewable energy", {
  threshold: 0.7,
  limit: 10,
});
```

### `getOrgDNA(format?, options?)`

Get the organisation DNA summary.

```ts
const dna = await client.getOrgDNA("markdown");
```

### `evaluatePersonas(idea, personaIds, options?)`

Evaluate an idea against a set of personas.

```ts
const evaluation = await client.evaluatePersonas(
  { title: "AI Tutor", description: "An AI-powered tutoring system" },
  ["student", "teacher", "administrator"]
);
```

### `getMonitorState(options?)`

Get the current innovation monitor state.

### `generateDigest(period?, options?)`

Generate an innovation digest.

```ts
const digest = await client.generateDigest("weekly");
```

## Request Options

All methods accept an optional `RequestOptions` object:

```ts
interface RequestOptions {
  model?: string; // Override the LLM model
  signal?: AbortSignal; // Cancel the request
}
```

## Error Handling

The SDK throws `InnovatorError` for all failures:

```ts
import { InnovatorError } from "@innovator/sdk";

try {
  await client.investigate("topic");
} catch (err) {
  if (err instanceof InnovatorError) {
    console.error(err.message); // Human-readable message
    console.error(err.status); // HTTP status (0 for network/timeout errors)
    console.error(err.code); // Error code: "TIMEOUT", "ABORTED", "NETWORK_ERROR"
  }
}
```

Transient failures (408, 429, 502, 503, 504) are retried automatically up to `maxRetries` times with exponential backoff.

## Integration Examples

### Express.js API Endpoint

Wrap the SDK behind your own API to add custom logic:

```ts
import express from "express";
import { InnovatorClient, InnovatorError } from "@innovator/sdk";

const app = express();
const client = new InnovatorClient({
  baseUrl: process.env.INNOVATOR_URL ?? "http://localhost:3000",
  apiKey: process.env.INNOVATOR_API_KEY,
});

app.post("/api/brainstorm", express.json(), async (req, res) => {
  try {
    const events = await client.auto(req.body.topic);
    const complete = events.find((e) => e.data?.stage === "complete");
    res.json({ ideas: complete?.data?.synthesis?.topIdeas ?? [] });
  } catch (err) {
    if (err instanceof InnovatorError) {
      res.status(err.status || 500).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Unexpected error" });
    }
  }
});

app.listen(4000);
```

### CLI Script with Streaming

Build a CLI tool that streams innovation progress in real time:

```ts
import { InnovatorClient } from "@innovator/sdk";

const client = new InnovatorClient({ baseUrl: "http://localhost:3000" });

await client.streamAuto("sustainable packaging", (event) => {
  switch (event.data?.stage) {
    case "investigating":
      console.log("🔍 Investigating...");
      break;
    case "generating":
      console.log(`⚡ Generating: ${event.data.currentAngle}`);
      break;
    case "complete":
      console.log("\n✅ Top ideas:");
      for (const idea of event.data.synthesis?.topIdeas ?? []) {
        console.log(`  • ${idea.title} (${idea.feasibility})`);
      }
      break;
  }
});
```

### React Hook

Use the SDK in a React app with cancellation support:

```tsx
import { useState, useCallback } from "react";
import { InnovatorClient } from "@innovator/sdk";

const client = new InnovatorClient({ baseUrl: "/api" });

function useInnovate() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const investigate = useCallback(async (subject: string) => {
    const controller = new AbortController();
    setLoading(true);
    try {
      const data = await client.investigate(subject, {
        signal: controller.signal,
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
    return controller;
  }, []);

  return { investigate, loading, result };
}
```

### Batch Processing with Rate Limiting

Process multiple subjects with controlled concurrency:

```ts
import { InnovatorClient, InnovatorError } from "@innovator/sdk";

const client = new InnovatorClient({
  baseUrl: "http://localhost:3000",
  apiKey: "inv_abc123",
  timeout: 180_000,
});

const subjects = ["solar energy", "urban farming", "remote education"];

for (const subject of subjects) {
  try {
    const investigation = await client.investigate(subject);
    console.log(`✅ ${subject}: ${investigation.opportunities.length} opportunities`);
  } catch (err) {
    if (err instanceof InnovatorError && err.status === 429) {
      console.log(`⏳ Rate limited on "${subject}", waiting 60s...`);
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
}
```

## Exported Schemas

The SDK exports Zod schemas for request validation:

- `InvestigateRequestSchema`
- `InnovateRequestSchema`
- `AutoRequestSchema`
- `NLInnovateRequestSchema`
- `DiffMergeRequestSchema`
- `MemorySearchRequestSchema`
- `PersonaEvaluationRequestSchema`
- `MonitorRequestSchema`

## Troubleshooting

| Issue                                  | Solution                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **`InnovatorError` with status 0**     | Network error or server unreachable. Verify `baseUrl` is correct and the server is running.                                                  |
| **`TIMEOUT` errors**                   | Increase the `timeout` option (default: 120s). Complex subjects or slower models may need 180s+.                                             |
| **`401 Unauthorized`**                 | Ensure `apiKey` matches the server's `INNOVATOR_API_KEY` env var. The key is sent as a Bearer token.                                         |
| **`429 Too Many Requests`**            | You've hit the server's rate limit. The SDK retries automatically (up to `maxRetries`), but you may need to add backoff in your application. |
| **SSE stream disconnects**             | Proxies or CDNs may close idle connections. The server sends heartbeats every 15s; ensure your proxy timeout is >15s.                        |
| **`TypeError: fetch is not defined`**  | The SDK uses the global `fetch` API. In Node.js <18, install a polyfill like `undici` or `node-fetch`.                                       |
| **Zod validation errors from schemas** | Ensure you're using the same version of `@innovator/sdk` as the server. Schema shapes may change between versions.                           |
| **`ABORTED` error code**               | The request was cancelled via `AbortSignal`. This is expected when using `signal` in `RequestOptions`.                                       |

## License

MIT — see [LICENSE](../../LICENSE).
