# Examples

Standalone integration samples showing how to use `@innovator/core` programmatically from Node.js.

## Prerequisites

These examples assume you have the monorepo set up and the core package built:

```bash
# From the repository root
npm install
npm run build --workspace=packages/core
```

## Running Examples

```bash
# Run with tsx (TypeScript execution)
npx tsx examples/basic-usage.ts
npx tsx examples/custom-angles.ts
npx tsx examples/with-budget.ts
```

## Files

| File               | Description                                  |
| ------------------ | -------------------------------------------- |
| `basic-usage.ts`   | Run the investigation and auto pipeline      |
| `custom-angles.ts` | Create and register custom innovation angles |
| `with-budget.ts`   | Set up budget caps and monitor costs         |

## Using in Your Own Project

To use `@innovator/core` in a standalone project:

```bash
npx create-innovator my-project
```

Or install directly:

```bash
npm install @innovator/core
```

Then import and use:

```typescript
import { investigate, runAutoPipeline } from "@innovator/core";
```
