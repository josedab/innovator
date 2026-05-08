import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TriggerPipeline,
  createTriggerPipeline,
  matchEventToInterests,
  triggerEventToMarkdown,
  TriggerConfigSchema,
  RSSAdapter,
  GitHubReleasesAdapter,
  HackerNewsAdapter,
  ArxivAdapter,
  PatentAdapter,
  type TriggerConfig,
  type TriggerEvent,
  type TriggerSourceAdapter,
  type InnovationInterest,
} from "../triggers/index.js";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue("mock-text"),
  extractJson: vi.fn().mockImplementation((text: string) => text),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn().mockImplementation((fn: () => Promise<string>) => fn()),
}));

vi.mock("../prompts/sanitize.js", () => ({
  sanitizeLlmOutput: vi.fn().mockImplementation((s: string) => s),
  wrapUserInput: vi.fn().mockImplementation((_label: string, value: string) => value),
}));

function makeEvent(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    source: "rss",
    title: "Test Event",
    url: "https://example.com",
    summary: "A test event summary",
    relevanceScore: 0.8,
    matchedInterests: [],
    timestamp: new Date().toISOString(),
    fingerprint: `rss::test-event-${Math.random()}`,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    source: "rss",
    ...overrides,
  };
}

function makeInterest(overrides: Partial<InnovationInterest> = {}): InnovationInterest {
  return {
    id: "interest-1",
    label: "AI Research",
    keywords: ["machine learning", "neural networks"],
    ...overrides,
  };
}

function makeFakeAdapter(
  type: TriggerEvent["source"] = "rss",
  events: TriggerEvent[] = []
): TriggerSourceAdapter {
  return {
    type,
    fetchEvents: vi.fn().mockResolvedValue(events),
  };
}

