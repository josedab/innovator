import { describe, it, expect, vi, beforeAll } from "vitest";
import packageJson from "../package.json" with { type: "json" };

/**
 * Tests for MCP server construction without starting a transport.
 */

const toolRegistrations: Array<{
  name: string;
  description: string;
  schema: unknown;
  handler: (...args: unknown[]) => unknown;
}> = [];
let constructorArgs: unknown = undefined;
let assertSupportedTransport: (argv?: readonly string[]) => void;

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
          schema: args[2],
          handler: args[3] as (...args: unknown[]) => unknown,
        });
      }
      resource() {}
      prompt() {}
      async connect() {}
      async close() {}
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

const mockHandleInvestigate = vi.fn();
const mockHandleGenerate = vi.fn();
const mockHandleAutoPipeline = vi.fn();

vi.mock("./handlers.js", () => ({
  handleInvestigate: mockHandleInvestigate,
  handleGenerate: mockHandleGenerate,
  handleAutoPipeline: mockHandleAutoPipeline,
  handleInnovateFromCode: vi.fn(),
  handleInnovateFile: vi.fn(),
  handleInnovateArchitecture: vi.fn(),
  handleNLInnovate: vi.fn(),
  handleMemorySearch: vi.fn(),
  handleOrgDNA: vi.fn(),
  handlePersonaEval: vi.fn(),
  handleAutonomousInnovate: vi.fn(),
  handleSwarmInnovate: vi.fn(),
  handleNetworkInsights: vi.fn(),
  handleNoveltyCheck: vi.fn(),
}));

vi.mock("./schemas.js", () => ({
  InvestigateInputSchema: {},
  GenerateInputSchema: {},
  AutoPipelineInputSchema: {},
}));

vi.mock("./resources.js", () => ({
  listSessionResources: vi.fn().mockResolvedValue([]),
  readSessionResource: vi.fn().mockResolvedValue({ contents: [] }),
  readAnglesResource: vi.fn().mockReturnValue({ contents: [] }),
  readConfigResource: vi.fn().mockReturnValue({ contents: [] }),
  readPresetsResource: vi.fn().mockReturnValue({ contents: [] }),
}));

vi.mock("./prompts.js", () => ({
  listPrompts: vi.fn().mockReturnValue([]),
  getPromptMessages: vi.fn().mockReturnValue([]),
}));

describe("MCP Server (server.ts)", () => {
  beforeAll(async () => {
    const serverModule = await import("./server.js");
    assertSupportedTransport = serverModule.assertSupportedTransport;
    const { createServer } = serverModule;
    createServer();
  });

  it("creates McpServer with package name and version", () => {
    expect(constructorArgs).toEqual({
      name: "innovator",
      version: packageJson.version,
    });
  });

  it("registers 14 tools including the new Innovation Mesh tools", () => {
    expect(toolRegistrations).toHaveLength(14);
    const toolNames = toolRegistrations.map((t) => t.name);
    expect(toolNames).toContain("investigate");
    expect(toolNames).toContain("innovate");
    expect(toolNames).toContain("auto");
    expect(toolNames).toContain("innovate-from-code");
    expect(toolNames).toContain("innovate-file");
    expect(toolNames).toContain("innovate-architecture");
    expect(toolNames).toContain("nl-innovate");
    expect(toolNames).toContain("memory-search");
    expect(toolNames).toContain("org-dna");
    expect(toolNames).toContain("persona-eval");
    expect(toolNames).toContain("autonomous-innovate");
    expect(toolNames).toContain("swarm-innovate");
    expect(toolNames).toContain("network-insights");
    expect(toolNames).toContain("novelty-check");
  });

  it("rejects the retired SSE transport", () => {
    expect(() => assertSupportedTransport(["node", "server", "--sse"])).toThrow(
      "Use the stdio transport"
    );
  });

  it("tool descriptions are non-empty strings", () => {
    for (const reg of toolRegistrations) {
      expect(typeof reg.description).toBe("string");
      expect(reg.description.length).toBeGreaterThan(10);
    }
  });

  it("investigate tool returns success content", async () => {
    mockHandleInvestigate.mockResolvedValue("Investigation result");
    const handler = toolRegistrations.find((t) => t.name === "investigate")!.handler;
    const result = await handler({ subject: "test topic" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Investigation result" }],
    });
  });

  it("investigate tool wraps errors with isError flag", async () => {
    mockHandleInvestigate.mockRejectedValue(new Error("Investigation failed"));
    const handler = toolRegistrations.find((t) => t.name === "investigate")!.handler;
    const result = await handler({ subject: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: Investigation failed" }],
      isError: true,
    });
  });

  it("innovate tool calls handleGenerate", async () => {
    mockHandleGenerate.mockResolvedValue("Innovation ideas");
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
    mockHandleAutoPipeline.mockResolvedValue("Pipeline result");
    const handler = toolRegistrations.find((t) => t.name === "auto")!.handler;
    const result = await handler({ subject: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Pipeline result" }],
    });
  });

  it("auto tool handles non-Error exceptions", async () => {
    mockHandleAutoPipeline.mockRejectedValue("string error");
    const handler = toolRegistrations.find((t) => t.name === "auto")!.handler;
    const result = await handler({ subject: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: string error" }],
      isError: true,
    });
  });
});
