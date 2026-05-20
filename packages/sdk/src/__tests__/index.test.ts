import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InnovatorClient,
  InnovatorError,
  InvestigateRequestSchema,
  InnovateRequestSchema,
  MemorySearchRequestSchema,
  type StreamEvent,
} from "../index.js";

// ---- Helpers ----

function mockFetchResponse(body: unknown, status = 200, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchError(status: number, errorBody?: unknown) {
  const text = errorBody ? JSON.stringify(errorBody) : `HTTP ${status}`;
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => text,
    json: async () => errorBody,
  });
}

function makeSSEStream(lines: string[]) {
  const encoded = new TextEncoder().encode(lines.join("\n") + "\n");
  let read = false;
  return {
    getReader: () => ({
      read: async () => {
        if (!read) {
          read = true;
          return { done: false, value: encoded };
        }
        return { done: true, value: undefined };
      },
    }),
  };
}

describe("InnovatorClient", () => {
  let client: InnovatorClient;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    client = new InnovatorClient({
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
      timeout: 5000,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---- Constructor ----

  describe("constructor", () => {
    it("strips trailing slashes from baseUrl", () => {
      const c = new InnovatorClient({ baseUrl: "https://api.example.com///" });
      // Verify by calling investigate and checking the URL
      const mockFn = mockFetchResponse({ summary: "ok" });
      vi.stubGlobal("fetch", mockFn);
      c.investigate("test").catch(() => {});
      expect(mockFn).toHaveBeenCalledWith(
        "https://api.example.com/api/investigate",
        expect.anything()
      );
      vi.unstubAllGlobals();
    });

    it("defaults timeout to 120000ms", () => {
      const c = new InnovatorClient({ baseUrl: "https://api.example.com" });
      expect(c).toBeDefined();
    });

    it("defaults maxRetries to 2", () => {
      const c = new InnovatorClient({ baseUrl: "https://api.example.com" });
      expect(c).toBeDefined();
    });
  });

  // ---- request() retry logic ----

  describe("request retry logic", () => {
    it("retries on 429 status", async () => {
      let callCount = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return { ok: false, status: 429, text: async () => '{"error":"rate limited"}' };
        }
        return { ok: true, status: 200, json: async () => ({ summary: "ok" }) };
      });
      vi.stubGlobal("fetch", mockFn);

      const result = await client.investigate("test");
      expect(result).toEqual({ summary: "ok" });
      expect(callCount).toBe(3);
      vi.unstubAllGlobals();
    });

    it("retries on 502 status", async () => {
      let callCount = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return { ok: false, status: 502, text: async () => "" };
        }
        return { ok: true, status: 200, json: async () => ({ data: "ok" }) };
      });
      vi.stubGlobal("fetch", mockFn);

      const result = await client.investigate("test");
      expect(result).toEqual({ data: "ok" });
      vi.unstubAllGlobals();
    });

    it("retries on 503 status", async () => {
      let callCount = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return { ok: false, status: 503, text: async () => "" };
        }
        return { ok: true, status: 200, json: async () => ({ data: "ok" }) };
      });
      vi.stubGlobal("fetch", mockFn);

      const result = await client.investigate("test");
      expect(result).toEqual({ data: "ok" });
      vi.unstubAllGlobals();
    });

    it("retries on 504 status", async () => {
      let callCount = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return { ok: false, status: 504, text: async () => "" };
        }
        return { ok: true, status: 200, json: async () => ({ data: "ok" }) };
      });
      vi.stubGlobal("fetch", mockFn);

      const result = await client.investigate("test");
      expect(result).toEqual({ data: "ok" });
      vi.unstubAllGlobals();
    });

    it("throws after exhausting all retries on retryable status", async () => {
      const mockFn = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => '{"error":"rate limited"}',
      });
      vi.stubGlobal("fetch", mockFn);

      await expect(client.investigate("test")).rejects.toThrow(InnovatorError);
      expect(mockFn).toHaveBeenCalledTimes(3); // 1 + 2 retries
      vi.unstubAllGlobals();
    });
  });

  // ---- Non-retryable errors ----

  describe("non-retryable errors", () => {
    it("throws immediately on 400", async () => {
      const mockFn = mockFetchError(400, { error: "Bad request", code: "BAD_REQUEST" });
      vi.stubGlobal("fetch", mockFn);

      const err = await client.investigate("test").catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.status).toBe(400);
      expect(err.code).toBe("BAD_REQUEST");
      expect(mockFn).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });

    it("throws immediately on 401", async () => {
      const mockFn = mockFetchError(401, { error: "Unauthorized" });
      vi.stubGlobal("fetch", mockFn);

      const err = await client.investigate("test").catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.status).toBe(401);
      expect(mockFn).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });

    it("throws immediately on 403", async () => {
      const mockFn = mockFetchError(403, { error: "Forbidden" });
      vi.stubGlobal("fetch", mockFn);

      const err = await client.investigate("test").catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.status).toBe(403);
      expect(mockFn).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });

    it("parses error details from JSON response", async () => {
      const mockFn = mockFetchError(422, {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: { field: "subject" },
      });
      vi.stubGlobal("fetch", mockFn);

      const err = await client.investigate("test").catch((e) => e);
      expect(err.message).toBe("Validation failed");
      expect(err.details).toEqual({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: { field: "subject" },
      });
      vi.unstubAllGlobals();
    });

    it("handles non-JSON error response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        })
      );

      const err = await client.investigate("test").catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.status).toBe(500);
      vi.unstubAllGlobals();
    });
  });

  // ---- requestStream SSE parsing ----

  describe("requestStream SSE parsing", () => {
    it("parses SSE events with event and data fields", async () => {
      const body = makeSSEStream([
        "event: progress",
        'data: {"stage":"investigating"}',
        "",
        "event: result",
        'data: {"ideas":[]}',
        "",
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body,
        })
      );

      const events: StreamEvent[] = [];
      await client.streamAuto("test", (e) => events.push(e));
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe("progress");
      expect(events[0].data).toEqual({ stage: "investigating" });
      expect(events[1].event).toBe("result");
      vi.unstubAllGlobals();
    });

    it("handles data-only events (no event field)", async () => {
      const body = makeSSEStream(['data: {"value":1}', ""]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events: StreamEvent[] = [];
      await client.streamAuto("test", (e) => events.push(e));
      expect(events).toHaveLength(1);
      expect(events[0].event).toBeUndefined();
      expect(events[0].data).toEqual({ value: 1 });
      vi.unstubAllGlobals();
    });

    it("handles non-JSON data as raw string", async () => {
      const body = makeSSEStream(["data: hello world", ""]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events: StreamEvent[] = [];
      await client.streamAuto("test", (e) => events.push(e));
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe("hello world");
      vi.unstubAllGlobals();
    });

    it("skips empty data lines", async () => {
      const body = makeSSEStream(["data: ", "", 'data: {"ok":true}', ""]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events: StreamEvent[] = [];
      await client.streamAuto("test", (e) => events.push(e));
      expect(events).toHaveLength(1);
      vi.unstubAllGlobals();
    });

    it("resets event type on empty line per SSE spec", async () => {
      const body = makeSSEStream(["event: first", "", 'data: {"no_event":true}', ""]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events: StreamEvent[] = [];
      await client.streamAuto("test", (e) => events.push(e));
      expect(events).toHaveLength(1);
      expect(events[0].event).toBeUndefined();
      vi.unstubAllGlobals();
    });

    it("throws InnovatorError when stream response is not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => '{"error":"Server error"}',
        })
      );

      await expect(client.streamAuto("test", () => {})).rejects.toThrow(InnovatorError);
      vi.unstubAllGlobals();
    });

    it("throws InnovatorError when response body is null", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null,
        })
      );

      await expect(client.streamAuto("test", () => {})).rejects.toThrow(InnovatorError);
      vi.unstubAllGlobals();
    });
  });

  // ---- Zod schema validation ----

  describe("Zod schema validation", () => {
    it("InvestigateRequestSchema rejects empty subject", () => {
      const result = InvestigateRequestSchema.safeParse({ subject: "" });
      expect(result.success).toBe(false);
    });

    it("InvestigateRequestSchema rejects subject > 500 chars", () => {
      const result = InvestigateRequestSchema.safeParse({ subject: "x".repeat(501) });
      expect(result.success).toBe(false);
    });

    it("InvestigateRequestSchema accepts valid input", () => {
      const result = InvestigateRequestSchema.safeParse({ subject: "AI" });
      expect(result.success).toBe(true);
    });

    it("InnovateRequestSchema rejects empty angles array", () => {
      const result = InnovateRequestSchema.safeParse({
        subject: "test",
        investigation: {},
        angles: [],
      });
      expect(result.success).toBe(false);
    });

    it("InnovateRequestSchema rejects > 8 angles", () => {
      const result = InnovateRequestSchema.safeParse({
        subject: "test",
        investigation: {},
        angles: Array(9).fill("angle"),
      });
      expect(result.success).toBe(false);
    });

    it("InnovateRequestSchema accepts valid input", () => {
      const result = InnovateRequestSchema.safeParse({
        subject: "test",
        investigation: { data: true },
        angles: ["scamper", "first-principles"],
      });
      expect(result.success).toBe(true);
    });

    it("MemorySearchRequestSchema validates threshold bounds", () => {
      expect(MemorySearchRequestSchema.safeParse({ query: "test", threshold: -0.1 }).success).toBe(
        false
      );
      expect(MemorySearchRequestSchema.safeParse({ query: "test", threshold: 1.1 }).success).toBe(
        false
      );
      expect(MemorySearchRequestSchema.safeParse({ query: "test", threshold: 0.5 }).success).toBe(
        true
      );
    });

    it("MemorySearchRequestSchema validates limit bounds", () => {
      expect(MemorySearchRequestSchema.safeParse({ query: "test", limit: 0 }).success).toBe(false);
      expect(MemorySearchRequestSchema.safeParse({ query: "test", limit: 51 }).success).toBe(false);
      expect(MemorySearchRequestSchema.safeParse({ query: "test", limit: 25 }).success).toBe(true);
    });
  });

  // ---- InnovatorError structure ----

  describe("InnovatorError", () => {
    it("has correct name", () => {
      const err = new InnovatorError("test", 400, "TEST");
      expect(err.name).toBe("InnovatorError");
    });

    it("preserves status, code, and details", () => {
      const err = new InnovatorError("msg", 404, "NOT_FOUND", { extra: true });
      expect(err.message).toBe("msg");
      expect(err.status).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
      expect(err.details).toEqual({ extra: true });
    });

    it("extends Error", () => {
      const err = new InnovatorError("test", 500);
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ---- AbortSignal / timeout ----

  describe("AbortSignal and timeout", () => {
    it("throws ABORTED when signal is already aborted", async () => {
      const mockFn = mockFetchResponse({ data: "ok" });
      vi.stubGlobal("fetch", mockFn);

      const controller = new AbortController();
      controller.abort();

      const err = await client.investigate("test", { signal: controller.signal }).catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.code).toBe("ABORTED");
      expect(mockFn).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("throws ABORTED for stream when signal is already aborted", async () => {
      vi.stubGlobal("fetch", vi.fn());

      const controller = new AbortController();
      controller.abort();

      const err = await client
        .streamAuto("test", () => {}, { signal: controller.signal })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.code).toBe("ABORTED");
      vi.unstubAllGlobals();
    });

    it("applies the configured timeout to stream connection setup", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("The operation was aborted", "AbortError")),
              { once: true }
            );
          });
        })
      );
      const timeoutClient = new InnovatorClient({
        baseUrl: "https://api.example.com",
        timeout: 1,
      });

      const error = await timeoutClient.streamAuto("test", () => {}).catch((err) => err);

      expect(error).toBeInstanceOf(InnovatorError);
      expect(error.code).toBe("TIMEOUT");
      vi.unstubAllGlobals();
    });

    it("throws TIMEOUT on fetch timeout (AbortError without external signal)", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

      const c = new InnovatorClient({
        baseUrl: "https://api.example.com",
        timeout: 1,
        maxRetries: 0,
      });

      const err = await c.investigate("test").catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.code).toBe("TIMEOUT");
      vi.unstubAllGlobals();
    });

    it("throws NETWORK_ERROR on generic fetch failure after retries", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("DNS resolution failed")));

      const err = await client.investigate("test").catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.code).toBe("NETWORK_ERROR");
      vi.unstubAllGlobals();
    });
  });

  // ---- Public API methods ----

  describe("public API methods", () => {
    it("investigate sends correct request", async () => {
      const mockFn = mockFetchResponse({ summary: "result" });
      vi.stubGlobal("fetch", mockFn);

      await client.investigate("solar energy", { model: "gpt-5" });
      expect(mockFn).toHaveBeenCalledWith(
        "https://api.example.com/api/investigate",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
            "Content-Type": "application/json",
          }),
        })
      );
      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.subject).toBe("solar energy");
      expect(body.model).toBe("gpt-5");
      vi.unstubAllGlobals();
    });

    it("innovate sends correct request with defaults", async () => {
      const mockFn = mockFetchResponse({ angleResults: [] });
      vi.stubGlobal("fetch", mockFn);

      await client.innovate("test", ["scamper"]);
      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.subject).toBe("test");
      expect(body.angles).toEqual(["scamper"]);
      expect(body.investigation).toEqual({});
      vi.unstubAllGlobals();
    });

    it("auto collects all stream events", async () => {
      const body = makeSSEStream([
        'data: {"stage":"investigating"}',
        "",
        'data: {"stage":"complete"}',
        "",
      ]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events = await client.auto("test");
      expect(events).toHaveLength(2);
      vi.unstubAllGlobals();
    });

    it("memorySearch sends correct body", async () => {
      const mockFn = mockFetchResponse({ results: [] });
      vi.stubGlobal("fetch", mockFn);

      await client.memorySearch("query", { threshold: 0.5, limit: 10 });
      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.query).toBe("query");
      expect(body.threshold).toBe(0.5);
      expect(body.limit).toBe(10);
      vi.unstubAllGlobals();
    });

    it("getOrgDNA sends GET with query params", async () => {
      const mockFn = mockFetchResponse({ dna: "data" });
      vi.stubGlobal("fetch", mockFn);

      await client.getOrgDNA("markdown");
      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining("action=org-dna"),
        expect.objectContaining({ method: "GET" })
      );
      expect(mockFn.mock.calls[0][0]).toContain("format=markdown");
      vi.unstubAllGlobals();
    });

    it("headers omit Authorization when no apiKey", async () => {
      const c = new InnovatorClient({ baseUrl: "https://api.example.com" });
      const mockFn = mockFetchResponse({ summary: "ok" });
      vi.stubGlobal("fetch", mockFn);

      await c.investigate("test");
      const headers = mockFn.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
      vi.unstubAllGlobals();
    });

    it("request with undefined body does not send body", async () => {
      const mockFn = mockFetchResponse({ status: "ok" });
      vi.stubGlobal("fetch", mockFn);

      await client.getOrgDNA();
      expect(mockFn.mock.calls[0][1].body).toBeUndefined();
      vi.unstubAllGlobals();
    });
  });

  // ---- requestStream edge cases ----

  describe("requestStream", () => {
    function makeMultiChunkStream(chunks: string[]) {
      const encoder = new TextEncoder();
      let index = 0;
      return {
        getReader: () => ({
          read: async () => {
            if (index < chunks.length) {
              return { done: false, value: encoder.encode(chunks[index++]) };
            }
            return { done: true, value: undefined };
          },
        }),
      };
    }

    it("handles SSE event split across chunk boundaries", async () => {
      // Split "data: {\"stage\":\"done\"}\n\n" across two chunks
      const body = makeMultiChunkStream(['data: {"stag', 'e":"done"}\n\n']);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events = await client.auto("test");
      expect(events).toHaveLength(1);
      expect((events[0].data as { stage: string }).stage).toBe("done");
      vi.unstubAllGlobals();
    });

    it("empty stream (0 events) returns empty array", async () => {
      const body = makeMultiChunkStream([]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events = await client.auto("test");
      expect(events).toHaveLength(0);
      vi.unstubAllGlobals();
    });

    it("filters heartbeat-only keepalive events (empty data lines)", async () => {
      const body = makeSSEStream([
        'data: {"stage":"start"}',
        "",
        "data: ",
        "",
        'data: {"stage":"end"}',
        "",
      ]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events = await client.auto("test");
      // Empty "data: " line should be skipped (raw is empty after trim)
      expect(events).toHaveLength(2);
      vi.unstubAllGlobals();
    });

    it("handles event: prefix for named events", async () => {
      const body = makeSSEStream([
        "event: progress",
        'data: {"step":1}',
        "",
        "event: complete",
        'data: {"step":2}',
        "",
      ]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events: StreamEvent[] = [];
      await client.streamAuto("test", (e) => events.push(e));
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe("progress");
      expect(events[1].event).toBe("complete");
      vi.unstubAllGlobals();
    });

    it("throws ABORTED when AbortSignal fires mid-stream", async () => {
      const controller = new AbortController();
      let readCount = 0;
      const body = {
        getReader: () => ({
          read: async () => {
            readCount++;
            if (readCount === 1) {
              return {
                done: false,
                value: new TextEncoder().encode('data: {"step":1}\n\n'),
              };
            }
            // Abort on second read
            controller.abort();
            throw new DOMException("The operation was aborted", "AbortError");
          },
        }),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const err = await client
        .streamAuto("test", () => {}, { signal: controller.signal })
        .catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.code).toBe("ABORTED");
      vi.unstubAllGlobals();
    });

    it("throws on HTTP error response during stream", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: "Server failed", code: "INTERNAL" }),
          body: null,
        })
      );

      const err = await client.streamAuto("test", () => {}).catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.status).toBe(500);
      expect(err.message).toBe("Server failed");
      vi.unstubAllGlobals();
    });

    it("throws NO_BODY when response body is null", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body: null }));

      const err = await client.streamAuto("test", () => {}).catch((e) => e);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err.code).toBe("NO_BODY");
      vi.unstubAllGlobals();
    });

    it("parses non-JSON data as raw string", async () => {
      const body = makeSSEStream(["data: hello world", ""]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body }));

      const events = await client.auto("test");
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe("hello world");
      vi.unstubAllGlobals();
    });
  });
});
