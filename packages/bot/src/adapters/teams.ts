import type { BotPlatform, BotMessage, BotResponse } from "../types.js";

/**
 * Microsoft Teams adapter implementing the BotPlatform interface.
 * Requires botbuilder as a peer dependency for actual Teams connectivity.
 */
export class TeamsAdapter implements BotPlatform {
  readonly platformId = "teams";
  readonly platformName = "Microsoft Teams";

  private handlers = new Map<string, (message: BotMessage) => Promise<void>>();
  private sendFn: ((channelId: string, text: string, threadId?: string) => Promise<void>) | null =
    null;

  /**
   * Inject the send function from the Teams Bot Framework.
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

  /** Dispatch an incoming Teams command. */
  async handleTeamsCommand(
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
      throw new Error("Teams send function not configured. Call setSendFunction() first.");
    }
    await this.sendFn(channelId, response.text, response.threadId);
  }

  async sendUpdate(channelId: string, response: BotResponse): Promise<void> {
    await this.sendMessage(channelId, response);
  }
}
