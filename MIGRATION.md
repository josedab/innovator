# Migration Guide

This document covers upgrade paths and breaking changes for Innovator.

## Version Compatibility

| Innovator Version | Node.js | npm | Notes                                    |
| ----------------- | ------- | --- | ---------------------------------------- |
| 0.1.0             | 20+     | 10+ | Initial release, stateless design        |
| 0.2.0             | 20+     | 10+ | Extended engine, multi-provider          |
| 0.3.0 (current)   | 22+     | 10+ | Production profile and runtime hardening |

## Upgrading within v0.3.x (Post-Release Changes)

### First Production Profile

Production now requires:

- `NODE_ENV=production`
- `INNOVATOR_DEPLOYMENT_PROFILE=single-tenant`
- `INNOVATOR_API_KEYS` with unique comma-separated keys of at least 32 characters each
- `GH_TOKEN`

Do not set legacy `INNOVATOR_API_KEY` together with `INNOVATOR_API_KEYS`.

The first production profile is headless, single-process, single-tenant, and single-replica. Browser/SaaS surfaces return `404`; Docker Compose persists state in `innovator_data`; Vercel/serverless, horizontal scaling, and PostgreSQL are unsupported.

MCP now supports stdio only. Remove `--sse` and `MCP_PORT`, and use `MCP_ALLOWED_ROOT` to bound filesystem analysis. GitHub App-based Copilot Extensions were retired on November 10, 2025; migrate direct integrations to `@innovator/mcp-server`.

### Typed Error Migration

All `@innovator/core` modules now throw typed `InnovatorError` subclasses instead of plain `Error`. This is a **behavioral change** — the thrown errors are now instances of `ValidationError`, `LlmParseError`, `ConfigurationError`, `PipelineError`, or `AbortError` instead of generic `Error`.

**Impact:**

- ✅ **No action needed** if your code uses `try/catch` with generic `Error` — all `InnovatorError` subclasses extend `Error`
- ✅ **No action needed** if you use `isInnovatorError()` — it now catches all errors from Innovator
- ⚠️ **Review needed** if your code checks `error.message` strings for specific patterns — error messages may have changed
- ⚠️ **Review needed** if your code uses `error instanceof Error` and then checks `error.constructor.name` — the name is now the specific subclass

**Recommended migration:**

```typescript
// Before (still works, but less precise):
try {
  await investigate(subject);
} catch (err) {
  console.error("Something failed:", err);
}

// After (recommended — use typed error handling):
import { investigate, isInnovatorError, ValidationError, LlmTimeoutError } from "@innovator/core";

try {
  await investigate(subject);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error("Invalid input:", err.message);
  } else if (err instanceof LlmTimeoutError) {
    console.error("LLM timed out:", err.message);
  } else if (isInnovatorError(err)) {
    console.error(`Innovator error [${err.code}]:`, err.message);
  }
}
```

### New Exports (Additive)

```typescript
import { flatMapAsync, mapAsync } from "@innovator/core"; // Async Result helpers
```

## Upgrading from v0.2.0 to v0.3.0

### What Changed

v0.3.0 is a feature release with no breaking API changes. All existing v0.2.0 code continues to work without modification.

**Key additions — 6 Moonshot Modules:**

- **Adversarial Idea Gauntlet** (`gauntlet/`) — Multi-agent stress-testing with 5 adversary personas and Survivability Index (0–100). Use `runGauntlet()` and `gauntletToMarkdown()`.
- **Innovation Provenance Ledger** (`provenance-ledger/`) — Tamper-evident append-only audit trail with SHA-256 hash chaining and GDPR support. Use `recordInvestigation()`, `verifyLedger()`, `exportForActor()`.
- **Temporal Innovation Memory** (`temporal-memory/`) — Persistent temporal knowledge graph tracking concept evolution across sessions. Use `ingestSession()`, `queryTemporalMemory()`, `computeVelocity()`.
- **Sentinel: Always-On Innovation Agent** (`sentinel/`) — Signal monitoring agent that collects RSS/Atom feeds and generates opportunities. Use `runSentinel()`.
- **Idea Genome Sequencer** (`genome-sequencer/`) — Decomposes ideas into 7 genome traits with similarity search and recombination. Use `sequenceIdea()`, `findSimilar()`, `recombine()`.
- **Federation DP** (`federation-dp/`) — Differential privacy layer for cross-organization pattern sharing. Uses Laplace mechanism with privacy budget tracking.

