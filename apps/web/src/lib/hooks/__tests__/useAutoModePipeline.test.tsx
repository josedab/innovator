/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoModePipeline } from "../useAutoModePipeline";

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function createControlledSSEStream() {
  const encoder = new TextEncoder();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;

  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    }),
    enqueue(chunk: string) {
      streamController.enqueue(encoder.encode(chunk));
    },
  };
}

const angleResults = [{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }];

describe("useAutoModePipeline", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends the current request and completes with parsed results", async () => {
    const onComplete = vi.fn();
    const complete = {
      stage: "complete",
      completedAngles: ["scamper"],
      totalAngles: 8,
      angleResults,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([`data: ${JSON.stringify(complete)}\n\n`]),
    });

    const { result } = renderHook(() =>
      useAutoModePipeline({ subject: "test subject", onComplete })
    );

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(angleResults, null);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "test subject" }),
      signal: expect.any(AbortSignal),
    });
    expect(result.current.progress).toEqual(complete);
  });

  it("tracks and clears partial idea content", async () => {
    const controlled = createControlledSSEStream();
    fetchMock.mockResolvedValueOnce({ ok: true, body: controlled.stream });
    const { result } = renderHook(() =>
      useAutoModePipeline({ subject: "test", onComplete: vi.fn() })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.enqueue(
        'data: {"stage":"generating","completedAngles":[],"totalAngles":8,"angleResults":[],"partialIdea":{"angleName":"SCAMPER","content":"Streaming idea"}}\n\n'
      );
    });
    await waitFor(() => expect(result.current.partialContent).toBe("Streaming idea"));

    act(() => {
      controlled.enqueue(
        'data: {"stage":"synthesizing","completedAngles":["scamper"],"totalAngles":8,"angleResults":[]}\n\n'
      );
    });
    await waitFor(() => expect(result.current.partialContent).toBe(""));
  });

  it("preserves server, missing-stream, and end-without-complete errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValue("Server failed"),
    });
    const serverError = renderHook(() =>
      useAutoModePipeline({ subject: "server", onComplete: vi.fn() })
    );
    await waitFor(() => expect(serverError.result.current.progress.error).toBe("Server failed"));
    serverError.unmount();

    fetchMock.mockResolvedValueOnce({ ok: true, body: null });
    const noStream = renderHook(() =>
      useAutoModePipeline({ subject: "stream", onComplete: vi.fn() })
    );
    await waitFor(() => expect(noStream.result.current.progress.error).toBe("No response stream"));
    noStream.unmount();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([
        'data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}\n\n',
      ]),
    });
    const disconnected = renderHook(() =>
      useAutoModePipeline({ subject: "disconnect", onComplete: vi.fn() })
    );
    await waitFor(() =>
      expect(disconnected.result.current.progress.error).toBe(
        "Connection lost before pipeline completed. Please try again."
      )
    );
  });

  it("treats an SSE error event as terminal", async () => {
    const onComplete = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([
        'data: {"stage":"error","completedAngles":[],"totalAngles":8,"angleResults":[],"error":"Pipeline failed"}\n\n',
      ]),
    });

    const { result } = renderHook(() => useAutoModePipeline({ subject: "test", onComplete }));

    await waitFor(() => expect(result.current.progress.error).toBe("Pipeline failed"));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("preserves per-frame isolation when the completion callback throws", async () => {
    const onComplete = vi.fn(() => {
      throw new Error("Callback failed");
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([
        `data: ${JSON.stringify({
          stage: "complete",
          completedAngles: ["scamper"],
          totalAngles: 8,
          angleResults,
        })}\n\n`,
      ]),
    });

    const { result } = renderHook(() => useAutoModePipeline({ subject: "test", onComplete }));

    await waitFor(() => expect(result.current.progress.stage).toBe("complete"));
    expect(result.current.progress.error).toBeUndefined();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("aborts and keeps partial results through the stop callback", async () => {
    const controlled = createControlledSSEStream();
    const onComplete = vi.fn();
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    fetchMock.mockResolvedValueOnce({ ok: true, body: controlled.stream });
    const { result } = renderHook(() => useAutoModePipeline({ subject: "test", onComplete }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.enqueue(
        `data: ${JSON.stringify({
          stage: "generating",
          completedAngles: ["scamper"],
          totalAngles: 8,
          angleResults,
          synthesis: { themes: [] },
        })}\n\n`
      );
    });
    await waitFor(() => expect(result.current.progress.angleResults).toEqual(angleResults));
    const abortCallsBeforeStop = abortSpy.mock.calls.length;

    act(() => {
      result.current.handleStopAndKeep();
    });

    expect(abortSpy.mock.calls.length).toBeGreaterThan(abortCallsBeforeStop);
    expect(onComplete).toHaveBeenCalledWith(angleResults, { themes: [] });
    expect(result.current.progress).toEqual(
      expect.objectContaining({ stage: "complete", stoppedEarly: true })
    );
  });

  it("aborts the active request by the five-minute timeout", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          requestSignal = init.signal as AbortSignal;
          requestSignal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    renderHook(() => useAutoModePipeline({ subject: "test", onComplete: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(requestSignal?.aborted).toBe(true);
  });
});
