# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`LRUCache`** — Generic bounded LRU cache with optional TTL, O(1) get/set via `Map`-based eviction, and hit/miss statistics (`hits`, `misses`, `hitRate`); includes `prune()` for explicit expired-entry eviction
- **`memoize()`** — Create a memoized function wrapper backed by an `LRUCache`, with optional custom key function and `.cache` property for inspection/clearing
- **`ObjectPool`** — Generic bounded object pool for recycling frequently allocated objects to reduce GC pressure; supports factory, reset, `prewarm()`, and usage statistics
- **`withPooled()` / `withPooledAsync()`** — Convenience wrappers that acquire an object from a pool, run a function, and guarantee release (even on throw)
- **`Result<T, E>`** — Discriminated union type for functional error handling (`Ok<T> | Err<E>`) with constructors (`ok`, `err`), wrappers (`tryFn`, `tryAsync`), transformers (`mapResult`, `mapError`, `flatMap`), extractors (`unwrap`, `unwrapOr`, `unwrapOrElse`), and collectors (`collectResults`, `partitionResults`)
- **`flatMapAsync()`** — Async monadic bind for chaining async Result-returning pipeline stages
- **`mapAsync()`** — Async map over successful Result values for I/O pipeline stages
- **`Semaphore`** — Async semaphore limiting concurrent access to a shared resource with `acquire()`, `release()`, `available`, and `waiting` properties
- **`TaskRunner`** — Bounded concurrent task runner with adaptive scaling that monitors error rates and halves concurrency on high failure rates; supports `AbortSignal` cancellation and per-task timing
- **`runConcurrent()`** — Functional convenience wrapper around `TaskRunner` for one-off batch execution
- **`StringPool`** — Bounded string interning pool for memory-efficient storage of repeated strings (angle IDs, model names, event types) with FIFO eviction and estimated bytes-saved tracking
- **`intern()`** — Global convenience function for string interning via the shared global pool (pre-populated with common Innovator strings)
- **`getStringPool()` / `resetStringPool()`** — Access and reset the global shared string pool
- **`EventBus` improvements** — Predicate-based filtered subscriptions (`onFiltered()`), subject/session filtering, single-fire listeners (`once()`), event buffering with manual/auto-flush, and `listenerCount()` for observability
- **Plugin lifecycle hooks** — `onInit(ctx)`, `onDestroy()`, `healthCheck()`, and `dependencies` array for plugin initialization, cleanup, health monitoring, and dependency resolution
- **`initPlugin()` / `initAllPlugins()`** — Explicit plugin initialization with tracked state (`pending`, `initialized`, `failed`)
- **`getPluginState()`** — Query the initialization state of a registered plugin
- **`checkPluginHealth()`** — Run health checks on all plugins implementing `healthCheck()`
- **`loadPlugin(source)`** — Dynamically load and register plugins from local file paths or npm package names
- **`clearPluginsSync()`** — Synchronous plugin registry clear for test teardown (skips `onDestroy` hooks)
- **`PluginContext`** — Context object passed to `onInit` providing registry access (`getPlugin`, `listPlugins`)
- **`RetryExhaustedError`** — New error class thrown when all `withRetry()` attempts are exhausted; preserves the original error as `cause` and exposes the `attempts` count
- **`getSessionStats()`** — Compute aggregate statistics (total sessions, idea count, tag/angle frequency, date range) across all stored sessions
- **`querySessionsPaginated()`** — Paginated session search returning `{ sessions, totalCount }` for building pagination UIs
- **`extractJson()` JSON array support** — Now extracts both JSON objects (`{...}`) and JSON arrays (`[...]`) from LLM responses; whichever bracket type appears first is extracted
- **`compareSessions()` angle coverage** — Now returns `sharedAngles`, `uniqueAngles1`, and `uniqueAngles2` alongside shared themes
- **`exportSessionAsMarkdown()`** — Export a session record as a structured Markdown document with investigation, ideas, and synthesis sections
- **`exportSessionAsJson()`** — Export a session record as a formatted JSON string
- **`exportSessionAsCsv()`** — Export a session's ideas as CSV rows for spreadsheet import, with CSV formula injection protection
- **`duplicateSession()`** — Duplicate an existing session with a fresh ID and timestamps for re-analysis workflows
- **`clearHistory()`** — Delete all sessions from history (development and testing cleanup)
- **`exportToHtml()`** — Export innovation results as a self-contained HTML report
- **`exportToCsv()`** — Export innovation results as RFC 4180 CSV for spreadsheet analysis
- **`computeWeightedPriorityScore()`** — Compute priority score with custom dimension weights
- **`filterIdeasByQuadrant()`** — Filter scored ideas by one or more priority quadrants
- **`getTopByDimension()`** — Get top N ideas sorted by a single scoring dimension
- **`getIdeaSummaryStats()`** — Compute summary statistics (averages, quadrant counts, top idea) across scored ideas
- **`InnovatorError.toJSON()`** — All error classes now serialize to structured JSON for logging and API responses
- **`ERR_RETRY_EXHAUSTED`** — New error code for `RetryExhaustedError`, added to `InnovatorErrorCode` union
- **`PriorityWeights`** — New type for custom priority weight configuration
- **`IdeaSummaryStats`** — New type for scored idea summary statistics
- **`ScoringQuadrant`** — Re-exported `Quadrant` type for priority quadrant filtering
- **`validateSubject()`** — Public subject validation and sanitization function; checks for non-empty, minimum length (2 chars), maximum length (500 chars), and prompt-injection safety; returns `SubjectValidationResult` with sanitized subject or error message
- **`SubjectValidationResult`** — New type for the return value of `validateSubject()` (`{ valid, sanitized?, error? }`)
- **`memoizeAsync()`** — Create a memoized version of an async function using an LRU cache; deduplicates concurrent calls for the same cache key, caches resolved values (not Promises), and evicts on rejection
- **`computeCompletionPercent()`** — Compute overall pipeline completion percentage (0–100) from a `PipelineProgress` snapshot using weighted stage model (investigation 20%, generation 60%, synthesis 20%)
- **`PipelineProgress.completionPercent`** — New optional field automatically populated by `runAutoPipeline()` on each progress callback
- **Pipeline event bus integration** — `investigate()` and `generateForAngle()` now emit lifecycle events (`*.started`, `*.completed`, `*.failed`) on the global `EventBus` with subject, duration, and error details
- **Time series gap filling** — `getTimeSeries()` now fills gaps with zero-value data points so charts are continuous across the full date range
- **`isOk()` / `isErr()`** — Type guard functions for `Result<T, E>` enabling ergonomic type narrowing without destructuring (`isOk(result)` narrows to `Ok<T>`, `isErr(result)` narrows to `Err<E>`)
- **`AggregateInnovatorError`** — New error class for wrapping multiple errors from batch/parallel operations into a single structured error; extends `InnovatorError` with an `errors: Error[]` property
- **`fromZodError()`** — Utility to convert a `ZodError` into a structured `ValidationError` with human-readable issue paths and messages; supports optional context prefix
- **`getPluginOrThrow()`** — Retrieve a registered plugin by ID or throw `ConfigurationError` if not found; useful for required plugin dependencies
- **`hasPlugin()`** — Check whether a plugin with the given ID is registered (returns `boolean`)
- **`PluginBaseSchema`** — Zod schema for validating plugin metadata at registration time (enforces `id`, `name`, `type`, optional `version`)
- **Plugin lifecycle events** — Plugin system now emits `plugin.registered`, `plugin.unregistered`, `plugin.initialized`, and `plugin.init_failed` events on the global EventBus
- **`unregisterModel()`** — Remove a single custom model by ID from the model registry; returns `true` if removed, `false` if not found or built-in
- **`LRUCache.getOrSet()`** — Atomic check-and-populate method that returns the cached value or computes it via a factory function, eliminating the `has()`+`get()` double-lookup pattern
- **`Semaphore.shrink()`** — Dynamically reduce maximum permits for future releases; wired into `TaskRunner` adaptive scaling so concurrency actually decreases when error rates exceed the threshold
- **`Semaphore` abort support** — `acquire({ signal })` now accepts an `AbortSignal`; aborted waiters are removed from the queue and receive an `AbortError`. Already-aborted signals throw immediately without queuing
- **`Semaphore` wait-queue cap** — Constructor accepts `maxWaiters` option (default: 10,000); when the queue is full, `acquire()` throws `ConfigurationError` instead of growing unboundedly — helps detect permit leaks in long-running processes
- **`EventBus` listener cap** — `setMaxListeners(n)` sets a per-event-type listener threshold (default: 10); exceeding it emits a warning to detect listener leaks. Set to 0 to disable. Custom warning handler via `onWarning(handler)`
- **`EventBus` buffer cap** — `setMaxBufferSize(n)` caps the event buffer (default: 10,000); when full, the oldest events are dropped to make room for new ones, preventing unbounded memory growth
- **`EventBus` error isolation** — `deliverEvent()` now uses `Promise.allSettled()` so a throwing listener does not prevent other listeners from receiving the event
- **`EventBus` observability** — New `listenerCount(type?)` method returns the count for a specific event type or total across all types; `maxListeners` and `maxBufferSize` readable properties
- **`ObjectPool` double-release guard** — `release()` now tracks checked-out objects via a `Set<T>`; calling `release()` twice on the same object is a safe no-op instead of corrupting the pool
- **`ObjectPool` safe reset-on-discard** — Objects are always reset (via the `reset` callback) even when the pool is full and the object is discarded, so callers holding external references never observe stale state
- **`ObjectPool` maxSize validation** — Constructor validates `maxSize ≥ 1` and finite; throws `ValidationError` on invalid values
- **In-memory storage bounded retention** — `InMemoryStorageProvider` caps usage records (`MAX_USAGE_RECORDS`) and analytics events (`MAX_EVENTS`) with FIFO eviction; uses `structuredClone()` for defensive copies on all reads and writes
- **`CircuitBreaker`** — Per-provider circuit breaker with closed → open → half-open state machine, sliding-window failure tracking, and configurable thresholds
- **`executeWithFailover()`** — Automatic failover across a provider chain with circuit-breaker integration
- **`CostGuardrailManager`** — Budget enforcement at per-request, per-session, and monthly granularity
- **`forecastPipelineCost()`** — Estimate total pipeline cost before execution based on subject, angles, and model
- **`getProviderHealthDashboard()`** — Aggregate health view across all configured providers
- **Prometheus metrics** — `recordPipelineExecution()`, `recordLLMLatency()`, `setActivePipelines()`, `recordIdeasGenerated()`, `renderPrometheusMetrics()`, `getAllMetrics()`, `clearMetrics()` with serialized-label indexing for O(1) lookups
- **Health check factories** — `createProviderHealthCheck()` and `createStorageHealthCheck()` with per-check timeouts and default core health fallback
- **Span-based instrumentation** — `beginStage()` / `endStage()` with bounded active-stage registry, stale-stage eviction, span events, and Prometheus metric emission
- **Privacy input validation** — Noise parameters validated; noisy scores clamped to `[0, 100]` to prevent drift
- **Feedback robustness** — `loadAllFeedback()` skips corrupt files; `buildFeedbackHint()` generates prompt guidance from low-rated feedback patterns
- **Copilot client hardening** — Safe disconnect handling, abort support, timeout handling, empty-response parse error, and `extractJson()` caching with `extractJsonCacheStats()`
- **`extractJson()` array support** — Now extracts JSON arrays (`[...]`) in addition to objects; uses balanced-brace parsing and strips trailing commas
- **Bounded memory caps** — Per-user signals, outcome records, and per-model performance records in the memory/learning module are all bounded with FIFO eviction
- **Validation hardening** — LLM validators use `sanitizeLlmOutput()` + `extractJson()` for safe JSON parsing; abort support threaded through validator and batch flows; capped arrays and strings in schemas

