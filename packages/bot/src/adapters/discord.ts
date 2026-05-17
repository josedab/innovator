import type { BotPlatform, BotMessage, BotResponse } from "../types.js";

/**
 * Discord adapter implementing the BotPlatform interface.
 * Requires discord.js as a peer dependency for actual Discord connectivity.
 */
export class DiscordAdapter implements BotPlatform {
  readonly platformId = "discord";
  readonly platformName = "Discord";

  private handlers = new Map<string, (message: BotMessage) => Promise<void>>();
  private sendFn: ((channelId: string, text: string, threadId?: string) => Promise<void>) | null =
    null;

  /**
   * Inject the send function from the Discord.js client.
   */
  setSendFunction(fn: (channelId: string, text: string, threadId?: string) => Promise<void>): void {
    this.sendFn = fn;
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this.handlers.clear();
  }

  onCommand(command: string, handler: (message: BotMessage) => Promise<void>): void {
    this.handlers.set(command, handler);
  }

  /** Dispatch an incoming Discord slash command. */
  async handleDiscordCommand(
    command: string,
    channelId: string,
    userId: string,
    userName: string,
    text: string,
    threadId?: string
  ): Promise<void> {
    const handler = this.handlers.get(command);
    if (!handler) return;

    await handler({
      channelId,
      userId,
      userName,
      text,
      threadId,
    });
  }

  async sendMessage(channelId: string, response: BotResponse): Promise<void> {
    if (!this.sendFn) {
      throw new Error("Discord send function not configured. Call setSendFunction() first.");
    }
    // Discord has a 2000-character message limit
    const text =
      response.text.length > 1950 ? response.text.slice(0, 1950) + "\n…[truncated]" : response.text;
    await this.sendFn(channelId, text, response.threadId);
  }

  async sendUpdate(channelId: string, response: BotResponse): Promise<void> {
    await this.sendMessage(channelId, response);
  }
}
