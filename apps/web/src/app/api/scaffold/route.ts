/**
 * @description Idea-to-code scaffold generation from innovation ideas.
 *
 * POST /api/scaffold — generate implementation scaffolding for an idea
 */

import { NextRequest, NextResponse } from "next/server";
import { generateScaffold, scaffoldToMarkdown } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { z } from "zod";

const RequestSchema = z.object({
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    potentialImpact: z.string().min(1).max(2000),
    implementationHint: z.string().optional().default(""),
  }),
  projectName: z.string().max(100).optional(),
  license: z.enum(["MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "ISC"]).optional(),
  stack: z.enum(["typescript", "python", "go", "rust"]).optional(),
  format: z.enum(["json", "markdown"]).optional().default("json"),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  try {
    const scaffold = generateScaffold({
      idea: parsed.data.idea,
      projectName: parsed.data.projectName,
      license: parsed.data.license,
      stack: parsed.data.stack,
    });

    if (parsed.data.format === "markdown") {
      return new Response(scaffoldToMarkdown(scaffold), {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    return NextResponse.json(scaffold, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: "Scaffold generation failed", details: (err as Error).message },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
