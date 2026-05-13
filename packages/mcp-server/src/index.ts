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
  handleAutonomousInnovate,
  handleSwarmInnovate,
  handleNetworkInsights,
  handleNoveltyCheck,
} from "./handlers.js";
import {
  InvestigateInputSchema as _InvestigateInputSchema,
  GenerateInputSchema as _GenerateInputSchema,
  AutoPipelineInputSchema as _AutoPipelineInputSchema,
} from "./schemas.js";
import {
  listSessionResources,
  readSessionResource,
  readAnglesResource,
  readConfigResource,
  readPresetsResource,
} from "./resources.js";
import { listPrompts, getPromptMessages } from "./prompts.js";

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

  // ---- Innovation Mesh: Autonomous Agent Tool ----

  server.tool(
    "autonomous-innovate",
    "Deploy a persistent autonomous innovation agent that self-directs exploration across branches, debates ideas, and delivers a curated portfolio. Runs longer than a single pipeline — ideal for deep, multi-branch exploration.",
    {
      subject: z.string().min(1).max(500).describe("The topic to explore autonomously"),
      maxBranches: z.number().min(1).max(50).optional().describe("Maximum exploration branches (default: 10)"),
      maxDepth: z.number().min(1).max(10).optional().describe("Maximum branch depth (default: 3)"),
      strategy: z
        .enum(["breadth-first", "depth-first", "adaptive"])
        .optional()
        .describe("Exploration strategy (default: adaptive)"),
      model: z.string().optional().describe("Optional LLM model override"),
    },
    async ({ subject, maxBranches, maxDepth, strategy, model }) => {
      try {
        const result = await handleAutonomousInnovate({
          subject,
          maxBranches,
          maxDepth,
          strategy,
          model,
        });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ---- Innovation Mesh: Swarm Intelligence Tool ----

  server.tool(
    "swarm-innovate",
    "Launch a multi-agent innovation swarm where agents with different personalities (risk-taker, pragmatist, contrarian, domain-expert) collaboratively explore ideas through shared blackboard and debate.",
    {
      subject: z.string().min(1).max(500).describe("The topic to explore via swarm intelligence"),
      agentCount: z.number().min(2).max(8).optional().describe("Number of agents (default: 4)"),
      maxIterations: z.number().min(1).max(10).optional().describe("Max debate iterations (default: 3)"),
      model: z.string().optional().describe("Optional LLM model override"),
    },
    async ({ subject, agentCount, maxIterations, model }) => {
      try {
        const result = await handleSwarmInnovate({ subject, agentCount, maxIterations, model });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ---- Innovation Mesh: Network Insights Tool ----

  server.tool(
    "network-insights",
    "Get innovation intelligence from the federated Innovation Genome Network — trending angles, effective methodology chains, and domain-specific patterns from anonymized cross-organization data.",
    {
      domainHint: z.string().min(1).max(200).optional().describe("Domain category hint (e.g., fintech, healthcare, saas)"),
      angleId: z.string().optional().describe("Filter insights for a specific angle"),
    },
    async ({ domainHint, angleId }) => {
      try {
        const result = await handleNetworkInsights({ domainHint, angleId });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ---- Innovation Mesh: Novelty Check Tool ----

  server.tool(
    "novelty-check",
    "Check the novelty of innovation ideas against known prior art, patents, and academic literature. Returns a novelty score (0-100) and links to similar existing work.",
    {
      ideas: z
        .array(
          z.object({
            title: z.string().max(500),
            description: z.string().max(5000),
          })
        )
        .min(1)
        .max(20)
        .describe("Ideas to check for novelty"),
      domain: z.string().max(200).optional().describe("Domain context for more accurate matching"),
    },
    async ({ ideas, domain }) => {
      try {
        const result = await handleNoveltyCheck({ ideas, domain });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ---- Innovation Mesh: MCP Resources ----

  server.resource(
    "innovation-angles",
    "innovation://angles",
    { description: "Catalog of all available innovation angles with descriptions", mimeType: "text/markdown" },
    async () => readAnglesResource()
  );

  server.resource(
    "innovation-config",
    "innovation://config",
    { description: "Current Innovator configuration including models, angles, and environment", mimeType: "application/json" },
    async () => readConfigResource()
  );

  server.resource(
    "innovation-presets",
    "innovation://presets",
    { description: "Pre-configured innovation presets for common domains", mimeType: "text/markdown" },
    async () => readPresetsResource()
  );

  // ---- Innovation Mesh: MCP Prompts ----

  server.prompt(
    "investigate-subject",
    "Investigate a subject to understand its landscape, challenges, and opportunities",
    {
      subject: z.string().describe("The topic or domain to investigate"),
      depth: z.string().optional().describe("Investigation depth: quick, standard, or deep"),
    },
    async ({ subject, depth }) => ({
      messages: getPromptMessages("investigate-subject", { subject, depth: depth ?? "standard" }),
    })
  );

  server.prompt(
    "full-innovation-pipeline",
    "Run the complete investigate → generate → synthesize pipeline",
    {
      subject: z.string().describe("The topic to explore"),
      angles: z.string().optional().describe("Comma-separated angle IDs (omit for all 8)"),
    },
    async ({ subject, angles }) => ({
      messages: getPromptMessages("full-innovation-pipeline", { subject, angles: angles ?? "" }),
    })
  );

  server.prompt(
    "innovate-with-angle",
    "Generate innovation ideas using a specific creativity angle",
    {
      subject: z.string().describe("The topic to innovate on"),
      angle: z.string().describe("Creativity angle ID (e.g. scamper, first-principles)"),
      context: z.string().optional().describe("Additional context or constraints"),
    },
    async ({ subject, angle, context }) => ({
      messages: getPromptMessages("innovate-with-angle", { subject, angle, context: context ?? "" }),
    })
  );

  server.prompt(
    "debate-idea",
    "Stress-test an idea through multi-perspective debate",
    {
      idea: z.string().describe("The idea to debate"),
      perspectives: z.string().optional().describe("Comma-separated perspectives (e.g. cto, investor)"),
    },
    async ({ idea, perspectives }) => ({
      messages: getPromptMessages("debate-idea", { idea, perspectives: perspectives ?? "" }),
    })
  );

  server.prompt(
    "innovate-code-architecture",
    "Analyze code/architecture and generate innovation ideas grounded in code context",
    {
      code_context: z.string().describe("Code snippet, file path, or architecture description"),
      focus: z.string().optional().describe("Focus: performance, security, ux, scalability, general"),
    },
    async ({ code_context, focus }) => ({
      messages: getPromptMessages("innovate-code-architecture", { code_context, focus: focus ?? "general" }),
    })
  );

  server.prompt(
    "compare-approaches",
    "Compare multiple innovation approaches side-by-side",
    {
      problem: z.string().describe("The problem statement"),
      approaches: z.string().describe("Comma-separated approaches to compare"),
    },
    async ({ problem, approaches }) => ({
      messages: getPromptMessages("compare-approaches", { problem, approaches }),
    })
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
