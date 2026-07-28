# Architecture and Code Quality Audit

Phase 1 audit and Phase 2 implementation status. Phase 2 was explicitly approved and implemented without commits.

## 1. Summary

- Overall health is **fair**: workspace dependency direction is clean and the repository has strong validation, error, retry, cancellation, and atomic-persistence idioms, but technical debt is concentrated in a few composition roots and duplicated orchestration paths.
- There are **no package-level dependency cycles**; there are eight confirmed value-level cycles inside `@innovator/core`, caused mainly by leaf modules importing their own feature barrel.
- The single highest-leverage structural change is a **typed structured-generation seam plus an injectable text-generator boundary**: 135 production core files repeat the `generateText` + `withRetry` + `extractJson` pattern, while the published provider abstraction is bypassed by the main pipeline.
- The test suite is large but uneven: the last full gate passed **639 files / 11,590 tests** at **72.19% statements, 58.53% branches, 74.25% functions, and 73.01% lines**; package line coverage is approximately core 84.7%, web 39.9%, CLI 8.2%, MCP 56.6%, SDK 88.3%, and VS Code 0%.
- Two P0 correctness defects exist in the GitHub Action and custom-angle persistence. They are documented here, but the requested behavior-preserving Phase 2 must defer them to separate bug-fix work unless the user explicitly changes scope.

### Existing conventions to preserve

| Area                   | Convention already in use                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Workspace architecture | Star-shaped dependency graph: adapters depend on `@innovator/core`; core does not import adapters.                                  |
| Domain boundaries      | Zod schemas define trust boundaries and TypeScript types are inferred from schemas.                                                 |
| LLM calls              | `withRetry`, `sanitizeLlmOutput`, `wrapUserInput`, typed errors, and `AbortSignal` propagation.                                     |
| Persistence            | File-backed modules use temp-write + rename atomic writes and tests use temporary directories.                                      |
| Web                    | Client components import `@innovator/core/types`; server routes call core directly; `appReducer` owns the primary UI state machine. |
| Testing                | Vitest from the repository root, jsdom for web, direct `Request` invocation for route tests, SDK mocking for LLM-dependent tests.   |
| Quality gates          | `npm run test:ci` runs formatting, lint, all-workspace type checks, production audit, builds, docs, tests, and coverage.            |
| Dependency injection   | Focused interfaces such as `BotPlatform` are useful; there is no DI container and none should be introduced.                        |

### Largest production source files reviewed

| Lines | File                                                  | Classification                                                                 |
| ----: | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 8,915 | `packages/core/src/index.ts`                          | Public compatibility barrel; change hotspot, not 8,915 lines of behavior.      |
| 4,702 | `apps/cli/src/program.ts`                             | Command registration and orchestration god module.                             |
| 2,518 | `packages/core/src/biomimicry/taxonomy.ts`            | Curated declarative data; size alone is not a refactor reason.                 |
| 1,435 | `packages/core/src/marketplace/index.ts`              | Registry, persistence, installation, reviews, seeding, and community features. |
| 1,390 | `packages/core/src/api-playground/index.ts`           | Mostly declarative endpoint/example catalog plus rendering helpers.            |
| 1,270 | `packages/core/src/codebase-analysis/index.ts`        | Schemas, discovery, analysis, reporting, PR generation, and deep analysis.     |
| 1,121 | `packages/core/src/api-gateway/index.ts`              | Keys, usage, webhooks, OpenAPI, tenants, and portal data.                      |
| 1,099 | `apps/web/src/app/api/verticals/route.ts`             | Duplicated domain model, seed data, evaluation, registry, and HTTP adapter.    |
| 1,013 | `packages/core/src/provenance-visualization/index.ts` | Chain building, graph transforms, queries, metrics, and four exporters.        |
|   988 | `packages/core/src/ab-testing/index.ts`               | Test lifecycle, storage, execution, statistics, power analysis, and reporting. |

## 2. Findings table

