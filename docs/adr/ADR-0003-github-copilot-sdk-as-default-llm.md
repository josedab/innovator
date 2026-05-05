# ADR-0003: GitHub Copilot SDK as Default LLM Provider

## Status

Accepted

## Context

Innovator requires a large language model for its core capabilities: investigating subjects, generating ideas from innovation angles, and synthesizing strategic recommendations. The team needed to choose a default LLM backend that balances accessibility, cost, and quality.

Options considered:

1. **Direct OpenAI API** — Requires users to sign up, obtain an API key, and pay per-token.
2. **Self-hosted models (Ollama)** — Free but requires local GPU resources and model downloads.
3. **GitHub Copilot SDK** — Leverages existing GitHub Copilot subscriptions via `@github/copilot-sdk`, authenticated through the GitHub CLI (`gh auth login`).

Most target users are developers who already have GitHub Copilot subscriptions through their employer or personal plan. Using the Copilot SDK means they can start using Innovator immediately with zero additional cost or API key management.

## Decision

We use the **GitHub Copilot SDK** (`@github/copilot-sdk`) as the default and primary LLM provider. The SDK authenticates via the locally installed GitHub CLI (`gh`), requiring only that the user has run `gh auth login` with a Copilot-enabled account.

Key implementation details:

- `packages/core/src/copilot/client.ts` manages a **lazy singleton** `CopilotClient` — created on first use, reused for all subsequent requests, with graceful shutdown support.
- A **permission handler** restricts the client to read-only operations, denying shell, write, and custom-tool requests.
- The `npm run doctor` script validates prerequisites (Node.js 20+, `gh` CLI installed, Copilot auth active) before development starts.
- The default model is configurable via `INNOVATOR_DEFAULT_MODEL` environment variable (defaults to `gpt-4.1`).

## Consequences

**Positive:**

- **Zero-config for most users** — No API keys to obtain, no accounts to create, no billing to set up. If you have Copilot, it just works.
- **Cost-effective** — Copilot is a flat-rate subscription; Innovator usage doesn't incur additional per-token charges.
- **Trusted auth flow** — Authentication is handled by the GitHub CLI, which users already trust and have configured.
- **Consistent model access** — The Copilot SDK provides access to the same models (GPT-4.1, etc.) as direct API access.

**Negative:**

- **GitHub Copilot subscription required** — Users without Copilot cannot use the default provider. This is mitigated by alternative providers (see ADR-0004).
- **GitHub CLI dependency** — Requires `gh` to be installed and authenticated, adding a prerequisite that non-GitHub-centric environments may lack.
- **Rate limits and quotas** — Subject to Copilot's usage policies, which may differ from direct API rate limits and are less transparent.
- **Model availability lag** — New models may be available via direct APIs before they appear in the Copilot SDK.
- **Vendor coupling** — The default path creates a dependency on GitHub's infrastructure and SDK stability, though the provider abstraction (ADR-0004) ensures this is swappable.
