import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPromptMessages } from "./prompts.js";

export function registerPrompts(server: McpServer): void {
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
      messages: getPromptMessages("innovate-with-angle", {
        subject,
        angle,
        context: context ?? "",
      }),
    })
  );

  server.prompt(
    "debate-idea",
    "Stress-test an idea through multi-perspective debate",
    {
      idea: z.string().describe("The idea to debate"),
      perspectives: z
        .string()
        .optional()
        .describe("Comma-separated perspectives (e.g. cto, investor)"),
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
      focus: z
        .string()
        .optional()
        .describe("Focus: performance, security, ux, scalability, general"),
    },
    async ({ code_context, focus }) => ({
      messages: getPromptMessages("innovate-code-architecture", {
        code_context,
        focus: focus ?? "general",
      }),
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
}