| ID     | Location                                                                                                                                                                                                                   | Category                                  | Severity | Cost                                                                                                                                                                                                                                                                                                           | Est. size | Behavior risk |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- |
| AUD-01 | `action/action.yml:47-49,59-62,71-80,141-147`; `.github/workflows/test-action.yml:61-74`                                                                                                                                   | Correctness / packaging                   | **P0**   | The composite Action installs private unpublished packages, suppresses CLI failure with `\|\| true`, omits the declared output mapping, and uses a fixed multiline delimiter. Clean consumers can receive npm errors as successful reports or corrupted outputs.                                               | M         | low           |
| AUD-02 | `packages/core/src/innovation/custom-angles.ts:21-25,38-47,61-68`                                                                                                                                                          | Correctness / persistence                 | **P0**   | Invalid JSON or one invalid record is converted to an incomplete array that later mutations overwrite. A malformed or legacy entry can cause the next add/remove/update to permanently delete recoverable user data.                                                                                           | S         | low           |
| AUD-03 | `vitest.config.ts:21-42`; `apps/web/src/app/api/__tests__/investigate.test.ts:10-42`; `apps/web/src/app/api/__tests__/health.test.ts:3-19`; `.github/workflows/ci.yml:64-102`; `apps/web/e2e/innovation-flow.spec.ts:5-57` | Test architecture                         | **P1**   | Global thresholds are carried by core while adapters remain weakly covered, at least 13 route tests execute copied stand-ins instead of production handlers, and the single conditional Playwright flow is not run in CI. Route, CLI, VSIX, and MCP refactors can regress while the global gate remains green. | M         | none          |
| AUD-04 | `packages/core/src/providers/index.ts:17-75,471-567`; `packages/core/src/innovation/investigate.ts:1-55`; `generate.ts:1-101`; `pipeline.ts:1-280`; `apps/cli/src/program.ts:2214-2287`                                    | Boundary / dependency direction           | **P1**   | Provider selection is public and persisted, but the main innovation path directly calls the Copilot client. Choosing Ollama/OpenAI/Anthropic can report success while core behavior remains on Copilot, and the provider interface supplies no real substitution seam.                                         | M         | high          |
| AUD-05 | `packages/core/src/providers/index.ts:420-466`; `packages/create-innovator/src/index.ts:57-83,142-156,232-234`; `packages/core/src/innovation-as-code/index.ts:15-35,125-156`; `action/action.yml:82-100`                  | Contract drift                            | **P1**   | Provider config, project IaC config, scaffold output, CLI initialization, and Action parsing use incompatible shapes under similar names. Generated projects can contain ignored or schema-invalid configuration, and each consumer must maintain its own parser.                                              | M         | low           |
| AUD-06 | Representative: `innovation/investigate.ts:36-58`; `innovation/generate.ts:82-104`; `innovation/pipeline.ts:248-278`; `scoring/index.ts:132-156`                                                                           | Shotgun surgery / duplication             | **P1**   | Core contains 222 `extractJson` calls, 228 `withRetry` calls, and 135 production files repeating generation, extraction, parsing, retry, and schema validation. Any retry, telemetry, sanitization, or parsing policy change requires broad edits and has already drifted historically.                        | L         | low           |
| AUD-07 | `packages/core/src/innovation/pipeline.ts:74-315`                                                                                                                                                                          | Responsibility / cohesion                 | **P1**   | `runAutoPipeline` owns validation, model routing, progress, events, concurrency, investigation, generation, synthesis, duration accounting, abort semantics, and error translation. Changes to any stage risk the entire primary hot path and require broad integration tests.                                 | L         | high          |
| AUD-08 | `apps/web/src/app/api/verticals/route.ts:14-145,150-895,898-1099`; `packages/core/src/verticals/pack-schema.ts:10-220`; `packages/core/src/verticals/*-pack.ts`                                                            | Layering / genuine duplication            | **P1**   | The web route recreates core types, registry behavior, rubric/compliance algorithms, and three seed packs. Web and core are independent sources of truth, so fixes and pack changes require edits in multiple layers and can return different results.                                                         | M         | high          |
| AUD-09 | Examples: `analytics/advanced.ts:9-10` ↔ `analytics/index.ts:366-426`; `canvas/canvas-export.ts:1` ↔ `canvas/index.ts`; `saas/rate-limiter.ts:9-10` ↔ `saas/index.ts`                                                      | Circular dependency                       | **P1**   | Eight feature clusters import runtime values from barrels that re-export the importing leaves. Initialization order is fragile, feature imports evaluate unnecessarily broad graphs, and future `const` initialization can create temporal-dead-zone failures.                                                 | M         | low           |
| AUD-10 | `packages/core/src/copilot/client.ts:67-175`; `copilot/timeout.ts:25-52`; `apps/cli/src/program.ts:157-168,1175,4694-4701`; `packages/bot/src/bot.ts:85-91`; `packages/mcp-server/src/server.ts:522-541`                   | Lifecycle ownership                       | **P1**   | The shared Copilot runtime has sophisticated concurrency but disposal is still invoked inconsistently by composition roots and normal shutdown can wait on SDK cleanup. Adding an adapter or command can leak resources or hang termination unless every caller remembers the same lifecycle protocol.         | M         | low           |
| AUD-11 | `packages/core/src/storage/index.ts:25,37-49`; `providers/index.ts:471-472`; `white-label/index.ts:140-143`; `rbac/scim.ts:91-94`; `innovation-monitor/index.ts:103-105`                                                   | Mutable shared state                      | **P1**   | Storage selection, provider selection, tenant identity, credentials, and timer handles are process-global singletons. Multiple consumers in one process are last-writer-wins, tests need global cleanup, and lifecycle ownership is implicit.                                                                  | L         | high          |
| AUD-12 | `apps/cli/src/program.ts:1-4702`, especially auto callback `:520-1177`; imports `:1-149`; shared process state `:151-168`                                                                                                  | God module / mixed abstraction            | **P1**   | One singleton registers roughly 121 commands and mixes parsing, I/O, rendering, orchestration, persistence, cancellation, and cleanup; the `auto` callback alone is 658 lines with nesting depth 6. Command changes are difficult to isolate and tests must mock a large portion of core.                      | L         | low           |
| AUD-13 | `apps/cli/src/program.ts:1155-1177`                                                                                                                                                                                        | Error handling                            | **P1**   | The outer `auto` command catch is empty. An unexpected post-processing or orchestration exception can be swallowed without a diagnostic or non-zero exit code.                                                                                                                                                 | S         | high          |
| AUD-14 | `apps/cli/src/utils.ts:8-11`; `apps/cli/src/program.ts:315-2534,3039-3041,3785-3786`                                                                                                                                       | Output boundary                           | **P1**   | Early commands sanitize untrusted terminal output while later commands print equivalent LLM or remote text directly. Terminal control sequences can forge output, deceptive links, or terminal state, and output policy changes require shotgun edits.                                                         | S         | none          |
| AUD-15 | `packages/core/src/marketplace/index.ts:122-145`                                                                                                                                                                           | Error handling / persistence              | **P1**   | A corrupt marketplace registry is silently treated as an empty registry. The next successful write can replace the corrupt-but-recoverable file with empty state, hiding the original failure and losing data.                                                                                                 | S         | high          |
| AUD-16 | `packages/core/src/ab-testing/index.ts:177-217`                                                                                                                                                                            | Error handling / data quality             | **P1**   | Failed variant executions are converted into successful-looking zero-metric samples. Statistical analysis is biased by transport/runtime failures and cannot distinguish a poor variant from a failed run.                                                                                                     | S         | high          |
| AUD-17 | `packages/vscode-extension/package.json:50-66`; `packages/vscode-extension/src/extension.ts:15-23`; `scripts/check-build-outputs.mjs:5-17`                                                                                 | Packaging boundary                        | **P1**   | The emitted VS Code extension dynamically imports `@innovator/core`, but VSIX packaging uses `--no-dependencies` and CI verifies only the loose build output. A packaged extension can activate and fail on its first core-backed command.                                                                     | M         | low           |
| AUD-18 | `packages/vscode-extension/src/extension.ts:31-57,92-103,183-265,290-292,514-537`                                                                                                                                          | State ownership / process boundary        | **P1**   | Chat state falls back to a shared key, `/pr` reads a different global context, and PR creation mixes markdown, filesystem, UI, shell quoting, and four unchecked commands. Concurrent chats can use the wrong ideas, and a failed branch command can let later git commands run in the wrong context.          | M         | high          |
| AUD-19 | `packages/sdk/src/index.ts:376-414`; `packages/sdk/src/__tests__/index.test.ts:632-758`                                                                                                                                    | Streaming correctness                     | **P1**   | Stream completion exits without flushing `decoder.decode()` and the residual SSE buffer. A valid final event without a trailing newline can disappear while the SDK reports success.                                                                                                                           | S         | low           |
| AUD-20 | `packages/mcp-server/src/server.ts:29-512`; `schemas.ts:1-65`; `handlers.ts:165-207,241`; `package.json:32-38`                                                                                                             | Adapter contract / abstraction leak       | **P1**   | MCP duplicates core schemas and error wrappers, weakens canonical limits, mixes validated real paths with raw caller paths, and imports undeclared `zod`. Validation and result behavior can drift, relative paths can lose findings, and strict package managers can fail at runtime.                         | M         | low           |
| AUD-21 | `packages/bot/src/bot.ts:47-74`; `adapters/slack.ts:57-62`; `discord.ts:53-61`; `teams.ts:53-58`                                                                                                                           | Async ordering / swallowed errors         | **P1**   | Progress updates are fire-and-forget and send failures are discarded. Progress may arrive after the final answer, while revoked credentials or archived-channel failures have no diagnostic owner.                                                                                                             | S         | low           |
| AUD-22 | `apps/web/src/app/page.tsx:29-185`                                                                                                                                                                                         | Component responsibility / state altitude | **P1**   | The page owns onboarding, fetch orchestration, abort lifecycle, response parsing, error classification, persistence, and stage rendering. Transport and UX changes are coupled, and flow logic cannot be tested or reused without rendering the full page.                                                     | L         | low           |
| AUD-23 | `apps/web/src/components/IdeaWorkshop.tsx:152-161,178-260`                                                                                                                                                                 | State ownership / correctness             | **P1**   | Workshop state is initialized from `angleResults` once and never reconciled with later props. Restoring or replacing a result set can leave the workshop showing and editing stale ideas.                                                                                                                      | S         | high          |
| AUD-24 | `apps/web/src/components/AutoModePanel.tsx:55-190`                                                                                                                                                                         | Component responsibility                  | **P2**   | UI state, fetch policy, timeout ownership, SSE framing, JSON validation, partial-content handling, and completion callbacks live in one component. Parser changes and presentation changes share one regression surface.                                                                                       | M         | low           |
| AUD-25 | `packages/core/src/index.ts:1-8915`                                                                                                                                                                                        | Public surface / coupling                 | **P2**   | The compatibility barrel contains 759 export statements spanning 335 source modules. It is a merge hotspot, obscures feature boundaries, and encourages adapters to depend on the entire package surface.                                                                                                      | L         | low           |
| AUD-26 | `packages/core/src/api-gateway/index.ts:84-330,337-659,661-900,902-1121`                                                                                                                                                   | God module / mutable state                | **P2**   | API key lifecycle, usage, tiers, webhooks, OpenAPI, tenants, and portal projection share one file and several global stores. Unrelated feature changes converge on the same module and make persistence ownership ambiguous.                                                                                   | L         | medium        |

