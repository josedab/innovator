# Innovator — Agent Guide

## Overview

Innovator is a TypeScript monorepo using npm workspaces. All business logic lives in `@innovator/core` (`packages/core/`); consumers (`apps/web`, `apps/cli`, `packages/mcp-server`, `packages/bot`) are thin adapters.

## Monorepo Structure

```
innovator/
├── apps/
│   ├── web/          # Next.js web app (see apps/web/AGENTS.md for details)
│   └── cli/          # Commander.js CLI
├── packages/
│   ├── core/         # Shared innovation engine (ALL business logic)
│   ├── mcp-server/   # MCP server for AI tool integration
│   ├── bot/          # Chat platform bot (Slack, Discord, Teams)
│   ├── sdk/          # Framework-agnostic SDK client
│   ├── copilot-extension/  # Retired GitHub App extension compatibility stub
│   ├── vscode-extension/   # VS Code extension
│   └── create-innovator/   # Project scaffolder (npx create-innovator)
├── action/           # GitHub Action
├── website/          # Docusaurus docs site
├── docs/             # API reference, developer guide, ADRs
└── package.json      # Workspace root
```

## Key Commands

| Task              | Command                                                 |
| ----------------- | ------------------------------------------------------- |
| Install           | `npm install` (from root only)                          |
| Dev server        | `npm run dev`                                           |
| Build all         | `npm run build` (all supported production workspaces)   |
| Run tests         | `npm test`                                              |
| Run single test   | `npx vitest run packages/core/src/__tests__/my-test.ts` |
| Watch tests       | `npm run test:watch`                                    |
| Type check        | `npm run typecheck`                                     |
| Lint + fix        | `npm run lint:fix`                                      |
| Format            | `npm run format`                                        |
| Production audit  | `npm run audit:production`                              |
| All quality gates | `npm run check`                                         |
| Doctor (prereqs)  | `npm run doctor`                                        |

## Build Order

The root `build` script builds all supported workspaces in dependency order, starting with `packages/core`. Never build a consumer before core.

## Core Module Conventions (`packages/core/src/`)

### File Structure Pattern

Every core module follows this pattern:

```
packages/core/src/<module>/
├── index.ts          # Barrel exports (re-exports from implementation files)
├── types.ts          # Zod schemas and TypeScript types
├── <module>.ts       # Main implementation
└── __tests__/        # Module-specific tests (optional; many tests live in src/__tests__/)
```

### LLM Call Pattern

All LLM interactions use the same pattern:

```typescript
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";

const result = await withRetry(
  async () => {
    const raw = await generateText({ prompt, model, signal });
    const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    return MyZodSchema.parse(parsed);
  },
  { signal }
);
```

Key rules:

- Always wrap LLM calls in `withRetry()` for transient failure recovery
- Always validate LLM output with Zod schemas
- Always use `wrapUserInput()` to delimit user content in prompts (prompt injection defense)
- Always use `sanitizeLlmOutput()` to clean responses before parsing
- Pass `signal?: AbortSignal` through for cancellation support

### Type Convention

- All data types have a Zod schema (e.g., `InvestigationSchema`) and a derived TypeScript type (e.g., `type Investigation = z.infer<typeof InvestigationSchema>`)
- Schemas are defined in `types.ts`, implementations in `<module>.ts`
- Public types are re-exported from `packages/core/src/index.ts`

### Persistence Pattern

Modules that persist data write JSON to `~/.innovator/<module>/` using atomic writes:

```typescript
function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}
```

### Naming Conventions

- Directories and files: `kebab-case` (e.g., `knowledge-graph/`, `custom-angles.ts`)
- Types and interfaces: `PascalCase` (e.g., `Investigation`, `AngleResult`)
- Functions: `camelCase` (e.g., `investigate()`, `runAutoPipeline()`)
- Zod schemas: `PascalCase` with `Schema` suffix (e.g., `InvestigationSchema`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_CONCURRENCY`, `ANGLE_IDS`)

## Testing Conventions

- Test framework: Vitest (configured in root `vitest.config.ts`)
- Tests live in `src/__tests__/` directories or alongside source files
- Mock `@github/copilot-sdk` in any test that imports LLM-dependent modules:
  ```typescript
  vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));
  ```
- Use `vi.stubEnv()` for environment variable tests (not direct `process.env` mutation)
- Use temp directories (`mkdtempSync`) for tests that write to disk
- API route tests create `Request` objects and call handler functions directly

## Do Not

- Do not run `npm install` inside a workspace directory — always from root
- Do not import `@innovator/core` in client components (use `@innovator/core/types` for types only)
- Do not add new dependencies without justification — the project is deliberately minimal
- Do not modify `packages/core/src/index.ts` exports without checking for name conflicts
- Do not write to `~/.innovator/` in tests without using a temp directory
- Do not bypass Zod validation for LLM outputs — even if the response "looks right"

## Architecture Decisions

Key architectural decisions are documented as ADRs in `docs/adr/`. Read the [ADR index](docs/adr/README.md) before making structural changes.

## Workspace-Specific Guides

- `apps/web/AGENTS.md` — Next.js web app conventions, API routes, components
