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
  "error": "Invalid request",
  "details": {
    "fieldErrors": {
      "subject": ["String must contain at least 1 character(s)"]
    }
  }
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

## Port 3000 already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 npm run dev
```
