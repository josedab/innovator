# ADR-0013: Bounded-Concurrency Semaphore for LLM Calls

## Status

Accepted

## Context

The innovation pipeline's generation stage runs multiple LLM calls in parallel — one per selected angle. Without concurrency limits, all 8 angles would fire simultaneously, risking rate-limit rejections from the LLM provider, memory pressure from concurrent response parsing, and poor error diagnostics when multiple calls fail at once. The team needed a mechanism to bound parallelism while still being significantly faster than sequential execution.

Options considered:

1. **Sequential execution** — Simple but slow; 8 angles × ~15s each = ~2 minutes.
2. **Unbounded `Promise.all`** — Fast but risks provider rate limits and blast-radius failures.
3. **Semaphore-based pool** — Bounded parallelism with configurable limit.
4. **External queue (Bull, BullMQ)** — Heavyweight, introduces Redis dependency.

## Decision

We use a **promise-pool semaphore pattern** implemented in `packages/core/src/innovation/pipeline.ts` via `runWithConcurrency()`. A `Set` of in-flight promises acts as the permit pool. When the pool reaches `MAX_CONCURRENCY` (default: 2), `Promise.race()` blocks until a slot opens. Each task's result or error is captured by index, so individual failures don't abort the pipeline.

```typescript
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  signal?: AbortSignal
): Promise<ConcurrencyResult<T>>;
```

The `AbortSignal` parameter allows API routes to propagate client disconnections, stopping new tasks from launching while letting in-flight tasks complete gracefully.

## Consequences

**Positive:**

- **Rate-limit safety** — At most 2 concurrent LLM requests, well within typical provider limits.
- **Graceful degradation** — A failed angle produces an error entry in the results but doesn't abort successful angles.
- **Abort propagation** — SSE client disconnection stops the pipeline without orphaned LLM calls.
- **Zero dependencies** — Pure async/await; no external queue or scheduler library.

**Negative:**

- **Static limit** — `MAX_CONCURRENCY = 2` is hardcoded. Different providers may support higher parallelism.
- **No priority scheduling** — All angles are treated equally; no way to prioritize faster or more important angles.
- **In-process only** — The semaphore doesn't coordinate across multiple server instances. Scaling horizontally could still trigger provider rate limits.
