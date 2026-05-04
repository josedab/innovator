---
id: cli
title: CLI Guide
sidebar_position: 2
---

# CLI Guide

The Innovator CLI provides the same innovation engine in your terminal — ideal for scripting, pipelines, and quick exploration.

## Running the CLI

```bash
npx tsx apps/cli/src/index.ts <command> [options]
```

Or use the root shortcut:

```bash
npm run cli -- <command> [options]
```

## Commands

### `angles` — List available angles

```bash
npx tsx apps/cli/src/index.ts angles
```

Output:

```
💡 Available Innovation Angles

  🔄 scamper              SCAMPER
     Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse

  🧱 first-principles     First Principles
     Decompose to fundamental truths, then rebuild novel solutions
  ...
```

### `investigate <subject>` — Analyze a subject

```bash
npx tsx apps/cli/src/index.ts investigate "code review processes"
```

Options:

- `-m, --model <model>` — specify the LLM model (default: `gpt-4.1`)
- `--verbose` — enable verbose logging (prompts, responses, timing)

Output includes summary, key aspects, current state, challenges, opportunities, and a suggestion for which angles to try next.

### `innovate <subject>` — Generate innovations

```bash
npx tsx apps/cli/src/index.ts innovate "code review processes" \
  --angles scamper,first-principles,inversion
```

Options:

- `-a, --angles <list>` — **(required)** comma-separated angle IDs
- `-m, --model <model>` — specify the LLM model
- `--verbose` — enable verbose logging (prompts, responses, timing)

This command investigates the subject first, then generates ideas for each selected angle.

### `auto <subject>` — Full automatic pipeline

```bash
npx tsx apps/cli/src/index.ts auto "home automation"
```

Options:

- `-m, --model <model>` — specify the LLM model
- `--verbose` — enable verbose logging (prompts, responses, timing)

Runs the complete pipeline: investigate → all 8 angles → synthesis. Shows a spinner with progress updates. Outputs all ideas plus the synthesized top picks.

## Angle IDs

Use these IDs with the `--angles` flag:

| ID                 | Name                    |
| ------------------ | ----------------------- |
| `scamper`          | SCAMPER                 |
| `first-principles` | First Principles        |
| `cross-domain`     | Cross-Domain Analogy    |
| `constraints`      | Constraint Injection    |
| `inversion`        | Problem Inversion       |
| `perspectives`     | Role-Based Perspectives |
| `what-if`          | What-If Scenarios       |
| `trend-collision`  | Trend Collision         |

## Examples

```bash
# Quick exploration with 2 angles
npx tsx apps/cli/src/index.ts innovate "electric vehicles" \
  --angles constraints,what-if

# Full analysis with a specific model
npx tsx apps/cli/src/index.ts auto "developer onboarding" --model gpt-5

# Pipe output to a file
npx tsx apps/cli/src/index.ts auto "sustainable packaging" > ideas.txt
```

## Language Support

The CLI supports multi-language output. Use the `--lang` flag to set the response language, or let Innovator auto-detect it from your subject text.

### Supported Languages

| Code | Language   |
| ---- | ---------- |
| `en` | English    |
| `es` | Spanish    |
| `ja` | Japanese   |
| `de` | German     |
| `pt` | Portuguese |

### Examples

```bash
# Explicit language selection
npx tsx apps/cli/src/index.ts investigate "energía solar" --lang es
npx tsx apps/cli/src/index.ts auto "再生可能エネルギー" --lang ja

# Auto-detection: Japanese characters are detected automatically
npx tsx apps/cli/src/index.ts investigate "人工知能の教育応用"
```

If `--lang` is omitted, the language is auto-detected from the subject. English is the default fallback. See [Core Concepts — Multi-Language Support](../core-concepts.md#multi-language-support-i18n) for details on detection behavior.
