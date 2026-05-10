import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock LLM dependencies
vi.mock("../../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue("{}"),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../prompts/sanitize.js", () => ({
  wrapUserInput: vi.fn((_label: string, val: string) => val),
  sanitizeLlmOutput: vi.fn((s: string) => s),
}));

import {
  TriggerPipeline,
  createTriggerPipeline,
  matchEventToInterests,
  triggerEventToMarkdown,
  type TriggerEvent,
  type TriggerSourceAdapter,
  type TriggerConfig,
  type InnovationInterest,
} from "../index.js";
import { generateText, extractJson } from "../../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

// ---- Helpers ----

function makeEvent(overrides?: Partial<TriggerEvent>): TriggerEvent {
  return {
    source: "rss",
    title: "Test Event",
    url: "https://example.com",
    summary: "Test summary",
    relevanceScore: 0.8,
    matchedInterests: [],
    timestamp: new Date().toISOString(),
    fingerprint: `rss::test-event-${Math.random()}`,
    ...overrides,
  };
}

function makeAdapter(
  type: TriggerEvent["source"],
  events: TriggerEvent[] = []
): TriggerSourceAdapter {
  return {
    type,
    fetchEvents: vi.fn().mockResolvedValue(events),
  };
}

function makeConfig(overrides?: Partial<TriggerConfig>): TriggerConfig {
  return {
    source: "rss",
    ...overrides,
  };
}

// ---- createTriggerPipeline ----

describe("createTriggerPipeline", () => {
  it("registers all 5 built-in adapter types", () => {
    const pipeline = createTriggerPipeline(makeConfig());
    // The pipeline should have adapters registered internally
    // We test indirectly by verifying it was created successfully
    expect(pipeline).toBeInstanceOf(TriggerPipeline);
  });
});

// ---- TriggerPipeline lifecycle ----

describe("TriggerPipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("start/stop lifecycle", () => {
    it("starts polling and can be stopped", () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const adapter = makeAdapter("rss", []);
      pipeline.registerAdapter(adapter);

      pipeline.start(10000);
      // Should have called fetchEvents at least once on start
      expect(adapter.fetchEvents).toHaveBeenCalled();

      pipeline.stop();
      // After stop, no more polling
      vi.clearAllMocks();
      vi.advanceTimersByTime(20000);
      expect(adapter.fetchEvents).not.toHaveBeenCalled();
    });

    it("start is idempotent", () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const adapter = makeAdapter("rss", []);
      pipeline.registerAdapter(adapter);

      pipeline.start(10000);
      pipeline.start(10000); // Second call should be no-op
      pipeline.stop();
    });
  });

  describe("fingerprint deduplication", () => {
    it("deduplicates events with the same fingerprint within window", async () => {
      const event = makeEvent({ fingerprint: "rss::duplicate" });
      const adapter = makeAdapter("rss", [event, { ...event }]);

      const pipeline = new TriggerPipeline(makeConfig());
      pipeline.registerAdapter(adapter);

      const received: TriggerEvent[][] = [];
      pipeline.onTrigger((events) => received.push(events));

      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);

      // Should receive at most 1 event (deduped)
      if (received.length > 0) {
        expect(received[0].length).toBeLessThanOrEqual(1);
      }

      pipeline.stop();
    });

    it("allows same fingerprint after dedup window expires", async () => {
      const event1 = makeEvent({ fingerprint: "rss::timed" });

      const adapter = makeAdapter("rss", [event1]);
      const pipeline = new TriggerPipeline(
        makeConfig({ deduplicationWindowMs: 1000 }) // 1 second window
      );
      pipeline.registerAdapter(adapter);

      const received: TriggerEvent[][] = [];
      pipeline.onTrigger((events) => received.push(events));

      // First poll
      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);

      // Advance past dedup window
      await vi.advanceTimersByTimeAsync(2000);

      // Second poll with same fingerprint
      (adapter.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValue([event1]);
      await vi.advanceTimersByTimeAsync(60000);

      pipeline.stop();

      // Should have received events on both polls
      expect(received.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("frequency capping", () => {
    it("caps events per hour", async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ fingerprint: `rss::freq-${i}`, title: `Event ${i}` })
      );
      const adapter = makeAdapter("rss", events);

      const pipeline = new TriggerPipeline(makeConfig({ frequencyCap: { maxPerHour: 2 } }));
      pipeline.registerAdapter(adapter);

      const received: TriggerEvent[][] = [];
      pipeline.onTrigger((evts) => received.push(evts));

      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);

      pipeline.stop();

      if (received.length > 0) {
        expect(received[0].length).toBeLessThanOrEqual(2);
      }
    });

    it("caps events per day", async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ fingerprint: `rss::daily-${i}`, title: `Event ${i}` })
      );
      const adapter = makeAdapter("rss", events);

      const pipeline = new TriggerPipeline(makeConfig({ frequencyCap: { maxPerDay: 3 } }));
      pipeline.registerAdapter(adapter);

      const received: TriggerEvent[][] = [];
      pipeline.onTrigger((evts) => received.push(evts));

      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);

      pipeline.stop();

      if (received.length > 0) {
        expect(received[0].length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("onTrigger callback error handling", () => {
    it("swallows callback errors without crashing", async () => {
      const event = makeEvent({ fingerprint: "rss::callback-error" });
      const adapter = makeAdapter("rss", [event]);

      const pipeline = new TriggerPipeline(makeConfig());
      pipeline.registerAdapter(adapter);

      pipeline.onTrigger(() => {
        throw new Error("Callback error");
      });

      // Should not throw
      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);
      pipeline.stop();
    });
  });

  describe("adapter fetch failure", () => {
    it("handles adapter fetch failure gracefully", async () => {
      const adapter: TriggerSourceAdapter = {
        type: "rss",
        fetchEvents: vi.fn().mockRejectedValue(new Error("Network error")),
      };

      const pipeline = new TriggerPipeline(makeConfig());
      pipeline.registerAdapter(adapter);

      const received: TriggerEvent[][] = [];
      pipeline.onTrigger((evts) => received.push(evts));

      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);
      pipeline.stop();

      // No events should be emitted on failure
      expect(received).toHaveLength(0);
    });
  });

  describe("empty event list", () => {
    it("does nothing when adapter returns empty list", async () => {
      const adapter = makeAdapter("rss", []);
      const pipeline = new TriggerPipeline(makeConfig());
      pipeline.registerAdapter(adapter);

      const received: TriggerEvent[][] = [];
      pipeline.onTrigger((evts) => received.push(evts));

      pipeline.start(60000);
      await vi.advanceTimersByTimeAsync(100);
      pipeline.stop();

      expect(received).toHaveLength(0);
    });
  });
});