## 3. Proposed refactor sequence

Each item is intended to be independently revertable and to leave the repository green. File moves and content edits must be separate commits. Full tests, lint, and type checks run after every commit in Phase 2.

1. **Replace false test seams with characterization tests** — `AUD-03`
   - Import and call the actual production route handlers currently represented by copied inline handlers.
   - Add CLI and VSIX characterization seams before restructuring them.
   - Report package-level coverage in CI before considering package-specific floors.

2. **Remove feature self-barrel cycles one cluster at a time** — `AUD-09`
   - Start with analytics, canvas, and SaaS.
   - Move shared types/constants to existing or new leaf modules in move-only commits.
   - Replace `./index.js` runtime imports with direct defining-module imports in follow-up commits.

3. **Extract a typed structured-generation helper** — `AUD-06`
   - Characterize fenced JSON, extraction errors, retry behavior, schema rejection, aborts, and telemetry.
   - Introduce one helper with the current Copilot behavior.
   - Migrate `investigate`, `generate`, `pipeline` synthesis, and scoring one file per commit before broader migration.

4. **Introduce a narrow text-generator seam without changing provider behavior** — `AUD-04`
   - Add an optional `TextGenerator`/`LLMProvider` dependency whose default is the current Copilot implementation.
   - Thread it through the primary pipeline only.
   - Do **not** activate alternative-provider selection in this refactor; that is a behavior change.

