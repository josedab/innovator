# scripts/

Development scripts for the Innovator monorepo.

## Available Scripts

### `doctor.mjs`

Prerequisite health-check for local development. Verifies that required tools and build outputs are in place before starting the dev server.

**Invocation:**

```bash
# Via npm
npm run doctor

# Via make
make doctor

# Directly
node scripts/doctor.mjs
```

**Checks performed:**

| Check                       | What it verifies                                     | Fix if failing                                |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| Node.js >= 20               | Major version of the running Node.js is 20 or higher | Upgrade Node.js — see `.nvmrc`                |
| GitHub CLI (`gh`) installed | `gh --version` succeeds                              | Install from https://cli.github.com           |
| GitHub CLI authenticated    | `gh auth status` succeeds                            | Run `gh auth login`                           |
| Core package built          | `packages/core/dist/` directory exists               | Run `npm run build --workspace=packages/core` |

**Exit codes:**

- `0` — all checks pass
- `1` — one or more checks failed

**Integration:** The `npm run dev` script runs `doctor.mjs` automatically before starting the Next.js dev server. If any check fails, the dev server will not start.

## Extending

To add a new check to `doctor.mjs`, use the `check()` helper:

```javascript
check("My new check", () => {
  // Throw an Error to fail the check
  // Return { warn: "message" } for a non-fatal warning
  // Return nothing for a pass
});
```