### Changed

- **Typed error migration** — Replaced ~250 raw `throw new Error()` calls with typed `InnovatorError` subclasses (`ValidationError`, `LlmParseError`, `AbortError`, `PipelineError`, `ConfigurationError`) across 149 core source files; all modules now use the structured error hierarchy for consistent error handling and programmatic discrimination
- **Storage driver type safety** — Replaced `any` types with proper interfaces (`Neo4jSession`, `Neo4jRecord`, `PgPool`, etc.) in `graph-database.ts`, `postgresql.ts`, and `sqlite.ts`; removed all `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments in storage drivers
- **`setStorage()` validation** — Now validates the provider object at registration time; `init()` and `close()` are idempotent
- **`EventBus.emit()` buffer overflow** — When buffering is enabled and the buffer is full, oldest events are dropped with a warning instead of growing unboundedly
- **`EventBus.deliverEvent()`** — Switched from sequential listener invocation to `Promise.allSettled()` for error isolation between listeners
- **Metrics label identity** — Metric values now use serialized-label indexing (`serializeLabels()`) for O(1) lookup; label keys are sorted for stable identity
- **Health check timeouts** — Individual health checks now have per-check timeouts; timed-out checks return `"unhealthy"` instead of hanging
- **`withRetry()` input validation** — Now validates that `maxAttempts ≥ 1`, `initialDelayMs ≥ 0`, `backoffMultiplier ≥ 1`, and `maxDelayMs ≥ 0` are finite numbers; throws immediately on invalid options
- **`withRetry()` error type** — Now throws `RetryExhaustedError` (instead of re-throwing the last error) when all attempts are exhausted, providing structured access to `cause` and `attempts`
- **`RetryExhaustedError`** — Now extends `InnovatorError` (was plain `Error`), inheriting `code`, `toJSON()`, and `isInnovatorError()` compatibility
- **`unregisterPlugin()`** — Now async (returns `Promise<boolean>`), calls `onDestroy` lifecycle hook before removal
- **`clearPlugins()`** — Now async (returns `Promise<void>`), calls `onDestroy` on each plugin during teardown
- **Plugin System** — Plugin registration now validates `dependencies` array, throwing on unmet dependencies; tracks per-plugin initialization state
- **`investigate()` subject validation** — Now validates and sanitizes the subject via `validateSubject()` before making the LLM call; throws `ValidationError` on invalid input instead of sending bad data to the LLM
- **`generateForAngle()` subject validation** — Now validates and sanitizes the subject via `validateSubject()` before prompt construction
- **`runAutoPipeline()` subject validation** — Now validates subject at pipeline entry point; throws `ValidationError` immediately on invalid input before any LLM calls
- **`sanitizeLlmOutput()` in pipeline** — `investigate()` and `generateForAngle()` now apply `sanitizeLlmOutput()` to LLM responses before JSON parsing, preventing multi-hop prompt injection
- **Pipeline event deduplication** — `runAutoPipeline()` no longer emits redundant `investigation.started`/`investigation.completed`/`investigation.failed` events since `investigate()` now emits them directly
- **Refinement loop quality scoring** — `generateRefinement()` now uses structural quality scoring (`computeStructuralQuality()`) instead of raw text length comparison; checks for presence of implementation steps, acceptance criteria, risks, dependencies, and other structured fields
- **Refinement loop UUID generation** — Replaced `crypto.randomUUID()` (browser API) with `node:crypto` `randomUUID()` for consistent Node.js compatibility
- **Activity heatmap key encoding** — Changed heatmap cell key separator from `:` to null byte (`\0`) to prevent ambiguity when axis labels contain colons
- **Plugin registration validation** — `registerPlugin()` now validates plugin metadata via `PluginBaseSchema` (Zod); invalid plugins throw `ValidationError` immediately
- **Validation parallelization** — `validateIdea()` now runs validators in parallel via `Promise.all` instead of sequentially, improving performance for ideas with multiple validators; error messages are preserved in fallback validation checks instead of being swallowed
- **Node.js version alignment** — Aligned to Node 22 across Dockerfile, devcontainer, action.yml, CI matrix, `package.json` engines, and `doctor.mjs`
- **Incremental TypeScript builds** — Enabled `incremental` with `tsBuildInfoFile` in `tsconfig.base.json`, `packages/core`, and `apps/cli` for faster rebuild times
- **Pipeline sanitized subject** — `pipeline.ts` now correctly uses the sanitized subject for all downstream operations (was unused after validation)

### Fixed

- **Portfolio optimizer validation** — `optimizePortfolio()` now validates weight array length against matrix dimensions and checks for non-empty inputs
- **Prompt Studio validation** — `recordPromptExecution()` now validates required fields before persisting execution records
- **Marketplace tests** — Fixed test setup and assertion mismatches across marketplace module test suites
- **ESLint compliance** — Removed all `@ts-nocheck` directives and resolved remaining lint warnings across core modules
- **Cache duplicate JSDoc** — Removed duplicate JSDoc comment block on `memoize()` in `cache/index.ts`
- **`compareModels()` no-op fix** — Fixed no-op `resolvedAngleId` variable in `compareModels()` that was assigned but never used
- **Codebase analysis test stability** — Fixed flaky `codebase-analysis` test timeout under parallel load
- **Privacy noise score clamping** — Noisy scores are now clamped to `[0, 100]` to prevent out-of-range drift after Laplace noise addition
- **Feedback file corruption** — `loadAllFeedback()` now skips corrupt JSON files instead of throwing, preventing a single bad file from blocking feedback aggregation
- **`extractJson()` trailing commas** — Now strips trailing commas before closing braces/brackets to handle common LLM output formatting issues
- **Copilot client disconnect** — Safe disconnect handling suppresses expected close errors during client shutdown
- **Empty LLM response** — `extractJson()` now throws `LlmParseError` with a descriptive message when the LLM returns an empty response, instead of an opaque parse error
- **Predictive scoring training cap** — Training data store is bounded by `MAX_TRAINING_DATA`; oldest entries evicted automatically
- **Context manager budget overflow** — Effective token budget is clamped to model limit; compression history is capped to prevent unbounded growth
- **Token manager warnings cap** — Warning list bounded by `MAX_WARNINGS` to prevent memory growth in long pipelines
- **Deduplication abort support** — All deduplication functions now respect `AbortSignal` for cancellation

### Testing

- **Hardening test suite** — 261-line `hardening-features.test.ts` covering Semaphore abort/queue-cap, EventBus listener-cap/buffer-cap/error-isolation, ObjectPool double-release guard, and Result non-Error normalization
- **Resilience test suite** — 410-line `resilience.test.ts` covering circuit breaker state machine, failover chains, cost guardrails, provider health dashboard, and storage bounded retention

- **Prompt Studio test suite** — 28 tests covering CRUD operations, versioning, analytics, template interpolation, and input validation
- **Portfolio optimizer test suite** — 12 tests covering asset conversion, correlation matrix, risk/return metrics, Monte Carlo simulation, and portfolio optimization
- **Plugin system test suite** — 14 new tests covering `getPluginOrThrow()`, `hasPlugin()`, schema validation, lifecycle events, and dependency resolution
- **Result type test suite** — 9 new tests covering `isOk()`, `isErr()`, `flatMapAsync()`, and `mapAsync()`
- **Error handling test suite** — 11 new tests covering `AggregateInnovatorError`, `fromZodError()`, and error serialization
- **Validation test suite** — 14 new `validateSubject()` tests covering all validation branches
- **Cache test suite** — Tests for `getOrSet()` atomic check-and-populate
- **Concurrency test suite** — Tests for `Semaphore.shrink()` and adaptive TaskRunner scaling
- **Model registry test suite** — Tests for `unregisterModel()` single-model removal
- **Removed duplicate tests** — Removed 4 duplicate root-level test files (`rbac`, `api-playground`, `portfolio-optimizer`, `cross-org-benchmark`) where module-local tests are supersets

### Documentation

- **API Reference** — Added LRU Cache section with `LRUCache` class API, `CacheStats` type, and `memoize()` utility
- **API Reference** — Added Object Pool section with `ObjectPool` class API, `PoolStats` type, `withPooled()`/`withPooledAsync()` wrappers
- **API Reference** — Added Result Type section with constructors, wrappers, transformers, extractors, and collectors
- **API Reference** — Added Concurrency section with `Semaphore`, `TaskRunner` (adaptive scaling), `runConcurrent()`, `BatchResult`/`TaskResult` types
- **API Reference** — Added String Interning section with `StringPool` class, global pool, and `intern()` convenience function
- **API Reference** — Added Event Bus section with `EventBus` class, filtered subscriptions, event buffering, and global bus
- **API Reference** — Expanded Plugin System section with lifecycle hooks (`onInit`/`onDestroy`/`healthCheck`/`dependencies`), `PluginContext`, dynamic loading, health checks, and state management
- **API Reference** — Added Session Export Helpers section (`exportSessionAsMarkdown`, `exportSessionAsJson`, `exportSessionAsCsv`)
- **API Reference** — Added `duplicateSession()` and `clearHistory()` documentation
- **API Reference** — Added `InnovatorError.toJSON()` serialization documentation with example
- **API Reference** — Added `RetryExhaustedError` to error hierarchy diagram and error table with `ERR_RETRY_EXHAUSTED` code
- **API Reference** — Fixed `RetryExhaustedError` to show correct base class (`InnovatorError`, not `Error`)
- **API Reference** — Added comprehensive Error Handling section with error hierarchy diagram, all error codes, and properties
- **API Reference** — Added `withTimeout()` documentation for standardized LLM timeout handling
- **API Reference** — Expanded Scoring section with priority scoring, quadrant analysis, summary stats, and configurable scoring engine
- **API Reference** — Expanded Export section with all 10 built-in exporters (HTML, CSV, PowerPoint, Google Slides, etc.) and integration adapters
- **API Reference** — Added Validation section with built-in validators, custom validator registry, and comprehensive validation
- **API Reference** — Added Futures Market section documenting LMSR prediction market engine with trading and analytics
- **API Reference** — Expanded Zod Schemas table with 14 new schema entries (scoring, validation, futures market)
- **API Reference** — Added `validateSubject()` section with validation rules, `SubjectValidationResult` type, and usage examples
- **API Reference** — Added `computeCompletionPercent()` section with stage weight breakdown and progress bar example
- **API Reference** — Updated `investigate()` with throws table (`ValidationError`, `LlmParseError`, `RetryExhaustedError`), event bus integration, and sanitization details
- **API Reference** — Updated `generateForAngle()` with throws table and event bus lifecycle events
- **API Reference** — Updated `runAutoPipeline()` with `ValidationError` throws, `completionPercent` progress tracking, and `PipelineProgress.completionPercent` field
- **API Reference** — Updated `PipelineProgress` type with `completionPercent` and `durationMs` fields
- **API Reference** — Added `AggregateInnovatorError` and `fromZodError()` to Error Handling section with examples and Mermaid diagram update
- **API Reference** — Added `isOk()` / `isErr()` type guards to Result Type section
- **API Reference** — Added `getPluginOrThrow()`, `hasPlugin()`, Schema Validation, and Plugin Lifecycle Events sections to Plugin System
- **API Reference** — Added `LRUCache.getOrSet()` method to cache methods table
- **API Reference** — Added `Semaphore.shrink()` and methods table to Concurrency section
- **API Reference** — Added `unregisterModel()` to Model Registry section
- **API Reference** — Added Resilience section with `CircuitBreaker`, `executeWithFailover()`, `CostGuardrailManager`, `forecastPipelineCost()`, and `getProviderHealthDashboard()`
- **API Reference** — Added Observability section with Prometheus metrics, health-check factories, and span-based instrumentation
- **API Reference** — Added Storage section with provider interface, `InMemoryStorageProvider`, and bounded retention documentation
- **API Reference** — Updated Semaphore docs with abort support (`acquire({ signal })`), wait-queue cap (`maxWaiters`), constructor options table, and abort usage example
- **API Reference** — Updated EventBus docs with listener cap, buffer cap, error isolation, `setMaxListeners()`, `setMaxBufferSize()`, `onWarning()`, `listenerCount()`, and full methods table
- **API Reference** — Updated Object Pool docs with double-release guard, safe reset-on-discard, and `maxSize` validation
- **Changelog** — Updated with all memory safety caps, event bus hardening, semaphore abort support, resilience primitives, observability, storage hardening, and correctness fixes from recent commits

## [0.3.0] — 2026-05-14

### Added

#### Moonshot Modules — Core Engine ✅

- ✅ **Adversarial Idea Gauntlet** (`packages/core/src/gauntlet/`) — Multi-agent adversarial stress-testing with 5 built-in adversary personas (Competitor, Regulator, Skeptic, Economist, Engineer), weighted Survivability Index (0–100), optional Strengthen mode, and Markdown report generation
- ✅ **Innovation Provenance Ledger** (`packages/core/src/provenance-ledger/`) — Tamper-evident append-only audit trail with SHA-256 hash chaining, GDPR Art. 15 export and Art. 17 erasure support, human decision recording, and chain verification
- ✅ **Temporal Innovation Memory** (`packages/core/src/temporal-memory/`) — Persistent temporal knowledge graph tracking concept evolution, idea genealogy, and outcome causality across sessions with recurrence detection, NL queries, innovation velocity metrics, and configurable graph pruning
- ✅ **Sentinel: Always-On Innovation Agent** (`packages/core/src/sentinel/`) — Signal monitoring agent that collects RSS/Atom feeds, scores relevance via LLM, generates opportunities through the innovation pipeline, and produces daily briefs with cost budget enforcement
- ✅ **Idea Genome Sequencer** (`packages/core/src/genome-sequencer/`) — Decomposes ideas into 7 genome traits (problem-space, solution-mechanism, value-proposition, target-audience, enabling-technology, risk-profile, competitive-differentiation) with Jaccard similarity search and LLM-powered recombination
- ✅ **Federation DP** (`packages/core/src/federation-dp/`) — Differential privacy layer for cross-organization pattern sharing using Laplace mechanism with privacy budget tracking, pattern recommendation engine, and anti-pattern detection

#### Web App UX ✅

- ✅ **Global Navigation** — Collapsible sidebar linking all 21 pages, grouped into Create/Explore/Analyze/Tools categories, with mobile hamburger menu and active-state highlighting
- ✅ **Dark Mode Toggle** — Light/dark/system theme switcher persisted to localStorage with class-based Tailwind `dark:` integration via `@custom-variant`
- ✅ **Session Persistence** — Auto-saves innovation results to localStorage with recent sessions list on home page, restore capability, and 4MB size guard with quota recovery
- ✅ **Results Action Bar** — Sticky export toolbar with Copy Markdown, Copy JSON, Download .md, and Download .json
- ✅ **Copy-to-Clipboard** — Reusable `CopyButton` component wired into investigation summary, synthesis recommendation, and individual idea cards
- ✅ **Elapsed Timer** — Progress indication with elapsed time and estimate comparison for manual investigation/generation loading states
- ✅ **Onboarding Wizard** — First-run experience showing role selection, suggested subjects, and preset angles for new visitors
- ✅ **Improved Error Messages** — Context-aware error parsing for rate limits (429), timeouts, auth failures, model unavailability, and network errors

#### Documentation ✅

- ✅ **10 Architecture Decision Records** — ADR-0013 (Bounded Concurrency), ADR-0014 (Blackboard Swarm), ADR-0015 (Atomic File Persistence), ADR-0016 (LLM-as-Judge), ADR-0017 (Hash-Chained Ledger), ADR-0018 (Differential Privacy Federation), ADR-0019 (Temporal Knowledge Graph), ADR-0020 (Genetic Algorithm Evolution), ADR-0021 (TF-IDF Semantic Search), ADR-0022 (Event-Driven Webhooks)
- ✅ **Root AGENTS.md** — AI-assisted development guide covering monorepo conventions, module patterns, LLM call patterns, naming conventions, testing conventions
- ✅ **Updated API Reference** — Full API documentation for all 6 moonshot modules with function signatures, parameter tables, config options, and code examples
- ✅ **Updated Developer Guide** — 4 new recipe sections: Gauntlet stress-testing, Provenance Ledger usage, Temporal Memory building, Genome Sequencing

#### Developer Experience ✅

- ✅ **Shared Test Factories** (`packages/core/src/__test-utils__/factories.ts`) — Typed builders for `Investigation`, `AngleResult`, `Synthesis`, `InnovationIdea`, `Attack`, `SessionIngestion`, and `PipelineProgress`
- ✅ **Improved PR Template** — What/Why/How sections with expanded checklist
- ✅ **README Quick Start** — Added `.env.local` copy step, Running Tests section with watch mode and single-file docs

### Changed

- **Coverage thresholds** raised from 35% to 50% for lines/functions/branches in `vitest.config.ts`
- **Pre-commit speed** — ESLint now uses `--cache` flag in lint-staged for faster commits
- **Doctor script** now checks npm version (≥ 10) alongside Node.js (≥ 20)
- **CI audit gate** uses `--omit=dev` to exclude dev-only transitive vulnerabilities with warning annotation fallback
- **Architecture docs** updated with Moonshot Modules section including Mermaid dependency diagram and key functions table

### Fixed

- **npm vulnerabilities** — `npm audit fix` resolved 6 high-severity CVEs (babel, copilot CLI, fast-uri); 20 remaining are Next.js transitive deps requiring framework upgrade
- **Gauntlet input validation** — `runGauntlet()` now validates idea title and description before LLM calls
- **Gauntlet scoring** — `computeSurvivabilityIndex()` handles NaN, negative, and out-of-range severity values
- **Gauntlet error logging** — All per-adversary catch blocks now log with `console.warn("[gauntlet]")`
- **Genome sequencer validation** — `sequenceIdea()` validates idea fields; `recombine()` guards against empty traits
- **Provenance ledger resilience** — `loadLedger()` recovers from corrupted JSON by backing up and starting fresh
- **Temporal memory validation** — `ingestSession()` validates sessionId, subject, and timestamp
- **Temporal memory pruning** — New `pruneGraph()` function prevents unbounded graph growth with configurable retention, max nodes/edges, and edge strength thresholds
- **Sentinel ESM fix** — Replaced `require("node:fs")` with proper ESM `readdirSync` import in `loadBriefs()`
- **Sentinel validation** — `runSentinel()` validates config (sources, topics, threshold range, budget)
- **Sentinel cost budget** — Added per-run cost tracking with configurable `dailyCostBudget` enforcement
- **Sentinel error logging** — All catch blocks now log with `console.warn("[sentinel]")`
- **Sentinel RSS robustness** — Feed parser guards against empty/binary/oversized content with 50-item cap
- **Federation DP safety** — `laplaceMechanism()` throws on epsilon ≤ 0 and negative sensitivity; `spendBudget()` rejects negative epsilon
- **Federation DP precision** — Added `dpRound()` helper for consistent floating-point rounding
- **Dark mode toggle** — ThemeToggle now adds/removes `.dark` class on `<html>` with `@custom-variant dark` for proper Tailwind `dark:` integration
- **Session storage quota** — Added 4MB size guard with auto-trim and quota-exceeded recovery
- **Web font** — `globals.css` body font-family now uses the Geist CSS variable instead of hardcoded Arial
- **Error boundary** — Added `role="alert"` to `error.tsx` for screen reader accessibility
- **Character count** — Subject input now shows character count with amber warning at 450+

### Security

- Resolved `@babel/plugin-transform-modules-systemjs` arbitrary code execution (GHSA-fv7c-fp4j-7gwp)
- Resolved `@github/copilot` nested bare repository command injection (GHSA-9ccr-r5hg-74gf)
- Resolved `fast-uri` path traversal via percent-encoded segments (GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc)
- Added `.eslintcache` to `.gitignore` to prevent cached lint data from being committed

### Upgrade Notes

- **Coverage thresholds increased** — CI now enforces 50% minimum for lines, functions, and branches (previously 35%). Run `npm run test:coverage` locally before opening a PR to verify your changes meet the threshold.
- **Node.js requirement** — The `doctor` script now validates npm ≥ 10 in addition to Node.js ≥ 20. Run `npm run doctor` to check your environment.
- **ESLint cache** — The lint-staged configuration now uses `--cache` for faster pre-commit checks. If you encounter stale lint results after config changes, delete `.eslintcache` and re-run `npm run lint`.
- **Docker Compose** — The `POSTGRES_PASSWORD` environment variable is now **required** (previously had a default). Set it in your `.env` file or export it before running `docker compose up`.

## [0.2.0] — 2025-05-10

### Added

> **Note:** This release includes both shipped features and infrastructure for future capabilities.
> Items marked with ✅ are fully implemented and usable. Items marked with 🔧 are scaffolded
> with APIs/schemas in place but may require additional configuration or LLM access to function fully.

#### Packages & Integrations ✅

- ✅ **MCP Server** — Model Context Protocol server (`packages/mcp-server/`) exposing `investigate`, `innovate`, and `auto` tools via stdio and SSE transports for Claude Desktop, Cursor, VS Code, and other MCP clients
- ✅ **Chat Bot** — Chat platform bot (`packages/bot/`) with Slack, Discord, and Teams adapters
- ✅ **Copilot Extensions** — Agent manifest and handler for GitHub Copilot Extensions integration
- ✅ **Create Innovator** — `npx create-innovator` scaffolding package for quick project setup
- ✅ **GitHub Action** — Automated innovation action for CI/CD workflows

#### LLM & Providers ✅

- ✅ **Alternative LLM Providers** — Direct OpenAI, Anthropic, and Ollama provider support (non-Copilot usage)
- ✅ **Cost Tracking** — Budget management and LLM cost tracking
- ✅ **Model Benchmarking** — Compare LLM model performance
- ✅ **LLM Output Quality Gate** — Automated quality checks on LLM responses
- ✅ **Prompt Replay & A/B Testing** — Replay and compare prompt variations
- ✅ **Investigation Confidence Scoring** — Confidence metrics for investigation results
- ✅ **Observatory** — API keys management and prompt observatory endpoints

#### Innovation Engine ✅

- ✅ **Comparative Analysis Pipeline** — Side-by-side comparison of multiple subjects
- ✅ **Structured Debate Engine** — Multi-perspective debate on innovation ideas
- ✅ **Genetic-Algorithm Evolution** — Evolve ideas through selection, crossover, and mutation
- ✅ **Idea Stress Testing** — Stress-test ideas against adversarial scenarios
- ✅ **Deep Research Agent** — Extended research agent for in-depth investigation
- ✅ **Hypothesis-Driven Innovation** — Frame innovations as testable hypotheses
- ✅ **Adversarial Red Team Analysis** — Challenge ideas from adversarial perspectives
- ✅ **Angle Chaining** — Chain multiple angles sequentially
- ✅ **Investigation Depth Tiers** — Configure investigation depth levels
- ✅ **Cross-Session Serendipity** — Discover unexpected connections across investigations
- ✅ **Innovation Diff Engine** — Compare investigation snapshots
- ✅ **Innovation Sprint Mode** — Time-boxed innovation sessions
- ✅ **Natural Language Pipeline Builder** — Describe pipelines in plain English
- ✅ **Stakeholder & Scenario Simulation** — Simulate stakeholder reactions and scenarios
- ✅ **Impact Simulator** — Simulate potential impact of ideas

#### Data & Knowledge 🔧

- 🔧 **RAG Knowledge Grounding** — Retrieval-augmented generation for grounded responses
- 🔧 **Knowledge Graph** — Persistent graph of concepts and relationships
- 🔧 **Memory & Learning Module** — Persistent memory across sessions
- 🔧 **Idea Provenance Tracking** — Full lineage tracking for ideas
- 🔧 **Market Signal Integration** — Live market data integration
- 🔧 **Competitive Intelligence** — Analyze competitive landscape

#### Collaboration & Management 🔧

- 🔧 **Collaborative Sessions** — `/api/collaborate` endpoint with room codes, voting, commenting, and idea merging
- 🔧 **Portfolio Lifecycle Management** — Track and manage idea portfolios
- 🔧 **Idea Validation Engine** — Validate ideas against criteria
- 🔧 **Idea Deduplication & Clustering** — Detect and merge duplicate ideas
- 🔧 **Idea Dependency Graph** — Analyze dependencies between ideas
- 🔧 **Idea Feedback System** — Collect and process feedback on ideas
- 🔧 **Idea Fitness Tracker** — Track and score idea fitness over time
- 🔧 **Shareable Investigation Links** — Share investigations via URL

#### Output & Export ✅

- ✅ **Artifact Generation** — `/api/artifacts` endpoint for generating PRDs, user stories, tech specs from ideas
- ✅ **Executive Decision Packets** — Generate decision-ready documents from innovations
- ✅ **Innovation Playbook Generator** — Reusable playbook creation from successful innovation patterns
- ✅ **Audience-Adaptive Output** — Transform outputs for different audiences
- ✅ **Multi-Language Support** — i18n for multiple languages

#### Platform & UX 🔧

- 🔧 **PWA Support** — Service worker and offline indicator for the web app
- 🔧 **Embeddable Widget** — Widget SDK and `/api/widget` endpoint for embedding Innovator in external sites
- 🔧 **Pipeline API** — Natural language pipeline description endpoint with SSE streaming (`/api/pipeline`)
- 🔧 **Tracker Dashboard** — `/api/tracker` endpoint and dashboard for tracking idea fitness
- 🔧 **Offline Local-First Mode** — Work offline with local data
- 🔧 **Compliance & IP Guard Rails** — Screen ideas for compliance issues
- 🔧 **Innovation Gamification** — Gamification engine for innovation activities
- 🔧 **Event Bus & Webhooks** — Event-driven architecture with webhook delivery
- 🔧 **Industry Vertical Packs** — Pre-configured templates for specific industries
- 🔧 **Web App** — Explore examples, idea workshop with drag-and-drop, priority matrix, idea map, OpenGraph metadata
- 🔧 **CLI** — Interactive refine, benchmark, provider config, depth/language/chain/feedback/offline commands, serendipitous connections, diff, and pipeline runner commands

### Changed

- Renamed `cosineSimilarity` export to avoid naming collisions
- Exported IdeaMap utility functions for testability
- Added client-safe subpath export for core types

### Fixed

- JSON parse error messages now include descriptive details in API routes
- Resolved unused variable lint warnings in core package

## [0.1.0] — 2025-05-01

### Added

- Initial release of Innovator — AI-powered innovation engine
- Subject investigation via GitHub Copilot SDK
- 8 innovation angles: SCAMPER, First Principles, Cross-Domain Analogy, Constraint Injection, Problem Inversion, Role-Based Perspectives, What-If Scenarios, Trend Collision
- Auto mode pipeline with synthesis
- Next.js web application with investigation → angle selection → results flow
- CLI tool with progress indicators
- Shared `@innovator/core` package with types, prompts, and pipeline logic
- Monorepo setup with npm workspaces
- CI pipeline with lint, typecheck, build, and test
- Docusaurus documentation website
