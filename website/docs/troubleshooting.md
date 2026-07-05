---
id: troubleshooting
title: Troubleshooting
sidebar_position: 7
---

# Troubleshooting

Common issues and how to resolve them.

## Production Startup Returns 503

Production fails closed when required runtime configuration is missing or invalid.

Verify:

```bash
NODE_ENV=production
INNOVATOR_DEPLOYMENT_PROFILE=single-tenant
INNOVATOR_API_KEYS=replace-with-one-or-more-unique-32-character-keys
GH_TOKEN=replace-with-token
```

Do not set legacy `INNOVATOR_API_KEY` together with `INNOVATOR_API_KEYS`. Check readiness for a sanitized result:

```bash
curl -i http://127.0.0.1:3000/readyz
docker compose logs --tail=100 innovator
```

`/readyz` also returns `503` when either state directory is not writable or the Copilot provider cannot start and list available models.

## A Route Returns 404 in Production

This is expected for the browser UI and experimental surfaces. Production only exposes the route allowlist documented in the [Deployment guide](/docs/guides/deployment#production-routes).

OAuth, billing, tenant/workspace administration, uploads, webhooks, integrations, collaboration, dynamic API keys, the portal, and other non-allowlisted routes intentionally return `404`.

## Protected API Returns 401

Send one configured production key:

```bash
curl \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  https://api.example.com/api/health
```

The `Authorization` header with the bearer scheme is also accepted. Confirm the client key exactly matches one entry in `INNOVATOR_API_KEYS`.

## MCP `--sse` Fails

This is intentional. The MCP server supports stdio only and the legacy network transport fails closed. Remove `--sse` and `MCP_PORT` from the client configuration. Use `MCP_ALLOWED_ROOT` to restrict filesystem analysis.

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

## Web app shows "Error" after investigation (development only)

**Cause:** The API route failed. Check the terminal running `npm run dev` for the full error.

Common issues:

- Copilot SDK not authenticated
- Rate limiting (too many rapid requests)
- Network connectivity issues

## Auto Mode progress bar stuck

**Possible causes:**

- A long-running LLM call (some models take 30-60 seconds per angle)
- Network timeout — the SSE stream may have been interrupted

**Fix:** Refresh the page and retry. In-flight pipelines are not resumable.

## Build errors after editing core package

After modifying files in `packages/core/src/`, rebuild the core package:

```bash
npm run build --workspace=packages/core
```

The web app's dev server (`npm run dev`) picks up changes automatically via `transpilePackages`.

## `npm run doctor` checks

The `npm run doctor` command (implemented in `scripts/doctor.mjs`) verifies the development environment and exits non-zero when a required check fails. `npm run dev` runs it automatically.

Checks cover Node.js 22+, npm 10+, TypeScript 5.6+, GitHub CLI installation/authentication, core and CLI build outputs, `.env.local`, installed dependencies, workspace manifests, Git hooks, `.nvmrc`, the lockfile, and available disk space.

Each check prints ✅, ⚠️, or ❌ so you can address all reported issues in one pass.

If all checks pass (✅), you're ready to develop. If any check fails (❌), follow the fix instructions above.

## Port 3000 already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 npm run dev
```

## LLM Rate Limiting (429 Errors)

**Cause:** The LLM provider (GitHub Copilot, OpenAI, Anthropic) is returning HTTP 429 due to too many requests.

**Symptoms:**

- Errors during auto mode, especially with many angles running in sequence
- `"Too many requests"` or `"Rate limit exceeded"` in server logs

**Fix:**

1. **Wait and retry** — most rate limits reset within 60 seconds
2. **Reduce concurrency** — avoid running multiple auto pipelines simultaneously
3. **Use a different model** — some models have higher rate limits:
   ```bash
   INNOVATOR_DEFAULT_MODEL=gpt-4o-mini npm run dev
   ```
4. **Check the built-in rate limiter** — Innovator's own middleware has limits (10 req/min global, 3 req/min for `/api/auto`). The 429 response includes a `Retry-After` header

## Copilot Token Expiry Mid-Pipeline

**Cause:** The GitHub Copilot authentication token expired during a long-running pipeline (auto mode can take 60+ seconds).

**Symptoms:**

- Pipeline fails partway through with authentication errors
- Works for investigation but fails during angle generation

**Fix:**

1. Re-authenticate the GitHub CLI:
   ```bash
   gh auth login
   gh auth status  # verify token is fresh
   ```
2. For CI/Docker environments, set `GH_TOKEN` with a long-lived token:
   ```bash
   export GH_TOKEN=ghp_your_token
   ```
3. In the first production profile, refresh or replace `GH_TOKEN`; direct OpenAI and Anthropic providers are development/experimental rather than supported production fallbacks

## Request Timeout Tuning

**Cause:** LLM calls timing out before completion, especially with larger models or complex subjects.

**Symptoms:**

- `"Investigation failed"` errors after a long wait
- Auto mode stalls on specific angles
- `ETIMEDOUT` or `AbortError` in server logs

**Fix:**

Increase the LLM timeout via the `INNOVATOR_LLM_TIMEOUT_MS` environment variable (default: 90,000 ms = 90 seconds):

```bash
# Increase to 3 minutes for complex subjects
INNOVATOR_LLM_TIMEOUT_MS=180000 npm run dev
```

For production deployments, set this in the Compose environment and ensure the TLS reverse proxy allows at least 180 seconds for streaming requests. Vercel/serverless is unsupported.

## CORS Errors with Embed Widget (development only)

`/api/embed` returns `404` in production.

**Cause:** The `<innovator-widget>` or `/api/embed` endpoint is being called from a domain not in the allowed origins list.

**Symptoms:**

- Browser console shows `Access-Control-Allow-Origin` errors
- Widget loads but API calls fail
- `OPTIONS` preflight requests return 403

**Fix:**

1. Set `INNOVATOR_EMBED_ORIGINS` to include your domain(s):

   ```bash
   INNOVATOR_EMBED_ORIGINS=https://mysite.com,https://docs.mysite.com
   ```

   Leave unset or set to `*` to allow all origins (not recommended for production).

2. If using `INNOVATOR_EMBED_API_KEY`, ensure the widget sends it via the `X-Embed-Key` header:

   ```html
   <innovator-widget api-key="your-embed-key"></innovator-widget>
   ```

3. Verify the `/api/embed` endpoint responds to `OPTIONS` requests — it should return CORS headers automatically

## "Custom angle with ID already exists" (development only)

**Cause:** You're trying to register a custom angle with an ID that is already taken — either by a built-in angle or a previously registered custom angle.

**Fix:**

1. Choose a different, unique ID for your custom angle
2. If you want to replace an existing custom angle, remove it first via `removeCustomAngle(id)` or a development-only custom-angle route, then re-add it
3. Built-in angle IDs (`scamper`, `first-principles`, `cross-domain`, `constraints`, `inversion`, `perspectives`, `what-if`, `trend-collision`) cannot be overridden

## SSE Stream Closes Unexpectedly During Auto Mode

**Cause:** The Server-Sent Events (SSE) connection used by the auto pipeline's streaming mode was interrupted before the pipeline completed.

**Possible causes:**

- Network timeout or proxy (e.g., Cloudflare, nginx) closing idle connections
- Client navigated away or closed the browser tab mid-pipeline
- Server-side error during angle generation that terminated the stream

**Fix:**

1. **Increase proxy timeouts** — if behind a reverse proxy, set the read/idle timeout to at least 120 seconds (auto mode can take 60–90 seconds for all angles)
2. **Check server logs** — the terminal running `npm run dev` will show the underlying error
3. **Use non-streaming mode** — pass `"stream": false` in the request body to get a single JSON response instead of SSE:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auto \
     -H "Content-Type: application/json" \
     -H "X-API-Key: inv_abc123..." \
     -d '{ "subject": "your subject", "stream": false }'
   ```
4. **Retry the request** — the pipeline is stateless, so retrying is safe

## Windows & WSL Compatibility

Innovator is developed and tested primarily on macOS and Linux. If you're on Windows, we recommend using **WSL 2** (Windows Subsystem for Linux) for the best experience.

### Recommended: WSL 2

1. Install WSL 2 if you haven't already:
   ```powershell
   wsl --install
   ```
2. Open a WSL terminal (Ubuntu is the default distribution)
3. Install Node.js 22+ inside WSL:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
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
- **Environment variables** — Use `set` instead of `export`, or use [cross-env](https://www.npmjs.com/package/cross-env). For local development:
  ```powershell
  set INNOVATOR_DEFAULT_MODEL=gpt-4.1 && npm run dev
  ```
  Use the documented Docker Compose profile rather than native `npm start` for production.
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
