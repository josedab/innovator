# Contributing to Innovator

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **npm** as package manager — do not use yarn or pnpm (enforced via `only-allow npm` preinstall hook; other package managers will be blocked)
- **GitHub Copilot subscription** (for running the AI-powered features)
- **GitHub CLI** authenticated (`gh auth login`)

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

> **💻 Dev Container / Codespaces:** This repo includes a `.devcontainer/devcontainer.json` with Node.js 20, GitHub CLI, and ESLint/Prettier extensions pre-configured. Open in Codespaces or VS Code Dev Containers to skip manual setup.

## Project Structure

```
innovator/
├── apps/
│   ├── web/          # Next.js web application
│   └── cli/          # Command-line interface
├── packages/
│   └── core/         # Shared innovation engine (types, prompts, pipeline)
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

This runs lint, typecheck, format check, and tests. To simulate the **full CI pipeline** (including build and coverage):

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

| Command                | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| `npm run check`        | Run all quality gates (lint, typecheck, format, test)                          |
| `npm run test:ci`      | Simulate full CI pipeline (format, lint, typecheck, build, test with coverage) |
| `npm run lint`         | Run ESLint across all packages                                                 |
| `npm run lint:fix`     | Auto-fix all linting and formatting issues                                     |
| `npm run typecheck`    | Run TypeScript type checking across all packages                               |
| `npm run format`       | Format all files with Prettier                                                 |
| `npm run format:check` | Check formatting without writing changes                                       |
| `npm test`             | Run all tests with vitest                                                      |
| `npm run test:watch`   | Run tests in watch mode                                                        |
| `npm run test:e2e`     | Run Playwright end-to-end tests (from `apps/web`)                              |
| `npm run test:e2e:ui`  | Run Playwright E2E tests with interactive UI mode                              |

### Build

| Command               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `npm run build`       | Build core package and web app for production               |
| `npm run clean`       | Remove build artifacts (`dist/`, `.next/`, `*.tsbuildinfo`) |
| `npm run build:check` | Verify all expected build outputs exist                     |
| `npm run clean:all`   | Clean build artifacts and all `node_modules/` directories   |
| `npm run docs:api`    | Generate TypeDoc API documentation for the core package     |

### CLI

| Command                                         | Description                                     |
| ----------------------------------------------- | ----------------------------------------------- |
| `npm run cli -- investigate <subject>`          | Investigate a subject                           |
| `npm run cli -- innovate <subject> -a <angles>` | Generate innovations for specific angles        |
| `npm run cli -- auto <subject>`                 | Run full auto pipeline (all angles + synthesis) |
| `npm run cli -- angles`                         | List all available innovation angles            |

## Coding Standards

- **TypeScript** — All code is written in TypeScript with strict mode enabled
- **Formatting** — Prettier is configured; run `npm run format` or enable format-on-save
- **Linting** — ESLint is configured; pre-commit hooks run automatically via husky. On commit, husky runs [lint-staged](https://github.com/lint-staged/lint-staged) which auto-fixes ESLint issues and formats staged `.ts`/`.tsx` files, and formats `.json`, `.md`, and `.yml` files with Prettier. Staged files may be modified in place.
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
- **Minimum thresholds** — CI enforces **35%** coverage for lines, functions, and branches. Pull requests that drop below these thresholds will fail.
- **Run coverage locally** with `npm run test:coverage`.

## Testing Guide

### Test Categories

- **Unit tests** — Located in `packages/*/src/__tests__/` and `apps/*/src/__tests__/`. Run with `npm test`. These test individual modules (prompt builders, JSON extraction, retry logic, angle generation, pipeline orchestration).
- **End-to-end tests** — Located in `apps/web/e2e/`. Run with `npm run test:e2e`. These use Playwright to test the web app in a real browser.

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

CI enforces a **35% minimum** for lines, functions, and branches (configured in `vitest.config.ts`). This threshold reflects the project's reliance on LLM integration code that is mocked in tests — the goal is to ensure utility and pipeline logic is well-tested while acknowledging that full coverage of SDK-dependent code requires integration tests. Run `npm run test:coverage` to check locally.

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

## Security

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

1. **Trigger** — Every push to the `main` branch runs the release workflow (`.github/workflows/release.yml`).
2. **Version bump** — `semantic-release` analyzes commit messages since the last release and determines the next version using [Conventional Commits](https://www.conventionalcommits.org/):
   - `fix:` → patch release (e.g. 1.0.0 → 1.0.1)
   - `feat:` → minor release (e.g. 1.0.0 → 1.1.0)
   - `BREAKING CHANGE:` or `feat!:` / `fix!:` → major release (e.g. 1.0.0 → 2.0.0)
3. **Changelog** — `CHANGELOG.md` is updated automatically based on the commit history.
4. **Publish** — A GitHub Release is created with the new version tag and release notes.

### Who can publish

Only pushes to `main` on the upstream repository (`josedab/innovator`) trigger a release. Fork pushes and pull request branches do not. The workflow uses the `GITHUB_TOKEN` secret provided by GitHub Actions — no additional credentials are needed.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
