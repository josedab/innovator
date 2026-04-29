import { investigate, InvestigationSchema } from "@innovator/core";
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
    const investigation = await investigate(subject, model);
    return Response.json(investigation);
  } catch (err) {
    console.error("Investigation error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Investigation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