5. **Decompose `runAutoPipeline` into private stages** — `AUD-07`
   - Extract investigation, angle generation, synthesis, progress/event emission, and timing into private functions.
   - Preserve the public signature, event order, error strings, partial-failure semantics, and mutation behavior.

6. **Remove the duplicated vertical-pack implementation from the web route** — `AUD-08`
   - First add route characterization tests against the current payloads.
   - Move seed data without editing it.
   - In a later commit, delegate registry/evaluation/compliance to core and delete the duplicate route-local model.

7. **Create explicit runtime contexts and one disposal boundary** — `AUD-10`, `AUD-11`
   - Introduce instance-owned contexts for Copilot lifecycle, providers, storage, tenant context, and monitor timers.
   - Keep current singleton exports as compatibility defaults for external consumers.
   - Add one idempotent runtime disposer and call it once from each composition root.

8. **Split MCP registration from canonical contracts** — structural portion of `AUD-20`
   - Extract one registration function per tool group and one error-result adapter.
   - Reuse core schemas/limits rather than recreating them.
   - Keep transport, tool names, descriptions, and returned payloads unchanged.

9. **Create a CLI program factory and extract command groups** — `AUD-12`
   - Add characterization tests for command parsing, output, exit codes, and cleanup.
   - Introduce `createProgram()` with injected output/runtime seams while preserving the current singleton entry point.
   - Move command groups in move-only commits, then remove module-global command state.

