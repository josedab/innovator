---
id: api-reference
title: API Reference
sidebar_position: 5
---

# API Reference

Complete reference for the `@innovator/core` package and web API routes.

## Core Package (`@innovator/core`)

### `investigate(subject, model?)`

Analyze a subject and return structured findings.

```typescript
import { investigate } from '@innovator/core';

const result = await investigate('remote work tools');
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | `string` | Yes | The topic to investigate |
| `model` | `string` | No | LLM model ID (default: `gpt-4.1`) |

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
import { generateForAngle } from '@innovator/core';

const result = await generateForAngle(
  'remote work tools',
  investigation,
  'scamper'
);
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | `string` | Yes | The original subject |
| `investigation` | `Investigation` | Yes | Result from `investigate()` |
| `angleId` | `AngleId` | Yes | One of the 8 angle IDs |
| `model` | `string` | No | LLM model ID |

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
import { runAutoPipeline } from '@innovator/core';

const result = await runAutoPipeline(
  'remote work tools',
  (progress) => console.log(progress.stage, progress.completedAngles.length),
);
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | `string` | Yes | The topic to innovate on |
| `onProgress` | `(progress: PipelineProgress) => void` | Yes | Called on each stage transition |
| `model` | `string` | No | LLM model ID |
| `angles` | `AngleId[]` | No | Subset of angles (default: all 8) |

**Returns:** `Promise<PipelineProgress>`

```typescript
interface PipelineProgress {
  stage: 'investigating' | 'generating' | 'synthesizing' | 'complete' | 'error';
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
    feasibility: 'low' | 'medium' | 'high';
  }[];
  themes: string[];
  recommendation: string;
}
```

---

### `AngleId` type

```typescript
type AngleId =
  | 'scamper'
  | 'first-principles'
  | 'cross-domain'
  | 'constraints'
  | 'inversion'
  | 'perspectives'
  | 'what-if'
  | 'trend-collision';
```

---

### `ANGLES` constant

Array of all angle definitions with metadata:

```typescript
import { ANGLES } from '@innovator/core';

ANGLES.forEach(angle => {
  console.log(`${angle.icon} ${angle.name}: ${angle.shortDescription}`);
});
```

Each entry has: `id`, `name`, `shortDescription`, `icon`.

---

### Copilot Client Utilities

```typescript
import {
  generateText,
  generateTextStream,
  extractJson,
  getCopilotClient,
  stopCopilotClient,
} from '@innovator/core';
```

| Function | Description |
|----------|-------------|
| `generateText(options)` | Send a prompt, wait for complete response |
| `generateTextStream(options, onChunk)` | Stream response chunks |
| `extractJson(raw)` | Extract JSON from LLM response (brace-balanced) |
| `getCopilotClient()` | Get or create the singleton CopilotClient |
| `stopCopilotClient()` | Shut down the CopilotClient gracefully |

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
{ "error": "Invalid request", "details": { "fieldErrors": { "subject": ["Required"] } } }
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
