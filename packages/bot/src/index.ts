/**
 * @module bot
 *
 * Chat platform bot for Innovator — adapter pattern supporting
 * Slack, Discord, and Microsoft Teams.
 */
export { InnovatorBot } from "./bot.js";
export { SlackAdapter, DiscordAdapter, TeamsAdapter } from "./adapters/index.js";
export type { BotPlatform, BotMessage, BotResponse, BotConfig } from "./types.js";
