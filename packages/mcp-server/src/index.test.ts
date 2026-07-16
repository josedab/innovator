import { describe, it, expect, vi, beforeAll } from "vitest";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };

/**
 * Tests for MCP server construction without starting a transport.
 */

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const toolRegistrations: Array<{
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: ToolHandler;
}> = [];
const resourceRegistrations: Array<{
  name: string;
  uri: string;
  metadata: { description: string; mimeType: string };
  handler: () => Promise<unknown>;
}> = [];
const promptRegistrations: Array<{
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (args: Record<string, string | undefined>) => Promise<unknown>;
}> = [];
let constructorArgs: unknown = undefined;
let assertSupportedTransport: (argv?: readonly string[]) => void;
let startServer: () => Promise<void>;
const mockServerConnect = vi.fn().mockResolvedValue(undefined);
const mockServerClose = vi.fn().mockResolvedValue(undefined);
const mockRuntimeDispose = vi.fn().mockResolvedValue(undefined);
const mockHandlers = {
  investigate: vi.fn(),
  innovate: vi.fn(),
  auto: vi.fn(),
  "innovate-from-code": vi.fn(),
  "innovate-file": vi.fn(),
  "innovate-architecture": vi.fn(),
  "nl-innovate": vi.fn(),
  "memory-search": vi.fn(),
  "org-dna": vi.fn(),
  "persona-eval": vi.fn(),
  "autonomous-innovate": vi.fn(),
  "swarm-innovate": vi.fn(),
  "network-insights": vi.fn(),
  "novelty-check": vi.fn(),
};
const anglesResource = {
  contents: [{ uri: "innovation://angles", mimeType: "text/markdown", text: "angles" }],
};
const configResource = {
  contents: [{ uri: "innovation://config", mimeType: "application/json", text: "config" }],
};
const presetsResource = {
  contents: [{ uri: "innovation://presets", mimeType: "text/markdown", text: "presets" }],
};
const mockGetPromptMessages = vi.fn((name: string, args: Record<string, string | undefined>) => [
  {
    role: "user",
    content: { type: "text", text: JSON.stringify({ name, args }) },
  },
]);

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class MockMcpServer {
      constructor(opts: unknown) {
        constructorArgs = opts;
      }
      tool(...args: unknown[]) {
        toolRegistrations.push({
          name: args[0] as string,
          description: args[1] as string,
          schema: args[2] as z.ZodRawShape,
          handler: args[3] as ToolHandler,
        });
      }
      resource(...args: unknown[]) {
        resourceRegistrations.push({
          name: args[0] as string,
          uri: args[1] as string,
          metadata: args[2] as { description: string; mimeType: string },
          handler: args[3] as () => Promise<unknown>,
        });
      }
      prompt(...args: unknown[]) {
        promptRegistrations.push({
          name: args[0] as string,
          description: args[1] as string,
          schema: args[2] as z.ZodRawShape,
          handler: args[3] as (input: Record<string, string | undefined>) => Promise<unknown>,
        });
      }
      connect = mockServerConnect;
      close = mockServerClose;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class MockStdioTransport {
    type = "stdio";
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/sse.js", () => ({
  SSEServerTransport: vi.fn(),
}));

vi.mock("@innovator/core/runtime", () => ({
  createDefaultInnovatorRuntime: vi.fn(() => ({
    dispose: mockRuntimeDispose,
  })),
}));

vi.mock("./handlers.js", () => ({
  handleInvestigate: mockHandlers.investigate,
  handleGenerate: mockHandlers.innovate,
  handleAutoPipeline: mockHandlers.auto,
  handleInnovateFromCode: mockHandlers["innovate-from-code"],
  handleInnovateFile: mockHandlers["innovate-file"],
  handleInnovateArchitecture: mockHandlers["innovate-architecture"],
  handleNLInnovate: mockHandlers["nl-innovate"],
  handleMemorySearch: mockHandlers["memory-search"],
  handleOrgDNA: mockHandlers["org-dna"],
  handlePersonaEval: mockHandlers["persona-eval"],
  handleAutonomousInnovate: mockHandlers["autonomous-innovate"],
  handleSwarmInnovate: mockHandlers["swarm-innovate"],
  handleNetworkInsights: mockHandlers["network-insights"],
  handleNoveltyCheck: mockHandlers["novelty-check"],
}));

