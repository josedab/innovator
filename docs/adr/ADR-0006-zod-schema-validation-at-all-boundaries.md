# ADR-0006: Zod Schema Validation at All Boundaries

## Status

Accepted

## Context

Innovator has three trust boundaries where data validation is critical:

1. **User → API** — HTTP requests from the browser or external clients to Next.js API routes.
2. **LLM → Application** — JSON responses from language models, which are inherently unpredictable and may contain malformed, incomplete, or hallucinated data.
3. **Config → Application** — User-provided configuration files (`.innovator.config.json`).

TypeScript's type system only provides compile-time guarantees and is erased at runtime. Without runtime validation, malformed LLM output could propagate through the system as `any`-typed data, causing subtle bugs or crashes far from the source.

The team considered:

1. **Manual validation** — `if` checks and type guards. Error-prone, verbose, hard to maintain.
2. **JSON Schema (ajv)** — Powerful but verbose schemas, no TypeScript type inference.
3. **Zod** — TypeScript-first schema validation with automatic type inference via `z.infer<>`.

## Decision

We use **Zod** (`zod ^3.23`) as the single validation library across all trust boundaries:

### API Input Validation

Every API route validates request bodies against Zod schemas before processing. Invalid requests receive structured error responses with field-level details.

### LLM Output Validation

All structured LLM responses are parsed through Zod schemas:

- `InvestigationSchema` — validates investigation results (summary, keyAspects, challenges, opportunities)
- `AngleResultSchema` / `InnovationIdeaSchema` — validates generated ideas
- `SynthesisSchema` — validates synthesis output
- `IdeaScoreSchema` — validates scoring results

The `extractJson()` helper in `copilot/client.ts` combines JSON parsing with Zod validation, providing a single function that takes raw LLM text and returns a typed, validated object.

### Configuration Validation

`InnovatorConfigSchema` validates `~/.innovator/config.json` with sensible defaults via `z.default()`.

### Type Inference

Domain types are derived directly from schemas using `z.infer<>`:

```typescript
export const InvestigationSchema = z.object({ ... });
export type Investigation = z.infer<typeof InvestigationSchema>;
```

This ensures runtime validation and TypeScript types can never drift apart.

### Field Constraints

Schemas include defensive limits (`.max(5000)` on string fields, `.max(20)` on arrays) to prevent LLM responses from producing unbounded data structures.

## Consequences

**Positive:**

- **Single source of truth for types** — Schema definitions are the canonical type definitions. No separate interface to maintain.
- **Graceful LLM error handling** — When LLM output doesn't match the schema, Zod provides detailed error messages identifying exactly which fields failed, enabling targeted retry or fallback logic.
- **Defense in depth** — Validation at every boundary means no single point of failure can let malformed data propagate.
- **Consistent error format** — All validation errors (API, LLM, config) produce the same `ZodError` structure, simplifiable into user-facing messages.
- **Minimal dependency** — Zod has zero dependencies and is already used by Next.js ecosystem tooling, adding no weight to the bundle.

**Negative:**

- **Schema duplication risk** — Some validation logic appears in both Zod schemas and LLM prompt instructions (e.g., "return an array of up to 5 ideas"). Keeping these in sync requires discipline.
- **Strict parsing can reject valid output** — LLMs occasionally produce valid but slightly off-schema responses (e.g., extra fields). We use `.passthrough()` or `.strip()` where appropriate, but overly strict schemas can cause unnecessary failures.
- **Zod is not a standard** — Unlike JSON Schema, Zod schemas aren't interoperable with non-TypeScript systems. If the API needs an OpenAPI spec, schemas must be converted.
