# @innovator/cli

Command-line interface for the Innovator AI-powered innovation engine.

## Prerequisites

- Node.js 20+
- GitHub Copilot subscription
- GitHub CLI authenticated (`gh auth login`)

## Usage

```bash
# Via the root workspace shortcut
npm run cli -- <command> [options]

# Or directly with tsx
npx tsx apps/cli/src/index.ts <command> [options]
```

## Commands

### `investigate <subject>`

Analyze a subject to identify key aspects, challenges, and opportunities.

```bash
npm run cli -- investigate "code review processes"
npm run cli -- investigate "home automation" --model gpt-5
```

### `innovate <subject> --angles <angles>`

Generate innovations for a subject using selected angles. Requires `--angles`.

```bash
npm run cli -- innovate "code review processes" --angles scamper,first-principles
npm run cli -- innovate "home automation" --angles inversion,what-if,trend-collision
```

### `auto <subject>`

Run the full innovation pipeline automatically — all 8 angles plus synthesis.

```bash
npm run cli -- auto "code review processes"
npm run cli -- auto "home automation" --model gpt-5
```

### `angles`

List all available innovation angles with IDs, names, and descriptions.

```bash
npm run cli -- angles
```

## Options

| Option             | Description                                 |
| ------------------ | ------------------------------------------- |
| `-m, --model <id>` | LLM model to use (default: `gpt-4.1`)       |
| `--verbose`        | Show prompts, responses, and timing details |
| `-V, --version`    | Display version number                      |
| `-h, --help`       | Show help for any command                   |

## Configuration

The CLI uses the same environment variables as the web app:

| Variable                   | Description                               | Default   |
| -------------------------- | ----------------------------------------- | --------- |
| `INNOVATOR_DEFAULT_MODEL`  | Default LLM model                         | `gpt-4.1` |
| `INNOVATOR_LLM_TIMEOUT_MS` | LLM request timeout in milliseconds       | `90000`   |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated additional allowed models | —         |

## Examples

```bash
# Quick investigation
npm run cli -- investigate "sustainable packaging"

# Targeted innovation with two angles
npm run cli -- innovate "sustainable packaging" --angles constraints,cross-domain

# Full pipeline with verbose output
npm run cli -- auto "sustainable packaging" --verbose

# Use a specific model
npm run cli -- auto "sustainable packaging" --model claude-sonnet-4.5
```

## Building

```bash
npm run build -w apps/cli
```
