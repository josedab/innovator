# ADR-0004: Pluggable LLM Provider Abstraction

## Status

Accepted

## Context

While the GitHub Copilot SDK is the default LLM backend (ADR-0003), not all users have Copilot subscriptions, and different deployment contexts have different constraints. Enterprise environments may mandate specific providers for compliance. Local development may benefit from offline models. The system needed to support multiple LLM backends without coupling business logic to any single provider's API.

## Decision

We define a **provider interface** (`LLMProvider`) in `packages/core/src/providers/index.ts` that all LLM backends must implement:

```typescript
interface LLMProvider {
  readonly id: string;
  readonly name: string;
  generateText(options: LLMGenerateOptions): Promise<string>;
  generateStream(options: LLMGenerateOptions, onChunk: (chunk: string) => void): Promise<string>;
  listModels(): Promise<LLMModelInfo[]>;
}
```

Four providers ship built-in:

| Provider       | Class               | Auth Mechanism                    |
| -------------- | ------------------- | --------------------------------- |
| GitHub Copilot | `CopilotProvider`   | GitHub CLI (`gh auth login`)      |
| OpenAI         | `OpenAIProvider`    | `OPENAI_API_KEY` env var          |
| Anthropic      | `AnthropicProvider` | `ANTHROPIC_API_KEY` env var       |
| Ollama         | `OllamaProvider`    | `OLLAMA_BASE_URL` (local, no key) |

A **provider registry** (Map-based) with `registerProvider()`, `getActiveProvider()`, and `setActiveProvider()` manages runtime selection. Configuration is persisted in `~/.innovator/config.json` (validated by Zod schema), supporting per-provider settings (enabled/disabled, API key env var, base URL, default model) and per-pipeline-stage model routing.

The `initializeProviders()` function reads config and registers all enabled providers at startup. Copilot is always registered as the fallback.

## Consequences

**Positive:**

- **Provider-agnostic business logic** — The innovation pipeline, prompts, and all core modules call `getActiveProvider().generateText()` without knowing which LLM is behind it.
- **User choice** — Users can switch providers via config file without code changes, enabling use in air-gapped environments (Ollama), enterprises with mandated vendors, or cost-sensitive scenarios.
- **Streaming support built-in** — The interface mandates `generateStream()`, so all providers support real-time progressive output.
- **Testability** — Tests can register a mock provider without touching production code.

**Negative:**

- **Lowest common denominator** — The interface exposes only text generation. Provider-specific features (function calling, vision, structured output) are not available through the abstraction.
- **No automatic failover** — If the active provider fails, there is no built-in fallback chain. The user must manually switch providers.
- **Direct HTTP implementations** — Each provider implements its own HTTP client using `fetch()` rather than vendor SDKs, which means tracking API changes manually. This was a deliberate choice to avoid heavy SDK dependencies.
- **Global mutable state** — The provider registry uses module-level `Map` and `activeProviderId`, which can cause issues in test isolation (mitigated by `clearProviders()`).
