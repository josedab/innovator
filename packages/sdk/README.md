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
  apiKey: "inv_abc123",                     // Optional — sent as Bearer token
  timeout: 120_000,                         // Optional — request timeout in ms (default: 120s)
  maxRetries: 2,                            // Optional — retries for transient failures (default: 2)
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
  synthesize: true,                     // cross-reference results
  score: true,                          // add feasibility scoring
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
  ["student", "teacher", "administrator"],
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
  model?: string;       // Override the LLM model
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
    console.error(err.status);  // HTTP status (0 for network/timeout errors)
    console.error(err.code);    // Error code: "TIMEOUT", "ABORTED", "NETWORK_ERROR"
  }
}
```

Transient failures (408, 429, 502, 503, 504) are retried automatically up to `maxRetries` times with exponential backoff.

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

## License

MIT — see [LICENSE](../../LICENSE).
