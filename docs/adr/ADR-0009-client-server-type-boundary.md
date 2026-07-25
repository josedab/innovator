# ADR-0009: Client/Server Type Boundary via Subpath Exports

## Status

Accepted

## Context

`@innovator/core` depends on Node.js APIs (`fs`, `os`, `child_process` via the Copilot SDK) and the `@github/copilot-sdk` package. These cannot run in a browser environment. However, the Next.js web app has React client components (marked with `"use client"`) that need access to core's TypeScript types — `Investigation`, `AngleResult`, `Synthesis`, `AngleDefinition`, etc. — for type-safe rendering.

Importing from `@innovator/core` in a client component causes Next.js to attempt bundling Node.js-only code into the client bundle, resulting in build errors.

The team needed a way to share types between server and client code without leaking Node.js dependencies into the browser bundle.

## Decision

We configure `@innovator/core` with explicit package entry points using Node.js subpath exports in
`package.json`. The browser boundary remains the dedicated `./types` entry point; cohesive
server-only leaf barrels are also supported:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/client.js",
      "types": "./dist/client.d.ts"
    },
    "./innovation": {
      "import": "./dist/innovation/index.js",
      "types": "./dist/innovation/index.d.ts"
    },
    "./runtime": {
      "import": "./dist/runtime/index.js",
      "types": "./dist/runtime/index.d.ts"
    }
  }
}
```

- **`@innovator/core`** (main) — Compatibility barrel with the complete public surface. Used only in server-side code.
- **`@innovator/core/types`** (client subpath) — `client.ts` re-exports only types, Zod schemas, and pure-JavaScript constants (like `ANGLES`). No Node.js imports, no Copilot SDK, no side effects.
- **Server feature subpaths** — `innovation`, `runtime`, `copilot`, `providers`, `verticals`, and `analytics` expose built leaf barrels with declarations. They are not browser-safe entry points.

The convention is enforced by documentation and code review:

```typescript
// ✅ Server-side (API route, server component)
import { investigate, generateForAngle } from "@innovator/core/innovation";

// ✅ Server-side compatibility import for mixed feature groups
import { investigate, scoreIdeas } from "@innovator/core";

// ✅ Client-side ("use client" component)
import type { Investigation, AngleResult } from "@innovator/core/types";

// ❌ NEVER — will break the build
import { investigate } from "@innovator/core"; // in a "use client" file
```

## Consequences

**Positive:**

- **Clean module boundary** — The client subpath is explicitly designed to be browser-safe. It's easy to audit: if it's in `client.ts`, it must be free of Node.js dependencies.
- **Cohesive server imports** — Feature subpaths let adapters depend on the public area they use without exposing arbitrary built files.
- **Type sharing without duplication** — Client components use the exact same types as server code, avoiding manual type duplication or `@types` packages.
- **Build-time enforcement** — Incorrect imports in client components produce immediate Next.js build errors, catching violations early.
- **Tree-shakeable** — Because `client.ts` only re-exports types and constants, the client bundle includes zero unnecessary runtime code.

**Negative:**

- **Developer discipline required** — The boundary is a convention, not a compiler-enforced rule. A careless import of `@innovator/core` in a client component will compile locally (TypeScript doesn't care) but fail at Next.js build time.
- **Maintenance burden** — Every new type that client components need must be explicitly added to `client.ts`. Forgetting to export a type forces the consumer to either use `any` or add it.
- **Entry-point discipline** — Developers must distinguish the browser-safe `types` path from server-only feature paths and use the root only for mixed or compatibility imports.
