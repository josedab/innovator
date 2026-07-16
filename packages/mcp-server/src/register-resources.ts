import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readAnglesResource, readConfigResource, readPresetsResource } from "./resources.js";

export function registerResources(server: McpServer): void {
  server.resource(
    "innovation-angles",
    "innovation://angles",
    {
      description: "Catalog of all available innovation angles with descriptions",
      mimeType: "text/markdown",
    },
    async () => readAnglesResource()
  );

  server.resource(
    "innovation-config",
    "innovation://config",
    {
      description: "Current Innovator configuration including models, angles, and environment",
      mimeType: "application/json",
    },
    async () => readConfigResource()
  );

  server.resource(
    "innovation-presets",
    "innovation://presets",
    {
      description: "Pre-configured innovation presets for common domains",
      mimeType: "text/markdown",
    },
    async () => readPresetsResource()
  );
}
