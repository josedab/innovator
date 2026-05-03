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

### Core Commands

#### `investigate <subject>`

Analyze a subject to identify key aspects, challenges, and opportunities.

```bash
npm run cli -- investigate "code review processes"
npm run cli -- investigate "home automation" --model gpt-5
npm run cli -- investigate "AI ethics" --depth deep --lang es
npm run cli -- investigate "sustainable packaging" --file ./context.md
```

| Option                | Description                                           | Default    |
| --------------------- | ----------------------------------------------------- | ---------- |
| `-m, --model <model>` | LLM model to use                                      | `gpt-4.1`  |
| `--depth <depth>`     | Investigation depth: `shallow`, `standard`, or `deep` | `standard` |
| `--lang <language>`   | Output language: `en`, `es`, `ja`, `de`, `pt`         | `en`       |
| `--score`             | Score and rank ideas after generation                 | —          |
| `--file <path>`       | Use a file or directory as context input              | —          |
| `--url <url>`         | Use a URL as context input                            | —          |

#### `innovate <subject> --angles <angles>`

Generate innovations for a subject using selected angles. Requires `--angles`.

```bash
npm run cli -- innovate "code review processes" --angles scamper,first-principles
npm run cli -- innovate "home automation" --angles inversion,what-if,trend-collision
```

| Option                | Description                              | Default   |
| --------------------- | ---------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                         | `gpt-4.1` |
| `--angles <ids>`      | Comma-separated angle IDs (**required**) | —         |
| `--score`             | Score and rank ideas after generation    | —         |
| `--file <path>`       | Use a file or directory as context input | —         |
| `--url <url>`         | Use a URL as context input               | —         |

#### `auto <subject>`

Run the full innovation pipeline automatically — all 8 angles plus synthesis.

```bash
npm run cli -- auto "code review processes"
npm run cli -- auto "home automation" --model gpt-5
npm run cli -- auto "AI ethics" --depth deep --playbook --debate
```

| Option                     | Description                                                                      | Default    |
| -------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `-m, --model <model>`      | LLM model to use                                                                 | `gpt-4.1`  |
| `--depth <depth>`          | Investigation depth: `shallow`, `standard`, or `deep`                            | `standard` |
| `--lang <language>`        | Output language: `en`, `es`, `ja`, `de`, `pt`                                    | `en`       |
| `--score`                  | Score and rank ideas after generation                                            | —          |
| `--validate`               | Validate ideas against patent, market, and feasibility checks                    | —          |
| `--audience <mode>`        | Generate audience-adapted output (`executive`, `technical`, `pitch`, `research`) | —          |
| `--file <path>`            | Use a file or directory as context input                                         | —          |
| `--url <url>`              | Use a URL as context input                                                       | —          |
| `--constraint <expr...>`   | Apply constraints (e.g., `budget<50K`, `timeline<3months`)                       | —          |
| `--min-confidence <score>` | Minimum investigation confidence score (0–100) before generating ideas           | —          |
| `--playbook [format]`      | Generate an Innovation Playbook (`markdown` or `html`)                           | —          |
| `--debate`                 | Run structured debate on top ideas after synthesis                               | —          |
| `--debate-rounds <n>`      | Number of debate rounds (1–5)                                                    | `2`        |
| `--decision-packet`        | Generate an executive decision packet from results                               | —          |
| `--stress-test`            | Run stress test scenarios on top ideas                                           | —          |

#### `evolve <subject>`

Evolve ideas through genetic-algorithm-inspired mutation and crossover.

```bash
npm run cli -- evolve "remote work tools" --generations 5 --population 8
```

| Option                | Description                            | Default   |
| --------------------- | -------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                       | `gpt-4.1` |
| `--generations <n>`   | Number of evolution generations (1–10) | `3`       |
| `--population <n>`    | Population size per generation         | `6`       |

#### `diff <subjectA> <subjectB>`

Compare two snapshots of a subject and generate an innovation diff.

```bash
npm run cli -- diff "remote work in 2020" "remote work in 2026"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `run <description>`

Run a pipeline described in natural language. The description is parsed into pipeline phases and angles automatically.

```bash
npm run cli -- run "investigate solar energy and generate ideas using first-principles"
npm run cli -- run "deep dive into AI ethics with all angles and synthesis"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `refine <subject>`

Start an interactive refinement session on a completed auto pipeline. Allows iterative conversation to deepen and refine results.

```bash
npm run cli -- refine "sustainable packaging"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `connections`

Find serendipitous connections across past investigations.

```bash
npm run cli -- connections --min-similarity 0.5 --max 5
```

| Option                         | Description                        | Default   |
| ------------------------------ | ---------------------------------- | --------- |
| `--min-similarity <threshold>` | Minimum similarity threshold (0–1) | `0.3`     |
| `--max <count>`                | Maximum connections to show        | `10`      |
| `-m, --model <model>`          | LLM model to use for explanations  | `gpt-4.1` |

### Angle Chain Commands

#### `chain list`

List available pre-defined angle chains for composed innovation.

```bash
npm run cli -- chain list
```

#### `chain run <chainId> <subject>`

Run an angle chain by ID.

```bash
npm run cli -- chain run deep-disruption "AI in healthcare"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

### Feedback Commands

#### `feedback summary`

Show per-angle quality scores from collected feedback.

```bash
npm run cli -- feedback summary
```

#### `feedback rate <angleId> <rating>`

Rate an idea from a session.

```bash
npm run cli -- feedback rate scamper up --idea "Smart Packaging" --comment "Very actionable"
```

