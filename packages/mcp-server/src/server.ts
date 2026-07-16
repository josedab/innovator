import { createDefaultInnovatorRuntime } from "@innovator/core/runtime";
import type { InnovatorRuntime } from "@innovator/core/runtime";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import packageJson from "../package.json" with { type: "json" };
import { registerCodeTools } from "./code-tools.js";
import { registerCoreTools } from "./core-tools.js";
import { registerMeshTools } from "./mesh-tools.js";
import { registerPrompts } from "./register-prompts.js";
import { registerResources } from "./register-resources.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "innovator",
    version: packageJson.version,
  });

  registerCoreTools(server);
  registerCodeTools(server);
  registerMeshTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}

export function assertSupportedTransport(argv: readonly string[] = process.argv): void {
  if (argv.includes("--sse")) {
    throw new Error(
      "Legacy MCP SSE transport is disabled for production safety. Use the stdio transport."
    );
  }
}

export async function startServer(runtime?: Pick<InnovatorRuntime, "dispose">): Promise<void> {
  assertSupportedTransport();

  const ownedRuntime = runtime ?? createDefaultInnovatorRuntime();
  const server = createServer();
  let runtimeDisposalPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  const disposeRuntime = (): Promise<void> => {
    runtimeDisposalPromise ??= ownedRuntime.dispose();
    return runtimeDisposalPromise;
  };

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= (async () => {
      const results = await Promise.allSettled([server.close(), disposeRuntime()]);
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failure) throw failure.reason;
    })();
    return shutdownPromise;
  };

  // Graceful shutdown handler
  const handleSignal = async (signal: string) => {
    console.error(`Received ${signal}, shutting down MCP server...`);
    try {
      await shutdown();
    } catch {
      // Best-effort cleanup
    }
    process.exit(0);
  };
  process.on("beforeExit", () => void disposeRuntime().catch(() => {}));
  process.on("SIGINT", () => void handleSignal("SIGINT"));
  process.on("SIGTERM", () => void handleSignal("SIGTERM"));

  const stdioTransport = new StdioServerTransport();
  stdioTransport.onclose = () => void disposeRuntime().catch(() => {});
  try {
    await server.connect(stdioTransport);
  } catch (error) {
    try {
      await shutdown();
    } catch {
      // Preserve the connection error.
    }
    throw error;
  }
}
