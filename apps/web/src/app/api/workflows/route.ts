import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getWorkflowTemplates,
  getWorkflowTemplate,
  validateDAG,
  DAGWorkflowSchema,
  listBuiltinDSLs,
  getBuiltinDSL,
  dslToDAG,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const QuerySchema = z.object({
  id: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse({
      id: searchParams.get("id") ?? undefined,
      category: searchParams.get("category") ?? undefined,
    });

    if (query.id) {
      const template = getWorkflowTemplate(query.id);
      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json(template, { headers: API_RESPONSE_HEADERS });
    }

    const templates = getWorkflowTemplates();
    const filtered = query.category
      ? templates.filter((t) => t.category === query.category)
      : templates;

    // Include built-in DSL templates
    const dslTemplates = listBuiltinDSLs();

    return NextResponse.json(
      { templates: filtered, dslTemplates, total: filtered.length },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
}

const ValidateBodySchema = z.object({
  action: z.literal("validate"),
  workflow: z.unknown(),
});

const ExecuteBodySchema = z.object({
  action: z.literal("execute"),
  workflowId: z.string().max(100).optional(),
  workflow: z.unknown().optional(),
  context: z.record(z.string().max(100), z.unknown()).optional(),
  dryRun: z.boolean().default(true),
});

const ConvertDSLBodySchema = z.object({
  action: z.literal("convert"),
  dslTemplateId: z.string().max(100).optional(),
  dsl: z.unknown().optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  ValidateBodySchema,
  ExecuteBodySchema,
  ConvertDSLBodySchema,
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    if (parsed.action === "validate") {
      const validation = validateDAG(DAGWorkflowSchema.parse(parsed.workflow));
      return NextResponse.json(validation, { headers: API_RESPONSE_HEADERS });
    }

    if (parsed.action === "execute") {
      // For now, only dry-run is supported via the API
      const workflow = parsed.workflowId
        ? getWorkflowTemplate(parsed.workflowId)?.workflow
        : parsed.workflow
          ? DAGWorkflowSchema.parse(parsed.workflow)
          : null;

      if (!workflow) {
        return NextResponse.json(
          { error: "Workflow not found or not provided" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }

      const validation = validateDAG(
        typeof workflow === "object" && "nodes" in workflow
          ? DAGWorkflowSchema.parse(workflow)
          : DAGWorkflowSchema.parse(workflow)
      );

      return NextResponse.json(
        {
          dryRun: true,
          validation,
          workflow:
            typeof workflow === "object" && "name" in workflow
              ? (workflow as { name: string }).name
              : "unknown",
          message: "Dry-run validation complete. Use SSE endpoint for live execution.",
        },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    if (parsed.action === "convert") {
      const dslData = parsed.dslTemplateId ? getBuiltinDSL(parsed.dslTemplateId) : parsed.dsl;

      if (!dslData) {
        return NextResponse.json(
          { error: "Provide dslTemplateId or dsl object" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }

      const dag = dslToDAG(dslData as Parameters<typeof dslToDAG>[0]);
      const validation = validateDAG(dag);

      return NextResponse.json({ workflow: dag, validation }, { headers: API_RESPONSE_HEADERS });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
