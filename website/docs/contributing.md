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

### CLI changes

1. Edit `apps/cli/src/index.ts`
2. Run directly with `tsx` — no build step needed
3. Type-check: `cd apps/cli && npx tsc --noEmit`

## Adding a new innovation angle

1. **Define the angle** in `packages/core/src/innovation/angles.ts`:

   ```typescript
   {
     id: "your-angle",
     name: "Your Angle",
     shortDescription: "Brief description",
     icon: "🎯",
   }
   ```

2. **Add the ID** to `ANGLE_IDS` in `packages/core/src/types.ts`

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
4. Ensure all type-checks pass (`npx tsc --noEmit` in each package)
5. Ensure the web app builds (`npm run build --workspace=apps/web`)
6. Open a pull request with a clear description
