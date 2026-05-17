# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`RetryExhaustedError`** — New error class thrown when all `withRetry()` attempts are exhausted; preserves the original error as `cause` and exposes the `attempts` count
- **`getSessionStats()`** — Compute aggregate statistics (total sessions, idea count, tag/angle frequency, date range) across all stored sessions
- **`querySessionsPaginated()`** — Paginated session search returning `{ sessions, totalCount }` for building pagination UIs
- **`extractJson()` JSON array support** — Now extracts both JSON objects (`{...}`) and JSON arrays (`[...]`) from LLM responses; whichever bracket type appears first is extracted
- **`compareSessions()` angle coverage** — Now returns `sharedAngles`, `uniqueAngles1`, and `uniqueAngles2` alongside shared themes

### Changed

- **`withRetry()` input validation** — Now validates that `maxAttempts ≥ 1`, `initialDelayMs ≥ 0`, `backoffMultiplier ≥ 1`, and `maxDelayMs ≥ 0` are finite numbers; throws immediately on invalid options
- **`withRetry()` error type** — Now throws `RetryExhaustedError` (instead of re-throwing the last error) when all attempts are exhausted, providing structured access to `cause` and `attempts`

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
