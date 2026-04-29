# Contributing to Innovator

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **GitHub Copilot subscription** (for running the AI-powered features)
- **GitHub CLI** authenticated (`gh auth login`)

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd innovator

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
# Lint
npm run lint

# Format
npm run format

# Test
npm test

# Build
npm run build
```

4. **Open a Pull Request** against `main`

## Coding Standards

- **TypeScript** — All code is written in TypeScript with strict mode enabled
- **Formatting** — Prettier is configured; run `npm run format` or enable format-on-save
- **Linting** — ESLint is configured; pre-commit hooks run automatically via husky
- **Types** — Shared types live in `packages/core/src/types.ts`; import from `@innovator/core` — do not re-declare types locally
- **Tests** — Write tests for new utilities and logic using vitest (`npm test`)

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
