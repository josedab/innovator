/** Represents a message from a bot platform. */
export interface BotMessage {
  /** Platform-specific channel/room ID. */
  channelId: string;
  /** Platform-specific user ID. */
  userId: string;
  /** Display name of the user. */
  userName: string;
  /** The command text (e.g. the subject after /innovate). */
  text: string;
  /** Platform-specific thread/reply ID for threaded responses. */
  threadId?: string;
  /** Raw platform-specific payload. */
  raw?: unknown;
}

/** A response to send back to the platform. */
export interface BotResponse {
  /** The text content to send. */
  text: string;
  /** Optional thread ID for threaded replies. */
  threadId?: string;
  /** Whether this is the final message in a sequence. */
  isFinal?: boolean;
}

/**
 * Platform adapter interface. Implement this for each messaging platform.
 */
export interface BotPlatform {
  /** Unique platform identifier. */
  readonly platformId: string;

  /** Human-readable platform name. */
  readonly platformName: string;

  /** Initialize the platform connection. */
  start(): Promise<void>;

  /** Gracefully shut down the platform connection. */
  stop(): Promise<void>;

  /** Register a handler for incoming slash commands. */
  onCommand(command: string, handler: (message: BotMessage) => Promise<void>): void;

  /** Send a message to a channel. */
  sendMessage(channelId: string, response: BotResponse): Promise<void>;

  /** Send a streaming update (for progress reporting). */
  sendUpdate(channelId: string, response: BotResponse): Promise<void>;
}

/** Configuration for a bot instance. */
export interface BotConfig {
  /** Platform adapter to use. */
  platform: BotPlatform;
  /** Optional default LLM model. */
  defaultModel?: string;
  /** Optional workspace-level settings. */
  workspace?: {
    id: string;
    name: string;
    adminUserIds: string[];
  };
}
