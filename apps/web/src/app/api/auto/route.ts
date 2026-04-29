import { runAutoPipeline, ANGLE_IDS } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
import { z } from "zod";

const RequestSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
});

export async function POST(request: Request) {
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
            // Stream may have been closed by client disconnect
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
              totalAngles: ANGLE_IDS.length,
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
    console.error("Auto mode error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Auto mode failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
