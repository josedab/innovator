---
id: bot
title: Bot Setup
sidebar_position: 11
---

# Bot Setup

Run Innovator as a chat bot in Slack, Discord, or Microsoft Teams.

## Overview

The `@innovator/bot` package provides platform adapters that connect Innovator's auto pipeline to chat platforms. Users send `/innovate <subject>` and receive streamed progress updates followed by a final innovation report.

## How It Works

1. User sends `/innovate <subject>` in a channel or DM
2. The bot runs `runAutoPipeline()` from `@innovator/core`
3. Progress updates stream to the thread:
   - 🔬 Investigating…
   - 💡 Generating ideas…
   - 🧬 Synthesizing…
   - ✅ Complete
4. Final message shows the top 5 ideas, themes, and a strategic recommendation

## Installation

```bash
npm install @innovator/bot
```

You also need the platform SDK for your chat service:

| Platform | SDK Package   |
| -------- | ------------- |
| Slack    | `@slack/bolt` |
| Discord  | `discord.js`  |
| Teams    | `botbuilder`  |

## Slack Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
2. Add the **Slash Commands** feature → create `/innovate`
3. Under **OAuth & Permissions**, add scopes: `chat:write`, `commands`
4. Install the app to your workspace and copy the **Bot Token** and **Signing Secret**

### 2. Environment Variables

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

### 3. Code

```typescript
import { InnovatorBot, SlackAdapter } from "@innovator/bot";
import { App } from "@slack/bolt";

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const adapter = new SlackAdapter();
adapter.setSendFunction(async (channel, text, threadTs) => {
  await slackApp.client.chat.postMessage({
    channel,
    text,
    thread_ts: threadTs,
  });
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
await slackApp.start(3000);

console.log("Slack bot running on port 3000");
```

## Discord Setup

### 1. Create a Discord Bot

1. Go to [discord.com/developers](https://discord.com/developers/applications) → **New Application**
2. Under **Bot**, click **Add Bot** and copy the **Token**
3. Under **OAuth2 → URL Generator**, select `bot` scope and `Send Messages` permission
4. Use the generated URL to invite the bot to your server

### 2. Environment Variables

```bash
DISCORD_BOT_TOKEN=your-discord-bot-token
```

### 3. Code

```typescript
import { InnovatorBot, DiscordAdapter } from "@innovator/bot";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const adapter = new DiscordAdapter();
adapter.setSendFunction(async (channelId, text) => {
  const channel = await client.channels.fetch(channelId);
  if (channel?.isTextBased()) {
    await channel.send({ content: text });
  }
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
await client.login(process.env.DISCORD_BOT_TOKEN);

console.log("Discord bot running");
```

## Microsoft Teams Setup

### 1. Register a Bot

1. Go to [dev.teams.microsoft.com](https://dev.teams.microsoft.com/) → **Tools → Bot Management**
2. Create a new bot and note the **App ID** and **Password**
3. Configure the messaging endpoint URL

### 2. Environment Variables

```bash
MICROSOFT_APP_ID=your-app-id
MICROSOFT_APP_PASSWORD=your-app-password
```

### 3. Code

```typescript
import { InnovatorBot, TeamsAdapter } from "@innovator/bot";

const adapter = new TeamsAdapter();
adapter.setSendFunction(async (conversationId, text, replyToId) => {
  // Use Bot Framework SDK to send activity to the conversation
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
```

## Configuration

```typescript
const bot = new InnovatorBot({
  platform: adapter, // Required — SlackAdapter, DiscordAdapter, or TeamsAdapter
  defaultModel: "gpt-4.1", // Optional — LLM model for the pipeline
});
```

## Custom Adapter

Implement the `BotPlatform` interface to add support for other platforms:

```typescript
import type { BotPlatform, BotMessage, BotResponse } from "@innovator/bot";

class MyAdapter implements BotPlatform {
  async start(): Promise<void> {
    /* connect to platform */
  }
  async stop(): Promise<void> {
    /* disconnect */
  }
  onCommand(handler: (msg: BotMessage) => Promise<void>): void {
    /* register handler */
  }
  async sendMessage(response: BotResponse): Promise<void> {
    /* send message */
  }
  async sendUpdate(response: BotResponse): Promise<void> {
    /* update existing message */
  }
}
```