**Web App UX improvements:**

- Global sidebar navigation with mobile support
- Dark mode toggle (light/dark/system)
- Session persistence with auto-save to localStorage
- Results action bar with Copy/Download options
- Onboarding wizard for first-run experience
- Improved error messages for common failure modes

### Upgrade Steps

1. **Update your branch**:

   ```bash
   git pull origin main
   ```

2. **Clean install dependencies**:

   ```bash
   npm run clean:all
   npm install
   ```

3. **Rebuild all packages**:

   ```bash
   npm run build
   ```

4. **Run tests** to verify nothing is broken:

   ```bash
   npm run check
   ```

### New Exports

All moonshot module functions are exported from `@innovator/core`. No new environment variables are required — the modules work with your existing LLM provider configuration.

```typescript
import {
  runGauntlet,
  gauntletToMarkdown,
  recordInvestigation,
  verifyLedger,
  ingestSession,
  queryTemporalMemory,
  runSentinel,
  sequenceIdea,
  findSimilar,
  recombine,
} from "@innovator/core";
```

## Upgrading from v0.1.0 to v0.2.0

### What Changed

v0.2.0 is a feature release with no breaking API changes. Existing code using `investigate()`, `generateForAngle()`, and `runAutoPipeline()` continues to work without modification.

**Key additions:**

- Alternative LLM providers (OpenAI, Anthropic, Ollama) — configure via environment variables or `~/.innovator/config.json`
- `runAutoPipeline()` now accepts an optional `modelRouting` parameter for per-stage model overrides
- 50+ new modules (collaboration, scoring, knowledge graph, etc.) — all additive, no existing exports removed

### Upgrade Steps

1. **Update your branch**:

   ```bash
   git pull origin main
   ```

2. **Clean install dependencies**:

   ```bash
   npm run clean:all
   npm install
   ```

3. **Rebuild all packages**:

   ```bash
   npm run build
   ```

4. **Run tests** to verify nothing is broken:

   ```bash
   npm run check
   ```

5. **Verify your environment**:

   ```bash
   npm run doctor
   ```

### Upgrading `create-innovator` Projects

If you scaffolded a project with `npx create-innovator`:

```bash
# Update the core dependency
npm install @innovator/core@latest

# Rebuild
npm run build
```

### New Environment Variables (Optional)

v0.2.0 introduces several optional environment variables. None are required — existing `.env.local` files work without changes. See [Configuration](/docs/configuration) for the full list.

| Variable            | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `OPENAI_API_KEY`    | Direct OpenAI provider                                          |
| `ANTHROPIC_API_KEY` | Direct Anthropic provider                                       |
| `OLLAMA_BASE_URL`   | Local Ollama instance                                           |
| `MCP_PORT`          | Historical MCP SSE port; removed in current v0.3.x (stdio only) |

## Breaking Changes

### v0.1.0 → v0.2.0

No breaking changes. All v0.1.0 APIs are preserved.

**Key conventions established in v0.1.0 (still apply):**

- `@innovator/core` uses subpath exports: `@innovator/core` (server) and `@innovator/core/types` (client)
- All LLM output is validated with Zod schemas
- Plugin IDs must match `^[a-z0-9-]+$`
- Custom angle IDs follow the same format
- File-based workspace persistence in `~/.innovator/workspaces/`

## Roadmap

Future versions may include:

- **Workspace storage migration** — JSON to SQLite for better concurrent access and indexed queries. A CLI migration command will be provided when this ships.
- **Environment variable changes** — No variables have been renamed or removed. If future versions deprecate variables, they will be listed here with replacements.

## Troubleshooting Upgrades

### Build failures after upgrade

```bash
# Clean everything and start fresh
npm run clean:all
rm -rf node_modules
npm install
npm run build
```

### Type errors after upgrade

If you see TypeScript errors after upgrading `@innovator/core`:

1. Check if any exported types were renamed in the [CHANGELOG](CHANGELOG.md)
2. Rebuild the core package: `npm run build --workspace=packages/core`
3. Restart your IDE's TypeScript server

### Plugin compatibility

Plugins built for one major version may not work with the next. Check the plugin's `peerDependencies` for the supported `@innovator/core` version range. If a plugin breaks after upgrade, contact the plugin author or pin to a compatible version.
