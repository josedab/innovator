---
id: cost-tracking
title: Cost Tracking & Budgets
sidebar_position: 18
---

# Cost Tracking & Budgets

Innovator includes built-in cost tracking and budget management for LLM API usage. This guide explains how to estimate costs, set budget caps, and monitor token consumption.

## How Cost Tracking Works

Every LLM call made through Innovator's pipeline is automatically recorded by the `CostTracker`. Each record captures:

| Field          | Description                                      |
| -------------- | ------------------------------------------------ |
| `model`        | The model used (e.g., `gpt-4.1`)                 |
| `inputTokens`  | Number of tokens in the prompt                   |
| `outputTokens` | Number of tokens in the response                 |
| `costUsd`      | Estimated cost in USD                            |
| `latencyMs`    | Round-trip time in milliseconds                  |
| `stage`        | Pipeline stage (e.g., `investigate`, `generate`) |
| `timestamp`    | ISO 8601 timestamp                               |

Costs are calculated using the built-in pricing table, which includes default rates for common models.

## Estimating Costs

Use `estimateCost()` to preview costs before running a pipeline:

```typescript
import { estimateCost } from "@innovator/core";

// Estimate cost for a typical investigation call
const cost = estimateCost("gpt-4.1", 2000, 1000);
console.log(`Estimated cost: $${cost.toFixed(4)}`);
// → Estimated cost: $0.0120
```

### Default Pricing Table

| Model               | Input (per 1K tokens) | Output (per 1K tokens) |
| ------------------- | --------------------- | ---------------------- |
| `gpt-4.1`           | $0.0020               | $0.0080                |
| `gpt-4.1-mini`      | $0.0004               | $0.0016                |
| `gpt-5`             | $0.0030               | $0.0150                |
| `gpt-5-mini`        | $0.0012               | $0.0050                |
| `claude-sonnet-4.5` | $0.0030               | $0.0150                |
| `claude-sonnet-4`   | $0.0030               | $0.0150                |

### Custom Model Pricing

Register pricing for models not in the default table:

```typescript
import { setModelPricing, listModelPricing } from "@innovator/core";

// Add pricing for a custom model
setModelPricing({
  modelId: "my-custom-model",
  inputPer1k: 0.001,
  outputPer1k: 0.004,
});

// View all registered pricing
const allPricing = listModelPricing();
console.log(allPricing);
```

:::note
Models without registered pricing return `0` from `estimateCost()`. Ollama and other local models have zero API cost but still consume compute resources.
:::

## Setting a Budget

Use `BudgetConfig` to cap spending for a session. When the budget is exceeded, an optional `AbortController` is triggered to halt in-flight requests.

```typescript
import { getCostTracker } from "@innovator/core";

const tracker = getCostTracker();
const abortController = new AbortController();

tracker.setBudget({
  maxCostUsd: 0.5, // Stop after $0.50
  abortController, // Signals abort when budget exceeded
});

// Pass the abort signal to your pipeline
abortController.signal.addEventListener("abort", (event) => {
  console.warn("Budget exceeded:", abortController.signal.reason);
});
```

### Budget enforcement

The tracker checks the budget after every recorded LLM call. When cumulative cost reaches or exceeds `maxCostUsd`:

1. The `AbortController.abort()` is called with a descriptive message
2. In-flight requests using the same `AbortSignal` are cancelled
3. Subsequent pipeline stages will not start

This prevents runaway costs in Auto Mode, where 8+ LLM calls run sequentially.

## Monitoring Token Usage

### Get the current session cost

```typescript
import { getCostTracker } from "@innovator/core";

const tracker = getCostTracker();
const totalCost = tracker.getTotalCost();
console.log(`Session cost so far: $${totalCost.toFixed(4)}`);
```

### Get a detailed summary

The `getSummary()` method returns aggregated metrics broken down by model and pipeline stage:

```typescript
const summary = tracker.getSummary();

console.log(`Total calls: ${summary.callCount}`);
console.log(`Total cost: $${summary.totalCostUsd.toFixed(4)}`);
console.log(`Total tokens: ${summary.totalInputTokens + summary.totalOutputTokens}`);
console.log(`Total latency: ${summary.totalLatencyMs}ms`);

// Cost per model
for (const [model, stats] of Object.entries(summary.byModel)) {
  console.log(`  ${model}: $${stats.costUsd.toFixed(4)} (${stats.calls} calls)`);
}

// Cost per pipeline stage
for (const [stage, stats] of Object.entries(summary.byStage)) {
  console.log(`  ${stage}: $${stats.costUsd.toFixed(4)} (${stats.calls} calls)`);
}
```

### Access raw records

```typescript
const records = tracker.getRecords();
for (const record of records) {
  console.log(
    `${record.timestamp} | ${record.model} | ${record.stage} | ` +
      `${record.inputTokens}→${record.outputTokens} tokens | $${record.costUsd.toFixed(4)}`
  );
}
```

## Typical Costs by Operation

These are approximate costs for common operations using `gpt-4.1`:

| Operation                     | Input Tokens | Output Tokens | Estimated Cost |
| ----------------------------- | ------------ | ------------- | -------------- |
| Single investigation          | ~1,500       | ~800          | ~$0.009        |
| Single angle generation       | ~2,500       | ~1,200        | ~$0.015        |
| Full auto pipeline (8 angles) | ~25,000      | ~12,000       | ~$0.15         |
| With synthesis                | ~30,000      | ~14,000       | ~$0.17         |

:::tip
Use `gpt-4.1-mini` for experimentation — it's roughly 5× cheaper than `gpt-4.1` with good results for most innovation tasks.
:::

## Token Estimation

The `estimateTokenCount()` utility provides a rough token count using a simple heuristic (4 characters ≈ 1 token):

```typescript
import { estimateTokenCount } from "@innovator/core";

const tokens = estimateTokenCount("Your text here");
console.log(`Estimated tokens: ${tokens}`);
```

This is useful for pre-flight checks before sending prompts to the LLM.

## Resetting the Tracker

```typescript
import { getCostTracker, resetCostTracker } from "@innovator/core";

// Clear records within the current tracker
getCostTracker().clear();

// Or reset the global singleton entirely
resetCostTracker();
```

## API Reference

| Function / Class       | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `CostTracker`          | Session-level cost tracker with budget enforcement  |
| `getCostTracker()`     | Get or create the global cost tracker singleton     |
| `resetCostTracker()`   | Reset the global cost tracker                       |
| `estimateCost()`       | Estimate USD cost for a given model and token count |
| `setModelPricing()`    | Register or update pricing for a model              |
| `getModelPricing()`    | Get pricing for a specific model                    |
| `listModelPricing()`   | List all registered model pricing entries           |
| `estimateTokenCount()` | Estimate token count from text length               |
