/**
 * @vitest-environment jsdom
 */
import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoModePanel } from "../AutoModePanel";

// Helper: create a ReadableStream from SSE chunks
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

// Mock fetch to prevent actual API calls
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("test error"),
    })
  );
});

describe("AutoModePanel", () => {
  it("renders without crashing", async () => {
    await act(async () => {
      render(<AutoModePanel subject="test subject" onComplete={vi.fn()} onReset={vi.fn()} />);
    });
    expect(screen.getByText("🚀 Auto Mode")).toBeDefined();
  });

  it("displays the subject", async () => {
    await act(async () => {
      render(<AutoModePanel subject="code review" onComplete={vi.fn()} onReset={vi.fn()} />);
    });
    expect(screen.getByText(/code review/)).toBeDefined();
  });

  it("parses multi-chunk SSE stream and calls onComplete", async () => {
    const onComplete = vi.fn();
    const completeData = {
      stage: "complete",
      completedAngles: ["scamper", "first-principles"],
      totalAngles: 8,
      angleResults: [{ angleId: "scamper", ideas: [] }],
      synthesis: { themes: [] },
    };

    // Split SSE events across multiple chunks to test buffer logic
    const chunks = [
      'data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}\n\n',
      'data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,"angleResults":[],"currentAngle":"first-principles"}\n',
      "\n",
      `data: ${JSON.stringify(completeData)}\n\n`,
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream(chunks),
      })
    );

    await act(async () => {
      render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledWith(completeData.angleResults, completeData.synthesis);
  });

  it("shows error when stream ends without complete event", async () => {
    const chunks = [
      'data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}\n\n',
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream(chunks),
      })
    );

    await act(async () => {
      render(<AutoModePanel subject="test" onComplete={vi.fn()} onReset={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Connection lost/)).toBeDefined();
    });
  });

  it("handles SSE error stage from server", async () => {
    const chunks = [
      'data: {"stage":"error","completedAngles":[],"totalAngles":8,"angleResults":[],"error":"Server failed"}\n\n',
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream(chunks),
      })
    );

    await act(async () => {
      render(<AutoModePanel subject="test" onComplete={vi.fn()} onReset={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Server failed")).toBeDefined();
    });
  });

  it("updates progress during generating stage", async () => {
    const completeData = {
      stage: "complete",
      completedAngles: ["scamper", "inversion"],
      totalAngles: 8,
      angleResults: [],
      synthesis: null,
    };

    const chunks = [
      'data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,"angleResults":[],"currentAngle":"inversion"}\n\n',
      `data: ${JSON.stringify(completeData)}\n\n`,
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream(chunks),
      })
    );

    const onComplete = vi.fn();
    await act(async () => {
      render(<AutoModePanel subject="test" onComplete={onComplete} onReset={vi.fn()} />);
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledWith([], null);
  });
});