vi.mock("./resources.js", () => ({
  listSessionResources: vi.fn().mockResolvedValue([]),
  readSessionResource: vi.fn().mockResolvedValue({ contents: [] }),
  readAnglesResource: vi.fn().mockReturnValue(anglesResource),
  readConfigResource: vi.fn().mockReturnValue(configResource),
  readPresetsResource: vi.fn().mockReturnValue(presetsResource),
}));

vi.mock("./prompts.js", () => ({
  listPrompts: vi.fn().mockReturnValue([]),
  getPromptMessages: mockGetPromptMessages,
}));

describe("MCP Server (server.ts)", () => {
  beforeAll(async () => {
    const serverModule = await import("./server.js");
    assertSupportedTransport = serverModule.assertSupportedTransport;
    startServer = serverModule.startServer;
    const { createServer } = serverModule;
    createServer();
  });

  it("creates McpServer with package name and version", () => {
    expect(constructorArgs).toEqual({
      name: "innovator",
      version: packageJson.version,
    });
  });

  it("pins all tool names, descriptions, schemas, limits, count, and ordering", () => {
    const investigation = z
      .object({
        summary: z.string(),
        keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
        currentState: z.string(),
        challenges: z.array(z.string()),
        opportunities: z.array(z.string()),
      })
      .describe("Previously generated investigation context");
    const expected = [
      {
        name: "investigate",
        description:
          "Investigate a subject using AI to identify key aspects, challenges, and opportunities for innovation",
        schema: {
          subject: z.string().min(1).max(500).describe("The topic or domain to investigate"),
          model: z.string().optional().describe("Optional LLM model override"),
        },
      },
      {
        name: "innovate",
        description:
          "Generate innovation ideas for a subject using a specific creativity angle (e.g. scamper, first-principles, cross-domain, constraints, inversion, perspectives, what-if, trend-collision)",
        schema: {
          subject: z.string().min(1).max(500).describe("The topic to innovate on"),
          investigation,
          angleId: z.string().min(1).describe("The creativity angle to apply"),
          model: z.string().optional().describe("Optional LLM model override"),
        },
      },
      {
        name: "auto",
        description:
          "Run the full innovation pipeline: investigate → generate ideas for all angles → synthesize top recommendations",
        schema: {
          subject: z
            .string()
            .min(1)
            .max(500)
            .describe("The topic to run the full innovation pipeline on"),
          model: z.string().optional().describe("Optional LLM model override"),
          angles: z.array(z.string()).optional().describe("Optional subset of angle IDs to use"),
        },
      },
      {
        name: "innovate-from-code",
        description:
          "Point at a codebase to auto-identify architectural debt, feature gaps, performance bottlenecks, and generate innovation ideas grounded in actual code context",
        schema: {
          path: z.string().min(1).describe("Path to the repository or directory to analyze"),
          maxFiles: z
            .number()
            .int()
            .min(1)
            .max(1_000)
            .optional()
            .describe("Maximum files to analyze (default: 200, maximum: 1000)"),
        },
      },
      {
        name: "innovate-file",
        description:
          "Analyze a specific file for complexity, patterns, and innovation opportunities",
        schema: {
          path: z.string().min(1).describe("Path to the specific file to analyze"),
        },
      },
      {
        name: "innovate-architecture",
        description:
          "Analyze repository architecture and generate Innovation PRs with implementation plans",
        schema: {
          path: z.string().min(1).describe("Path to the repository"),
        },
      },
      {
        name: "nl-innovate",
        description:
          "Run the innovation pipeline from a natural language prompt (e.g., 'Generate SCAMPER ideas for checkout flow, debate top 2, create PRD for winner')",
        schema: {
          prompt: z
            .string()
            .min(1)
            .max(5000)
            .describe("Natural language description of the innovation task"),
          model: z.string().optional().describe("Optional LLM model override"),
        },
      },
      {
        name: "memory-search",
        description:
          "Search the innovation memory graph for related past ideas, investigations, and insights across all sessions",
        schema: {
          query: z
            .string()
            .min(1)
            .max(2000)
            .describe("Search query for finding related past ideas"),
          threshold: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Similarity threshold (0-1, default 0.3)"),
          limit: z
            .number()
            .min(1)
            .max(50)
            .optional()
            .describe("Maximum results to return (default 10)"),
        },
      },
      {
        name: "org-dna",
        description:
          "Generate an organizational innovation DNA report showing theme clusters, blind spots, convergence patterns, and idea lineage",
        schema: {
          format: z.enum(["json", "markdown"]).optional().describe("Output format (default: json)"),
        },
      },
      {
        name: "persona-eval",
        description:
          "Evaluate an idea through multiple stakeholder personas (CTO, end-user, investor, regulator) with independent scoring and conflict analysis",
        schema: {
          idea: z.string().min(1).max(5000).describe("The idea to evaluate"),
          personaIds: z
            .array(z.string())
            .min(1)
            .max(12)
            .describe("Persona IDs to evaluate with (e.g., cto, end-user, investor, regulator)"),
          model: z.string().optional().describe("Optional LLM model override"),
        },
      },
      {
        name: "autonomous-innovate",
        description:
          "Deploy a persistent autonomous innovation agent that self-directs exploration across branches, debates ideas, and delivers a curated portfolio. Runs longer than a single pipeline — ideal for deep, multi-branch exploration.",
        schema: {
          subject: z.string().min(1).max(500).describe("The topic to explore autonomously"),
          maxBranches: z
            .number()
            .min(1)
            .max(50)
            .optional()
            .describe("Maximum exploration branches (default: 10)"),
          maxDepth: z
            .number()
            .min(1)
            .max(10)
            .optional()
            .describe("Maximum branch depth (default: 3)"),
          strategy: z
            .enum(["breadth-first", "depth-first", "adaptive"])
            .optional()
            .describe("Exploration strategy (default: adaptive)"),
          model: z.string().optional().describe("Optional LLM model override"),
        },
      },
      {
        name: "swarm-innovate",
        description:
          "Launch a multi-agent innovation swarm where agents with different personalities (risk-taker, pragmatist, contrarian, domain-expert) collaboratively explore ideas through shared blackboard and debate.",
        schema: {
          subject: z
            .string()
            .min(1)
            .max(500)
            .describe("The topic to explore via swarm intelligence"),
          agentCount: z.number().min(2).max(8).optional().describe("Number of agents (default: 4)"),
          maxIterations: z
            .number()
            .min(1)
            .max(10)
            .optional()
            .describe("Max debate iterations (default: 3)"),
          model: z.string().optional().describe("Optional LLM model override"),
        },
      },
      {
        name: "network-insights",
        description:
          "Get innovation intelligence from the federated Innovation Genome Network — trending angles, effective methodology chains, and domain-specific patterns from anonymized cross-organization data.",
        schema: {
          domainHint: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe("Domain category hint (e.g., fintech, healthcare, saas)"),
          angleId: z.string().optional().describe("Filter insights for a specific angle"),
        },
      },
      {
        name: "novelty-check",
        description:
          "Check the novelty of innovation ideas against known prior art, patents, and academic literature. Returns a novelty score (0-100) and links to similar existing work.",
        schema: {
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
          domain: z
            .string()
            .max(200)
            .optional()
            .describe("Domain context for more accurate matching"),
        },
      },
    ];

    expect(toolRegistrations).toHaveLength(14);
    expect(
      toolRegistrations.map(({ name, description, schema }) => ({
        name,
        description,
        schema: z.toJSONSchema(z.object(schema)),
      }))
    ).toEqual(
      expected.map(({ name, description, schema }) => ({
        name,
        description,
        schema: z.toJSONSchema(z.object(schema)),
      }))
    );
  });

  it("rejects SSE with the exact stdio-only transport error", () => {
    expect(() => assertSupportedTransport(["node", "server", "--sse"])).toThrow(
      "Legacy MCP SSE transport is disabled for production safety. Use the stdio transport."
    );
    expect(() => assertSupportedTransport(["node", "server"])).not.toThrow();
  });

  it("pins all resource registrations and result payloads", async () => {
    expect(
      resourceRegistrations.map(({ handler: _handler, ...registration }) => registration)
    ).toEqual([
      {
        name: "innovation-angles",
        uri: "innovation://angles",
        metadata: {
          description: "Catalog of all available innovation angles with descriptions",
          mimeType: "text/markdown",
        },
      },
      {
        name: "innovation-config",
        uri: "innovation://config",
        metadata: {
          description: "Current Innovator configuration including models, angles, and environment",
          mimeType: "application/json",
        },
      },
      {
        name: "innovation-presets",
        uri: "innovation://presets",
        metadata: {
          description: "Pre-configured innovation presets for common domains",
          mimeType: "text/markdown",
        },
      },
    ]);
    await expect(resourceRegistrations[0].handler()).resolves.toEqual(anglesResource);
    await expect(resourceRegistrations[1].handler()).resolves.toEqual(configResource);
    await expect(resourceRegistrations[2].handler()).resolves.toEqual(presetsResource);
  });

  it("pins all prompt names, descriptions, schemas, ordering, defaults, and outputs", async () => {
    const expected = [
      {
        name: "investigate-subject",
        description:
          "Investigate a subject to understand its landscape, challenges, and opportunities",
        schema: {
          subject: z.string().describe("The topic or domain to investigate"),
          depth: z.string().optional().describe("Investigation depth: quick, standard, or deep"),
        },
        input: { subject: "solar" },
        resolved: { subject: "solar", depth: "standard" },
      },
      {
        name: "full-innovation-pipeline",
        description: "Run the complete investigate → generate → synthesize pipeline",
        schema: {
          subject: z.string().describe("The topic to explore"),
          angles: z.string().optional().describe("Comma-separated angle IDs (omit for all 8)"),
        },
        input: { subject: "solar" },
        resolved: { subject: "solar", angles: "" },
      },
      {
        name: "innovate-with-angle",
        description: "Generate innovation ideas using a specific creativity angle",
        schema: {
          subject: z.string().describe("The topic to innovate on"),
          angle: z.string().describe("Creativity angle ID (e.g. scamper, first-principles)"),
          context: z.string().optional().describe("Additional context or constraints"),
        },
        input: { subject: "solar", angle: "scamper" },
        resolved: { subject: "solar", angle: "scamper", context: "" },
      },
      {
        name: "debate-idea",
        description: "Stress-test an idea through multi-perspective debate",
        schema: {
          idea: z.string().describe("The idea to debate"),
          perspectives: z
            .string()
            .optional()
            .describe("Comma-separated perspectives (e.g. cto, investor)"),
        },
        input: { idea: "solar roads" },
        resolved: { idea: "solar roads", perspectives: "" },
      },
      {
        name: "innovate-code-architecture",
        description:
          "Analyze code/architecture and generate innovation ideas grounded in code context",
        schema: {
          code_context: z.string().describe("Code snippet, file path, or architecture description"),
          focus: z
            .string()
            .optional()
            .describe("Focus: performance, security, ux, scalability, general"),
        },
        input: { code_context: "service" },
        resolved: { code_context: "service", focus: "general" },
      },
      {
        name: "compare-approaches",
        description: "Compare multiple innovation approaches side-by-side",
        schema: {
          problem: z.string().describe("The problem statement"),
          approaches: z.string().describe("Comma-separated approaches to compare"),
        },
        input: { problem: "storage", approaches: "sql, graph" },
        resolved: { problem: "storage", approaches: "sql, graph" },
      },
    ];

    expect(
      promptRegistrations.map(({ handler: _handler, ...registration }) => ({
        ...registration,
        schema: z.toJSONSchema(z.object(registration.schema)),
      }))
    ).toEqual(
      expected.map(({ name, description, schema }) => ({
        name,
        description,
        schema: z.toJSONSchema(z.object(schema)),
      }))
    );

    mockGetPromptMessages.mockClear();
    for (const [index, prompt] of expected.entries()) {
      const output = await promptRegistrations[index].handler(prompt.input);
      expect(mockGetPromptMessages).toHaveBeenNthCalledWith(
        index + 1,
        prompt.name,
        prompt.resolved
      );
      expect(output).toEqual({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: JSON.stringify({ name: prompt.name, args: prompt.resolved }),
            },
          },
        ],
      });
    }
  });

  it("returns the exact success text payload for every tool", async () => {
    for (const registration of toolRegistrations) {
      const resultText = `result:${registration.name}`;
      mockHandlers[registration.name as keyof typeof mockHandlers].mockResolvedValueOnce(
        resultText
      );
      await expect(registration.handler({})).resolves.toEqual({
        content: [{ type: "text", text: resultText }],
      });
    }
  });

  it("returns the exact Error payload for every tool", async () => {
    for (const registration of toolRegistrations) {
      const message = `failure:${registration.name}`;
      mockHandlers[registration.name as keyof typeof mockHandlers].mockRejectedValueOnce(
        new Error(message)
      );
      await expect(registration.handler({})).resolves.toEqual({
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      });
    }
  });

  it("investigate tool returns success content", async () => {
    mockHandlers.investigate.mockResolvedValue("Investigation result");
    const handler = toolRegistrations.find((t) => t.name === "investigate")!.handler;
    const result = await handler({ subject: "test topic" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Investigation result" }],
    });
  });

  it("investigate tool wraps errors with isError flag", async () => {
    mockHandlers.investigate.mockRejectedValue(new Error("Investigation failed"));
    const handler = toolRegistrations.find((t) => t.name === "investigate")!.handler;
    const result = await handler({ subject: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: Investigation failed" }],
      isError: true,
    });
  });

  it("innovate tool calls handleGenerate", async () => {
    mockHandlers.innovate.mockResolvedValue("Innovation ideas");
    const handler = toolRegistrations.find((t) => t.name === "innovate")!.handler;
    const result = await handler({
      subject: "test",
      investigation: {
        summary: "S",
        keyAspects: [],
        currentState: "",
        challenges: [],
        opportunities: [],
      },
      angleId: "scamper",
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "Innovation ideas" }],
    });
  });

  it("auto tool calls handleAutoPipeline", async () => {
    mockHandlers.auto.mockResolvedValue("Pipeline result");
    const handler = toolRegistrations.find((t) => t.name === "auto")!.handler;
    const result = await handler({ subject: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Pipeline result" }],
    });
  });

  it("auto tool handles non-Error exceptions", async () => {
    mockHandlers.auto.mockRejectedValue("string error");
    const handler = toolRegistrations.find((t) => t.name === "auto")!.handler;
    const result = await handler({ subject: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: string error" }],
      isError: true,
    });
  });

  it("owns one runtime disposal at the stdio lifecycle boundary", async () => {
    mockServerConnect.mockClear();
    mockServerClose.mockClear();
    mockRuntimeDispose.mockClear();
    const handlers = new Map<string | symbol, (...args: unknown[]) => void>();
    const onSpy = vi.spyOn(process, "on").mockImplementation((event, listener) => {
      handlers.set(event, listener as (...args: unknown[]) => void);
      return process;
    });

    try {
      await startServer();
      expect(mockServerConnect).toHaveBeenCalledOnce();
      expect(mockServerClose).not.toHaveBeenCalled();
      expect(mockRuntimeDispose).not.toHaveBeenCalled();

      handlers.get("beforeExit")?.(0);
      await vi.waitFor(() => expect(mockRuntimeDispose).toHaveBeenCalledOnce());
    } finally {
      onSpy.mockRestore();
    }

    expect(mockServerClose).not.toHaveBeenCalled();
  });

  it("reuses one shutdown for repeated process signals", async () => {
    mockServerConnect.mockClear();
    mockServerClose.mockClear();
    mockRuntimeDispose.mockClear();
    const handlers = new Map<string | symbol, (...args: unknown[]) => void>();
    const onSpy = vi.spyOn(process, "on").mockImplementation((event, listener) => {
      handlers.set(event, listener as (...args: unknown[]) => void);
      return process;
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await startServer();
      handlers.get("SIGINT")?.();
      handlers.get("SIGTERM")?.();
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(2));
    } finally {
      onSpy.mockRestore();
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect(mockServerClose).toHaveBeenCalledOnce();
    expect(mockRuntimeDispose).toHaveBeenCalledOnce();
  });
});
