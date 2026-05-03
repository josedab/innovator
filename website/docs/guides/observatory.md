---
id: observatory
title: Observatory
sidebar_position: 8
---

# Observatory

Monitor, analyze, and compare LLM calls across your innovation pipeline with the prompt observatory.

## Overview

The observatory captures every LLM call made during innovation sessions — prompts, responses, token usage, latency, and quality scores. Use it to debug prompts, optimize costs, and run A/B comparisons between models or prompt variants.

## What It Tracks

| Metric      | Description                                        |
| ----------- | -------------------------------------------------- |
| **Prompts** | Full prompt text and model used                    |
| **Tokens**  | Input/output token counts (estimated via char/4)   |
| **Latency** | Response time in milliseconds                      |
| **Quality** | Quality score (0–100), optional                    |
| **Stage**   | Pipeline stage (investigate, generate, synthesize) |

## Recording Calls

### Automatic Recording

Wrap any async LLM call with `observeCall()` to automatically capture timing, tokens, and quality:

```typescript
import { observeCall } from "@innovator/core";

const result = await observeCall(
  () => generateText({ prompt: "Analyze remote work tools", model: "gpt-4.1" }),
  { stage: "investigate", model: "gpt-4.1" }
);
```

### Manual Recording

```typescript
import { recordPromptCall } from "@innovator/core";

recordPromptCall({
  prompt: "Analyze remote work tools",
  response: "Remote work tools have evolved...",
  model: "gpt-4.1",
  stage: "investigate",
  tokens: { input: 150, output: 500 },
  latencyMs: 1200,
  quality: 85,
});
```

## Querying the Observatory

### Via the API

```bash
# Aggregated statistics
curl "http://localhost:3000/api/observatory?action=stats"

# Call timeline with filters
curl "http://localhost:3000/api/observatory?action=timeline&limit=20&stage=investigate&model=gpt-4.1"

# Compare two calls
curl "http://localhost:3000/api/observatory?action=diff&a=call-id-1&b=call-id-2"
```

### Via the Core Package

```typescript
import {
  getObservatoryStats,
  getCallTimeline,
  getPromptCallById,
  diffPromptCalls,
} from "@innovator/core";

// Dashboard stats
const stats = getObservatoryStats();
// { totalCalls, byModel, byStage, qualityDistribution }

// Filtered timeline
const calls = getCallTimeline({ stage: "investigate", model: "gpt-4.1", limit: 20 });

// Look up a single call
const call = getPromptCallById("call-id");

// Compare two calls
const diff = diffPromptCalls("call-id-1", "call-id-2");
// { added: [...], removed: [...], unchanged: [...], tokenDelta: {...} }
```

## A/B Comparisons

Compare two prompt variants or models side by side:

```typescript
import { createABComparison } from "@innovator/core";

const comparison = createABComparison("call-id-a", "call-id-b");
```

The diff output includes:

- **Line-level diffs** — added, removed, and unchanged lines between prompts
- **Token deltas** — difference in input/output token counts
- **Latency comparison** — response time difference
- **Quality delta** — quality score difference (if scored)

## Observatory Stats Schema

```typescript
interface ObservatoryStats {
  totalCalls: number;
  byModel: Record<string, number>;
  byStage: Record<string, number>;
  qualityDistribution: Record<string, number>;
}
```

## Prompt Call Schema

```typescript
interface PromptCall {
  id: string;
  prompt: string;
  response: string;
  model: string;
  stage: string;
  tokens: { input: number; output: number };
  latencyMs: number;
  quality?: number;
  timestamp: string;
}
```

:::note
The observatory uses an in-memory call log. Data is not persisted across server restarts. Capture can be toggled on/off globally.
:::
