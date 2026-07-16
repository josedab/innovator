import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleAutoPipeline, handleGenerate, handleInvestigate } from "./handlers.js";
import { AutoPipelineInputSchema, GenerateInputSchema, InvestigateInputSchema } from "./schemas.js";
import { toTextToolResult } from "./tool-result.js";

export function registerCoreTools(server: McpServer): void {
  server.tool(
    "investigate",
    "Investigate a subject using AI to identify key aspects, challenges, and opportunities for innovation",
    InvestigateInputSchema.shape,
    ({ subject, model }) => toTextToolResult(() => handleInvestigate({ subject, model }))
  );

  server.tool(
    "innovate",
    "Generate innovation ideas for a subject using a specific creativity angle (e.g. scamper, first-principles, cross-domain, constraints, inversion, perspectives, what-if, trend-collision)",
    GenerateInputSchema.shape,
    ({ subject, investigation, angleId, model }) =>
      toTextToolResult(() => handleGenerate({ subject, investigation, angleId, model }))
  );

  server.tool(
    "auto",
    "Run the full innovation pipeline: investigate → generate ideas for all angles → synthesize top recommendations",
    AutoPipelineInputSchema.shape,
    ({ subject, model, angles }) =>
      toTextToolResult(() => handleAutoPipeline({ subject, model, angles }))
  );
}
