---
id: examples
title: Examples
sidebar_position: 24
---

# Examples

Standalone integration scripts showing how to use `@innovator/core` programmatically from Node.js. All examples live in the [`examples/`](https://github.com/josedab/innovator/tree/main/examples) directory at the repository root.

## Prerequisites

```bash
# From the repository root
npm install
npm run build --workspace=packages/core
```

## Available Examples

| Script                   | What It Shows                                              |
| ------------------------ | ---------------------------------------------------------- |
| `basic-usage.ts`         | Full investigation → generation → synthesis pipeline       |
| `custom-angles.ts`       | Registering and using custom innovation angles             |
| `with-budget.ts`         | Cost tracking and budget management                        |
| `debate-and-redteam.ts`  | Structured debate engine and adversarial red team analysis |
| `portfolio-lifecycle.ts` | Full idea lifecycle from ideation to shipped               |

## Running

```bash
# Run any example with tsx
npx tsx examples/basic-usage.ts
npx tsx examples/custom-angles.ts
npx tsx examples/with-budget.ts
npx tsx examples/debate-and-redteam.ts
npx tsx examples/portfolio-lifecycle.ts

# Pass a custom subject to any example
npx tsx examples/basic-usage.ts "quantum computing"
```

## Further Reading

- [Developer Guide](https://github.com/josedab/innovator/blob/main/docs/DEVELOPER_GUIDE.md) — Recipes and patterns for working with the codebase
- [API Reference](/docs/api-reference) — Full function signatures and parameter tables
- Full details in the [examples/README.md](https://github.com/josedab/innovator/blob/main/examples/README.md)
