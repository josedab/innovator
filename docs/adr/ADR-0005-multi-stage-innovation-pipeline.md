# ADR-0005: Multi-Stage Innovation Pipeline

## Status

Accepted

## Context

Innovator's core value proposition is structured innovation: taking a subject and exploring it through multiple creative frameworks to produce actionable ideas. The team needed to decide how to orchestrate this process. A single monolithic LLM call would produce unfocused output. Conversely, giving users full control over every step would create friction.

The innovation process naturally decomposes into phases with distinct inputs and outputs:

1. **Understand** the subject deeply before ideating.
2. **Generate** ideas through multiple creative lenses (angles).
3. **Synthesize** results into a strategic recommendation.

## Decision

We implement a **three-stage pipeline** in `packages/core/src/innovation/`:

### Stage 1: Investigation (`investigate.ts`)

- Takes a subject string and an optional model.
- Sends a structured prompt to the LLM requesting summary, key aspects, current state, challenges, and opportunities.
- Parses and validates the response against `InvestigationSchema` (Zod).
- Output: `Investigation` object.

### Stage 2: Angle Generation (`generate.ts`)

- Takes an `Investigation` and one or more `AngleId` values.
- For each angle, builds a specialized prompt from templates in `prompts/angles/`.
- Calls the LLM with the investigation context plus the angle-specific prompt.
- Parses each response against `AngleResultSchema`.
- Output: `AngleResult[]` — each containing 3–5 innovation ideas with impact, feasibility, and implementation notes.

### Stage 3: Synthesis (`pipeline.ts`)

- Takes all `AngleResult` objects and the original `Investigation`.
- Sends a synthesis prompt asking the LLM to identify cross-angle themes, rank ideas, and produce a strategic recommendation.
- Parses the response against `SynthesisSchema`.
- Output: `Synthesis` object with themes, rankings, and recommendations.

The **auto pipeline** (`runAutoPipeline()`) orchestrates all three stages automatically, emitting `PipelineProgress` events at each transition. Angle generation uses a **bounded concurrency** model (semaphore pattern with `MAX_CONCURRENCY = 2`) to parallelize LLM calls without overwhelming rate limits.

Eight built-in angles are defined as a canonical constant (`ANGLES` in `angles.ts`): SCAMPER, First Principles, Cross-Domain Analogy, Constraint Injection, Problem Inversion, Role-Based Perspectives, What-If Scenarios, and Trend Collision.

## Consequences

**Positive:**

- **Structured exploration** — Each stage has a clear contract (Zod-validated input/output), making the pipeline predictable and debuggable.
- **Incremental UI** — The web app can show results progressively: investigation summary → angle selection → per-angle results → synthesis. Users don't wait for the entire pipeline to complete.
- **Composable** — Each stage can be called independently. The CLI can run just `investigate` or a single angle without triggering synthesis.
- **Parallelizable** — Multiple angles run concurrently within the generation stage, reducing wall-clock time from O(n) to O(n/2) for n angles.
- **Extensible** — Custom angles can be added without modifying the pipeline orchestration. The `custom-angles.ts` module supports user-defined angles with custom prompt templates.

**Negative:**

- **Multiple LLM calls** — A full auto pipeline makes 1 (investigation) + 8 (angles) + 1 (synthesis) = 10 LLM calls minimum. This has cost and latency implications.
- **Context loss between stages** — Each LLM call is independent; the model doesn't "remember" previous calls. Context is passed by injecting previous outputs into prompts, which consumes tokens.
- **Fixed angle set** — The 8 built-in angles represent a curated but opinionated selection. Users who want different frameworks must use the custom angles system.
