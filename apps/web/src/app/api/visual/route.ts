/**
 * @description Visual output generation — diagrams, idea maps, comparison charts,
 * and export to Figma/Miro formats.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { VisualOutputGenerator } from "@innovator/core";
import type { VisualIdeaInput as IdeaInput, VisualSynthesisInput as SynthesisInput, VisualAngleResultInput as AngleResultInput } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

// ---- Zod Schemas ----

const IdeaInputSchema = z.object({
  title: z.string().min(1).max(500),
  score: z.number().min(0).max(1).optional(),
  angle: z.string().max(200).optional(),
  feasibility: z.enum(["low", "medium", "high"]).optional(),
  impact: z.number().min(0).max(1).optional(),
  createdAt: z.string().optional(),
  connections: z.array(z.string().max(200)).max(20).optional(),
});

const SynthesisInputSchema = z.object({
  topIdeas: z.array(IdeaInputSchema).min(1).max(50),
  themes: z.array(z.string().max(200)).max(20).optional(),
  recommendation: z.string().max(5000).optional(),
});

const AngleResultInputSchema = z.object({
  angle: z.string().min(1).max(200),
  ideas: z.array(IdeaInputSchema).min(1).max(50),
  score: z.number().min(0).max(1).optional(),
});

// ---- Action Schemas ----

const DiagramSchema = z.object({
  action: z.literal("diagram"),
  ideas: z.array(IdeaInputSchema).min(1).max(50),
  diagramType: z.enum(["mindmap", "flowchart", "quadrant"]),
});

const IdeaMapSchema = z.object({
  action: z.literal("idea_map"),
  synthesis: SynthesisInputSchema,
});

const ComparisonSchema = z.object({
  action: z.literal("comparison"),
  angleResults: z.array(AngleResultInputSchema).min(1).max(20),
});

const ExportFigmaSchema = z.object({
  action: z.literal("export_figma"),
  artifacts: z.array(
    z.object({
      id: z.string().max(200),
      type: z.enum(["chart", "diagram", "mindmap", "matrix"]),
      format: z.enum(["mermaid", "svg", "json"]),
      content: z.string(),
      title: z.string().max(500),
      metadata: z.record(z.unknown()).optional(),
    })
  ).min(1).max(20),
});

const ExportMiroSchema = z.object({
  action: z.literal("export_miro"),
  artifacts: z.array(
    z.object({
      id: z.string().max(200),
      type: z.enum(["chart", "diagram", "mindmap", "matrix"]),
      format: z.enum(["mermaid", "svg", "json"]),
      content: z.string(),
      title: z.string().max(500),
      metadata: z.record(z.unknown()).optional(),
    })
  ).min(1).max(20),
});

const PostBodySchema = z.discriminatedUnion("action", [
  DiagramSchema,
  IdeaMapSchema,
  ComparisonSchema,
  ExportFigmaSchema,
  ExportMiroSchema,
]);

// ---- POST handler ----

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;
  const generator = new VisualOutputGenerator();

  try {
    switch (data.action) {
      case "diagram": {
        const artifact = generator.generateMermaidDiagram(
          data.ideas as IdeaInput[],
          data.diagramType
        );
        return NextResponse.json({ artifact }, { headers: API_RESPONSE_HEADERS });
      }

      case "idea_map": {
        const artifact = generator.generateIdeaMap(data.synthesis as SynthesisInput);
        return NextResponse.json({ artifact }, { headers: API_RESPONSE_HEADERS });
      }

      case "comparison": {
        const artifact = generator.generateComparisonChart(
          data.angleResults as AngleResultInput[]
        );
        return NextResponse.json({ artifact }, { headers: API_RESPONSE_HEADERS });
      }

      case "export_figma": {
        const figmaData = generator.exportToFigmaFormat(data.artifacts);
        return NextResponse.json({ export: figmaData }, { headers: API_RESPONSE_HEADERS });
      }

      case "export_miro": {
        const miroData = generator.exportToMiroFormat(data.artifacts);
        return NextResponse.json({ export: miroData }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual generation failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
