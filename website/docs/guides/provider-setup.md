---
id: provider-setup
title: LLM Provider Setup
sidebar_position: 6
---

# LLM Provider Setup

Innovator uses GitHub Copilot as its default LLM provider — no extra API keys needed. If you want to use a different provider (OpenAI directly, Anthropic, or a local Ollama instance), this guide walks you through end-to-end setup.

## Default: GitHub Copilot

No configuration is required. Innovator uses your GitHub Copilot subscription via the `@github/copilot-sdk`. As long as:

1. **GitHub CLI** is installed (`gh --version`)
2. **GitHub CLI** is authenticated (`gh auth login`)
3. You have an active **Copilot subscription** (Free, Pro, or Enterprise)

…the default provider works out of the box. Run `npm run doctor` to verify.

---

## OpenAI (Direct)

Use the OpenAI API directly instead of routing through Copilot. This gives you access to all OpenAI models including GPT-4.1 and GPT-5.

### 1. Get an API key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **"Create new secret key"**
3. Give it a name (e.g. `innovator`) and copy the key

### 2. Configure the environment

Add to your `.env.local` file:

```bash
OPENAI_API_KEY=sk-proj-...your-key...
INNOVATOR_DEFAULT_MODEL=gpt-4.1
```

### 3. Test connectivity

```bash
# Quick test with curl
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  | head -c 200

# Or test through Innovator
npx tsx apps/cli/src/index.ts investigate "test subject" --model gpt-4.1
```

### 4. Available models

| Model          | Best for                          |
| -------------- | --------------------------------- |
| `gpt-4.1`      | Best quality, recommended default |
| `gpt-5`        | Latest capabilities               |
| `gpt-4.1-mini` | Faster, lower cost                |

---

## Anthropic

Use Anthropic's Claude models for innovation generation.

### 1. Get an API key

1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Click **"Create Key"**
3. Copy the key (starts with `sk-ant-`)

### 2. Configure the environment

Add to your `.env.local` file:

```bash
ANTHROPIC_API_KEY=sk-ant-...your-key...
INNOVATOR_DEFAULT_MODEL=claude-sonnet-4-5
```

### 3. Test connectivity

```bash
# Quick test with curl
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}' \
  | head -c 200

# Or test through Innovator
npx tsx apps/cli/src/index.ts investigate "test subject" --model claude-sonnet-4-5
```

### 4. Available models

| Model               | Best for                      |
| ------------------- | ----------------------------- |
| `claude-sonnet-4-5` | Best balance of speed/quality |
| `claude-opus-4`     | Highest quality               |
| `claude-haiku-3-5`  | Fastest, lowest cost          |

---

## Ollama (Local)

Run models locally with [Ollama](https://ollama.com/) — no API keys, no cloud, full privacy.

### 1. Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows — download from https://ollama.com/download
```

### 2. Pull a model

```bash
# Recommended for innovation tasks
ollama pull llama3.1

# Smaller / faster alternative
ollama pull mistral
```

### 3. Start the Ollama server

```bash
ollama serve
```

The server runs on `http://localhost:11434` by default.

### 4. Configure the environment

Add to your `.env.local` file:

```bash
OLLAMA_BASE_URL=http://localhost:11434
INNOVATOR_DEFAULT_MODEL=llama3.1
```

### 5. Test connectivity

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Test through Innovator
npx tsx apps/cli/src/index.ts investigate "test subject" --model llama3.1
```

### 6. Performance notes

- Local models require significant RAM (8 GB+ for 7B parameter models, 16 GB+ for 13B+).
- Generation is slower than cloud providers — expect 30–120 seconds per angle depending on hardware.
- For best results with innovation tasks, use models with 13B+ parameters.

---

## Switching Providers at Runtime

You don't need to restart the server to switch providers. Pass the `--model` flag to the CLI or set the `model` field in API requests:

```bash
# CLI — override per-command
npx tsx apps/cli/src/index.ts auto "topic" --model claude-sonnet-4-5
npx tsx apps/cli/src/index.ts auto "topic" --model llama3.1

# API — override per-request
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"subject": "topic", "model": "gpt-5"}'
```

The `INNOVATOR_DEFAULT_MODEL` environment variable sets the fallback when no model is specified.

---

## Adding Extra Models

If a model is not listed in the built-in registry, add it via the `INNOVATOR_EXTRA_MODELS` environment variable:

```bash
INNOVATOR_EXTRA_MODELS=my-custom-model,another-model
```

These models will appear in the model selector in the web UI.

---

## Troubleshooting

### "Authentication failed" or "Invalid API key"

- Double-check the API key is correct and hasn't expired.
- Ensure the key is in `.env.local` (not `.env` — Next.js loads `.env.local` with higher priority).
- Restart the dev server after changing environment variables.

### Ollama connection refused

- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check the `OLLAMA_BASE_URL` matches the running server.
- If using Docker, ensure the Ollama container's port is exposed.

### Slow responses with local models

- Use a smaller model (e.g. `mistral` instead of `llama3.1:70b`).
- Ensure no other GPU-intensive processes are running.
- Consider using a cloud provider for production workloads.
