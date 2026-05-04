import { describe, it, expect, vi, beforeEach } from "vitest";
import { TeamsAdapter } from "./teams.js";
import { SlackAdapter } from "./slack.js";
import { DiscordAdapter } from "./discord.js";

// ---- TeamsAdapter ----

describe("TeamsAdapter", () => {
  let adapter: TeamsAdapter;

  beforeEach(() => {
    adapter = new TeamsAdapter();
  });

  it("has correct platformId and platformName", () => {
    expect(adapter.platformId).toBe("teams");
    expect(adapter.platformName).toBe("Microsoft Teams");
  });

  it("start() and stop() do not throw", async () => {
    await expect(adapter.start()).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it("setSendFunction stores the function", () => {
    const sendFn = vi.fn();
    adapter.setSendFunction(sendFn);
    // Verify it's usable (sendMessage should not throw)
    expect(() => adapter.setSendFunction(sendFn)).not.toThrow();
  });

  it("sendMessage calls send function with correct args", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    adapter.setSendFunction(sendFn);

    await adapter.sendMessage("channel-1", { text: "Hello", threadId: "thread-1" });
    expect(sendFn).toHaveBeenCalledWith("channel-1", "Hello", "thread-1");
  });

  it("sendMessage without threadId passes undefined", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    adapter.setSendFunction(sendFn);

    await adapter.sendMessage("channel-1", { text: "Hello" });
    expect(sendFn).toHaveBeenCalledWith("channel-1", "Hello", undefined);
  });

  it("sendMessage throws when no send function configured", async () => {
    await expect(adapter.sendMessage("ch", { text: "test" })).rejects.toThrow(
      "Teams send function not configured"
    );
  });

  it("handleTeamsCommand routes to registered handler with converted message format", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    adapter.onCommand("investigate", handler);

    await adapter.handleTeamsCommand(
      "investigate",
      "ch-1",
      "user-1",
      "John",
      "AI topic",
      "thread-1"
    );

    expect(handler).toHaveBeenCalledWith({
      channelId: "ch-1",
      userId: "user-1",
      userName: "John",
      text: "AI topic",
      threadId: "thread-1",
    });
  });

  it("handleTeamsCommand silently ignores unregistered commands", async () => {
    await expect(
      adapter.handleTeamsCommand("unknown", "ch", "user", "name", "text")
    ).resolves.toBeUndefined();
  });

  it("sendUpdate delegates to sendMessage", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    adapter.setSendFunction(sendFn);
    await adapter.sendUpdate("ch-1", { text: "Update" });
    expect(sendFn).toHaveBeenCalledWith("ch-1", "Update", undefined);
  });

  it("stop() clears registered handlers", async () => {
    const handler = vi.fn();
    adapter.onCommand("test", handler);
    await adapter.stop();
    await adapter.handleTeamsCommand("test", "ch", "u", "n", "t");
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---- SlackAdapter ----

describe("SlackAdapter", () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    adapter = new SlackAdapter();
  });

  it("has correct platformId and platformName", () => {
    expect(adapter.platformId).toBe("slack");
    expect(adapter.platformName).toBe("Slack");
  });

  it("sendMessage calls send function with correct args", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    adapter.setSendFunction(sendFn);

    await adapter.sendMessage("channel-1", { text: "Hello", threadId: "1234567890.123456" });
    expect(sendFn).toHaveBeenCalledWith("channel-1", "Hello", "1234567890.123456");
  });

  it("sendMessage throws when no send function configured", async () => {
    await expect(adapter.sendMessage("ch", { text: "test" })).rejects.toThrow(
      "Slack send function not configured"
    );
  });

  it("handleSlackCommand routes with threadTs to threadId conversion", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    adapter.onCommand("generate", handler);

    const threadTs = "1234567890.123456";
    await adapter.handleSlackCommand("generate", "C123", "U456", "Alice", "quantum", threadTs);

    expect(handler).toHaveBeenCalledWith({
      channelId: "C123",
      userId: "U456",
      userName: "Alice",
      text: "quantum",
      threadId: threadTs,
    });
  });

  it("handleSlackCommand passes undefined threadId when no threadTs", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    adapter.onCommand("investigate", handler);

    await adapter.handleSlackCommand("investigate", "C123", "U456", "Bob", "ai");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ threadId: undefined }));
  });

  it("silently ignores unregistered commands", async () => {
    await expect(
      adapter.handleSlackCommand("unknown", "ch", "u", "n", "t")
    ).resolves.toBeUndefined();
  });

  it("stop() clears handlers", async () => {
    const handler = vi.fn();
    adapter.onCommand("test", handler);
    await adapter.stop();
    await adapter.handleSlackCommand("test", "ch", "u", "n", "t");
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---- DiscordAdapter ----

describe("DiscordAdapter", () => {
  let adapter: DiscordAdapter;

  beforeEach(() => {
    adapter = new DiscordAdapter();
  });

  it("has correct platformId and platformName", () => {
    expect(adapter.platformId).toBe("discord");
    expect(adapter.platformName).toBe("Discord");
  });

  it("sendMessage calls send function with correct args", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    adapter.setSendFunction(sendFn);

    await adapter.sendMessage("guild-channel-1", { text: "Hello", threadId: "thread-123" });
    expect(sendFn).toHaveBeenCalledWith("guild-channel-1", "Hello", "thread-123");
  });

  it("sendMessage throws when no send function configured", async () => {
    await expect(adapter.sendMessage("ch", { text: "test" })).rejects.toThrow(
      "Discord send function not configured"
    );
  });

  it("handleDiscordCommand routes slash command with text extraction", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    adapter.onCommand("innovate", handler);

    await adapter.handleDiscordCommand(
      "innovate",
      "ch-1",
      "user-1",
      "User#1234",
      "arg text",
      "thread-1"
    );

    expect(handler).toHaveBeenCalledWith({
      channelId: "ch-1",
      userId: "user-1",
      userName: "User#1234",
      text: "arg text",
      threadId: "thread-1",
    });
  });

  it("silently ignores unregistered commands", async () => {
    await expect(
      adapter.handleDiscordCommand("unknown", "ch", "u", "n", "t")
    ).resolves.toBeUndefined();
  });

  it("stop() clears handlers", async () => {
    const handler = vi.fn();
    adapter.onCommand("test", handler);
    await adapter.stop();
    await adapter.handleDiscordCommand("test", "ch", "u", "n", "t");
    expect(handler).not.toHaveBeenCalled();
  });

  it("sendUpdate delegates to sendMessage", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    adapter.setSendFunction(sendFn);
    await adapter.sendUpdate("ch-1", { text: "Update" });
    expect(sendFn).toHaveBeenCalledWith("ch-1", "Update", undefined);
  });
});
