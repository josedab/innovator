# Contributing to Innovator

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js 22+** (see `.nvmrc`)
- **npm** as package manager — do not use yarn or pnpm (enforced via `only-allow npm` preinstall hook; other package managers will be blocked)
- **GitHub Copilot subscription** (for running the AI-powered features)
- **GitHub CLI** authenticated (`gh auth login`)

### Node.js Version

The repository includes an `.nvmrc` file that pins Node.js to version **22**. If you use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm), running `nvm use` (or `fnm use`) in the repository root will automatically switch to the correct version. CI enforces this version — builds run on Node 22.

## Setup

```bash
# Clone the repository
git clone https://github.com/josedab/innovator.git
cd innovator

# Use the correct Node.js version
nvm use  # or fnm use

# Install dependencies
npm install

# Start development (auto-builds core first)
npm run dev
```

> **Prefer `make`?** A full Makefile with common targets is available. Run `make help` to see all options.

### Using Make

The repository includes a `Makefile` that wraps common npm scripts. All targets mirror their npm equivalents:

| Target               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `make help`          | Show all available targets                           |
| `make install`       | Install dependencies                                 |
| `make dev`           | Start web dev server (builds core first)             |
| `make dev-all`       | Run core watch + web dev in parallel                 |
| `make dev-docs`      | Start Docusaurus docs server                         |
| `make dev-cli`       | Run CLI in dev mode via tsx                          |
| `make build`         | Build all packages for production                    |
| `make build-check`   | Verify expected build outputs exist                  |
| `make clean`         | Remove build artifacts                               |
| `make clean-all`     | Clean artifacts + all `node_modules/`                |
| `make test`          | Run all tests                                        |
| `make test-coverage` | Run tests with coverage report                       |
| `make test-ci`       | Simulate CI, including production audit/build checks |
| `make check`         | Run quality gates, production audit, and docs build  |
| `make lint`          | Run ESLint                                           |
| `make lint-fix`      | Auto-fix linting and formatting issues               |
| `make typecheck`     | Run TypeScript type checking                         |
| `make format`        | Format all files with Prettier                       |
| `make doctor`        | Check prerequisites (Node, gh CLI, auth, core build) |

> **💻 Dev Container / Codespaces:** This repo includes a `.devcontainer/devcontainer.json` with Node.js 22, GitHub CLI, and ESLint/Prettier extensions pre-configured. Open in Codespaces or VS Code Dev Containers to skip manual setup.

## Project Structure

```
innovator/
├── apps/
│   ├── web/          # Next.js web application
│   └── cli/          # Command-line interface
├── packages/
│   ├── core/             # Shared innovation engine (types, prompts, pipeline)
│   ├── bot/              # Chat platform bot (Slack, Discord, Teams)
│   ├── create-innovator/ # `npx create-innovator` scaffolding CLI
│   └── mcp-server/       # Model Context Protocol server (stdio only)
├── website/          # Docusaurus documentation site
└── package.json      # Workspace root
```

## Development Workflow

1. **Create a branch** from `main` for your changes
2. **Make your changes** following the coding standards below
3. **Run checks locally** before pushing:

```bash
npm run check
```

This runs lint, typecheck, format check, the production dependency audit, tests, and the documentation build. To simulate the main CI quality/build/test sequence locally (including production builds, output validation, and coverage):

```bash
npm run test:ci
```

You can also run them individually:

```bash
npm run lint
npm run typecheck
npm run format
npm test
npm run build
```

4. **Open a Pull Request** against `main`

## Available Commands

All commands are run from the monorepo root.

### Development

| Command                    | Description                               |
| -------------------------- | ----------------------------------------- |
| `npm run dev`              | Build core, then start Next.js dev server |
| `npm run dev:all`          | Run core watch + web dev in parallel      |
| `npm run dev:core`         | Watch-mode build for `packages/core` only |
| `npm run dev:cli`          | Run CLI in development mode via tsx       |
| `npm run dev:docs`         | Start Docusaurus documentation dev server |
| `npm run cli -- <command>` | Run the CLI in development mode via tsx   |

### Quality

