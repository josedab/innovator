import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  runAutoPipeline: vi.fn(),
}));

import { runAutoPipeline } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
const mockRunAutoPipeline = vi.mocked(runAutoPipeline);

import { z } from "zod";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { subject, model } = parsed.data;
    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (progress: PipelineProgress) => {
          if (streamClosed) return;
          try {
            const data = `data: ${JSON.stringify(progress)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            streamClosed = true;
          }
        };
        try {
          await runAutoPipeline(subject, sendProgress, model);
        } catch (err) {
          if (!streamClosed) {
            const errorProgress: PipelineProgress = {
              stage: "error",
              completedAngles: [],
              totalAngles: 8,
              angleResults: [],
              error: err instanceof Error ? err.message : "Pipeline failed",
            };
            sendProgress(errorProgress);
          }
        } finally {
          if (!streamClosed) {
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
          streamClosed = true;
        }
      },
      cancel() {
        streamClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Auto mode failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function readSSEStream(response: Response): Promise<PipelineProgress[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: PipelineProgress[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        events.push(JSON.parse(line.slice(6)));
      }
    }
  }
  return events;
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SSE stream with correct headers", async () => {
    mockRunAutoPipeline.mockResolvedValue({
      stage: "complete",
      completedAngles: [],
      totalAngles: 8,
      angleResults: [],
    });

    const res = await POST(makeRequest({ subject: "testing" }));

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("streams progress events from pipeline", async () => {
    mockRunAutoPipeline.mockImplementation(
      async (_subject: string, onProgress: (p: PipelineProgress) => void) => {
        onProgress({
          stage: "investigating",
          completedAngles: [],
          totalAngles: 8,
          angleResults: [],
        });
        onProgress({
          stage: "complete",
          completedAngles: ["scamper"],
          totalAngles: 8,
          angleResults: [],
        });
        return {
          stage: "complete" as const,
          completedAngles: ["scamper"],
          totalAngles: 8,
          angleResults: [],
        };
      }
    );

    const res = await POST(makeRequest({ subject: "testing" }));
    const events = await readSSEStream(res);

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].stage).toBe("investigating");
    expect(events[events.length - 1].stage).toBe("complete");
  });

  it("returns 400 for missing subject", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty subject", async () => {
    const res = await POST(makeRequest({ subject: "" }));

    expect(res.status).toBe(400);
  });

  it("streams error event when pipeline throws", async () => {
    mockRunAutoPipeline.mockRejectedValue(new Error("Pipeline crash"));

    const res = await POST(makeRequest({ subject: "testing" }));
    const events = await readSSEStream(res);

    const errorEvent = events.find((e) => e.stage === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toBe("Pipeline crash");
  });

  it("passes model to runAutoPipeline", async () => {
    mockRunAutoPipeline.mockResolvedValue({
      stage: "complete",
      completedAngles: [],
      totalAngles: 8,
      angleResults: [],
    });

    const res = await POST(makeRequest({ subject: "testing", model: "gpt-5" }));
    await readSSEStream(res);

    expect(mockRunAutoPipeline).toHaveBeenCalledWith("testing", expect.any(Function), "gpt-5");
  });
});