describe("triggers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- TriggerPipeline ----

  describe("TriggerPipeline", () => {
    it("constructor creates instance with config", () => {
      const config = makeConfig();
      const pipeline = new TriggerPipeline(config);
      expect(pipeline).toBeInstanceOf(TriggerPipeline);
    });

    it("registerAdapter adds adapter", () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const adapter = makeFakeAdapter("rss", [makeEvent()]);
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);
      pipeline.start(60_000);

      // poll is called immediately on start, wait for the async poll to complete
      return vi.advanceTimersByTimeAsync(0).then(() => {
        expect(adapter.fetchEvents).toHaveBeenCalled();
      });
    });

    it("addInterest adds interests for matching", () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const interest = makeInterest();
      // Should not throw
      pipeline.addInterest(interest);
      pipeline.addInterest(makeInterest({ id: "interest-2", label: "Biotech" }));
    });

    it("onTrigger registers callbacks", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const event = makeEvent({ fingerprint: "rss::unique-1" });
      const adapter = makeFakeAdapter("rss", [event]);
      pipeline.registerAdapter(adapter);

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      pipeline.onTrigger(cb1);
      pipeline.onTrigger(cb2);

      pipeline.start(60_000);
      await vi.advanceTimersByTimeAsync(0);

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it("start() triggers immediate poll and sets interval", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const event1 = makeEvent({ fingerprint: "rss::ev-1" });
      const event2 = makeEvent({ fingerprint: "rss::ev-2" });
      const adapter = makeFakeAdapter("rss", [event1]);
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(10_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      // Change adapter to return a new event for next poll
      (adapter.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValue([event2]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("stop() clears the polling timer", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const adapter = makeFakeAdapter("rss", [makeEvent({ fingerprint: "rss::stop-test" })]);
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(10_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      pipeline.stop();

      (adapter.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent({ fingerprint: "rss::stop-test-2" }),
      ]);
      await vi.advanceTimersByTimeAsync(20_000);
      // No additional calls after stop
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("start() is idempotent — calling twice does not double-poll", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const adapter = makeFakeAdapter("rss", [makeEvent({ fingerprint: "rss::idempotent" })]);
      pipeline.registerAdapter(adapter);

      pipeline.start(10_000);
      pipeline.start(10_000); // second call should be a no-op
      await vi.advanceTimersByTimeAsync(0);

      expect(adapter.fetchEvents).toHaveBeenCalledTimes(1);
    });

    it("deduplication: same fingerprint not emitted twice", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const event = makeEvent({ fingerprint: "rss::dup-event" });
      const adapter = makeFakeAdapter("rss", [event]);
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(5_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      // Next poll returns same fingerprint
      await vi.advanceTimersByTimeAsync(5_000);
      // Should still be 1 — duplicate filtered
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("deduplication window expires and allows same fingerprint again", async () => {
      const dedupMs = 10_000;
      const pipeline = new TriggerPipeline(makeConfig({ deduplicationWindowMs: dedupMs }));
      const event = makeEvent({ fingerprint: "rss::expire-dedup" });
      const adapter = makeFakeAdapter("rss", [event]);
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(5_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      // Advance past dedup window
      await vi.advanceTimersByTimeAsync(15_000);
      // After window expires, the same fingerprint should be re-emitted
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("frequency cap maxPerHour limits events emitted", async () => {
      const pipeline = new TriggerPipeline(makeConfig({ frequencyCap: { maxPerHour: 1 } }));
      let callCount = 0;
      const adapter: TriggerSourceAdapter = {
        type: "rss",
        fetchEvents: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve([makeEvent({ fingerprint: `rss::cap-${callCount}` })]);
        }),
      };
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(1_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second poll — should be capped
      await vi.advanceTimersByTimeAsync(1_000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("frequency cap maxPerDay limits events emitted", async () => {
      const pipeline = new TriggerPipeline(makeConfig({ frequencyCap: { maxPerDay: 2 } }));
      let callCount = 0;
      const adapter: TriggerSourceAdapter = {
        type: "rss",
        fetchEvents: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve([makeEvent({ fingerprint: `rss::day-${callCount}` })]);
        }),
      };
      pipeline.registerAdapter(adapter);

      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(1_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(callback).toHaveBeenCalledTimes(2);

      // Third poll — should be capped at 2 per day
      await vi.advanceTimersByTimeAsync(1_000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("poll does nothing when no adapters are registered", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      const callback = vi.fn();
      pipeline.onTrigger(callback);

      pipeline.start(5_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).not.toHaveBeenCalled();
    });

    it("swallows callback errors without stopping pipeline", async () => {
      const pipeline = new TriggerPipeline(makeConfig());
      let callCount = 0;
      const adapter: TriggerSourceAdapter = {
        type: "rss",
        fetchEvents: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve([makeEvent({ fingerprint: `rss::err-${callCount}` })]);
        }),
      };
      pipeline.registerAdapter(adapter);

      const throwingCb = vi.fn().mockImplementation(() => {
        throw new Error("callback error");
      });
      const normalCb = vi.fn();
      pipeline.onTrigger(throwingCb);
      pipeline.onTrigger(normalCb);

      pipeline.start(5_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(throwingCb).toHaveBeenCalledTimes(1);
      expect(normalCb).toHaveBeenCalledTimes(1);
    });
  });

  // ---- createTriggerPipeline ----

  describe("createTriggerPipeline", () => {
    it("returns a TriggerPipeline instance", () => {
      const pipeline = createTriggerPipeline(makeConfig());
      expect(pipeline).toBeInstanceOf(TriggerPipeline);
    });

    it("pre-registers all 5 built-in adapters", async () => {
      // We verify indirectly: create a pipeline for each source type and
      // confirm it can start without throwing (adapters are present).
      const sources = ["rss", "github-releases", "hacker-news", "arxiv", "patent-filings"] as const;
      for (const source of sources) {
        const pipeline = createTriggerPipeline(makeConfig({ source }));
        pipeline.start(60_000);
        await vi.advanceTimersByTimeAsync(0);
        pipeline.stop();
      }
    });
  });

  // ---- matchEventToInterests ----

  describe("matchEventToInterests", () => {
    it("returns zero relevance when no interests provided", async () => {
      const event = makeEvent();
      const result = await matchEventToInterests(event, []);
      expect(result.relevanceScore).toBe(0);
      expect(result.matchedInterests).toEqual([]);
    });

    it("calls LLM and returns scored event when interests present", async () => {
      const { generateText, extractJson } = await import("../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValue("mock");
      (extractJson as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ relevanceScore: 0.9, matchedInterests: ["interest-1"] })
      );

      const event = makeEvent();
      const interest = makeInterest();
      const result = await matchEventToInterests(event, [interest]);
      expect(result.relevanceScore).toBe(0.9);
      expect(result.matchedInterests).toEqual(["interest-1"]);
    });

    it("clamps relevance score to [0, 1]", async () => {
      const { generateText, extractJson } = await import("../copilot/client.js");
      (generateText as ReturnType<typeof vi.fn>).mockResolvedValue("mock");
      (extractJson as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ relevanceScore: 5.0, matchedInterests: [] })
      );

      const event = makeEvent();
      const result = await matchEventToInterests(event, [makeInterest()]);
      expect(result.relevanceScore).toBeLessThanOrEqual(1);
    });

    it("returns original event on LLM error", async () => {
      const { withRetry } = await import("../copilot/retry.js");
      (withRetry as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM failure"));

      const event = makeEvent({ relevanceScore: 0.5 });
      const result = await matchEventToInterests(event, [makeInterest()]);
      expect(result.relevanceScore).toBe(0.5);
    });
  });

  // ---- triggerEventToMarkdown ----

  describe("triggerEventToMarkdown", () => {
    it("formats event as markdown with all fields", () => {
      const event = makeEvent({
        title: "AI Breakthrough",
        source: "arxiv",
        relevanceScore: 0.95,
        url: "https://arxiv.org/paper",
        matchedInterests: ["ml", "nlp"],
        summary: "Major advancement in NLP.",
        timestamp: "2024-01-15T10:00:00.000Z",
      });

      const md = triggerEventToMarkdown(event);
      expect(md).toContain("### AI Breakthrough");
      expect(md).toContain("**Source:** arxiv");
      expect(md).toContain("**Relevance:** 95%");
      expect(md).toContain("**URL:** https://arxiv.org/paper");
      expect(md).toContain("**Matched Interests:** ml, nlp");
      expect(md).toContain("Major advancement in NLP.");
      expect(md).toContain("2024-01-15T10:00:00.000Z");
    });

    it("omits URL line when url is undefined", () => {
      const event = makeEvent({ url: undefined });
      const md = triggerEventToMarkdown(event);
      expect(md).not.toContain("**URL:**");
    });

    it("omits matched interests line when empty", () => {
      const event = makeEvent({ matchedInterests: [] });
      const md = triggerEventToMarkdown(event);
      expect(md).not.toContain("**Matched Interests:**");
    });
  });

  // ---- Schema validation ----

  describe("TriggerConfigSchema", () => {
    it("validates a minimal config", () => {
      const result = TriggerConfigSchema.safeParse({ source: "rss" });
      expect(result.success).toBe(true);
    });

    it("validates a full config", () => {
      const result = TriggerConfigSchema.safeParse({
        source: "hacker-news",
        filter: { keywords: ["AI"], minRelevance: 0.5 },
        frequencyCap: { maxPerHour: 10, maxPerDay: 50 },
        deduplicationWindowMs: 3600000,
        options: { feedUrl: "https://example.com/feed" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid source", () => {
      const result = TriggerConfigSchema.safeParse({ source: "invalid-source" });
      expect(result.success).toBe(false);
    });
  });

  // ---- Built-in adapters ----

  describe("built-in adapters", () => {
    it("RSSAdapter has type 'rss'", () => {
      expect(RSSAdapter.type).toBe("rss");
    });

    it("GitHubReleasesAdapter has type 'github-releases'", () => {
      expect(GitHubReleasesAdapter.type).toBe("github-releases");
    });

    it("HackerNewsAdapter has type 'hacker-news'", () => {
      expect(HackerNewsAdapter.type).toBe("hacker-news");
    });

    it("ArxivAdapter has type 'arxiv'", () => {
      expect(ArxivAdapter.type).toBe("arxiv");
    });

    it("PatentAdapter has type 'patent-filings'", () => {
      expect(PatentAdapter.type).toBe("patent-filings");
    });
  });
});
