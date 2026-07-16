import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  handleInnovateArchitecture,
  handleInnovateFile,
  handleInnovateFromCode,
} from "./handlers.js";
import {
  InnovateArchitectureInputSchema,
  InnovateFileInputSchema,
  InnovateFromCodeInputSchema,
} from "./schemas.js";
import { toTextToolResult } from "./tool-result.js";

export function registerCodeTools(server: McpServer): void {
  server.tool(
    "innovate-from-code",
    "Point at a codebase to auto-identify architectural debt, feature gaps, performance bottlenecks, and generate innovation ideas grounded in actual code context",
    InnovateFromCodeInputSchema.shape,
    ({ path, maxFiles }) => toTextToolResult(() => handleInnovateFromCode({ path, maxFiles }))
  );

  server.tool(
    "innovate-file",
    "Analyze a specific file for complexity, patterns, and innovation opportunities",
    InnovateFileInputSchema.shape,
    ({ path }) => toTextToolResult(() => handleInnovateFile({ path }))
  );

  server.tool(
    "innovate-architecture",
    "Analyze repository architecture and generate Innovation PRs with implementation plans",
    InnovateArchitectureInputSchema.shape,
    ({ path }) => toTextToolResult(() => handleInnovateArchitecture({ path }))
  );
}