10. **Extract web flow and stream hooks** — `AUD-22`, `AUD-24`
    - Move error classification to a pure utility.
    - Extract investigation/innovation orchestration into hooks while retaining `appReducer`.
    - Extract SSE framing/validation into a tested parser hook before simplifying `AutoModePanel`.

11. **Extract VS Code state and process seams without changing outcomes** — structural portion of `AUD-18`
    - Pass selected ideas explicitly through the PR flow.
    - Separate markdown generation, filesystem writing, UI prompts, and process invocation.
    - Preserve current command order and user messages; command failure policy is deferred below.

12. **Optional P2 surface cleanup after all P1 structural work** — `AUD-25`, `AUD-26`
    - Add stable feature subpath exports and migrate internal consumers incrementally; retain the public root barrel for external compatibility.
    - Split API gateway schemas, key/usage state, webhook state, OpenAPI, and tenant projection without changing exported names.

### Explicit Phase 2 deferrals

The following are correctness/security bugs or behavior changes, not refactors. Under the user's Phase 2 rules they must remain unchanged unless separately approved:

- `AUD-01` GitHub Action execution/output behavior.
- `AUD-02` lossy custom-angle recovery.
- Provider activation and config migration portions of `AUD-04` and `AUD-05`.
- `AUD-13` swallowed CLI error and `AUD-14` terminal sanitization policy.
- `AUD-15` corrupt marketplace recovery and `AUD-16` failed A/B run semantics.
- `AUD-17` VSIX packaging behavior and command-failure behavior from `AUD-18`.
- `AUD-19` final SSE event handling.
- Canonical-path behavior portion of `AUD-20`.
- `AUD-21` bot message ordering/failure reporting.
- `AUD-23` IdeaWorkshop prop-reconciliation behavior.

## 4. Explicitly out of scope

- **Do not split curated or declarative data solely by line count.** `biomimicry/taxonomy.ts`, endpoint catalogs, and OpenAPI object literals are large but cohesive data assets.
- **Do not introduce a DI container.** Constructor/context injection is valuable at composition and I/O boundaries; applying DI to pure scoring, statistics, schema, and formatter functions would add ceremony without reducing real coupling.
- **Do not replace closed command/type switches with Strategy classes.** Existing discriminated unions and exhaustive switches are clearer for fixed command sets.
- **Do not remove the public core barrel in Phase 2.** Internal imports should migrate toward feature subpaths, but adapters and external consumers require compatibility.
- **Do not redesign the production deployment profile, proxy storage, or multi-replica architecture.** The current single-process constraint is explicit; distributed storage is a feature project, not a refactor.
- **Do not add a global React state library.** `appReducer` is already the correct state-machine boundary; the problem is side effects living beside it, not the absence of Redux/Zustand.
- **Do not visually redesign components while extracting hooks or parsers.** Markup and behavior should remain stable.
- **Do not revive or refactor the retired GitHub App-based Copilot Extension.** Its fail-closed compatibility stub is intentional.
- **Do not combine the deferred bug fixes above with structural commits.** They require separate approval, tests that pin current behavior first, and reviewer-visible behavior changes.

## 5. Phase 2 final status

