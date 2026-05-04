---
id: troubleshooting
title: Troubleshooting
sidebar_position: 7
---

# Troubleshooting

Common issues and how to resolve them.

## "Cannot find module '@github/copilot-sdk'"

**Cause:** Dependencies not installed.

```bash
npm install
```

## "ERR_MODULE_NOT_FOUND: vscode-jsonrpc/node"

**Cause:** Running the CLI with `node` instead of `tsx`. The Copilot SDK has ESM resolution requirements that `tsx` handles.

**Fix:** Always use `tsx` to run the CLI:

```bash
npx tsx apps/cli/src/index.ts <command>
```

Do **not** use `node apps/cli/dist/index.js` directly.

## "Investigation failed" or empty responses

**Possible causes:**

1. **Not authenticated with GitHub CLI**

   ```bash
   gh auth login
   gh auth status  # verify
   ```

2. **No Copilot subscription** — you need an active GitHub Copilot subscription (Free, Pro, or Enterprise).

3. **Model not available** — try a different model:
   ```bash
   npx tsx apps/cli/src/index.ts investigate "topic" --model gpt-4.1
   ```

## "Failed to extract JSON from response"

**Cause:** The LLM returned a response that doesn't contain valid JSON.

This can happen with certain models or when the subject is very short or ambiguous. Try:

- A more descriptive subject ("machine learning in healthcare" instead of "ML")
- A different model (`--model gpt-5`)
- Running the same command again (LLM responses are non-deterministic)

## API returns 400 with validation errors

**Cause:** The request body doesn't match the expected schema.

Check the error response for details:

```json
{
  "error": "Invalid request. Please check your input and try again."
}
```

Ensure your request includes all required fields. See the [API Reference](/docs/api-reference).

## Web app shows "Error" after investigation

**Cause:** The API route failed. Check the terminal running `npm run dev` for the full error.

Common issues:

- Copilot SDK not authenticated
- Rate limiting (too many rapid requests)
- Network connectivity issues

## Auto Mode progress bar stuck

**Possible causes:**

- A long-running LLM call (some models take 30-60 seconds per angle)
- Network timeout — the SSE stream may have been interrupted

**Fix:** Refresh the page and try again. The pipeline is stateless so there's no stale state to worry about.

## Build errors after editing core package

After modifying files in `packages/core/src/`, rebuild the core package:

```bash
npm run build --workspace=packages/core
```

The web app's dev server (`npm run dev`) picks up changes automatically via `transpilePackages`.

## `npm run doctor` checks

The `npm run doctor` command verifies your development environment is ready. It checks:

| Check                        | What it verifies                           | Fix if it fails                                                                   |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| **Node.js ≥ 20**             | Your Node.js major version is 20 or higher | Install Node.js 20+ via `nvm install 20` or from [nodejs.org](https://nodejs.org) |
| **GitHub CLI installed**     | The `gh` command is available on your PATH | Install from [cli.github.com](https://cli.github.com)                             |
| **GitHub CLI authenticated** | `gh auth status` succeeds                  | Run `gh auth login`                                                               |
| **Core package built**       | `packages/core/dist/` exists               | Run `npm run build --workspace=packages/core`                                     |

If all checks pass (✅), you're ready to develop. If any check fails (❌), follow the fix instructions above.

## Port 3000 already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 npm run dev
```

## Windows & WSL Compatibility

Innovator is developed and tested primarily on macOS and Linux. If you're on Windows, we recommend using **WSL 2** (Windows Subsystem for Linux) for the best experience.

### Recommended: WSL 2

1. Install WSL 2 if you haven't already:
   ```powershell
   wsl --install
   ```
2. Open a WSL terminal (Ubuntu is the default distribution)
3. Install Node.js 20+ inside WSL:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
4. Install GitHub CLI inside WSL:
   ```bash
   sudo apt install -y gh
   gh auth login
   ```
5. Clone and run Innovator from within the WSL filesystem (not `/mnt/c/`):
   ```bash
   cd ~
   git clone https://github.com/josedab/innovator.git
   cd innovator
   npm install
   npm run dev
   ```

:::tip
Always work within the WSL filesystem (`~/...`) rather than the mounted Windows filesystem (`/mnt/c/...`). File operations on `/mnt/c/` are significantly slower and can cause permission issues.
:::

### Native Windows (without WSL)

If you prefer to run natively on Windows:

- **Line endings** — Configure Git to use LF line endings:
  ```powershell
  git config --global core.autocrlf input
  ```
- **Shell scripts** — Some npm scripts use shell syntax. Install [Git Bash](https://gitforwindows.org/) and configure npm to use it:
  ```powershell
  npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
  ```
- **Port conflicts** — Use `netstat -ano | findstr :3000` instead of `lsof` to find port conflicts.
- **Environment variables** — Use `set` instead of `export`, or use [cross-env](https://www.npmjs.com/package/cross-env):
  ```powershell
  set INNOVATOR_API_KEY=your-key && npm start
  ```
- **Path length limits** — Enable long paths in Windows if you encounter `ENAMETOOLONG` errors:
  ```powershell
  # Run as Administrator
  reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f
  ```

### Known Windows Issues

| Issue                                  | Cause                             | Fix                                            |
| -------------------------------------- | --------------------------------- | ---------------------------------------------- |
| `ENOENT` on `gh` commands              | GitHub CLI not in PATH            | Reinstall `gh` or add to PATH manually         |
| `npm run doctor` fails on shell syntax | Script uses Bash syntax           | Run from Git Bash or WSL                       |
| Slow `npm install`                     | Antivirus scanning `node_modules` | Exclude project folder from real-time scanning |
| `EPERM` errors during `npm install`    | File locked by another process    | Close VS Code / editors, retry                 |
