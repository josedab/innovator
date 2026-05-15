---
id: troubleshooting-guide
title: Troubleshooting Guide
sidebar_label: Troubleshooting Guide
sidebar_position: 99
---

# Troubleshooting Guide

This guide provides detailed solutions for common issues you may encounter when developing with or running Innovator. For a quick-reference table, see the [README troubleshooting section](https://github.com/josedab/innovator#troubleshooting).

---

## Authentication & Copilot

### `gh auth` / Copilot token errors

**Symptoms:** "Authentication failed", "No Copilot subscription", or "token expired" errors.

**Root cause:** The GitHub CLI is not authenticated or your account lacks an active Copilot subscription.

**Solution:**

```bash
# 1. Log in to GitHub CLI
gh auth login

# 2. Verify authentication status
gh auth status

# 3. Confirm Copilot subscription is active
gh copilot --version
```

For CI/Docker environments where `gh` CLI is not available, set the `GH_TOKEN` environment variable:

```bash
export GH_TOKEN=ghp_your_personal_access_token
```

### Copilot token expiry mid-pipeline

**Symptoms:** Pipeline fails partway through — investigation succeeds but angle generation fails with auth errors.

**Root cause:** The GitHub Copilot token expired during a long-running pipeline (auto mode can take 60+ seconds).

**Solution:**

1. Re-authenticate: `gh auth login && gh auth status`
2. For CI/Docker: use `GH_TOKEN` with a long-lived token
3. For production: consider a direct provider (OpenAI/Anthropic) that uses stable API keys

---

## Model & LLM Issues

### Model not available

**Symptoms:** "Model not found" or "Model not available" errors.

**Solution:**

- Check model availability with your provider
- Use `INNOVATOR_EXTRA_MODELS` to allowlist custom model IDs:
  ```bash
  INNOVATOR_EXTRA_MODELS=my-custom-model npm run dev
  ```
- Switch providers via `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variables

### "Failed to extract JSON from response"

**Symptoms:** LLM returns text that doesn't contain valid JSON.

**Common causes:**

- Subject is too short or ambiguous ("ML" instead of "machine learning in healthcare")
- Model generates markdown-wrapped JSON that the parser can't extract
- Model hallucinated a different response format

**Solution:**

1. Use a more descriptive subject
2. Try a different model: `--model gpt-5`
3. Re-run the command (LLM responses are non-deterministic)

### LLM request timeouts

**Symptoms:** `ETIMEDOUT`, `AbortError`, or "Investigation failed" after a long wait.

**Solution:**

Increase `INNOVATOR_LLM_TIMEOUT_MS` (default: 90,000 ms):

```bash
# Increase to 3 minutes for complex subjects
INNOVATOR_LLM_TIMEOUT_MS=180000 npm run dev
```

:::note
Some hosting platforms (e.g., Vercel) have their own function execution time limits that may also need adjustment.
:::

---

## Rate Limiting

### LLM rate limiting (429 errors)

**Symptoms:** `"Too many requests"` or `"Rate limit exceeded"` in server logs, especially during auto mode.

**Solution:**

1. **Wait and retry** — most rate limits reset within 60 seconds
2. **Reduce concurrency** — avoid running multiple auto pipelines simultaneously
3. **Use a different model** — some models have higher rate limits:
   ```bash
   INNOVATOR_DEFAULT_MODEL=gpt-4o-mini npm run dev
   ```
4. **Check built-in rate limiter** — Innovator enforces 10 req/min globally and 3 req/min for `/api/auto`. The 429 response includes a `Retry-After` header.

### API returns 400 with validation errors

**Symptoms:** `"Invalid request. Please check your input and try again."`

**Solution:** Ensure your request includes all required fields. Check the error response `details` field for specific validation issues. See the [API Reference](/docs/api-reference) for request schemas.

---

## Web App Issues

### Port 3000 already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 npm run dev
```

### Web app shows "Error" after investigation

**Root cause:** The API route failed. Check the terminal running `npm run dev` for the full error.

**Common causes:**

- Copilot SDK not authenticated
- Rate limiting (too many rapid requests)
- Network connectivity issues

### Auto mode progress bar stuck

**Possible causes:**

- A long-running LLM call (some models take 30–60 seconds per angle)
- Network timeout — the SSE stream may have been interrupted

**Solution:** Refresh the page and try again. The pipeline is stateless.

### SSE stream closes unexpectedly during auto mode

**Possible causes:**

- Network timeout or proxy (Cloudflare, nginx) closing idle connections
- Client navigated away or closed the tab mid-pipeline

**Solution:**

1. **Increase proxy timeouts** — set read/idle timeout to at least 120 seconds
2. **Check server logs** — the `npm run dev` terminal shows the underlying error
3. **Use non-streaming mode:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/auto \
     -H "Content-Type: application/json" \
     -H "X-API-Key: inv_abc123..." \
     -d '{ "subject": "your subject", "stream": false }'
   ```

### CORS errors with embed widget

**Symptoms:** `Access-Control-Allow-Origin` errors in browser console.

**Solution:**

```bash
# Allow specific origins
INNOVATOR_EMBED_ORIGINS=https://mysite.com,https://docs.mysite.com

# Or allow all (not recommended for production)
INNOVATOR_EMBED_ORIGINS=*
```

If using `INNOVATOR_EMBED_API_KEY`, ensure the widget sends it via the `X-Embed-Key` header:

```html
<innovator-widget api-key="your-embed-key"></innovator-widget>
```

---

## Build & Development

### Build failures after upgrade

```bash
npm run clean:all && rm -rf node_modules && npm install && npm run build
```

### Build errors after editing core package

After modifying files in `packages/core/src/`, rebuild:

```bash
npm run build --workspace=packages/core
```

The web app dev server picks up changes automatically via `transpilePackages`.

### "Cannot find module '@github/copilot-sdk'"

**Cause:** Dependencies not installed.

```bash
npm install   # Always run from the monorepo root
```

### "ERR_MODULE_NOT_FOUND: vscode-jsonrpc/node"

**Cause:** Running the CLI with `node` instead of `tsx`.

**Fix:** Always use `tsx`:

```bash
npx tsx apps/cli/src/index.ts <command>
```

### "Custom angle with ID already exists"

**Solution:**

1. Choose a different, unique ID for your custom angle
2. Remove the existing one first via `removeCustomAngle(id)` or `DELETE /api/custom-angles?id=<id>`
3. Built-in angle IDs cannot be overridden

---

## Environment Checks

### `npm run doctor` checks

The `npm run doctor` command verifies your development environment:

| #   | Check                        | What it verifies             | Fix                                                   |
| --- | ---------------------------- | ---------------------------- | ----------------------------------------------------- |
| 1   | **Node.js ≥ 20**             | Major version is ≥ 20        | `nvm install 20` or [nodejs.org](https://nodejs.org)  |
| 2   | **npm ≥ 10**                 | npm version is ≥ 10          | `npm install -g npm@latest`                           |
| 3   | **GitHub CLI installed**     | `gh --version` succeeds      | Install from [cli.github.com](https://cli.github.com) |
| 4   | **GitHub CLI authenticated** | `gh auth status` succeeds    | Run `gh auth login`                                   |
| 5   | **Core package built**       | `packages/core/dist/` exists | `npm run build --workspace=packages/core`             |

All checks run even if earlier ones fail, so you can see every issue at once.

---

## Platform-Specific Issues

### Windows & WSL

Innovator is developed primarily on macOS and Linux. On Windows, use **WSL 2** for the best experience:

```powershell
wsl --install
```

**Known Windows issues:**

| Issue                     | Cause                             | Fix                                  |
| ------------------------- | --------------------------------- | ------------------------------------ |
| `ENOENT` on `gh` commands | GitHub CLI not in PATH            | Reinstall `gh` or add to PATH        |
| `npm run doctor` fails    | Script uses Bash syntax           | Run from Git Bash or WSL             |
| Slow `npm install`        | Antivirus scanning `node_modules` | Exclude project folder from scanning |
| `EPERM` errors            | File locked by another process    | Close editors, retry                 |

For native Windows (without WSL), configure Git for LF line endings:

```powershell
git config --global core.autocrlf input
```

---

## Getting More Help

If your issue isn't listed here:

1. Check the [GitHub Issues](https://github.com/josedab/innovator/issues) for similar problems
2. Run `npm run doctor` to verify your environment
3. Check server logs in the terminal running `npm run dev`
4. Open a new issue with your error message, Node.js version, and OS
