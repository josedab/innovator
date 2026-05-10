import { describe, it, expect, vi, beforeAll } from "vitest";

/**
 * Tests for MCP Server entry point (index.ts).
 *
 * Since index.ts calls main() at module level, we mock all external deps
 * and capture the server's tool registrations on first import.
 */

const toolRegistrations: Array<{
  name: string;
  description: string;
  schema: unknown;
  handler: (...args: unknown[]) => unknown;
}> = [];
let serverConnectArgs: unknown = undefined;
let constructorArgs: unknown = undefined;

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
      async connect(transport: unknown) {
        serverConnectArgs = transport;
      }
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
}));

vi.mock("./schemas.js", () => ({
  InvestigateInputSchema: {},
  GenerateInputSchema: {},
  AutoPipelineInputSchema: {},
}));

// Prevent process.exit from killing tests
vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

describe("MCP Server (index.ts)", () => {
  beforeAll(async () => {
    // Import triggers createServer() and main()
    await import("./index.js");
    // Allow async main() to settle
    await new Promise((r) => setTimeout(r, 100));
  });

  it("creates McpServer with name 'innovator' and version '0.1.0'", () => {
    expect(constructorArgs).toEqual({
      name: "innovator",
      version: "0.1.0",
    });
  });

  it("registers 10 tools: investigate, innovate, auto, innovate-from-code, innovate-file, innovate-architecture, nl-innovate, memory-search, org-dna, persona-eval", () => {
    expect(toolRegistrations).toHaveLength(10);
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
  });

  it("connects to stdio transport (default)", () => {
    expect(serverConnectArgs).toEqual(expect.objectContaining({ type: "stdio" }));
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
