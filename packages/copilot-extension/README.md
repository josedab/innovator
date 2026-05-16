# @innovator/copilot-extension

GitHub Copilot Extension that exposes [Innovator](../../README.md) as `@innovator` in Copilot Chat — VS Code, GitHub.com, or any IDE with Copilot support.

## Overview

This package provides a standalone HTTP server that acts as a GitHub Copilot Extension agent. It receives webhook requests from GitHub, processes `@innovator` slash commands, and streams results back to Copilot Chat.

### Architecture

```
User → Copilot Chat → GitHub → POST / (webhook) → CopilotExtensionServer
                                                     ├── verifySignature()
                                                     ├── handleWebhook()
                                                     └── SSE response → Copilot Chat
```

### Source Files

| File          | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `index.ts`    | Public exports                                      |
| `server.ts`   | HTTP server with CORS, health check, and routing    |
| `webhook.ts`  | Webhook payload parsing and command dispatch        |
| `verify.ts`   | GitHub webhook signature verification (HMAC-SHA256) |
| `manifest.ts` | Extension manifest with commands and metadata       |

## Setup

### 1. Install Dependencies

```bash
npm install
npm run build --workspace=packages/copilot-extension
```

### 2. Register a GitHub App

Register a GitHub App at [github.com/settings/apps/new](https://github.com/settings/apps/new) with these settings:

| Setting            | Value                                      |
| ------------------ | ------------------------------------------ |
| **App name**       | Innovator                                  |
| **Webhook URL**    | `https://<your-domain>/` (or ngrok tunnel) |
| **Webhook secret** | A random secret string                     |

Then enable **Copilot Extension** in the app's Copilot tab, setting the agent endpoint to the same URL.

### 3. Configure Environment

```bash
export COPILOT_WEBHOOK_SECRET="your-webhook-secret"
export COPILOT_EXT_PORT=3200          # optional, default: 3200
export INNOVATOR_DEFAULT_MODEL=gpt-4.1 # optional
```

### 4. Start the Server

```bash
npm run start --workspace=packages/copilot-extension
```

The server exposes:

- `POST /` — Webhook endpoint for Copilot Chat messages
- `GET /health` — Health check (`{ "status": "ok" }`)
- `GET /manifest` — Extension manifest with command definitions

## Available Commands

| Command                            | Description                                       |
| ---------------------------------- | ------------------------------------------------- |
| `@innovator investigate <subject>` | Analyze a subject                                 |
| `@innovator innovate <subject>`    | Generate ideas using specific angles              |
| `@innovator auto <subject>`        | Full pipeline (investigate → angles → synthesize) |
| `@innovator angles`                | List available innovation angles                  |
| `@innovator presets`               | Browse domain-specific presets                    |
| `@innovator help`                  | Show usage instructions                           |

## Programmatic Usage

```ts
import { CopilotExtensionServer } from "@innovator/copilot-extension";

const server = new CopilotExtensionServer({
  port: 3200,
  webhookSecret: process.env.COPILOT_WEBHOOK_SECRET,
  model: "gpt-4.1",
  skipVerification: false, // set true for local dev
});

await server.start();
// Server is running at http://localhost:3200
```

You can also handle webhooks directly without the server:

```ts
import { handleWebhook, verifySignature } from "@innovator/copilot-extension";

// Verify the request
const isValid = verifySignature(body, signature, secret);

// Process the webhook
const result = await handleWebhook(payload, { model: "gpt-4.1" });
```

## Local Development

1. Start the extension server:

   ```bash
   npm run dev --workspace=packages/copilot-extension
   ```

2. Expose it via a tunnel:

   ```bash
   ngrok http 3200
   ```

3. Update your GitHub App's webhook URL to the ngrok URL

4. Test in VS Code Copilot Chat: `@innovator investigate solar energy`

## Further Reading

- [Copilot Extension Setup Guide](../../website/docs/guides/copilot-extension.md) — full walkthrough with screenshots
- [GitHub Copilot Extensions docs](https://docs.github.com/en/copilot/building-copilot-extensions)

## Troubleshooting

| Issue                                       | Solution                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Webhook signature verification fails**    | Ensure `COPILOT_WEBHOOK_SECRET` matches the secret configured in your GitHub App settings. The signature uses HMAC-SHA256.                    |
| **Extension not appearing in Copilot Chat** | Verify the GitHub App has **Copilot Extension** enabled in its Copilot tab. The agent endpoint must be set to your server's URL.              |
| **`@innovator` commands not recognized**    | Ensure the app is installed on your GitHub account/org. Try uninstalling and reinstalling the GitHub App.                                     |
| **Server returns 403 on webhook**           | Check that `skipVerification` is `false` in production and your webhook secret is correctly set. For local dev, set `skipVerification: true`. |
| **`gh auth` / Copilot token errors**        | The extension uses GitHub Copilot SDK internally. Run `gh auth login` and ensure your account has an active Copilot subscription.             |
| **Port 3200 already in use**                | Set `COPILOT_EXT_PORT` to an alternative port, e.g., `export COPILOT_EXT_PORT=3201`.                                                          |
| **ngrok tunnel not forwarding**             | Ensure ngrok is pointing to the correct port (`ngrok http 3200`). Update the GitHub App webhook URL to the new ngrok URL after each restart.  |
| **LLM timeouts during commands**            | Increase `INNOVATOR_LLM_TIMEOUT_MS` (default: 90000). Complex subjects may need 120000+.                                                      |

## License

MIT — see [LICENSE](../../LICENSE).
