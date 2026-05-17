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
| Node.js >= 22               | Major version of the running Node.js is 22 or higher | Upgrade Node.js — see `.nvmrc`                |
| npm >= 10                   | npm major version is 10 or higher                    | Upgrade npm (comes with Node 22+)             |
| TypeScript >= 5.6           | TypeScript version is 5.6 or higher                  | Run `npm install`                             |
| GitHub CLI (`gh`) installed | `gh --version` succeeds                              | Install from https://cli.github.com           |
| GitHub CLI authenticated    | `gh auth status` succeeds                            | Run `gh auth login`                           |
| Core package built          | `packages/core/dist/` directory exists               | Run `npm run build --workspace=packages/core` |
| `.env.local` configuration  | `.env.local` file exists (warning only)              | `cp .env.local.example .env.local`            |
| Dependencies installed      | `node_modules/` directory exists                     | Run `npm install`                             |
| Workspace packages valid    | All workspace `package.json` files exist             | Check workspace directories                   |
| Git hooks configured        | `.husky/` directory exists (warning only)            | Run `npm run prepare`                         |
| Node version matches .nvmrc | Running Node matches `.nvmrc` (warning only)         | Use `nvm use` to switch versions              |
| Lock file present           | `package-lock.json` exists                           | Run `npm install`                             |
| Sufficient disk space       | At least 1 GB free disk space (warning only)         | Free up disk space                            |

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