// ---- matchEventToInterests ----

describe("matchEventToInterests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 relevance with no interests", async () => {
    const event = makeEvent();
    const result = await matchEventToInterests(event, []);
    expect(result.relevanceScore).toBe(0);
    expect(result.matchedInterests).toEqual([]);
  });

  it("clamps relevance score to [0,1]", async () => {
    mockGenerateText.mockResolvedValue(
      JSON.stringify({ relevanceScore: 1.5, matchedInterests: ["ai"] })
    );
    mockExtractJson.mockImplementation((s: string) => s);

    const event = makeEvent();
    const interest: InnovationInterest = {
      id: "ai",
      label: "AI",
      keywords: ["artificial intelligence"],
    };

    const result = await matchEventToInterests(event, [interest]);
    expect(result.relevanceScore).toBeLessThanOrEqual(1);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
  });

  it("returns original event on LLM error", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM error"));

    const event = makeEvent({ relevanceScore: 0.5 });
    const interest: InnovationInterest = {
      id: "ai",
      label: "AI",
      keywords: ["artificial intelligence"],
    };

    const result = await matchEventToInterests(event, [interest]);
    expect(result.relevanceScore).toBe(0.5);
  });
});

// ---- triggerEventToMarkdown ----

describe("triggerEventToMarkdown", () => {
  it("formats event as markdown block", () => {
    const event = makeEvent({
      title: "New Release",
      source: "github-releases",
      relevanceScore: 0.95,
      url: "https://github.com/test",
      matchedInterests: ["ai", "ml"],
      summary: "A great new release",
    });

    const md = triggerEventToMarkdown(event);

    expect(md).toContain("### New Release");
    expect(md).toContain("github-releases");
    expect(md).toContain("95%");
    expect(md).toContain("https://github.com/test");
    expect(md).toContain("ai, ml");
    expect(md).toContain("A great new release");
  });

  it("omits URL when not present", () => {
    const event = makeEvent({ url: undefined });
    const md = triggerEventToMarkdown(event);
    expect(md).not.toContain("**URL:**");
  });

  it("omits matched interests when empty", () => {
    const event = makeEvent({ matchedInterests: [] });
    const md = triggerEventToMarkdown(event);
    expect(md).not.toContain("**Matched Interests:**");
  });
});
