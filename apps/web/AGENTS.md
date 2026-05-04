<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Innovator Web App — Agent Guide

## Overview

`apps/web` is a Next.js App Router application serving the Innovator UI and API routes. It is part of a monorepo that also includes `apps/cli` (CLI tool), `packages/core` (shared logic), and `website` (docs site).

## Project Structure

```
apps/web/src/
├── app/
│   ├── page.tsx              # Main page — investigation → angle selection → results flow
│   ├── appReducer.ts         # State machine driving UI stages
│   ├── layout.tsx            # Root layout with metadata
│   ├── api/                  # API route handlers (Next.js Route Handlers)
│   │   ├── investigate/      # Subject investigation endpoint
│   │   ├── innovate/         # Angle-based idea generation endpoint
│   │   ├── auto/             # Full auto pipeline (SSE streaming)
│   │   ├── pipeline/         # Natural language pipeline (SSE)
│   │   ├── artifacts/        # Artifact generation (PRD, tech spec, etc.)
│   │   ├── collaborate/      # Collaborative sessions
│   │   ├── embed/            # Embeddable widget endpoint (CORS-enabled)
│   │   └── ...               # share, export, validate, refine, etc.
│   ├── analytics/            # Analytics dashboard page
│   └── dashboard/            # Dashboard page
├── components/
│   ├── SubjectInput.tsx      # Subject entry form
│   ├── InvestigationView.tsx # Investigation results display
│   ├── AngleSelector.tsx     # Angle selection grid
│   ├── InnovationResults.tsx # Innovation results cards
│   ├── AutoModePanel.tsx     # Auto mode with SSE progress streaming
│   ├── IdeaWorkshop.tsx      # Drag-and-drop idea workshop
│   ├── PriorityMatrix.tsx    # Priority/impact quadrant matrix
│   ├── IdeaMap.tsx           # Idea relationship visualization
│   └── __tests__/            # Component tests
├── lib/
│   ├── api-auth.ts           # API key validation (INNOVATOR_API_KEY / INNOVATOR_API_KEYS)
│   ├── api-headers.ts        # Shared response headers (CORS, security)
│   ├── validate-request.ts   # Content-type and model validation
│   ├── rate-limit.ts         # In-memory rate limiting
│   ├── logger.ts             # Structured logging
│   └── env.ts                # Environment configuration
├── middleware.ts              # Rate limiting, auth, CSP headers, body size limits
└── instrumentation.ts         # CopilotClient lifecycle (env validation + graceful shutdown)
```

## Architecture & Conventions

### Server/Client Boundary

- **Server-side** code imports from `@innovator/core` (full module)
- **Client components** import from `@innovator/core/types` only (client-safe subpath, types only)
- Never import core functions in `"use client"` components

### API Routes

- All routes live in `src/app/api/` using Next.js App Router conventions
- Each exports `GET` and/or `POST` handler functions
- Input validation uses Zod schemas
- All responses include `API_RESPONSE_HEADERS` from `src/lib/api-headers.ts`

### Streaming

- SSE endpoints (`auto`, `pipeline`) use `ReadableStream` with a heartbeat keepalive
- Events follow the pattern: `data: {"stage": "...", ...}\n\n`

### Authentication

- `src/middleware.ts` checks `INNOVATOR_API_KEY` on all `/api/*` routes when the env var is set
- `INNOVATOR_API_KEYS` supports comma-separated multi-key auth
- See `src/lib/api-auth.ts` for validation logic

### State Machine

- `appReducer.ts` manages the UI flow: `input → investigating → explored → innovating → results | auto`
- All UI state transitions go through this reducer

## Testing

- **Unit tests**: `src/__tests__/` and `src/components/__tests__/` — run via `vitest` from monorepo root (`npm test`)
- **Test patterns**:
  - Mock `@innovator/core` functions with `vi.mock()`
  - Use `@testing-library/react` for component tests
  - API route tests create `Request` objects and call exported handler functions directly
  - Use `vi.stubEnv()` for environment variable tests

## Common Tasks

| Task                | How                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Add a new API route | Create `src/app/api/<name>/route.ts`, export `GET`/`POST`, validate with Zod, use `API_RESPONSE_HEADERS` |
| Add a new component | Create in `src/components/`, add test in `src/components/__tests__/`                                     |
| Modify auth         | Edit `src/lib/api-auth.ts` and `src/middleware.ts`                                                       |
| Start dev server    | `npm run dev` from monorepo root (builds core first, then starts Next.js)                                |
| Run tests           | `npm test` from monorepo root                                                                            |

## Environment Variables

See `.env.local.example` at monorepo root. Key variables:

| Variable                   | Description                               |
| -------------------------- | ----------------------------------------- |
| `INNOVATOR_DEFAULT_MODEL`  | Default LLM model                         |
| `INNOVATOR_API_KEY`        | API key for route auth (optional)         |
| `INNOVATOR_API_KEYS`       | Comma-separated multi-key auth (optional) |
| `INNOVATOR_LLM_TIMEOUT_MS` | LLM request timeout in ms                 |

## Do Not

- Do not add `"use client"` to API route files
- Do not import from `@innovator/core` in client components (use `@innovator/core/types` for types only)
- Do not modify `middleware.ts` without understanding the rate-limiting and auth flow
- Do not use `fetch()` in server-side API routes to call other API routes — import the core functions directly