| ID     | Status                                   | Final disposition                                                                                                                                                 |
| ------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-01 | **Deferred**                             | Correctness fix: self-contained/fail-fast GitHub Action and output protocol require separate bug-fix approval.                                                    |
| AUD-02 | **Deferred**                             | Correctness fix: lossy custom-angle recovery changes persistence behavior.                                                                                        |
| AUD-03 | **Implemented**                          | Copied web handler stand-ins were replaced with tests against production exports; CLI/VS Code characterization and workspace coverage reporting were added.       |
| AUD-04 | **Partially implemented / deferred**     | The `TextGenerator` injection seam is complete with Copilot as the unchanged default; activating provider selection remains a feature/behavior change.            |
| AUD-05 | **Deferred**                             | Canonical provider/IaC config migration changes generated and accepted configuration contracts.                                                                   |
| AUD-06 | **Implemented for the primary hot path** | Typed structured generation now covers investigation, angle generation, synthesis, and scoring; broader migration is explicitly deferred as follow-up cleanup.    |
| AUD-07 | **Implemented**                          | `runAutoPipeline` is a small coordinator over characterized private stages; public behavior is preserved.                                                         |
| AUD-08 | **Implemented**                          | The vertical route is a thin adapter over core-owned registry, seed data, rubric, compliance, installation, and submission behavior.                              |
| AUD-09 | **Implemented**                          | All detected core value-level SCCs were removed through direct leaf imports and focused type/runtime modules.                                                     |
| AUD-10 | **Implemented**                          | An idempotent, timeout-bounded `InnovatorRuntime.dispose()` now owns composition-root cleanup.                                                                    |
| AUD-11 | **Implemented**                          | Provider, storage, white-label, SCIM, and monitor facilities have isolated instances with singleton compatibility defaults.                                       |
| AUD-12 | **Implemented**                          | CLI now uses `createProgram()` and five cohesive registration groups; command inventory/order and singleton compatibility are pinned.                             |
| AUD-13 | **Deferred**                             | Empty catch behavior is a user-visible error-policy bug fix.                                                                                                      |
| AUD-14 | **Deferred**                             | Terminal sanitization changes externally visible output policy.                                                                                                   |
| AUD-15 | **Deferred**                             | Corrupt marketplace recovery changes persistence/error behavior.                                                                                                  |
| AUD-16 | **Deferred**                             | Failed-run representation changes A/B result semantics and statistics.                                                                                            |
| AUD-17 | **Deferred**                             | VSIX bundling/package behavior is a packaging bug fix outside the approved refactor sequence.                                                                     |
| AUD-18 | **Structural portion implemented**       | Chat state, proposal generation, I/O, and terminal emission have seams; key collision, quoting, failure gating, and success messaging remain pinned and deferred. |
| AUD-19 | **Deferred**                             | Flushing the residual SSE frame changes observable SDK behavior.                                                                                                  |
| AUD-20 | **Structural portion implemented**       | MCP registration, schemas, and result adaptation are decomposed; canonical-path result behavior remains deferred. Direct `zod` dependency is declared.            |
| AUD-21 | **Deferred**                             | Serializing bot progress and surfacing send failures changes message ordering and diagnostics.                                                                    |
| AUD-22 | **Implemented**                          | Page transport/orchestration and error mapping moved to focused hooks/utilities; reducer and markup are preserved.                                                |
| AUD-23 | **Deferred**                             | Reconciling prop changes would intentionally change workshop state behavior.                                                                                      |
| AUD-24 | **Implemented**                          | SSE framing/validation and auto-pipeline lifecycle moved to tested parser/hook seams.                                                                             |
| AUD-25 | **Implemented**                          | Stable feature subpaths were added and internal consumers migrated; root barrel compatibility remains intact.                                                     |
| AUD-26 | **Implemented**                          | API gateway responsibilities were split into focused leaves with one compatibility barrel and unchanged singleton state.                                          |

### Final verification

- Every logical batch ran `npm run check` before the next batch started.
- The definitive `npm run test:ci` gate passed: formatting, lint, every workspace typecheck, all production builds, build-output verification, the Docusaurus build, and the production dependency audit (zero vulnerabilities).
- Vitest passed **654 test files / 11,721 tests**.
- Aggregate workspace coverage passed the existing thresholds at **76.02% lines (41,722/54,881)**, **76.10% functions (9,637/12,663)**, and **60.70% branches (19,830/32,671)**.
- A final read-only review of the complete uncommitted diff found no high-confidence behavior, compatibility, security, or lifecycle regression.
- No commits were created.

### Reviewer focus

Review most carefully:

1. **Compatibility barrels and moved implementations** — confirm export identity/initialization remains stable across analytics, canvas, federation, digital twin, knowledge graph, portfolio, novelty oracle, multi-modal, tournament, SaaS, and API gateway.
2. **Primary pipeline seams** — verify structured generation, injected `TextGenerator`, stage decomposition, event order, partial failures, and positional/options precedence.
3. **Composition roots** — inspect runtime disposal ownership, CLI command-registration order, MCP tool/resource/prompt parity, and VS Code adapter seams.
4. **Web behavior preservation** — compare route payload characterization, vertical-pack response parity, `Home` stage rendering, and AutoMode SSE terminal behavior.
