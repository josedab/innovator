# @innovator/bot

Chat platform bot that brings Innovator's AI-powered innovation pipeline to Slack, Discord, and Microsoft Teams.

## Overview

The bot exposes a `/innovate` command that runs the full auto pipeline (investigate → generate → synthesize) and streams progress updates directly into your chat channel.

## Installation

```bash
npm install @innovator/bot
```

## Quick Start

```typescript
import { InnovatorBot, SlackAdapter } from "@innovator/bot";

const adapter = new SlackAdapter();
adapter.setSendFunction(/* your Slack Bolt send function */);

const bot = new InnovatorBot({
  platform: adapter,
  defaultModel: "gpt-4.1",
});

await bot.start();
```

## Adapters

Three platform adapters are included, all implementing the `BotPlatform` interface:

| Adapter          | Platform        | Handler Method           |
| ---------------- | --------------- | ------------------------ |
| `SlackAdapter`   | Slack           | `handleSlackCommand()`   |
| `DiscordAdapter` | Discord         | `handleDiscordCommand()` |
| `TeamsAdapter`   | Microsoft Teams | `handleTeamsCommand()`   |

### Slack

```typescript
import { InnovatorBot, SlackAdapter } from "@innovator/bot";
import { App } from "@slack/bolt";

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const adapter = new SlackAdapter();
adapter.setSendFunction(async (channel, text, threadTs) => {
  await slackApp.client.chat.postMessage({ channel, text, thread_ts: threadTs });
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
await slackApp.start(3000);
```

### Discord

```typescript
import { InnovatorBot, DiscordAdapter } from "@innovator/bot";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const adapter = new DiscordAdapter();
adapter.setSendFunction(async (channelId, text, threadId) => {
  const channel = await client.channels.fetch(channelId);
  if (channel?.isTextBased()) await channel.send({ content: text });
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
await client.login(process.env.DISCORD_BOT_TOKEN);
```

### Microsoft Teams

```typescript
import { InnovatorBot, TeamsAdapter } from "@innovator/bot";

const adapter = new TeamsAdapter();
adapter.setSendFunction(async (conversationId, text, replyToId) => {
  // Use Bot Framework SDK to send activity
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
```

## Configuration

The `InnovatorBot` constructor accepts a `BotConfig` object:

```typescript
interface BotConfig {
  platform: BotPlatform; // Required — adapter instance
  defaultModel?: string; // LLM model ID (default: provider default)
}
```

## Environment Variables

The bot package itself does not require environment variables — platform credentials are injected via the adapter's `setSendFunction()`. However, your platform SDK will need:

| Platform | Variable                 | Description            |
| -------- | ------------------------ | ---------------------- |
| Slack    | `SLACK_BOT_TOKEN`        | Bot OAuth token        |
| Slack    | `SLACK_SIGNING_SECRET`   | Request signing secret |
| Discord  | `DISCORD_BOT_TOKEN`      | Bot token              |
| Teams    | `MICROSOFT_APP_ID`       | Bot Framework app ID   |
| Teams    | `MICROSOFT_APP_PASSWORD` | Bot Framework password |

The underlying `@innovator/core` package uses its own provider env vars (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## Types

```typescript
import type { BotPlatform, BotMessage, BotResponse, BotConfig } from "@innovator/bot";
```

| Type          | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `BotMessage`  | Incoming command with `text`, `channel`, `user`, `threadId`                    |
| `BotResponse` | Outgoing message with `text`, `threadId`, `isFinal`                            |
| `BotPlatform` | Interface: `start()`, `stop()`, `onCommand()`, `sendMessage()`, `sendUpdate()` |
| `BotConfig`   | Constructor config with `platform` and optional `defaultModel`                 |

## How It Works

1. User sends `/innovate <subject>` in chat
2. Bot calls `runAutoPipeline()` from `@innovator/core`
3. Progress updates are streamed to the channel:
   - 🔬 Investigating…
   - 💡 Generating ideas…
   - 🧬 Synthesizing…
   - ✅ Complete
4. Final message shows top 5 ideas, themes, and a strategic recommendation
