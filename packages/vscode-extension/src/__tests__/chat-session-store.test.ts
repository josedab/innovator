import { describe, expect, it } from "vitest";
import { ChatSessionStore } from "../chat-session-store.js";

function ideas(title: string) {
  return [
    {
      title,
      description: `${title} description`,
      potentialImpact: `${title} impact`,
      implementationHint: `${title} implementation`,
    },
  ];
}

describe("ChatSessionStore", () => {
  it("uses thread IDs when present and one shared default key otherwise", () => {
    const store = new ChatSessionStore();

    const thread = store.getContext({ threadId: "thread-a" });
    const sameThread = store.getContext({ threadId: "thread-a" });
    const fallback = store.getContext({});
    const sameFallback = store.getContext({ threadId: undefined });

    expect(sameThread).toBe(thread);
    expect(sameFallback).toBe(fallback);
    expect(fallback).not.toBe(thread);
  });

  it("evicts by insertion order without refreshing an accessed context", () => {
    const store = new ChatSessionStore(2);
    const oldest = store.getContext({ threadId: "oldest" });
    oldest.lastIdeas = ideas("oldest");
    const second = store.getContext({ threadId: "second" });
    second.lastIdeas = ideas("second");

    expect(store.getContext({ threadId: "oldest" })).toBe(oldest);
    store.getContext({ threadId: "third" });

    expect(store.getFirstIdeas()).toBe(second.lastIdeas);
  });

  it("returns the first non-empty ideas and clears all contexts", () => {
    const store = new ChatSessionStore();
    store.getContext({ threadId: "empty" }).lastIdeas = [];
    const firstIdeas = ideas("first");
    store.getContext({ threadId: "first" }).lastIdeas = firstIdeas;
    store.getContext({ threadId: "second" }).lastIdeas = ideas("second");

    expect(store.getFirstIdeas()).toBe(firstIdeas);

    store.clear();

    expect(store.getFirstIdeas()).toBeUndefined();
    expect(store.getContext({ threadId: "first" }).lastIdeas).toBeUndefined();
  });
});
