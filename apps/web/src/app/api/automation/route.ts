export const runtime = "nodejs";

import {
  createAutomationRule,
  listAutomationRules,
  getAutomationRule,
  toggleAutomationRule,
  deleteAutomationRule,
  getAutomationLog,
  createHighScoreChain,
  createPipelineNotificationChain,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateRuleSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  triggerEvent: z.string().min(1).max(100),
  conditions: z.array(z.object({
    field: z.string().max(200),
    operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists"]),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })).max(10).default([]),
  actions: z.array(z.object({
    type: z.enum(["webhook", "generate-prd", "create-github-issue", "send-notification", "index-for-search", "record-outcome", "log"]),
    config: z.record(z.unknown()).optional(),
  })).min(1).max(10),
});

const ListRulesSchema = z.object({ action: z.literal("list") });

const ToggleSchema = z.object({
  action: z.literal("toggle"),
  ruleId: z.string().min(1).max(100),
  enabled: z.boolean(),
});

const DeleteSchema = z.object({
  action: z.literal("delete"),
  ruleId: z.string().min(1).max(100),
});

const LogSchema = z.object({
  action: z.literal("log"),
  ruleId: z.string().max(100).optional(),
});

const PresetSchema = z.object({
  action: z.literal("preset"),
  preset: z.enum(["high-score-chain", "pipeline-notification"]),
  scoreThreshold: z.number().min(0).max(100).optional(),
  repo: z.string().max(200).optional(),
  channel: z.string().max(100).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  CreateRuleSchema, ListRulesSchema, ToggleSchema, DeleteSchema, LogSchema, PresetSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "create": {
        const rule = createAutomationRule({
          name: parsed.name,
          description: parsed.description,
          enabled: true,
          triggerEvent: parsed.triggerEvent as Parameters<typeof createAutomationRule>[0]["triggerEvent"],
          conditions: parsed.conditions,
          actions: parsed.actions,
        });
        logger.info(`Created rule: ${rule.name} (${rule.id})`, { route: "/api/automation" });
        return Response.json({ rule }, { headers: API_RESPONSE_HEADERS });
      }
      case "list":
        return Response.json({ rules: listAutomationRules() }, { headers: API_RESPONSE_HEADERS });
      case "toggle": {
        const ok = toggleAutomationRule(parsed.ruleId, parsed.enabled);
        if (!ok) return Response.json({ error: "Rule not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
        return Response.json({ rule: getAutomationRule(parsed.ruleId) }, { headers: API_RESPONSE_HEADERS });
      }
      case "delete": {
        const ok = deleteAutomationRule(parsed.ruleId);
        if (!ok) return Response.json({ error: "Rule not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
        return Response.json({ deleted: true }, { headers: API_RESPONSE_HEADERS });
      }
      case "log":
        return Response.json({ log: getAutomationLog(parsed.ruleId) }, { headers: API_RESPONSE_HEADERS });
      case "preset": {
        const rule = parsed.preset === "high-score-chain"
          ? createHighScoreChain(parsed.scoreThreshold, parsed.repo)
          : createPipelineNotificationChain(parsed.channel);
        return Response.json({ rule }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid request", details: error.errors }, { status: 400, headers: API_RESPONSE_HEADERS });
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", { route: "/api/automation" });
    return Response.json({ error: "Internal server error" }, { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
