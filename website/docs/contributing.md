---
id: contributing
title: Contributing
sidebar_position: 8
---

# Contributing

We welcome contributions to Innovator! Whether it's fixing a bug, adding a feature, improving documentation, or adding a new innovation angle.

## Development setup

```bash
# Clone and install
git clone https://github.com/josedab/innovator.git
cd innovator
npm install

# Build the core package
npm run build --workspace=packages/core

# Start the web app in dev mode
npm run dev

# In another terminal, test the CLI
npx tsx apps/cli/src/index.ts angles
```

## Project structure

```
innovator/
├── packages/core/src/
│   ├── types.ts            # Shared types and Zod schemas
│   ├── copilot/client.ts   # Copilot SDK wrapper
│   ├── innovation/         # Investigation, generation, pipeline
│   └── prompts/            # Prompt templates
├── apps/web/src/
│   ├── app/                # Next.js pages and API routes
│   └── components/         # React components
├── apps/cli/src/
│   └── index.ts            # CLI commands
└── website/                # Docusaurus documentation
```

## Making changes

### Core package changes

1. Edit files in `packages/core/src/`
2. Type-check: `cd packages/core && npx tsc --noEmit`
3. Rebuild: `npm run build --workspace=packages/core`
4. Test via CLI or web app

### Web app changes

1. Edit files in `apps/web/src/`
2. The dev server hot-reloads automatically
3. Type-check: `cd apps/web && npx tsc --noEmit`

#### Client vs server imports

The web app uses two different import paths for `@innovator/core`:

- **`@innovator/core`** — use in server components and API routes (has Node.js dependencies)
- **`@innovator/core/types`** — use in client components (`"use client"`) for types and constants only

Using the full `@innovator/core` import in a client component will break the build because it pulls in the Copilot SDK (Node.js-only). See the [API Reference](/docs/api-reference#client-vs-server-imports) for the full exports mapping.

### CLI changes

1. Edit `apps/cli/src/index.ts`
2. Run directly with `tsx` — no build step needed
3. Type-check: `cd apps/cli && npx tsc --noEmit`

## Adding a new innovation angle

1. **Add the angle ID** to `ANGLE_IDS` in `packages/core/src/types.ts`

2. **Define the angle** in `packages/core/src/innovation/angles.ts`:

   ```typescript
   {
     id: "your-angle",
     name: "Your Angle",
     shortDescription: "Brief description",
     icon: "🎯",
   }
   ```

3. **Write the prompt** in `packages/core/src/prompts/angles/index.ts`:

   ```typescript
   export function buildYourAnglePrompt(subject: string, investigation: Investigation): string {
     return `You are an innovation expert applying Your Angle...
   ${investigationContext(subject, investigation)}
   ...`;
   }
   ```

4. **Register it** in `packages/core/src/innovation/generate.ts`:

   ```typescript
   const ANGLE_PROMPT_MAP: Record<AngleId, PromptBuilder> = {
     // ... existing angles
     "your-angle": buildYourAnglePrompt,
   };
   ```

5. **No UI changes needed** — the `AngleSelector` component imports `ANGLES` from `@innovator/core/types`, so new angles are picked up automatically after rebuilding the core package.

6. **Rebuild** and test

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add biomimicry innovation angle
fix(web): handle empty investigation response
docs: update API reference with new angle
refactor(pipeline): improve error aggregation
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

## Code style

- TypeScript with strict mode
- Prefer `interface` over `type` for object shapes
- Only comment non-obvious logic
- Follow existing patterns in the codebase

## Pull request process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes with appropriate commits
4. Run all quality checks before pushing:
   ```bash
   npm run check     # lint, typecheck, format, test
   npm run test:ci   # full CI simulation (includes build + coverage)
   ```
5. Open a pull request with a clear description

## Testing

### Running tests

```bash
# Run all tests
npm test

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

### Test categories

- **Unit tests** — Located in `packages/*/src/__tests__/` and `apps/*/src/__tests__/`. Run with `npm test`.
- **End-to-end tests** — Located in `apps/web/e2e/`. Run with `npm run test:e2e` **from the `apps/web/` directory**.

### Mocking the LLM layer

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

### Test fixtures

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

### Coverage thresholds

CI enforces a **35% minimum** for lines, functions, and branches (configured in `vitest.config.ts`). Run `npm run test:coverage` to check locally.