| Option             | Description        | Default   |
| ------------------ | ------------------ | --------- |
| `--idea <title>`   | Idea title to rate | `general` |
| `--comment <text>` | Optional comment   | —         |
| `--session <id>`   | Session ID         | —         |

### Angle Management

#### `angles list`

List all available innovation angles (built-in and custom).

```bash
npm run cli -- angles list
```

#### `angles create`

Create a new custom innovation angle.

```bash
npm run cli -- angles create --name "Biomimicry" --description "Nature-inspired solutions" --icon 🌿
```

| Option                 | Description                      | Default |
| ---------------------- | -------------------------------- | ------- |
| `--name <name>`        | Angle name (**required**)        | —       |
| `--description <desc>` | Angle description (**required**) | —       |
| `--icon <icon>`        | Emoji icon                       | `🔧`    |
| `--author <author>`    | Author name                      | —       |
| `--tags <tags>`        | Comma-separated tags             | —       |

#### `angles remove <id>`

Remove a custom angle by ID.

```bash
npm run cli -- angles remove biomimicry
```

#### `angles export`

Export custom angles to an angle pack file.

```bash
npm run cli -- angles export --angles biomimicry,custom-1 -o my-angles.angle.json
```

| Option                | Description                                 | Default             |
| --------------------- | ------------------------------------------- | ------------------- |
| `--angles <ids>`      | Comma-separated angle IDs (defaults to all) | all                 |
| `-o, --output <file>` | Output file path                            | `angles.angle.json` |

#### `angles import <file>`

Import angles from an `.angle.json` pack file.

```bash
npm run cli -- angles import my-angles.angle.json
```

### Export

#### `export <sessionId>`

Export a session to Markdown, JSON, or GitHub Issue format.

```bash
npm run cli -- export abc123 --format markdown -o report.md
npm run cli -- export abc123 --format github-issue
```

| Option                  | Description                                       | Default    |
| ----------------------- | ------------------------------------------------- | ---------- |
| `-f, --format <format>` | Export format: `markdown`, `json`, `github-issue` | `markdown` |
| `-o, --output <file>`   | Output file path (defaults to stdout)             | stdout     |

### Session History

#### `history list`

List recent innovation sessions.

```bash
npm run cli -- history list -n 20 --search "AI" --tag important
```

| Option             | Description                  | Default |
| ------------------ | ---------------------------- | ------- |
| `-n, --limit <n>`  | Number of sessions to show   | `10`    |
| `--search <query>` | Search by subject or content | —       |
| `--tag <tag>`      | Filter by tag                | —       |

#### `history show <id>`

Show details of a session.

```bash
npm run cli -- history show abc123
```

#### `history tag <id> <tags...>`

Add tags to a session.

```bash
npm run cli -- history tag abc123 important follow-up
```

#### `history delete <id>`

Delete a session from history.

```bash
npm run cli -- history delete abc123
```

### Presets

#### `presets list`

List all available domain presets.

```bash
npm run cli -- presets list
```

#### `presets run <presetId> <subject>`

Run the auto pipeline with a preset's configuration.

```bash
npm run cli -- presets run startup-mvp "food delivery optimization"
```

| Option                | Description                              | Default   |
| --------------------- | ---------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                         | `gpt-4.1` |
| `--score`             | Score and rank ideas after generation    | —         |
| `--file <path>`       | Use a file or directory as context input | —         |
| `--url <url>`         | Use a URL as context input               | —         |

### Plugin Management

#### `plugin list`

List all registered plugins.

```bash
npm run cli -- plugin list
```

#### `plugin load <source>`

Load a plugin from a file path or npm package.

```bash
npm run cli -- plugin load ./my-plugin.ts
npm run cli -- plugin load innovator-plugin-sustainability
```

#### `plugin create <name>`

Scaffold a new plugin project.

```bash
npm run cli -- plugin create my-plugin --type angle
```

| Option          | Description                                       | Default |
| --------------- | ------------------------------------------------- | ------- |
| `--type <type>` | Plugin type: `angle`, `exporter`, or `visualizer` | `angle` |

### Benchmark

#### `benchmark <subject>`

Compare innovation quality across LLM models.

```bash
npm run cli -- benchmark "sustainable energy" --models gpt-4.1,claude-sonnet-4.5
```

| Option                | Description                         | Default                                 |
| --------------------- | ----------------------------------- | --------------------------------------- |
| `--models <models>`   | Comma-separated models to benchmark | —                                       |
| `--angles <angles>`   | Comma-separated angle IDs           | `scamper,first-principles,cross-domain` |
| `--judge <model>`     | Model to use as evaluator/judge     | —                                       |
| `-o, --output <file>` | Output report file path             | —                                       |

### Configuration

#### `config show`

Show current LLM provider configuration.

```bash
npm run cli -- config show
```

#### `config set-provider <provider>`

Set the default LLM provider.

```bash
npm run cli -- config set-provider openai
```

Supported providers: `copilot`, `openai`, `anthropic`, `ollama`

#### `config set-model <stage> <model>`

Set the preferred model for a pipeline stage.

```bash
npm run cli -- config set-model investigation gpt-4.1
npm run cli -- config set-model generation claude-sonnet-4.5
npm run cli -- config set-model synthesis gpt-4.1
```

#### `providers`

List available LLM providers and their status.

```bash
npm run cli -- providers
```

#### `setup-offline`

Configure Ollama for offline / local-first innovation.

```bash
npm run cli -- setup-offline
```

Detects Ollama installation, checks available models, and configures the CLI for offline use with recommended models.

## Global Options

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
