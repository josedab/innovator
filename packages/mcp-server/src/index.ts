#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import {
  handleInvestigate,
  handleGenerate,
  handleAutoPipeline,
  handleInnovateFromCode,
  handleInnovateFile,
  handleInnovateArchitecture,
  handleNLInnovate,
  handleMemorySearch,
  handleOrgDNA,
  handlePersonaEval,
} from "./handlers.js";
import {
  InvestigateInputSchema as _InvestigateInputSchema,
  GenerateInputSchema as _GenerateInputSchema,
  AutoPipelineInputSchema as _AutoPipelineInputSchema,
} from "./schemas.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "innovator",
    version: "0.1.0",
  });

  server.tool(
    "investigate",
    "Investigate a subject using AI to identify key aspects, challenges, and opportunities for innovation",
    {
      subject: z.string().min(1).max(500).describe("The topic or domain to investigate"),
      model: z.string().optional().describe("Optional LLM model override"),
    },
    async ({ subject, model }) => {
      try {
        const result = await handleInvestigate({ subject, model });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "innovate",
    "Generate innovation ideas for a subject using a specific creativity angle (e.g. scamper, first-principles, cross-domain, constraints, inversion, perspectives, what-if, trend-collision)",
    {
      subject: z.string().min(1).max(500).describe("The topic to innovate on"),
      investigation: z
        .object({
          summary: z.string(),
          keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
          currentState: z.string(),
          challenges: z.array(z.string()),
          opportunities: z.array(z.string()),
        })
        .describe("Previously generated investigation context"),
      angleId: z.string().min(1).describe("The creativity angle to apply"),
      model: z.string().optional().describe("Optional LLM model override"),
    },
    async ({ subject, investigation, angleId, model }) => {
      try {
        const result = await handleGenerate({ subject, investigation, angleId, model });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "auto",
    "Run the full innovation pipeline: investigate → generate ideas for all angles → synthesize top recommendations",
    {
      subject: z
        .string()
        .min(1)
        .max(500)
        .describe("The topic to run the full innovation pipeline on"),
      model: z.string().optional().describe("Optional LLM model override"),
      angles: z.array(z.string()).optional().describe("Optional subset of angle IDs to use"),
    },
    async ({ subject, model, angles }) => {
      try {
        const result = await handleAutoPipeline({ subject, model, angles });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "innovate-from-code",
    "Point at a codebase to auto-identify architectural debt, feature gaps, performance bottlenecks, and generate innovation ideas grounded in actual code context",
    {
      path: z.string().min(1).describe("Path to the repository or directory to analyze"),
      maxFiles: z.number().optional().describe("Maximum files to analyze (default: 200)"),
    },
    async ({ path, maxFiles }) => {
      try {
        const result = await handleInnovateFromCode({ path, maxFiles });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "innovate-file",
    "Analyze a specific file for complexity, patterns, and innovation opportunities",
    {
      path: z.string().min(1).describe("Path to the specific file to analyze"),
    },
    async ({ path }) => {
      try {
        const result = await handleInnovateFile({ path });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "innovate-architecture",
    "Analyze repository architecture and generate Innovation PRs with implementation plans",
    {
      path: z.string().min(1).describe("Path to the repository"),
    },
    async ({ path }) => {
      try {
        const result = await handleInnovateArchitecture({ path });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ---- New Feature Tools ----

  server.tool(
    "nl-innovate",
    "Run the innovation pipeline from a natural language prompt (e.g., 'Generate SCAMPER ideas for checkout flow, debate top 2, create PRD for winner')",
    {
      prompt: z.string().min(1).max(5000).describe("Natural language description of the innovation task"),
      model: z.string().optional().describe("Optional LLM model override"),
    },
    async ({ prompt, model }) => {
      try {
        const result = await handleNLInnovate({ prompt, model });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    "memory-search",
    "Search the innovation memory graph for related past ideas, investigations, and insights across all sessions",
    {
      query: z.string().min(1).max(2000).describe("Search query for finding related past ideas"),
      threshold: z.number().min(0).max(1).optional().describe("Similarity threshold (0-1, default 0.3)"),
      limit: z.number().min(1).max(50).optional().describe("Maximum results to return (default 10)"),
    },
    async ({ query, threshold, limit }) => {
      try {
        const result = await handleMemorySearch({ query, threshold, limit });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    "org-dna",
    "Generate an organizational innovation DNA report showing theme clusters, blind spots, convergence patterns, and idea lineage",
    {
      format: z.enum(["json", "markdown"]).optional().describe("Output format (default: json)"),
    },
    async ({ format }) => {
      try {
        const result = await handleOrgDNA({ format });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    "persona-eval",
    "Evaluate an idea through multiple stakeholder personas (CTO, end-user, investor, regulator) with independent scoring and conflict analysis",
    {
      idea: z.string().min(1).max(5000).describe("The idea to evaluate"),
      personaIds: z
        .array(z.string())
        .min(1)
        .max(12)
        .describe("Persona IDs to evaluate with (e.g., cto, end-user, investor, regulator)"),
      model: z.string().optional().describe("Optional LLM model override"),
    },
    async ({ idea, personaIds, model }) => {
      try {
        const result = await handlePersonaEval({ idea, personaIds, model });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  return server;
}

async function main(): Promise<void> {
  const transport = process.argv.includes("--sse") ? "sse" : "stdio";

  const server = createServer();

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.error(`Received ${signal}, shutting down MCP server...`);
    try {
      await server.close();
    } catch {
      // Best-effort cleanup
    }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  if (transport === "stdio") {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
  } else {
    const port = parseInt(process.env.MCP_PORT ?? "3100", 10);
    const { createServer: createHttpServer } = await import("http");

    let sseTransport: SSEServerTransport | null = null;

    const httpServer = createHttpServer(async (req, res) => {
      try {
        if (req.method === "GET" && req.url === "/sse") {
          sseTransport = new SSEServerTransport("/messages", res);
          await server.connect(sseTransport);
        } else if (req.method === "POST" && req.url === "/messages") {
          if (sseTransport) {
            await sseTransport.handlePostMessage(req, res);
          } else {
            res.writeHead(400);
            res.end("No SSE connection established");
          }
        } else if (req.method === "GET" && req.url === "/health") {
          const connected = sseTransport !== null;
          const status = connected ? "ok" : "waiting";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status, transport: "sse", connected }));
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      } catch (err) {
        console.error("SSE handler error:", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal server error");
        }
      }
    });

    httpServer.listen(port, () => {
      console.error(`Innovator MCP server (SSE) listening on port ${port}`);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