| Command                    | Description                                                                       |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm run check`            | Run lint, typecheck, format, production audit, tests, and the documentation build |
| `npm run test:ci`          | Simulate CI quality/build/test checks, output/docs validation, and coverage       |
| `npm run audit:production` | Audit runtime dependencies; fail on any production advisory                       |
| `npm run lint`             | Run ESLint across all packages                                                    |
| `npm run lint:fix`         | Auto-fix all linting and formatting issues                                        |
| `npm run typecheck`        | Type-check every supported workspace, including the documentation site            |
| `npm run format`           | Format all files with Prettier                                                    |
| `npm run format:check`     | Check formatting without writing changes                                          |
| `npm test`                 | Run all tests with vitest                                                         |
| `npm run test:watch`       | Run tests in watch mode                                                           |
| `npm run test:e2e`         | Run Playwright end-to-end tests (**run from `apps/web/`**, not the repo root)     |
| `npm run test:e2e:ui`      | Run Playwright E2E tests with interactive UI (**run from `apps/web/`**)           |

### Build

| Command               | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `npm run build`       | Build every supported production workspace in dependency order |
| `npm run build:check` | Verify all expected build outputs exist                        |
| `npm run clean`       | Remove build artifacts (`dist/`, `.next/`, `*.tsbuildinfo`)    |
| `npm run clean:all`   | Clean build artifacts and all `node_modules/` directories      |
| `npm run docs:api`    | Generate TypeDoc API documentation for the core package        |

### CLI

| Command                                         | Description                                     |
| ----------------------------------------------- | ----------------------------------------------- |
| `npm run cli -- investigate <subject>`          | Investigate a subject                           |
| `npm run cli -- innovate <subject> -a <angles>` | Generate innovations for specific angles        |
| `npm run cli -- auto <subject>`                 | Run full auto pipeline (all angles + synthesis) |
| `npm run cli -- angles`                         | List all available innovation angles            |

## Coding Standards

- **TypeScript** — All code is written in TypeScript with strict mode enabled
- **Formatting** — Prettier is configured; run `npm run format` or enable format-on-save. The project uses these Prettier settings (`.prettierrc`):

  | Setting         | Value   |
  | --------------- | ------- |
  | `semi`          | `true`  |
  | `singleQuote`   | `false` |
  | `trailingComma` | `es5`   |
  | `printWidth`    | `100`   |
  | `tabWidth`      | `2`     |

- **Linting** — ESLint is configured; pre-commit hooks run automatically via husky. On commit, husky runs [lint-staged](https://github.com/lint-staged/lint-staged) which auto-fixes ESLint issues and formats staged `.ts`/`.tsx` files, and formats `.json`, `.md`, and `.yml` files with Prettier. Staged files may be modified in place.
- **Unused variables** — Prefix unused parameters, destructured items, or variables with an underscore (`_`) to suppress `no-unused-vars` lint errors (e.g., `_event`, `_unused`). This convention is configured in `eslint.config.mjs` via `argsIgnorePattern`, `destructuredArrayIgnorePattern`, and `varsIgnorePattern`.
- **Commit messages** — [Conventional Commits](https://www.conventionalcommits.org/) are enforced automatically by [commitlint](https://commitlint.js.org/) (configured in `commitlint.config.mjs`) and [husky](https://typicode.github.io/husky/) git hooks. Non-conforming commits will be rejected locally.

  The `commit-msg` hook runs commitlint on every commit. If your message does not follow the conventional format, you will see an error like:

  ```
  ⧗   input: my bad commit message
  ✖   subject may not be empty [subject-empty]
  ✖   type may not be empty [type-empty]
  ✖   Found 2 problems, 0 warnings
  ```

  Fix this by using a valid prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, etc.

- **Types** — Shared types live in `packages/core/src/types.ts`; import from `@innovator/core` — do not re-declare types locally
- **Tests** — Write tests for new utilities and logic using vitest (`npm test`)

### Running Specific Tests

You can run a single test file or filter tests by name:

```bash
# Run a specific test file
npx vitest run packages/core/src/__tests__/angles.test.ts

