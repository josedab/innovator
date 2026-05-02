import type { BotPlatform, BotMessage, BotResponse } from "../types.js";

/**
 * Slack adapter implementing the BotPlatform interface.
 * Requires @slack/bolt as a peer dependency for actual Slack connectivity.
 * This adapter provides the structural contract; consumers wire up Slack's Bolt App.
 */
export class SlackAdapter implements BotPlatform {
  readonly platformId = "slack";
  readonly platformName = "Slack";

  private handlers = new Map<string, (message: BotMessage) => Promise<void>>();
  private sendFn: ((channelId: string, text: string, threadTs?: string) => Promise<void>) | null =
    null;

  /**
   * Inject the send function from the Slack Bolt app.
   * This allows the adapter to work without a hard @slack/bolt dependency.
   */
  setSendFunction(fn: (channelId: string, text: string, threadTs?: string) => Promise<void>): void {
    this.sendFn = fn;
  }

  async start(): Promise<void> {
    // Bolt app initialization is done externally
  }

  async stop(): Promise<void> {
    this.handlers.clear();
  }

  onCommand(command: string, handler: (message: BotMessage) => Promise<void>): void {
    this.handlers.set(command, handler);
  }

  /** Dispatch an incoming Slack command to the registered handler. */
  async handleSlackCommand(
    command: string,
    channelId: string,
    userId: string,
    userName: string,
    text: string,
    threadTs?: string
  ): Promise<void> {
    const handler = this.handlers.get(command);
    if (!handler) return;

    await handler({
      channelId,
      userId,
      userName,
      text,
      threadId: threadTs,
    });
  }

  async sendMessage(channelId: string, response: BotResponse): Promise<void> {
    if (!this.sendFn) {
      throw new Error("Slack send function not configured. Call setSendFunction() first.");
    }
    await this.sendFn(channelId, response.text, response.threadId);
  }

  async sendUpdate(channelId: string, response: BotResponse): Promise<void> {
    await this.sendMessage(channelId, response);
  }
}
