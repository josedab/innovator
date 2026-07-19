/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoModePanel } from "../AutoModePanel";

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
    close() {
      streamController.close();
    },
    error(reason: unknown) {
      streamController.error(reason);
    },
  };
}

const completeProgress = {
  stage: "complete",
  completedAngles: ["scamper", "first-principles"],
  totalAngles: 8,
  angleResults: [{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }],
  synthesis: { themes: [] },
};

describe("AutoModePanel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("test error"),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the current markup and sends the exact auto request", async () => {
    render(<AutoModePanel subject="code review" onComplete={vi.fn()} onReset={vi.fn()} />);

    expect(screen.getByText("🚀 Auto Mode")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/code review/)).toBeInstanceOf(HTMLElement);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "code review" }),
      signal: expect.any(AbortSignal),
    });
  });

  it("buffers split chunks and calls onComplete for a valid complete event", async () => {
    const onComplete = vi.fn();
    const chunks = [
      'data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}\n\n',
      'data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,"angleResults":[],"currentAngle":"first-principles"}\n',
      "\n",
      `data: ${JSON.stringify(completeProgress)}\n\n`,
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream(chunks),
    });

    render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledWith(
      completeProgress.angleResults,
      completeProgress.synthesis
    );
  });

  it("ignores heartbeats, invalid JSON, invalid shapes, and data lines without a space", async () => {
    const onComplete = vi.fn();
    const chunks = [
      ": heartbeat\n\n",
      "data: not-json\n\n",
      'data: {"stage":"generating"}\n\n',
      `data:${JSON.stringify(completeProgress)}\n\n`,
      `data: ${JSON.stringify(completeProgress)}\n\n`,
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream(chunks),
    });

    render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("shows and clears partialIdea content while generating", async () => {
    const controlled = createControlledSSEStream();
    const onComplete = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, body: controlled.stream });

    render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.enqueue(
        'data: {"stage":"generating","completedAngles":[],"totalAngles":8,"angleResults":[],"partialIdea":{"angleName":"SCAMPER","content":"Streaming idea"}}\n\n'
      );
    });

    expect(await screen.findByText("💭 SCAMPER")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Streaming idea")).toBeInstanceOf(HTMLElement);

    act(() => {
      controlled.enqueue(
        'data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,"angleResults":[]}\n\n'
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Streaming idea")).toBeNull();
    });

    act(() => {
      controlled.enqueue(`data: ${JSON.stringify(completeProgress)}\n\n`);
      controlled.close();
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("uses null synthesis and stops reading after completion", async () => {
    const onComplete = vi.fn();
    const completeWithoutSynthesis = {
      ...completeProgress,
      synthesis: undefined,
    };
    const chunks = [
      `data: ${JSON.stringify(completeWithoutSynthesis)}\n\n`,
      'data: {"stage":"error","completedAngles":[],"totalAngles":8,"angleResults":[],"error":"late error"}\n\n',
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream(chunks),
    });

    render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(completeProgress.angleResults, null);
    });
    expect(screen.queryByText("late error")).toBeNull();
  });

  it("treats an error event as terminal and preserves the server error text", async () => {
    const onComplete = vi.fn();
    const chunks = [
      'data: {"stage":"error","completedAngles":[],"totalAngles":8,"angleResults":[],"error":"Server failed"}\n\n',
      `data: ${JSON.stringify(completeProgress)}\n\n`,
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream(chunks),
    });

    render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);

    expect(await screen.findByText("Server failed")).toBeInstanceOf(HTMLElement);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows the existing connection-lost error when the stream ends without complete", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([
        'data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}\n\n',
      ]),
    });

    render(<AutoModePanel subject="test" onComplete={vi.fn()} onReset={vi.fn()} />);

    expect(
      await screen.findByText("Connection lost before pipeline completed. Please try again.")
    ).toBeInstanceOf(HTMLElement);
  });

  it("preserves a non-OK response error", async () => {
    render(<AutoModePanel subject="non-ok" onComplete={vi.fn()} onReset={vi.fn()} />);
    expect(await screen.findByText("test error")).toBeInstanceOf(HTMLElement);
  });

  it("preserves the missing-stream error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, body: null });
    render(<AutoModePanel subject="missing" onComplete={vi.fn()} onReset={vi.fn()} />);
    expect(await screen.findByText("No response stream")).toBeInstanceOf(HTMLElement);
  });

  it("aborts the request after the five-minute timeout without replacing progress with an error", async () => {
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

    render(<AutoModePanel subject="timeout" onComplete={vi.fn()} onReset={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(requestSignal?.aborted).toBe(true);
    expect(screen.getByText("🔍 Investigating subject...")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByText("Aborted")).toBeNull();
  });

  it("stops, keeps partial results, aborts the request, and calls onComplete", async () => {
    const controlled = createControlledSSEStream();
    const onComplete = vi.fn();
    let requestSignal: AbortSignal | undefined;
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return Promise.resolve({ ok: true, body: controlled.stream });
    });

    render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      controlled.enqueue(
        'data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,"angleResults":[{"angleId":"scamper","angleName":"SCAMPER","ideas":[]}],"synthesis":{"themes":[]}}\n\n'
      );
    });

    const stopButton = await screen.findByRole("button", { name: "⏹ Stop & Keep Results" });
    const abortCallsBeforeStop = abortSpy.mock.calls.length;
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(requestSignal?.aborted).toBe(true);
      expect(abortSpy.mock.calls.length).toBeGreaterThan(abortCallsBeforeStop);
      expect(onComplete).toHaveBeenCalledWith(
        [{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }],
        { themes: [] }
      );
    });
    expect(
      screen.getByText("Pipeline stopped early. Showing 1 completed angle(s).")
    ).toBeInstanceOf(HTMLElement);
  });

  it("calls onReset from the error-state Start over button", async () => {
    const onReset = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([
        'data: {"stage":"error","completedAngles":[],"totalAngles":8,"angleResults":[],"error":"Server failed"}\n\n',
      ]),
    });

    render(<AutoModePanel subject="test" onComplete={vi.fn()} onReset={onReset} />);

    fireEvent.click(await screen.findByRole("button", { name: "Start over" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