# Run tests matching a name pattern
npx vitest -t "extractJson"

# Run tests in watch mode for a specific file
npx vitest packages/core/src/__tests__/angles.test.ts

# Run all tests for a specific workspace
npx vitest run packages/core/
npx vitest run apps/web/
```

### Test Configuration and Coverage

Tests are configured in `vitest.config.ts` at the repository root. Key settings:

- **Environment** — Web app tests (`apps/web/**`) run in a `jsdom` environment; all other tests use the default Node environment.
- **Coverage provider** — V8, with `lcov` and `text` reporters.
- **Minimum thresholds** — CI enforces **72% lines, 73% functions, and 58% branches**. Pull requests that drop below any threshold will fail.
- **Run coverage locally** with `npm run test:coverage`.

## Testing Guide

### Test Categories

- **Unit tests** — Located in `packages/*/src/__tests__/` and `apps/*/src/__tests__/`. Run with `npm test`. These test individual modules (prompt builders, JSON extraction, retry logic, angle generation, pipeline orchestration).
- **End-to-end tests** — Located in `apps/web/e2e/`. Run with `npm run test:e2e` **from the `apps/web/` directory** (these scripts are defined in `apps/web/package.json`, not in the root `package.json`). These use Playwright to test the web app in a real browser.

  ```bash
  cd apps/web
  npm run test:e2e
  ```

### Mocking the LLM Layer

All tests that touch LLM functionality mock the Copilot SDK and client to avoid real API calls:

```typescript
// Mock the Copilot SDK (required in every test file that imports core modules)
vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

// Mock the client wrapper
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
```

> **Note:** These mock declarations are currently repeated inline in each test file. There are no shared test helpers or centralized mock setup files yet. If you find yourself writing the same mocks across multiple tests, consider extracting them into a shared helper — but keep the mocks co-located with the test files that use them until a formal convention is established.

### Test Fixtures

Tests use a shared `MOCK_INVESTIGATION` fixture to simulate investigation results:

```typescript
const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect", description: "Description" }],
  currentState: "Current state",
  challenges: ["Challenge"],
  opportunities: ["Opportunity"],
};
```

### Writing Tests for the LLM Integration Layer

1. Mock `generateText` and `extractJson` from the client module
2. Use `vi.mocked()` to get typed mock references
3. Set up return values with `mockResolvedValue` / `mockReturnValue`
4. Assert that prompts are constructed correctly and results are parsed as expected

### Coverage Thresholds

CI enforces **72% line coverage, 73% function coverage, and 58% branch coverage** (configured in `vitest.config.ts`). These thresholds are ratcheted independently so coverage cannot regress while branch-heavy integration code remains practical to test. Run `npm run test:coverage` to check locally.

## E2E Testing with Playwright

End-to-end tests live in `apps/web/e2e/` and use [Playwright](https://playwright.dev/) to test the web app in a real browser. E2E scripts are defined in `apps/web/package.json` — run them from the `apps/web/` directory.

### Setup

1. Install Playwright browsers (one-time setup):

   ```bash
   cd apps/web
   npx playwright install --with-deps chromium
   ```

2. Ensure the core package is built:

   ```bash
   npm run build --workspace=packages/core
   ```

### Running E2E Tests

```bash
cd apps/web

# Run all E2E tests (headless)
npm run test:e2e

# Run with the interactive Playwright UI
npm run test:e2e:ui
```

In local development, Playwright automatically starts the dev server (`npm run dev` on port 3000) and waits for it to be ready. In CI, set `PLAYWRIGHT_BASE_URL` to point to an already-running server.

### Configuration

The Playwright configuration is in `apps/web/playwright.config.ts`:

| Setting         | Value                                            | Description                           |
| --------------- | ------------------------------------------------ | ------------------------------------- |
| `testDir`       | `./e2e`                                          | Test files directory                  |
| `fullyParallel` | `true`                                           | Tests run in parallel                 |
| `retries`       | 2 (CI) / 0 (local)                               | Automatic retries on failure in CI    |
| `workers`       | 1 (CI) / auto (local)                            | Parallel workers                      |
| `reporter`      | `html`                                           | Generates an HTML report              |
| `baseURL`       | `PLAYWRIGHT_BASE_URL` or `http://localhost:3000` | Base URL for all page navigations     |
| `trace`         | `on-first-retry`                                 | Captures traces for debugging retries |
| Browser         | Chromium only                                    | Desktop Chrome device profile         |

### Writing New E2E Tests

Create test files in `apps/web/e2e/` with the `.spec.ts` extension:

```typescript
import { test, expect } from "@playwright/test";

test("homepage loads and shows input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox")).toBeVisible();
});
```

See `apps/web/e2e/innovation-flow.spec.ts` for an example of testing the full innovation flow.

## Making Changes

### Core package (`packages/core`)

The shared engine containing types, prompts, Copilot client, and innovation pipeline logic. Changes here affect both the web app and CLI.

```bash
# Build core after changes
npm run build --workspace=packages/core

# Or watch mode
npm run dev --workspace=packages/core
```

### Web app (`apps/web`)

Next.js application. Uses `@innovator/core` for types and server-side logic.

```bash
npm run dev
```

### Adding a new innovation angle

1. Add the angle ID to `ANGLE_IDS` in `packages/core/src/types.ts`
2. Add the angle definition to `packages/core/src/innovation/angles.ts`
3. Create the prompt template in `packages/core/src/prompts/angles/`
4. Register in `packages/core/src/innovation/generate.ts`

## Pull Request Guidelines

- Keep PRs focused and small when possible
- Include a clear description of what changed and why
- Ensure all CI checks pass (lint, build, test)
- Update documentation if your change affects user-facing behavior
- PRs are automatically assigned reviewers via [CODEOWNERS](.github/CODEOWNERS)

## Architecture Decision Records

Significant architectural decisions are tracked via ADRs in [`docs/adr/`](docs/adr/). See the [ADR README](docs/adr/README.md) for the full index and format. If your contribution involves a major design choice (new dependency, structural change, protocol selection), consider adding a new ADR.

### Writing a New ADR

1. **Determine the next ADR number.** Check the highest-numbered ADR in `docs/adr/` and increment by 1 (e.g., ADR-0022 → ADR-0023).

2. **Create the file** following the naming convention:

   ```
   docs/adr/ADR-NNNN-short-kebab-case-title.md
   ```

   Example: `docs/adr/ADR-0023-websocket-collaboration-protocol.md`

3. **Use this template:**

   ```markdown
   # ADR-NNNN: Title

   ## Status

   Proposed

   ## Context

   What prompted this decision? What problem are we solving?
   Include constraints, requirements, and alternatives considered.

   ## Decision

   What was decided and why? Be specific about the technical approach.

   ## Consequences

   **Positive:**

   - What this enables or improves

   **Negative:**

   - Tradeoffs accepted, limitations introduced
   ```

4. **Set the status** to `Proposed` in your PR. The status will be updated to `Accepted` upon merge.

5. **Add an entry** to the index table in [`docs/adr/README.md`](docs/adr/README.md).

6. **Submit the ADR as part of your PR.** ADRs should accompany the code that implements the decision, not be submitted separately.

### ADR Status Values

| Status         | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| **Proposed**   | Under discussion; submitted as part of a PR                        |
| **Accepted**   | Approved and in effect; merged into `main`                         |
| **Deprecated** | No longer recommended; a newer approach is preferred               |
| **Superseded** | Replaced by a newer ADR (link the superseding ADR in the document) |

### When to Write an ADR

- Adding a new external dependency to `@innovator/core`
- Changing the persistence strategy or storage format
- Modifying the LLM provider interface or adding a new provider
- Introducing a new architectural pattern (e.g., event sourcing, CQRS)
- Changing the API contract or authentication mechanism
- Major refactoring that alters the module structure

## Monorepo Workspace Guide

The repository is an [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo with three workspace groups defined in the root `package.json`:

```json
"workspaces": ["apps/*", "packages/*", "website"]
```

### Adding a New Package

1. **Create the package directory** under `packages/` (or `apps/` for an application):

   ```bash
   mkdir -p packages/my-package/src
   ```

2. **Add a `package.json`** with a scoped name:

   ```json
   {
     "name": "@innovator/my-package",
     "version": "0.0.0",
     "private": true,
     "type": "module",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "scripts": {
       "build": "tsc -p tsconfig.json",
       "dev": "tsc -p tsconfig.json --watch"
     }
   }
   ```

3. **Add a `tsconfig.json`** extending the shared base:

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "dist",
       "rootDir": "src"
     },
     "include": ["src"]
   }
   ```

4. **If the web app imports the package**, add it to `transpilePackages` in `apps/web/next.config.ts`:

   ```ts
   const nextConfig: NextConfig = {
     transpilePackages: ["@innovator/core", "@innovator/my-package"],
   };
   ```

5. **Run `npm install`** from the root to link the new workspace.

### Workspace Dependency Conventions

- Use `"*"` as the version for intra-workspace dependencies (e.g., `"@innovator/core": "*"`). npm resolves these to the local workspace package.
- Install shared devDependencies (ESLint, TypeScript, Prettier, Vitest) at the **root** level. Only install package-specific dependencies in the workspace's own `package.json`.
- Run workspace-specific commands via `npm run <script> --workspace=<name>` (e.g., `npm run build --workspace=packages/core`).

### `tsconfig.base.json`

The shared base TypeScript configuration at the repository root provides common compiler options (`ES2022` target, `bundler` module resolution, strict mode). Each workspace extends it and adds its own `outDir`, `rootDir`, and `include` paths.

### `only-allow npm` Enforcement

The root `package.json` includes a `preinstall` script:

```json
"preinstall": "npx only-allow npm"
```

This blocks `yarn` and `pnpm` from being used to install dependencies. The monorepo is configured exclusively for npm workspaces — using a different package manager would produce incompatible lockfiles and break CI.

## Security

### CI/CD Pipelines

Three GitHub Actions workflows run automatically:

| Workflow    | File          | Trigger                              | What it does                                                                                                                                                                                                                      |
| ----------- | ------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI**      | `ci.yml`      | Push & PR to `main`                  | Format → Lint → Typecheck → production dependency audit → build/output checks → docs build → coverage. A separate container job validates Compose and builds the production image. Runs on Node 22.                               |
| **CodeQL**  | `codeql.yml`  | Push & PR to `main`, weekly schedule | CodeQL security analysis with `security-and-quality` queries on JavaScript/TypeScript. Results appear in **Security → Code scanning**.                                                                                            |
| **Release** | `release.yml` | Successful CI run on upstream `main` | Checks out the exact tested revision, installs dependencies, rebuilds, reruns `npm run audit:production`, then runs `semantic-release`. Failed or non-`main` CI runs cannot release. Only runs on `josedab/innovator`, not forks. |

All required CI checks must pass before a PR can be merged. You can simulate the main quality/build/test sequence locally:

```bash
npm run test:ci
```

This project uses [GitHub CodeQL](https://codeql.github.com/) for automated security analysis. The CodeQL workflow (`.github/workflows/codeql.yml`) runs:

- On every push and pull request to `main`
- On a weekly schedule

It analyzes JavaScript/TypeScript code using `security-and-quality` queries. Results appear in the repository's **Security → Code scanning** tab. No action is needed from contributors — CodeQL runs automatically as part of CI.

To report a security vulnerability, see [SECURITY.md](.github/SECURITY.md).

## Dependency Management

This project uses [Dependabot](https://docs.github.com/en/code-security/dependabot) for automated dependency updates. The configuration (`.github/dependabot.yml`) defines 6 separate update schedules, all running weekly:

| Schedule       | Directory        | Group name     |
| -------------- | ---------------- | -------------- |
| Root npm deps  | `/`              | `root-deps`    |
| Core package   | `/packages/core` | `core-deps`    |
| Web app        | `/apps/web`      | `web-deps`     |
| CLI app        | `/apps/cli`      | `cli-deps`     |
| Documentation  | `/website`       | `website-deps` |
| GitHub Actions | `/` (actions)    | _(ungrouped)_  |

Each npm schedule groups all dependency updates into a single PR per workspace. Dependabot PRs are created automatically — review, test, and merge them like any other PR.

## Releases

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) to automate versioning, changelog generation, and publishing.

### How it works

1. **Trigger** — A successful `CI` workflow run for the upstream `main` branch triggers the release workflow (`.github/workflows/release.yml`) for the exact tested commit.
2. **Version bump** — `semantic-release` analyzes commit messages since the last release and determines the next version using [Conventional Commits](https://www.conventionalcommits.org/):
   - `fix:` → patch release (e.g. 1.0.0 → 1.0.1)
   - `feat:` → minor release (e.g. 1.0.0 → 1.1.0)
   - `BREAKING CHANGE:` or `feat!:` / `fix!:` → major release (e.g. 1.0.0 → 2.0.0)
3. **Changelog** — `CHANGELOG.md` is updated automatically based on the commit history.
4. **Publish** — A GitHub Release is created with the new version tag and release notes.

### Release plugins (`.releaserc.json`)

The release pipeline is configured in `.releaserc.json` at the repository root. It runs these plugins in order:

| Plugin                                      | Purpose                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `@semantic-release/commit-analyzer`         | Parses commit messages to determine the release type (patch/minor/major)    |
| `@semantic-release/release-notes-generator` | Generates release notes from commit messages                                |
| `@semantic-release/changelog`               | Updates `CHANGELOG.md` with the new release entry                           |
| `@semantic-release/npm`                     | Bumps `package.json` version (`npmPublish: false` — no npm publish)         |
| `@semantic-release/git`                     | Commits `CHANGELOG.md` and `package.json` back to the repo with `[skip ci]` |
| `@semantic-release/github`                  | Creates a GitHub Release with tag and release notes                         |

### Tag strategy

- Releases are tagged as `vX.Y.Z` (e.g., `v1.2.3`).
- Only the `main` branch triggers releases (configured via `"branches": ["main"]`).
- The release commit message follows the pattern: `chore(release): X.Y.Z [skip ci]` to avoid re-triggering CI.

### How commits become releases

1. You open a PR with conventional commit messages (e.g., `feat: add export button`).
2. The PR is reviewed and merged into `main`.
3. CI runs all quality, production dependency, build, test, documentation, and container checks.
4. After CI succeeds, the release workflow checks out that tested revision.
5. `semantic-release` analyzes all commits since the last release tag.
6. If releasable commits exist (`feat:`, `fix:`, or breaking changes), a new version is calculated, `CHANGELOG.md` is updated, a Git tag is created, and a GitHub Release is published.
7. Commits with prefixes like `docs:`, `chore:`, `refactor:`, `test:`, or `style:` do **not** trigger a release on their own.

### Who can publish

Only successful CI runs for `main` commits on the upstream repository (`josedab/innovator`) can trigger a release. Fork pushes, pull request branches, and failed CI runs do not. The workflow uses the `GITHUB_TOKEN` secret provided by GitHub Actions — no additional credentials are needed.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](.github/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior via the methods described in the Code of Conduct.

## Community

Have a question, idea, or want to share what you've built? Use [GitHub Discussions](https://github.com/josedab/innovator/discussions):

- **💡 [Ideas](https://github.com/josedab/innovator/discussions/categories/ideas)** — Propose features, new angles, or improvements. Use the [Ideas template](.github/DISCUSSION_TEMPLATE/ideas.yml) for structured submissions.
- **❓ [Q&A](https://github.com/josedab/innovator/discussions/categories/q-a)** — Ask questions about setup, usage, or troubleshooting. Check the [documentation](https://josedab.github.io/innovator/docs/getting-started) first.

Discussions are the best place for open-ended conversations — save GitHub Issues for concrete bug reports and feature requests with clear acceptance criteria.

### Reporting Bugs

When filing a bug report, please use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) for a structured format that helps us triage and resolve issues quickly. For feature requests, use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

<!-- NOTE: A summary of this file exists at website/docs/contributing.md for the documentation site.
     When making significant changes here, consider updating the website version or at minimum
     verify the "Topics covered in the full guide" section there still reflects this file's contents. -->
