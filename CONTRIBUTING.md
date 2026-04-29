# Contributing to Innovator

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
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

This runs lint, typecheck, format check, and tests. You can also run them individually:

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
| `npm run dev:cli`          | Run CLI in development mode via tsx       |
| `npm run cli -- <command>` | Run the CLI in development mode via tsx   |

### Quality

| Command                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `npm run check`        | Run all quality gates (lint, typecheck, format, test) |
| `npm run lint`         | Run ESLint across all packages                        |
| `npm run lint:fix`     | Auto-fix all linting and formatting issues            |
| `npm run typecheck`    | Run TypeScript type checking across all packages      |
| `npm run format`       | Format all files with Prettier                        |
| `npm run format:check` | Check formatting without writing changes              |
| `npm test`             | Run all tests with vitest                             |
| `npm run test:watch`   | Run tests in watch mode                               |

### Build

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `npm run build`     | Build core package and web app for production               |
| `npm run clean`     | Remove build artifacts (`dist/`, `.next/`, `*.tsbuildinfo`) |
| `npm run clean:all` | Clean build artifacts and all `node_modules/` directories   |

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
- **Linting** — ESLint is configured; pre-commit hooks run automatically via husky
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

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
